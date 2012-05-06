
var assert = require('assert')
  , profiler = require('./profiler')
  , ipem = require('..')

function testScope() {
  if(ipem.pid === this.from) {
    assert.deepEqual(this.pids, [this.from])
    assert.deepEqual(this.pids, [ipem.pid])
  } else {
    assert.strictEqual(this.pids[0], this.from)
    assert.notStrictEqual(this.pids[0], ipem.pid)
    assert.strictEqual(this.pids.slice(-1)[0], ipem.pid)
  }

  var pids_unique = this.pids.reduce(function(p, c) {
    if(p.indexOf(c) === -1) {
      p.push(c)
    }
    return p
  }, [])
  assert.deepEqual(this.pids, pids_unique)
}

ipem
  .options({
    restart: true
    , delayRestart: 0
    , useSocket: true
    , socket: {
        socketPath: null
        , port: 7200
        , host: 'localhost'
        , reconnect: true
        , delayReconnect: 1000
      }
  })
  .on('error', function(err) {
    // console.error(err.stack||err)
  })
  .on('ready', function() {
    console.log('Ready: '+this.pid+'')
    
    assert.strictEqual(ipem, this)
    
    ipem.on('online', function() {
      console.log(
        '%s process online: pid %s, route %j'
        , ipem.pid
        , this.from
        , this.pids
      )
      
      testScope.call(this)
    })
    
    ipem.on('offline', function(pid) {
      console.log(
        '%s process offline: pid %s, parent %s, route %j'
        , ipem.pid
        , pid
        , this.from
        , this.pids
      )
      
      testScope.call(this)
      
      if(ipem.childsOnline===0) {
        process.exit()
      }
    })
    
    // ping pong
    
    ipem.on('profile', function(was_type, durr) {
      // console.log('profile', was_type, durr, this.pids)
      testScope.call(this)
      
      profiler.reg(was_type)
      profiler.add(was_type, durr)
      // profiler.reg(this.from+'-'+was_type)
      // profiler.add(this.from+'-'+was_type, durr)
    })
    
    ipem.on('pong', function(nowPing, originPing, now, origin, was_type) {
      var n = Date.now()
      
      // console.log(
        // '%s pong %s %s ms %s ms %s ms %j'
        // , pad(ipem.pid, 5)
        // , pad(was_type, 10)
        // , pad(now-nowPing, 3)
        // , pad(n-now, 3)
        // , pad(n-nowPing, 3)
        // , this.pids
        // , originPing
      // )
      
      testScope.call(this)
      
      assert.strictEqual(ipem.pid, originPing)
      assert.strictEqual(this.pids.slice(-1)[0], originPing)
      assert.strictEqual(this.from, origin)
      
      ipem.sendToGrandMaster('profile', was_type, n-nowPing)
    })
    
    ipem.on('ping', function(now, origin) {
      
      var n = Date.now()
      
      // console.log(
        // '%s ping %s %s ms %j'
        // , pad(ipem.pid, 5)
        // , pad(this.type, 14)
        // , pad(n-now, 3)
        // , this.pids
      // )
      
      testScope.call(this)
      assert.strictEqual(this.pids[0], origin)
      assert.strictEqual(this.from, origin)
      
      ipem.sendTo(this.pids, 'pong', now, origin, n, ipem.pid, this.type)
    })
    
    function ping() {
      ipem.sendToParents('ping', Date.now(), ipem.pid)
      ipem.sendToChilds('ping', Date.now(), ipem.pid)
      ipem.sendToSiblings('ping', Date.now(), ipem.pid)
      ipem.broadcast('ping', Date.now(), ipem.pid)
      setTimeout(ping, 50)
    }
    
    if(ipem.isMaster) {
      ipem.worker()
      ipem.worker()
      ipem.worker()
      
      setInterval(function() {
        console.log('NETMAP', ipem.pid)
        ipem.printNetmap()
      }, 15000)
    } else {
      setTimeout(process.exit, Math.floor(Math.random()*30000))
    }
    
    if(ipem.isGrandMaster) {
      setInterval(function() {
        console.log('STATS', ipem.pid)
        profiler.display()
      }, 15000)
    }
    
    
    setTimeout(ping, 1000)
    
  })
.start()

function pad(v,n) {
  if(v.length>n) return v
  return (new Array(n+1).join(' ')+v).slice(-1*n)
}
