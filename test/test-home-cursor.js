/* The native cursor shape is restored without forcing pointer mode on. */
var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var html = fs.readFileSync(path.join(__dirname, '../server/assets/home.html'), 'utf8');
var start = html.indexOf('  function restorePointerCursor(');
var end = html.indexOf('\n  }', start);
assert.ok(start > 0 && end > start);
var source = html.slice(start, end + 4);

function fixture(system, legacy, hidden) {
  var sandbox = { window: { webOSSystem: system, PalmSystem: legacy }, document: { hidden: !!hidden } };
  vm.runInNewContext(source, sandbox);
  return sandbox.restorePointerCursor;
}

['webOSSystem', 'PalmSystem'].forEach(function (name) {
  var calls = [];
  var system = {
    setCursor: function (shape) { assert.strictEqual(this, system); calls.push(shape); },
    setCursorHidden: function () { assert.fail('pointer-mode visibility belongs to webOS'); }
  };
  fixture(name === 'webOSSystem' ? system : null, name === 'PalmSystem' ? system : null)();
  assert.deepEqual(calls, ['default'], name + ' restores the native cursor shape');
  fixture(system, null, true)();
  assert.strictEqual(calls.length, 1, 'a background page cannot change the active app cursor');
});

var restored = 0;
fixture({}, { setCursor: function () { restored++; } })();
assert.strictEqual(restored, 1, 'an older bridge can supply the method');
assert.doesNotThrow(fixture(null, null), 'an ordinary browser needs no native cursor bridge');
assert.doesNotThrow(fixture({ setCursor: function () { throw new Error('unavailable'); } }, null),
  'a refused cursor reset must not stop Home returning or hovering');
console.log('Home cursor compatibility assertions passed.');
