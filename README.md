
Inter-process Event-Emitter
==========================

### Inter-process Event-Emitter over process.send and TCP/IP or UNIX Domain Sockets for node.js

### Installation

```npm install ipevents```

### Usage

```js
var ipem = require('ipevents')

ipem
  .options({
  })
  .on('ready', function() {
    console.log('ready', this.pid)
    
    ipem.on('online', function() {
      console.log('process online', this.pid, this.pids)
    })
    ipem.on('offline', function() {
      console.log('process online', this.pid, this.pids)
    })
  })
.start()
```

Anatomy of a message
--------------------

```js
{
  from: Number,String // The origin (pid) of the message.
  pids: Array         // An array of each pid the message passed.
  to: Number,String   // Target of the message.
  route: Array        // An array of process-pids representing
                      // the route the message should take.
  type: Number        // Type of the message (eg event, push, broadcast).
  event: String       // Name of the event.
  args: Array         // Array of arguments for the event
}
```

API
---

### Options

``restart`` (default: true)  
Automatically restart child-processes.

``delayRestart`` (default: 1000)  
Delay automatic restart of a child-process in milliseconds.

``useSocket`` (default: true)  
Use a TCP/IP or UNIX Domain Socket to shim process.send.

``socket.socketPath`` (default: null)  
The path for to the UNIX Domain Socket.

``socket.port`` (default: 7100)  
The port for TCP/IP connections.

``socket.host`` (default: localhost)  
The host for TCP/IP connections.

``socket.reconnect`` (default: true)  
Automatically reconnect to server.

``socket.delayReconnect`` (default: 3000)  
Delay automatic reconnects in milliseconds.

### Attributes

``.pid`` (String)  
The identifier of the process.

``.parentPid`` (String, null)  
The identifier of the parent-process (if any).

``.childsOnline`` (Number)  
Number of child-processes.

``.isGrandMaster`` (Boolean)  
Boolean TRUE if the process is the very top process.

``.isMaster`` (Boolean)  
Boolean TRUE if the process is a master according to cluster.isMaster

``.isWorker`` (Boolean)  
Boolean TRUE if the process is a master according to cluster.isWorker

### Functions

``.options(options)``  
Sets the options for the inter-process event emitter.

#### Functions: Events

``.bubble(eventName, arg1, arg2, ...)``  
Emits an event and sends it up to the parent-process.

``.sendToParents(eventName, arg1, arg2, ...)``  
Sends an event up to the parent-processes.

``.sendToChilds(eventName, arg1, arg2, ...)``  
Sends an event down to the child-processes.

``.sendToSiblings(eventName, arg1, arg2, ...)``  
Sends an event to all siblings of the process.

``.sendToGrandMaster(eventName, arg1, arg2, ...)``  
Sends an event to the grand master.

``.sendToChild(pid, eventName, arg1, arg2, ...)``  
Sends an event to a specific child-process.

``.sendTo(pids, eventName, arg1, arg2, ...)``  
Pushes an event to a specific process.

``.broadcast(eventName, arg1, arg2, ...)``  
Sends an event to all processes.

#### Functions: Processes

``.fork(path, arguments)``  
Forks a new node child-process.

``.worker()``  
Forks a new child-process via the core cluster-module.

### Events

``ready``  
Emitted when the inter-process event emitter is ready.
This event is exclusive to the process.

``online``  
Emitted to signal other processes that a new process connected.

``offline``  
Emitted on the exit of a process.

MIT License
-----------

Copyright (c) 2012 Oliver Leics <oliver.leics@gmail.com>

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
