require("../common");
var events = require('events');

var t = 0;

var e = new events.EventEmitter();
e.on("test", function(amount) {
  if (isNaN(amount)) amount = 1;
  t += amount;
});

e.emit("test");
assert.equal(1, t);

e.suppress("test", true);

e.emit("test");
assert.equal(1, t);
assert.equal(1, e._buffer.length)

e.emit("test");
assert.equal(1, t);
assert.equal(2, e._buffer.length)

//2 events should have been buffered...
e.unsuppress("test");
assert.equal(3, t);

//now test buffering w/ arguments
e.suppress("test", true);
e.emit("test", 2);
assert.equal(3, t);
e.unsuppress("test");
assert.equal(5, t);

//buffering with multiple arguments
var a1 = 0, a2 = 0, a3 = 0;
e.on("test2", function(arg1, arg2, arg3) {
  a1 = arg1;
  a2 = arg2;
  a3 = arg3;
});
e.suppress("test2", true);
e.emit("test2", 2, 3, 4);
assert.equal(0, a1);
assert.equal(0, a2);
assert.equal(0, a3);
e.unsuppress("test2");
assert.equal(2, a1);
assert.equal(3, a2);
assert.equal(4, a3);

//suppressing & buffering on multiple events, re-rolling events in the original order
var arr = [];
function pushnum(num) {
  arr.push(num);
}
e.on("test3", pushnum);
e.on("test4", pushnum);
e.suppress(["test3", "test4"], true);
e.emit("test3", 1);
e.emit("test4", 2);
e.emit("test3", 3);
e.emit("test3", 4);
e.emit("test4", 5);
e.unsuppress(["test3", "test4"]);
assert.equal("1,2,3,4,5", arr.join(","));

//odd case, where a re-suppression happens during the re-rolling stage of an unsuppress call
arr = [];
function pushnum2(num) {
  if (num === 0) {
    e.suppress("test5", true);
  } else {
    arr.push(num);
  }
}
e.on("test5", pushnum2);
e.suppress("test5", true);
e.emit("test5", 1);
e.emit("test5", 2);
e.emit("test5", 0);
e.emit("test5", 3);
e.emit("test5", 4);
e.unsuppress("test5");
assert.equal("1,2", arr.join(","));
e.unsuppress("test5");
assert.equal("1,2,3,4", arr.join(","));

//another odd case, where re-suppression happens during re-roll for a multi-event suppression
arr = [];
function pushnum3(num) {
  if (num === 0) {
    e.suppress(["test6", "test7"], true);
  } else {
    arr.push(num);
  }
}
e.on("test6", pushnum3);
e.on("test7", pushnum3);
e.suppress(["test6", "test7"], true);
e.emit("test6", 1);
e.emit("test7", 2);
e.emit("test6", 0);
e.emit("test7", 3);
e.emit("test6", 4);
e.emit("test7", 5);
e.unsuppress(["test6", "test7"]);
assert.equal("1,2", arr.join(","));
e.unsuppress(["test6", "test7"]);
assert.equal("1,2,3,4,5", arr.join(","));

//similar to last one except re-suppression on only 1 of the events
arr = [];
function pushnum4(num) {
  if (num === 0) {
    e.suppress("test8", true);
  } else {
    arr.push(num);
  }
}
e.on("test8", pushnum4);
e.on("test9", pushnum4);
e.suppress(["test8", "test9"], true);
e.emit("test8", 1);
e.emit("test9", 2);
e.emit("test8", 0);
e.emit("test9", 3);
e.emit("test8", 4);
e.emit("test9", 5);
e.unsuppress(["test8", "test9"]);
assert.equal("1,2,3,5", arr.join(","));
e.unsuppress("test8");
assert.equal("1,2,3,5,4", arr.join(","));

//suppress/unsuppress all events
var num = 0;
function increment(){
  num++;
}
e.on("test10", increment);
e.on("test11", increment);
e.on("test12", increment);
e.suppress();
e.emit("test10");
e.emit("test11");
e.emit("test12");
assert.equal(0, num);
e.unsuppress();
e.emit("test10");
e.emit("test11");
e.emit("test12");
assert.equal(3, num);

//suppress/unsuppress all events w/ buffering
num = 0;
e.suppress(null, true);
e.emit("test10");
e.emit("test11");
e.emit("test12");
assert.equal(0, num);
e.unsuppress();
assert.equal(3, num);

//suppress/unsuppress and bypass re-emission of buffered events
num = 0;
e.suppress(null, true);
e.emit("test10");
e.emit("test11");
e.emit("test12");
assert.equal(0, num);
e.unsuppress(null, true);
assert.equal(0, num);

//suppress multiple events, unsuppress subset, prove correct listeners stay in buffer
var val = {a: 0, b: 0, c: 0};
e.on("a", function(args) {
  val.a++;
});
e.on("b", function(args) {
  val.b++;
});
e.on("c", function(args) {
  val.c++;
});
e.suppress(["a", "b", "c"], true);
e.emit("a");
e.emit("b");
e.emit("c");
assert.equal(0, val.a);
assert.equal(0, val.b);
assert.equal(0, val.c);
e.unsuppress("b");
assert.equal(0, val.a);
assert.equal(1, val.b);
assert.equal(0, val.c);
e.unsuppress("c");
assert.equal(1, val.c);
e.unsuppress("a");
assert.equal(1, val.a);