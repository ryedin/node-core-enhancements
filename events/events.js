exports.EventEmitter = process.EventEmitter;

var isArray = Array.isArray;

process.EventEmitter.prototype.emit = function (type) {
  // putting this here will allow the 'error' event to be suppressed, which I suppose could be 
  // useful/valid for certain debugging scenarios. If deemed evil to do that, we can simply move this 
  // bit of logic to be after the error event stuff below
  if (this._suppressAll
      || (this._suppressOnceEvents && this._suppressOnceEvents[type]) 
      || (this._suppressEvents && this._suppressEvents[type])) {
    
    if (this._suppressOnceEvents) {
      delete this._suppressOnceEvents[type];
    }
    //buffer events for re-emitting later if required
    if (this._bufferedEvents && (this._bufferedEvents[type] || this._bufferAll)) {
      this._buffer.push({type: type, args: toArray(arguments)});
    }
    return false;
  }
  
  // If there is no 'error' event listener then throw.
  if (type === 'error') {
    if (!this._events || !this._events.error ||
        (isArray(this._events.error) && !this._events.error.length))
    {
      if (arguments[1] instanceof Error) {
        throw arguments[1];
      } else {
        throw new Error("Uncaught, unspecified 'error' event.");
      }
      return false;
    }
  }

  if (!this._events) return false;
  if (!this._events[type]) return false;

  if (typeof this._events[type] == 'function') {
    if (arguments.length < 3) {
      // fast case
      this._events[type].call( this
                             , arguments[1]
                             , arguments[2]
                             );
    } else {
      // slower
      var args = Array.prototype.slice.call(arguments, 1);
      this._events[type].apply(this, args);
    }
    //get rid of the listener if it's marked to only execute one time
    if (this._events[type].__once) this.removeListener(type, this._events[type]);
    return true;

  } else if (isArray(this._events[type])) {
    var args = Array.prototype.slice.call(arguments, 1);

    //placeholder in case we need to get rid of 'once' handlers (avoid creating the array if it's never needed)
    //(don't want to remove them within the loop so-as not to muck with the indices)
    var oneShotListeners;

    var listeners = this._events[type].slice(0);
    for (var i = 0, l = listeners.length; i < l; i++) {
      listeners[i].apply(this, args);
      if (listeners[i].__once) {
        oneShotListeners = oneShotListeners || [];
        oneShotListeners.push(listeners[i]);
      }
    }    
    //get rid of any one-timers
    if (oneShotListeners) {
      for (var ii = 0, ll = oneShotListeners.length; ii < ll; ii++) {
        this.removeListener(type, oneShotListeners[ii]);
      }
    }
    return true;

  } else {
    return false;
  }
};

// process.EventEmitter is defined in src/node_events.cc
// process.EventEmitter.prototype.emit() is also defined there.
process.EventEmitter.prototype.addListener = function (type, listener, fireOnce) {
  if ('function' !== typeof listener) {
    throw new Error('addListener only takes instances of Function');
  }

  if (!this._events) this._events = {};
  
  //attach listener metadata to indicate if it should only execute one time or every time
  if (fireOnce === true) listener.__once = true; //add underscores to defend against super-edge case of listener already have a .once property

  // To avoid recursion in the case that type == "newListeners"! Before
  // adding it to the listeners, first emit "newListeners".
  this.emit("newListener", type, listener);

  if (!this._events[type]) {
    // Optimize the case of one listener. Don't need the extra array object.
    this._events[type] = listener;
  } else if (isArray(this._events[type])) {
    // If we've already got an array, just append.
    this._events[type].push(listener);
  } else {
    // Adding the second element, need to change to array.
    this._events[type] = [this._events[type], listener];
  }

  return this;
};

process.EventEmitter.prototype.on = process.EventEmitter.prototype.addListener;

//convenience method for attaching one-time listeners
process.EventEmitter.prototype.once = function(type, listener) {
  return this.on(type, listener, true);
};

process.EventEmitter.prototype.removeListener = function (type, listener) {
  if ('function' !== typeof listener) {
    throw new Error('removeListener only takes instances of Function');
  }

  // does not use listeners(), so no side effect of creating _events[type]
  if (!this._events || !this._events[type]) return this;

  var list = this._events[type];

  if (isArray(list)) {
    var i = list.indexOf(listener);
    if (i < 0) return this;
    list.splice(i, 1);
    if (list.length == 0)
      delete this._events[type];
  } else if (this._events[type] === listener) {
    delete this._events[type];
  }

  return this;
};

process.EventEmitter.prototype.removeAllListeners = function (type) {
  // does not use listeners(), so no side effect of creating _events[type]
  if (type && this._events && this._events[type]) this._events[type] = null;
  return this;
};

process.EventEmitter.prototype.listeners = function (type) {
  if (!this._events) this._events = {};
  if (!this._events[type]) this._events[type] = [];
  if (!isArray(this._events[type])) {
    this._events[type] = [this._events[type]];
  }
  return this._events[type];
};

/**
 * allow events to be suppressed by event type, and optionally buffered for re-emitting after unsuppression
 * pass null or nothing in for type param to indicate that all events should be suppressed
 * note: if suppressing all events, the only way to unsuppress any events is to unsuppress them all.
 * In other words, I'm doing no internal tracking/checking of "unsuppressed" event names against all possible events if _suppressAll is true 
 * (this is so the logic can remain fairly light; i.e. some edge cases are not currently supported)
 * @param {String | String[]} type - the event name to suppress, or an array of event names to suppress
 * @param {Boolean} buffer - flag to indicate whether the suppressed events should be buffered for re-emission after unsuppress
 * @param {Boolean} once - flag to indicate whether the event(s) should only be suppressed one time
 */
process.EventEmitter.prototype.suppress = function(type, buffer, once) {
  this._suppressEvents = this._suppressEvents || {};
  this._suppressOnceEvents = this._suppressOnceEvents || {};
  var suppressionTarget = once ? this._suppressOnceEvents : this._suppressEvents;
  //instance level queue for all events so re-firing mixed suppressed events can be in the original order
  buffer && (this._buffer = this._buffer || []);
  //state object to track events that should be buffered
  buffer && (this._bufferedEvents = this._bufferedEvents || {});
  if (typeof type === "undefined" || type === null) {
    this._suppressAll = true;
    buffer && (this._bufferAll = true);
  } else {
    if (Array.isArray(type)) {
      for (var i = 0, l = type.length; i < l; i++) {
        suppressionTarget[type[i]] = true;
        buffer && (this._bufferedEvents[type[i]] = true);
      }
    } else {
      suppressionTarget[type] = true;
      buffer && (this._bufferedEvents[type] = true);
    }
  }  
};

/**
 * convenience alias for suppressing events one time
 * @param {String | String[]} type - the event name to suppress, or an array of event names to suppress
 * @param {Boolean} buffer - flag to indicate whether the suppressed events should be buffered for re-emission after unsuppress
 */
process.EventEmitter.prototype.suppressOnce = function(type, buffer) {
  this.suppress(type, buffer, true);
};

/**
 * un-suppress events by event type, optionally re-emitting any buffered events in the process
 * @param {String | String[]} type - the event name to un-suppress, or an array of event names to un-suppress
 * @param {Boolean} bypassRefiring - flag to indicate whether buffered events should be re-emitted or not (true means events are NOT re-emitted. defaults to false)
 */
process.EventEmitter.prototype.unsuppress = function(type, bypassRefiring) {
  //sanity assignments of the state objects to defend against case where .unsuppress is called before .suppress is ever called
  this._suppressEvents = this._suppressEvents || {};
  this._suppressOnceEvents = this._suppressOnceEvents || {};
  bypassRefiring = !!bypassRefiring; //normalize to proper bool
  var unsuppressAll = (typeof type === "undefined" || type === null);
  if (unsuppressAll) {
    //reset/remove all state flags
    this._suppressAll = false;
    this._bufferAll = false;
    delete this._suppressEvents;
    delete this._suppressOnceEvents;
    delete this._bufferedEvents;    
  } else if (!this._suppressAll) {
    //normalize type to an array
    type = Array.isArray(type) ? type : [type];
    var currType;
    for (var i = 0, l = type.length; i < l; i++) {
      currType = type[i];
      delete this._suppressEvents[currType];
      delete this._suppressOnceEvents[currType];      
    }    
  } else {
    //if we're currently suppressing all events, and .unsuppress is called with a granular event name or event list,
    //since we're not supporting this case (see comments for .suppress method), throw an error to alert
    //the developer that this is not a supported case currently and they should change their code.
    throw new Error("Cannot unsuppress a subset of events when the event emitter is currenly suppressing ALL events. Please change this call to unsuppress all events by passing either nothing or null in as the first argument.");
  }
  
  //if we got this far, now re-emit all appropriate buffered events
  if (this._buffer) {
    //do the loop thing
    var currEvent,
        length = this._buffer.length, //cache original length so we can stop the loop at the right spot if events get re-queued (which is possible for some supported cases)
        index = 0,
        offset = 0,
        mismatches = {}, //a cache to index mismatching types to minimize .indexOf lookups in the loop
        matches = {}; //a cache to index the types after first matching lookup to minimize .indexOf calls in the loop
    while (this._buffer && index < length) {
      if (this._buffer.length > 0) {
        currEvent = this._buffer[offset];
        //re-emit the event if type matches one of the passed in types or if we're unsuppressing all
        //note: even though suppress could be re-called during this process,
        //we'll go through the whole loop (up to the original length of the buffer)
        //this supports the case where a subset of events are re-suppressed and some of them are not
        if (!mismatches[currEvent.type] 
            && (unsuppressAll 
                || matches[currEvent.type] 
                || type.indexOf(currEvent.type) > -1)) {
          //cache this type to avoid an indexOf lookup next time the same type is checked
          matches[currEvent.type] = true;
          //take it out of the buffer
          this._buffer.splice(offset, 1);          
          //finally, re-emit unless told not to at the call level
          !bypassRefiring && process.EventEmitter.prototype.emit.apply(this, currEvent.args);
        } else {
          //mark this event type as a mismatch to avoid unneccesary lookup/checks next time one is found
          mismatches[currEvent.type] = true;
          offset++;
        }
        if (this._buffer.length == 0) delete this._buffer;
        index++;
      } else {
        delete this._buffer;
      }
    }
  }
};

exports.Promise = function removed () {
  throw new Error(
    'Promise has been removed. See '+
    'http://groups.google.com/group/nodejs/msg/0c483b891c56fea2 for more information.');
}
process.Promise = exports.Promise;

/**
 * Convert array-like object to an Array.
 *
 * node-bench: "16.5 times faster than Array.prototype.slice.call()"
 *
 * @param {Object} obj
 * @return {Array}
 * @api private
 */

function toArray(obj){
    var len = obj.length,
        arr = new Array(len);
    for (var i = 0; i < len; ++i) {
        arr[i] = obj[i];
    }
    return arr;
}