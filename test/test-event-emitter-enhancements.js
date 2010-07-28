require("../common");
var events = require('events');

var t = 0;
var t2 = 0;

var e = new events.EventEmitter();
e.on("test", function() {
  t++;
});
e.once("test", function() { //test one-time listeners
  t2++;
});

e.emit("test");
assert.equal(1, t);
assert.equal(1, t2);

e.emit("test");
assert.equal(2, t);
assert.equal(1, t2);

//test event suppression ----
e.suppress("test");
e.emit("test");
assert.equal(2, t);
assert.equal(1, t2);
e.emit("test");
assert.equal(2, t);
assert.equal(1, t2);

//test unsupression ----
e.unsuppress("test");
e.emit("test");
assert.equal(3, t);
assert.equal(1, t2);

//test suppressOnce ----
e.suppressOnce("test");
e.emit("test");
assert.equal(3, t);
assert.equal(1, t2);
e.emit("test");
assert.equal(4, t);
assert.equal(1, t2);