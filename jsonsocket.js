
module.exports = shim

var net = require('net')
var Stream = require('stream').Stream
var Lazy = require('lazy')
var EventEmitter = require('events').EventEmitter

var defaultSocketPath = '/tmp/node-process-send-shim.sock'
var defaultPort = 7100
var defaultHost = 'localhost'

var reconnect = true
var delayReconnect = 1000

function shim() {
  
  var em = new EventEmitter()
  
  // creates a readable stream
  function _createJsonReadStream(stream) {
    var s = new Stream()
    s.readable = true
    s.writable = false
    Lazy(stream)
      .lines
      .map(String)
      .forEach(function(d) {
        s.emit('data', JSON.parse(d))
      })
    return s
  }
  
  // creates a writable stream
  function _createJsonWriteStream(stream) {
    var s = new Stream()
    s.readable = false
    s.writable = true
    s.write = function(d) {
      if(stream.writable) {
        stream.write(JSON.stringify(d)+'\n')
      }
    }
    s.end = function() {
      this.emit('end')
    }
    return s
  }
  
  function onConnection(conn, server) {
    var rs = _createJsonReadStream(conn)
      , ws = _createJsonWriteStream(conn)
    
    conn.on('close', function() {
      ws.on('end', function() {
        ws.emit('close')
        ws = null
        rs = null
      })
      ws.end()
      conn = null
      server = null
    })
    
    if(server) {
      em.emit('stream', rs, ws, conn, server)
    } else {
      em.emit('stream', rs, ws, conn)
    }
  }
  
  em.on('connection', onConnection)
  em.on('connect', onConnection)
  em.on('reconnect', onConnection)
  
  start(em)
  
  return em
}

function start(em, port, host, cb) {
  em.numReconnects = 0
  
  if(port instanceof Function) {
    cb = port
    port = null
  }
  
  if(host instanceof Function) {
    cb = host
    host = null
  }
  
  port = port || defaultSocketPath || defaultPort
  host = host || (!isNaN(port) ? defaultHost : null)
  cb = cb || function(){}
  
  function onError(err) {
    if(err.code == 'ECONNREFUSED') {
      em.emit('warn', new Error(err.code+' on '+port+', '+host))
      listen(em, port, host)
    } else {
      em.removeListener('listening', onListening)
      em.removeListener('connection', onConnection)
      em.removeListener('connect', onConnect)
      cb(err)
      em.emit('error', err)
    }
  }
  
  function onListening(server) {
    em.removeListener('error', onError)
    em.removeListener('connection', onConnection)
    em.removeListener('connect', onConnect)
    cb(null, true, server)
  }
  
  function onConnection(conn, server) {
    em.removeListener('error', onError)
    em.removeListener('listening', onListening)
    em.removeListener('connect', onConnect)
    cb(null, true, conn, server)
  }
  
  function onConnect(conn) {
    em.removeListener('error', onError)
    em.removeListener('listening', onListening)
    em.removeListener('connection', onConnection)
    cb(null, false, conn)
  }
  
  em.once('error', onError)
  em.once('listening', onListening)
  em.once('connection', onConnection)
  em.once('connect', onConnect)
  
  connect(em, port, host)
}

function connect(em, port, host, cb) {
  
  if(port instanceof Function) {
    cb = port
    port = null
  }
  if(host instanceof Function) {
    cb = host
    host = null
  }
  
  port = port || defaultSocketPath || defaultPort
  host = host || (!isNaN(port) ? defaultHost : null)
  cb = cb || function(){}
  
  var conn
  
  function onError(err) {
    conn.removeListener('connect', onConnect)
    
    if(err.code === 'ENOENT' && isNaN(port) && defaultPort) {
      console.warn(new Error(err.code+' on '+port+', '+host))
      connect(em, defaultPort, cb)
      return
    } else if(err.code === 'ECONNREFUSED' && em.numReconnects) {
      console.warn(new Error(err.code+' on '+port+', '+host))
      return _reconnect(em, port, host)
    }
    
    cb(err)
    em.emit('error', err)
  }
  
  function onConnect() {
    conn.removeListener('error', onError)
    
    conn.on('close', function(had_error) {
      // reconnect
      if(reconnect) {
        _reconnect(em, port, host)
      }
    })
    
    cb(null, conn)
    
    if(em.numReconnects>0) {
      em.numReconnects = 0
      em.emit('reconnect', conn)
    } else {
      em.emit('connect', conn)
    }
  }
  
  if(port && host) {
    conn = net.connect(port, host)
  } else {
    conn = net.connect(port)
  }
  
  conn.once('error', onError)
  conn.once('connect', onConnect)
}

function _reconnect(em, port, host) {
  em.numReconnects += 1
  if(delayReconnect) {
    setTimeout(function() {
      connect(em, port, host)
    }, delayReconnect)
  } else {
    connect(em, port, host)
  }
}

function listen(em, port, host, cb) {
  
  if(port instanceof Function) {
    cb = port
    port = null
  }
  if(host instanceof Function) {
    cb = host
    host = null
  }
  
  port = port || defaultSocketPath || defaultPort
  host = host || (!isNaN(port) ? defaultHost : null)
  cb = cb || function(){}
  
  function onError(err) {
    if(err.code === 'EACCES' && isNaN(port) && defaultPort) {
      console.error(new Error(err.code+' on '+port+', '+host))
      listen(em, defaultPort, cb)
      return
    }
    cb(err)
    em.emit('error', err)
  }
  
  function onConnection(conn) {
    cb(null, conn, server)
    em.emit('connection', conn, server)
  }
  
  var server = net.createServer()
  
  server.once('error', onError)
  
  server.once('listening', function() {
    server.removeListener('error', onError)
    em.emit('listening', server)
  })
  
  server.on('connection', onConnection)
  
  if(port && host) {
    server.listen(port, host)
  } else {
    server.listen(port)
  }
  
}
