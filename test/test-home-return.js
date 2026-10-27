/* Returning to Home must settle the displayed rows before any refresh replies. */
var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');

console.log('Running test-home-return.js ...');
var html = fs.readFileSync(path.join(__dirname, '../server/assets/home.html'), 'utf8');
var source = ['paint', 'land', 'landAll', 'returned'].map(function (name) {
  var start = html.indexOf('  function ' + name + '(');
  var end = html.indexOf('\n  }', start);
  assert.ok(start > 0 && end > start, name + ' exists in the Home view');
  return html.slice(start, end + 4);
}).join('\n');

function fixture(faded, tracks) {
  var elements = {}, loads = [];
  Object.keys(tracks).forEach(function (key) {
    var track = { style: { transform: 'translateX(-' + tracks[key].x + 'px)' } };
    elements[key] = { track: track, querySelector: function () { return track; } };
  });
  var sandbox = {
    tracks: tracks, state: { row: 1, col: { app: 4, dev: 2 }, bar: -1, arranging: false },
    refreshGeneration: 0, verticalAnchor: null, faded: faded, GLIDE_OUT: 65, FADE_WAIT_MS: 500,
    okTimer: null, clearTimeout: function () {}, setTimeout: function () {},
    fadeIn: function () {}, closeRecents: function () {}, keepSearch: function () {},
    readLaunchParams: function () {}, updateWall: function () {}, stopPointing: function () {},
    beat: function () {}, load: function (cb, arranging, onNow) { loads.push({ cb: cb, onNow: onNow }); },
    rowElOf: function (key) { return elements[key] || null; },
    trackOf: function (key) { return tracks[key]; }
  };
  vm.runInNewContext(source + '\nthis.view = { returned: returned };', sandbox);
  return { view: sandbox.view, state: sandbox.state, elements: elements, loads: loads };
}

[false, true].forEach(function (faded) {
  var tracks = {
    app: { x: 48, target: 160, max: 1500, v: 100, gv: 0 },
    dev: { x: 130, target: 210, max: 500, v: -20, gv: 800 },
    ch: { x: 275, target: 275, max: 300, v: 0, gv: 800 }
  };
  var f = fixture(faded, tracks);
  f.view.returned();
  assert.strictEqual(f.loads.length, 1, 'the catalogue is still pending');
  assert.strictEqual(f.elements.app.track.style.transform, 'translateX(-160px)', 'an inactive row settles visually');
  assert.strictEqual(f.elements.dev.track.style.transform, 'translateX(-262px)', 'a gliding row settles at its landing point');
  assert.strictEqual(f.elements.ch.track.style.transform, 'translateX(-300px)', 'landing stays inside the row end');
  Object.keys(tracks).forEach(function (key) {
    assert.strictEqual(tracks[key].x, tracks[key].target, key + ' is at rest');
    assert.strictEqual(tracks[key].v, 0, key + ' has no remaining spring velocity');
    assert.strictEqual(tracks[key].gv, 0, key + ' has no remaining glide velocity');
    assert.strictEqual(f.elements[key].track.style.webkitTransform, f.elements[key].track.style.transform,
      key + ' also settles on older webOS browsers');
  });
  assert.strictEqual(f.state.row, 1, 'the focused row is preserved');
  assert.deepEqual(f.state.col, { app: 4, dev: 2 }, 'the focused columns are preserved');
  console.log('  \u2713 interrupted scrolls settle before refresh replies, with fading ' + (faded ? 'on' : 'off'));
});

(function missingRows() {
  var cold = fixture(false, {});
  cold.view.returned();
  assert.strictEqual(cold.loads.length, 1, 'a return before the first catalogue still loads it');
  var f = fixture(false, { recents: { x: 25, target: 80, max: 200, v: 0, gv: 0 } });
  delete f.elements.recents;
  f.view.returned();
  assert.strictEqual(f.loads.length, 1, 'a removed track does not interrupt returning');
  console.log('  \u2713 returning tolerates rows not yet loaded or already removed');
})();

console.log('All home return tests passed.');
