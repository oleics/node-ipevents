
try {
  var EventEmitter = require('eventemitter2').EventEmitter2
} catch(e) {
  var EventEmitter = require('events').EventEmitter
}

var util = require('util')
  , cp = require('child_process')
  , cluster = require('cluster')
  , jsonsocket = require('./jsonsocket')

var MSG_TYPE_TOPARENTS  = 'toParents'
  , MSG_TYPE_TOCHILDS   = 'toChilds'
  , MSG_TYPE_TOSIBLINGS = 'toSiblings'
  , MSG_TYPE_TOCHILD    = 'toChild'
  , MSG_TYPE_TOGM       = 'toGM'
  , MSG_TYPE_SENDTO     = 'sendTo'
  , MSG_TYPE_BROADCAST  = 'broadcast'

var em = new EventEmitter()
  , childs = {}
  , netmap = {}
  , started = false
  , opts = {
      restart: true
      , delayRestart: 1000
      
      // socket
      , useSocket: true
      , socket: {
          onlyConnect: false
          , socketPath: null
          , port: 7100
          , host: 'localhost'
          , reconnect: true
          , delayReconnect: 3000
        }
    }

// variables
em.parentPid = null
em.pid = process.pid+''
em.childsOnline = 0
em.isGrandMaster = false
em.isMaster = cluster.isMaster
em.isWorker = cluster.isWorker

// set to comply with messages
em.from = em.pid
em.pids = [em.pid]

// functions
em.options = options
em.start = start

em.bubble = bubble
em.sendToParents = sendToParents
em.sendToChilds = sendToChilds
em.sendToSiblings = sendToSiblings
em.sendToGrandMaster = sendToGrandMaster
em.sendToChild = sendToChild
em.sendTo = sendTo
em.broadcast = broadcast

em.fork = fork
em.worker = worker

em.printNetmap = printNetmap

init()

// export
module.exports = em

function options(options) {
  options = options || {}
  
  Object.keys(options).forEach(function(k) {
    if(opts.hasOwnProperty(k)) {
      opts[k] = options[k]
    }
  })
  
  return em
}

function init() {
  
  process.on('message', onProcessMessage)
  
  em.on('newListener', function(eventName) {
    if(childs[this.from]) {
      childs[this.from].listeners[eventName] = true
    }
    sendToParents('newListener', eventName)
  })
  
  em.on('ready', function() {
    em.isGrandMaster = process.send ? false : true
  })
  
  em.on('parent', function(pid) {
    em.parentPid = pid
  })
  
  em.on('online', function() {
    addToNetmap(this.pids)
    if(childs[this.from]) {
      sendToChild(this.from, 'parent', em.pid)
    }
  })
  
  em.on('offline', function() {
    removeFromNetmap(this.pids)
  })
  
  return em
}

function start() {
  if(started) return em
  started = true
  
  if(process.send || ! opts.useSocket) {
    process.nextTick(function() {
      em.emit('ready')
      bubble('online')
    })
  } else {
    processSendShim()
  }
  
  return em
}

// Handles messages sent to this process.
function onProcessMessage(msg) {
  return handleMessage(msg)
}

// Emits an event and sends it up to the parent-process if
// process.send exists
function bubble(/*eventName, arg1, arg2, ...*/) {
  switch(arguments.length) {
    case 1:
      em.emit.call(em, arguments[0])
      sendToParents.call(null, arguments[0])
      break
    case 2:
      em.emit.call(em, arguments[0], arguments[1])
      sendToParents.call(null, arguments[0], arguments[1])
      break
    case 3:
      em.emit.call(em, arguments[0], arguments[1], arguments[2])
      sendToParents.call(null, arguments[0], arguments[1], arguments[2])
      break
    default:
      em.emit.apply(em, arguments)
      sendToParents.apply(null, arguments)
      break
  }
  
  return em
}

// Sends an event to all parent processes.
function sendToParents(/*event, arg1, arg2, ...*/) {
  if(process.send) {
    // create the message
    var msg = {
          from: em.pid                                     // pid of the origin
          , pids: [em.pid]                                 // chain of pids
          , type: MSG_TYPE_TOPARENTS                       // type of command
          , event: arguments[0]                            // name of the event
          , args: Array.prototype.slice.call(arguments, 1) // arguments of the event
        }
    process.send(msg)
  }
  
  return em
}

// Sends an event to all listenting child processes.
function sendToChilds(/*event, arg1, arg2, ...*/) {
  var pids = Object.keys(childs)
  
  if(pids.length) {
    // create the message
    var msg = {
          from: em.pid                                     // pid of the origin
          , pids: [em.pid]                                 // chain of pids
          , type: MSG_TYPE_TOCHILDS                        // type of command
          , event: arguments[0]                            // name of the event
          , args: Array.prototype.slice.call(arguments, 1) // arguments of the event
        }
      , child
    
    // send the event to listening child processes:
    pids.forEach(function(pid) {
      child = childs[pid]
      
      if(child.listeners[msg.event]) {
        child.send(msg)
      }
    })
    
    child = null
  }
  
  return em
}

// Sends an event to all listenting siblings of a process.
function sendToSiblings(/*event, arg1, arg2, ...*/) {
  if(process.send) {
    // create the message
    var msg = {
          from: em.pid                                     // pid of the origin
          , pids: [em.pid]                                 // chain of pids
          , type: MSG_TYPE_TOSIBLINGS                      // type of command
          , event: arguments[0]                            // name of the event
          , args: Array.prototype.slice.call(arguments, 1) // arguments of the event
        }
    process.send(msg)
  }
  
  return em
}

// Sends an event to one child
function sendToChild(/*pid, event, arg1, arg2, ...*/) {
  var child = childs[arguments[0]]
  
  if(child) {
    // create the message
    var msg = {
          from: em.pid                                     // pid of the origin
          , to: arguments[0]                               // target pid
          , pids: [em.pid]                                 // chain of pids
          , type: MSG_TYPE_TOCHILD                         // type of command
          , event: arguments[1]                            // name of the event
          , args: Array.prototype.slice.call(arguments, 2) // arguments of the event
        }
    child.send(msg)
  } else {
    em.emit('error', new Error('.sendToChild() failed: Child with pid '+arguments[0]+' not found.'))
  }
  
  return em
}

// Sends an event to the grand master
function sendToGrandMaster(/*pid, event, arg1, arg2, ...*/) {  
  if(process.send) {
    // create the message
    var msg = {
          from: em.pid                                     // pid of the origin
          , pids: [em.pid]                                 // chain of pids
          , type: MSG_TYPE_TOGM                            // type of command
          , event: arguments[0]                            // name of the event
          , args: Array.prototype.slice.call(arguments, 1) // arguments of the event
        }
    process.send(msg)
  } else if(em.isGrandMaster) {
    // emit
    em.emit.apply(em, arguments)
  } else {
    em.emit('error', new Error('.sendToGrandMaster() failed: process.send not defined.'))
  }
  
  return em
}


// Sends an event to a process.
// pids is the route to take.
function sendTo(/*route, event, arg1, arg2, ...*/) {
  var route = arguments[0].slice(0)
    , to = route.pop()
    , pids = []
  
  // check if next pid in route is the current pid
  if(to === em.pid) {
    pids.push(to)
    to = route.pop()
  } else {
    // make sure that the current pid is in the chain of pids the
    // message traveled
    pids.push(em.pid)
  }
  
  var msg = {
        from: em.pid                                     // pid that started the push
        , pids: pids                                     // chain of pids
        , to: route.length ? route[0] : to               // target pid
        , route: route                                   // route to take
        , type: MSG_TYPE_SENDTO                          // type of command
        , event: arguments[1]                            // name of the event
        , args: Array.prototype.slice.call(arguments, 2) // arguments of the event
      }
    , child = childs[to]
  
  if(child) {
    child.send(msg)
  } else if(em.parentPid === to) {
    process.send(msg)
  } else {
    // no process found to push the message to
    console.log(em.pid, to, route, Object.keys(childs))
    em.emit('error', new Error('Can not push to '+to+': Process not found.'))
  }
  
  return em
}

// Broadcasts an event to all processes.
function broadcast(/*event, arg1, arg2, ...*/) {
  var pids = Object.keys(childs)
  
  if(pids.length || process.send) {
    
    // create the message
    var msg = {
          from: em.pid                                     // pid of the origin
          , pids: [em.pid]                                 // chain of pids
          , type: MSG_TYPE_BROADCAST                       // type of command
          , event: arguments[0]                            // name of the event
          , args: Array.prototype.slice.call(arguments, 1) // arguments of the event
        }
      , child
    
    // send the event to the parent
    if(process.send) {
      process.send(msg)
    }
    
    // send the event to listening child processes:
    pids.forEach(function(pid) {
      child = childs[pid]
      if(child.listeners[msg.event]) {
        child.send(msg)
      }
    })
  }
  
  return em
}

// Forks a new child-process.
function fork(path, args) {
  var c = cp.fork(path, args || [])
  
  c.once('exit', function() {
    if(opts.restart) {
      if(opts.delayRestart) {
        setTimeout(function() {
          fork(path, args)
        }, opts.delayRestart)
      } else {
        fork(path, args)
      }
    }
    c = null
  })
  
  return registerProcess(c)
}

// Forks a new worker child-process.
function worker() {
  var c = cluster.fork()
  
  c.once('exit', function() {
    if(opts.restart) {
      if(opts.delayRestart) {
        setTimeout(function() {
          worker()
        }, opts.delayRestart)
      } else {
        worker()
      }
    }
    c = null
  })
  
  return registerProcess(c)
}

// Registers a new child-process.
function registerProcess(child) {
  if(childs[child.pid]) {
    em.emit('error', new Error('Child already registered, pid '+child.pid))
    return
  }
  var child = {
    pid: child.pid
    , process: child
    , listeners: {} // events the process listens to
    , send: function(msg) {
        try {
          child.process.send(msg)
        } catch(err) {
          em.emit('error', err)
        }
      }
  }
  child.process.on('message', onChildProcessMessage.bind(null, child))
  child.process.on('exit', onChildProcessExit.bind(null, child))
  childs[child.pid] = child
  em.childsOnline += 1
  return child
}

// Handles messages from a child process.
function onChildProcessMessage(child, msg) {
  // track listeners of child process
  // if(msg.type === MSG_TYPE_TOPARENTS && msg.event === 'newListener') {
    // child.listeners[msg.args[0]] = true
  // }
  
  handleMessage(msg)
}

// Handles the exit of a child.
function onChildProcessExit(child, code, signal) {
  childs[child.pid] = null
  delete childs[child.pid]
  em.childsOnline -= 1
  em.pids = [em.pid]
  bubble('offline', child.pid)
  child = null
}

// 
function _emitScoped(scope, eventName, args) {
  var listeners = em.listeners(eventName)
  if(listeners.length) {
    listeners.forEach(function(listener) {
      switch(args.length) {
        case 1:
          listener.call(scope, args[0])
          break
        case 2:
          listener.call(scope, args[0], args[1])
          break
        case 3:
          listener.call(scope, args[0], args[1], args[2])
          break
        default:
          listener.apply(scope, args)
          break
      }
    })
  }
}

// 
function handleMessage(msg) {
  switch(msg.type) {
    case MSG_TYPE_TOPARENTS:      
      // push pid to pid-chain
      msg.pids.push(em.pid)
      
      // emit the event
      _emitScoped(msg, msg.event, msg.args)
      
      // send the event up to the parent process
      if(process.send) {
        process.send(msg)
      }
      
      break
    case MSG_TYPE_TOCHILDS:
      msg.pids.push(em.pid)
      
      _emitScoped(msg, msg.event, msg.args)
      
      // send the event to listening child processes:
      var child
      Object.keys(childs).forEach(function(pid) {
        child = childs[pid]
        if(child.listeners[msg.event]) {
          child.send(msg)
        }
      })
      
      break
    case MSG_TYPE_TOSIBLINGS:
      // console.log('MSG_TYPE_TOSIBLINGS', em.pid, msg)
      msg.pids.push(em.pid)
      
      if(msg.pids.length === 3) {
        _emitScoped(msg, msg.event, msg.args)
      } else {
        // send the event to listening child processes
        // skip child with the pid in msg.from
        var child
        Object.keys(childs).forEach(function(pid) {
          child = childs[pid]
          if(pid !== msg.from && child.listeners[msg.event]) {
            child.send(msg)
          }
        })
      }
      
      break
    case MSG_TYPE_TOCHILD:
      // console.log('MSG_TYPE_TOCHILD', em.pid, msg)
      msg.pids.push(em.pid)
      
      // is the event for me?
      if(msg.to === em.pid) {
        // yes, it is
        // emit the event
        _emitScoped(msg, msg.event, msg.args)
      } else {
        em.emit('error', new Error('Got a message that is not for me: msg.to '+msg.to+', em.pid '+em.pid+''))
      }
      
      break
    case MSG_TYPE_TOGM:
      // console.log('MSG_TYPE_TOGM', em.pid, msg)
      msg.pids.push(em.pid)
      
      // is the event for me?
      if(em.isGrandMaster) {
        // yes, it is
        // emit the event
        _emitScoped(msg, msg.event, msg.args)
      } else if(process.send) {
        // nope, not for me
        // send it up
        process.send(msg)
      } else {
        em.emit('error', new Error('Could not deliver a message to the grand master: process.send is not defined.'))
      }
      
      break
    case MSG_TYPE_SENDTO:
      // console.log('MSG_TYPE_SENDTO', em.pid, msg)
      msg.pids.push(em.pid)
      
      // is the event for me?
      if(msg.to === em.pid) {
        // yes, it is
        // emit the event
        _emitScoped(msg, msg.event, msg.args)
      } else {
        // nope, it is not for me
        // send it further down the road
        var pid = msg.route.pop()
          , child = childs[pid]
        
        if(child) {
          child.send(msg)
        } else if(em.parentPid === pid) {
          process.send(msg)
        } else {
          // somehow the route got broken
          console.warn('Broken route for:', msg)
          // notify the sender
          
        }
      }
      
      break
    case MSG_TYPE_BROADCAST:
      // console.log('MSG_TYPE_BROADCAST', em.pid, msg)
      
      msg.pids.push(em.pid)
      
      // emit on this object
      _emitScoped(msg, msg.event, msg.args)
      
      // 
      if(em.parentPid && msg.pids.indexOf(em.parentPid) === -1) {
        process.send(msg)
      }
      
      // send the event to listening child processes:
      var child
      Object.keys(childs).forEach(function(pid) {
        if(msg.pids.indexOf(pid) === -1) {
          child = childs[pid]
          if(child.listeners[msg.event]) {
            child.send(msg)
          }
        }
      })
      
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
      em.emit('error', new Error('Unknown message type: '+msg.type))
      break
  }
}

// 
function addToNetmap(pids) {
  var t = netmap
    , pids = pids.slice(0)
    , pid
  while(pids.length) {
    pid = pids.pop()
    t = t[pid] = t[pid] || {}
  }
  // pollNetmap()
}

// 
function removeFromNetmap(pids) {
  var t = netmap
    , pids = pids.slice(0)
    , pid
  while(pids.length) {
    pid = pids.pop()
    if(!pids.length) {
      delete t[pid]
    } else {
      t = t[pid]
    }
  }
  // pollNetmap()
}

// 
function pollNetmap() {
  var t = netmap[em.pid]
  if(t) {
    Object.keys(t).forEach(function(k) {
      if(!childs[k]) {
        t[k] = null
        delete t[k]
      }
    })
  }
}

// 
function printNetmap() {
  console.log(JSON.stringify(netmap, null, '  '))
}

// 
function processSendShim() {
  // set options
  jsonsocket.options(opts.socket)
  
  // open a tcp/ip socket
  var socket = jsonsocket()
  
  socket.on('listening', function(server) {
    // console.log('Listening...', server.address())
    em.emit('ready')
    bubble('online')
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
      registerProcess(child)
      
      // emit data from input stream as 'message' event on the
      // fake child-process
      req.on('data', function(d) {
        // console.log('GOT DATA', d)
        child.emit('message', d)
      })
      
      // if the connection closes, emit an 'exit' event on the
      // fake child-process
      conn.on('close', function(had_error) {
        console.log('%s Connection closed: %s', em.pid, child.pid)
        child.emit('exit', had_error?1:0, null)
        child = null
      })
    } else {
      // We are connected to a server
      
      // 
      var a = conn.address()
      em.pid = a.address+':'+a.port
      em.from = em.pid
      em.pids = [em.pid]
      
      process.send = function(msg) {
        res.write(msg)
      }
      
      process.send.isSocket = true
      
      // emit data from input stream as 'message' event on the
      // process
      req.on('data', function(d) {
        process.emit('message', d)
      })
      
      // 
      conn.on('close', function() {
        process.send = null
        delete process.send
        em.emit('offline', em.parentPid)
      })
      
      em.emit('ready')
      bubble('online')
    }
    
  })
  
  console.log(em.pid)
}
