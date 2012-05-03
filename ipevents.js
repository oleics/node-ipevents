
module.exports = IpEventEmitter

var EventEmitter = require('events').EventEmitter
  , util = require('util')
  , cp = require('child_process')
  , cluster = require('cluster')
  , jsonsocket = require('./jsonsocket')

var MSG_TYPE_EVENT = 1
  , MSG_TYPE_PUSH = 2
  , MSG_TYPE_BROADCAST = 3

function IpEventEmitter() {
  if(!(this instanceof IpEventEmitter)) return new IpEventEmitter()
  var self = this
  
  self.pid = process.pid
  self.pids = [self.pid]
  
  self.isMaster = cluster.isMaster
  self.isWorker = cluster.isWorker
  
  self.childsOnline = 0
  self.childs = {}
  
  self.netmap = {}
  
  process.on('message', self.onProcessMessage.bind(self))
  
  self.on('online', function() {
    self.addToNetmap(this.pids)
  })
  
  self.on('offline', function() {
    self.removeFromNetmap(this.pids)
  })
  
  setInterval(self.printNetmap.bind(self), 5000)
  
  if(process.send) {
    EventEmitter.prototype.emit.call(self, 'ready')
    self.emit('online')
  } else {
    self.processSendShim()
  }
}
util.inherits(IpEventEmitter, EventEmitter)

// Handles messages sent to this process.
IpEventEmitter.prototype.onProcessMessage = function(msg) {
  switch(msg.type) {
    case MSG_TYPE_EVENT:
      // We got the emit of an event
      // console.log('onProcessMessage', 'event', msg)
      
      msg.pids.push(this.pid)
      
      // emit the event
      this._emitScoped(msg, msg.name, msg.args)
      
      // send the event up to the parent process
      if(process.send) {
        process.send(msg)
      }
      
      break
    case MSG_TYPE_PUSH:
      // We got the push of an event
      // console.log('onProcessMessage', 'push', msg)
      
      // is the event for me?
      if(msg.to === this.pid) {
        // yes, it is
        // emit the event
        msg.pids.push(this.pid)
        this._emitScoped(msg, msg.name, msg.args)
      } else {
        // nope, it is not for me
        // send it further down the road
        var pid = msg.route.pop()
          , child = this.childs[pid]
        
        if(child) {
          msg.pids.push(pid)
          child.process.send(msg)
        } else {
          // somehow the route got broken
          console.warn('Broken route for:', msg)
          // notify the sender
          
        }
      }
      
      break
    case MSG_TYPE_BROADCAST:
      // We got the broadcast of an event
      // console.log(msg)
      
      msg.pids.push(this.pid)
      
      // emit on this object
      this._emitScoped(msg, msg.name, msg.args)
      
      // send the event to listening child processes:
      var self = this
      Object.keys(self.childs).forEach(function(pid) {
        var child = self.childs[pid]
        if(child.listeners[msg.name] || msg.name === 'addListener') {
          child.process.send(msg)
        }
      })
      
      break
    default:
      // It is an error if the msg is of unknown format.
      console.log(typeof msg, msg)
      this.emit('error', new Error('Unknown message type: '+msg.type))
      break
  }
}

// Emits an event on the object and sends it to the parent-
// process if process.send exists
IpEventEmitter.prototype.emit = function(/*name, arg1, arg2, ...*/) {
  
  // emit on this object
  EventEmitter.prototype.emit.apply(this, arguments)
  
  // create the message
  var msg = {
    pid: this.pid                                    // pid of the origin
    , pids: [this.pid]                               // chain of pids
    , type: MSG_TYPE_EVENT                           // type of command
    , name: arguments[0]                             // name of the event
    , args: Array.prototype.slice.call(arguments, 1) // arguments of the event
  }
  
  // send the event up to the parent process
  if(process.send) {
    // this starts ipc-emitting
    process.send(msg)
  }
  
  return this
}

// Pushes an event down to a child process.
// pids is the route to take.
IpEventEmitter.prototype.push = function(/*pids, event, arg1, arg2, ...*/) {
  var route = arguments[0].slice(0)
    , pid = route.pop()
    , pids = []
  
  // check if next pid in route is the current pid
  if(pid === this.pid) {
    pids.push(pid)
    pid = route.pop()
  } else {
    // make sure that the current pid is in the chain of pids the
    // message traveled
    pids.push(this.pid)
  }
  
  var child = this.childs[pid]
  
  if(child) {
    // child process found, start pushing the message
    child.process.send({
      pid: this.pid                                    // pid that started the push
      , pids: pids                                     // chain of pids
      , to: route.lenght ? route[0] : pid              // target pid
      , route: route                                   // route to take
      , type: MSG_TYPE_PUSH                            // type of command
      , name: arguments[1]                             // name of the event
      , args: Array.prototype.slice.call(arguments, 2) // arguments of the event
    })
  } else {
    // not child process found to push the message to
    console.log(pid, route, Object.keys(this.childs))
    this.emit('error', new Error('Can not push to '+pid+': Process not found.'))
  }
  
  return this
}

// Broadcasts an event to all listenting child processes.
IpEventEmitter.prototype.broadcast = function(/*event, arg1, arg2, ...*/) {
  var self = this
  
  // create the message
  var msg = {
    pid: self.pid                                    // pid of the origin
    , pids: [self.pid]                               // chain of pids
    , type: MSG_TYPE_BROADCAST                       // type of command
    , name: arguments[0]                             // name of the event
    , args: Array.prototype.slice.call(arguments, 1) // arguments of the event
  }
  
  // send the event to listening child processes:
  Object.keys(self.childs).forEach(function(pid) {
    var child = self.childs[pid]
    if(child.listeners[msg.name]) {
      child.process.send(msg)
    }
  })
  
  return this
}

// Forks a new child-process.
IpEventEmitter.prototype.fork = function(path, args) {
  var child = cp.fork(path, args || [])
  return this.registerProcess(child)
}

// Forks a new worker child-process.
IpEventEmitter.prototype.worker = function() {
  var child = cluster.fork()
  return this.registerProcess(child)
}

// Registers a new child-process.
IpEventEmitter.prototype.registerProcess = function(child) {
  if(this.childs[child.pid]) {
    this.emit('error', new Error('Child already registered, pid '+child.pid))
    return
  }
  var child = {
    pid: child.pid
    , process: child
    , listeners: {} // events the process listens to
  }
  child.process.on('message', this.onChildProcessMessage.bind(this, child))
  child.process.on('exit', this.onChildProcessExit.bind(this, child))
  this.childs[child.pid] = child
  this.childsOnline += 1
  return child
}

// Handles messages from a child process.
IpEventEmitter.prototype.onChildProcessMessage = function(child, msg) {
  switch(msg.type) {
    case MSG_TYPE_EVENT:
      // console.log('onChildProcessMessage', msg)
      
      // track listeners of child process
      if(msg.name === 'newListener') {
        child.listeners[msg.args[0]] = true
      }
      
      // push pid to pid-chain
      msg.pids.push(this.pid)
      
      // emit on this object
      this._emitScoped(msg, msg.name, msg.args)
      
      // send the event up to the parent process
      if(process.send) {
        // if(process.send.isSocket && msg.name == 'ping') {
          // console.log('SEND OVER SOCKET', msg)
        // }
        process.send(msg)
      }
      
      break
    default:
      // Test if message form core cluster-module
      if(msg.hasOwnProperty('cmd')
          && msg.hasOwnProperty('_queryId')
          && msg.hasOwnProperty('_workerId')
        ) {
        break
      }
      // It is an error if the msg is of unknown format.
      console.log(typeof msg, msg)
      this.emit('error', new Error('Unknown message type: '+msg.type))
      break
  }
}

// Handles the exit of a child.
IpEventEmitter.prototype.onChildProcessExit = function(child, code, signal) {
  this.childs[child.pid] = null
  delete this.childs[child.pid]
  this.childsOnline -= 1
  this.pids = [this.pid]
  this.emit('offline', child.pid)
  child = null
}

// 
IpEventEmitter.prototype._emitScoped = function(scope, eventName, args) {
  var listeners = this.listeners(eventName)
  if(listeners.length) {
    listeners.forEach(function(listener) {
      listener.apply(scope, args)
    })
  }
}

// 
IpEventEmitter.prototype.addToNetmap = function(pids) {
  var t = this.netmap
    , pids = pids.slice(0)
  while(pids.length) {
    var pid = pids.pop()
    t = t[pid] = t[pid] || {}
  }
  // this.pollNetmap()
}

// 
IpEventEmitter.prototype.removeFromNetmap = function(pids) {
  var t = this.netmap
    , pids = pids.slice(0)
  while(pids.length) {
    var pid = pids.pop()
    if(!pids.length) {
      delete t[pid]
    } else {
      t = t[pid]
    }
  }
  // this.pollNetmap()
}

// 
IpEventEmitter.prototype.pollNetmap = function() {
  var self = this
    , t = self.netmap[self.pid]
  if(t) {
    Object.keys(t).forEach(function(k) {
      if(!self.childs[k]) {
        t[k] = null
        delete t[k]
      }
    })
  }
}

// 
IpEventEmitter.prototype.printNetmap = function() {
  console.log(JSON.stringify(this.netmap, null, '  '))
}

// 
IpEventEmitter.prototype.processSendShim = function() {
  var self = this
  
  // open a tcp/ip socket
  var socket = jsonsocket()
  
  socket.on('listening', function(server) {
    // 
    EventEmitter.prototype.emit.call(self, 'ready')
    self.emit('online')
  })
  
  socket.on('stream', function(req, res, conn, server) {
    console.log('Connected to', conn.remoteAddress, conn.remotePort, conn.address())
    
    if(server) {
      // We got a connection from a client.
      
      // create a fake child-process and register it
      var child = new EventEmitter()
      child.pid = conn.remoteAddress+':'+conn.remotePort
      child.send = function(msg) {
        res.write(msg)
      }
      self.registerProcess(child)
      
      // emit data from input stream as 'message' event on the
      // fake child-process
      req.on('data', function(d) {
        // console.log('GOT DATA', d)
        child.emit('message', d)
      })
      
      // if the connection closes, emit an 'exit' event on the
      // fake child-process
      conn.on('close', function(had_error) {
        console.log('%s Connection closed: %s', self.pid, child.pid)
        child.emit('exit', had_error?1:0, null)
        child = null
      })
    } else {
      // We are connected to a server
      
      // 
      var a = conn.address()
      self.pid = a.address+':'+a.port
      self.pids = [self.pid]
      
      process.send = function(msg) {
        res.write(msg)
      }
      
      process.send.isSocket = true
      
      // emit data from input stream as 'message' event on the
      // process
      req.on('data', function(d) {
        // console.log('GOT DATA', d)
        process.emit('message', d)
      })
      
      // 
      conn.on('close', function() {
        process.send = null
        delete process.send
      })
      
      EventEmitter.prototype.emit.call(self, 'ready')
      self.emit('online')
    }
    
  })
  
  console.log(self.pid)
}
