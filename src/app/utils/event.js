'use strict';

const EventEmitter3 = require('eventemitter3');

class EventEmitter extends EventEmitter3 {
  emit(type, args={}) {
    if (args.preventDefault) super.emit(type, args);
    else super.emit(type, {...args, type});
  }
}

module.exports = EventEmitter;