
Inter-process EventEmitter
==========================

### Inter-process EventEmitter over process.send and TCP/IP or UNIX Domain Sockets for node.js

### Installation

```npm install ipevents```

### Usage

Coming soon.

Anatomy of a message
--------------------

```js
{
  pid:  Number,String // The origin (pid) of the message.
  pids: Array         // An array of each pid the message passed.
  to: Number,String   // Target of the message. (.push())
  route: Array        // An array of process-pids representing
                      // the route the message should take. (.push())
  type: Number        // Type of the message (eg event, push, broadcast).
}
```

Class: IpEventEmitter
---------------------

Inherits from ``events.EventEmitter``

### Events

``ready``  
Emitted when the instance of IpEventEmitter is ready.
This event is exclusive to the process.

``online``  
Emitted to signal other processes that a new process connected.

### Properties

``.pid``  
The identifier of a process.

``.isMaster``  


``.isWorker``  

``.childsOnline``  

``.childs``  

### Methods

``.emit(eventName, arg1, arg2, ...)``  
Emits an event and sends it up to the parent-process.

``.push(pids, eventName, arg1, arg2, ...)``  
Pushes an event down to a specific child-process.
Once reached there, .push() emits the event.

``.broadcast(eventName, arg1, arg2, ...)``  
Sends an event to all child-processes listening to the event

``.fork(path, arguments)``  
Forks a new node child-process.

``.worker()``  
Forks a new child-process via the core cluster-module.

MIT License
-----------

Copyright (c) 2012 Oliver Leics <oliver.leics@gmail.com>

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
