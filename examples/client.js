
var ipem = require('..')

ipem
  .options({
    restart: true
    , delayRestart: 0
    , useSocket: true
    , socket: {
        onlyConnect: true
        , socketPath: null
        , port: 7200
        , host: 'localhost'
        , reconnect: true
        , delayReconnect: 1000
      }
  })
  .on('error', function(err) {
    console.error(err.stack||err)
  })
  .on('ready', function() {
    console.log('Ready: '+this.pid+'')
  })
  .on('parent', function(pid) {
    console.log('parent', pid)
  })
  .on('online', function(err) {
    console.log(
      '%s process online: pid %s, route %j'
      , ipem.pid
      , this.from
      , this.pids
    )
  })
  .on('offline', function(pid) {
    console.log(
      '%s process offline: pid %s, parent %s, route %j'
      , ipem.pid
      , pid
      , this.from
      , this.pids
    )
  })
.start()
