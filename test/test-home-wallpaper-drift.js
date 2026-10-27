/* Wallpaper motion keeps its phase through hiding, image changes and reloads. */
var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');

console.log('Running test-home-wallpaper-drift.js ...');
var html = fs.readFileSync(path.join(__dirname, '../server/assets/home.html'), 'utf8');
var start = html.indexOf('  var WALL_DRIFT_MS =');
var end = html.indexOf('  function wallpaperOpacity(', start);
assert.ok(start > 0 && end > start, 'the wallpaper motion helpers exist');

function fixture(saved, unavailable) {
  var now = 1000, stored = saved, listener, motion = { style: {} };
  var media = { matches: false, addListener: function (cb) { listener = cb; } };
  var sandbox = {
    Date: { now: function () { return now; } }, document: { hidden: false }, wallShown: null,
    $: function () { return motion; }, window: {
      matchMedia: function () { return media; },
      localStorage: {
        getItem: function () { if (unavailable) throw new Error('storage unavailable'); return stored; },
        setItem: function (key, value) { if (unavailable) throw new Error('storage unavailable'); stored = value; }
      }
    }
  };
  vm.runInNewContext(html.slice(start, end) + '\nthis.view = { restore: restoreWallpaperDrift,' +
    ' sync: syncWallpaperDrift, save: rememberWallpaperDrift, phase: function () { return wallpaperDriftPhase(Date.now()); } };', sandbox);
  sandbox.view.restore();
  return {
    view: sandbox.view, style: motion.style, stored: function () { return stored; },
    advance: function (ms) { now += ms; },
    image: function (id) { sandbox.wallShown = id; sandbox.view.sync(); },
    hidden: function (hidden) { sandbox.document.hidden = hidden; sandbox.view.sync(); },
    reduced: function (reduce) { media.matches = reduce; listener(); }
  };
}

(function pauseAndReload() {
  var f = fixture('225000');
  assert.strictEqual(f.style.animationDelay, '-225000ms', 'the return half of the cycle is restored');
  assert.strictEqual(f.style.webkitAnimationDelay, '-225000ms', 'older webOS restores the same crop');
  f.advance(10000);
  assert.strictEqual(f.view.phase(), 225000, 'motion waits for a picture');
  f.image('morning');
  assert.strictEqual(f.style.animationPlayState, 'running');
  f.advance(5000);
  f.hidden(true);
  assert.strictEqual(f.style.animationPlayState, 'paused');
  assert.strictEqual(f.stored(), '230000', 'hiding saves the visible phase');
  f.advance(120000);
  assert.strictEqual(f.view.phase(), 230000, 'time in another app does not advance the crop');
  f.hidden(false);
  f.advance(1000);
  f.view.save();
  assert.strictEqual(f.stored(), '231000');
  assert.strictEqual(f.style.animationDelay, '-225000ms', 'resuming does not apply the elapsed time twice');
  var reloaded = fixture(f.stored());
  assert.strictEqual(reloaded.style.animationDelay, '-231000ms', 'reloading keeps the crop and direction');
  console.log('  \u2713 hiding pauses and reloads restore the saved crop and direction');
})();

(function imageChangesAndReducedMotion() {
  var f = fixture('359000');
  f.image('morning');
  f.advance(2000);
  f.image('afternoon');
  assert.strictEqual(f.view.phase(), 1000, 'image changes preserve the cycle through its wrap');
  f.reduced(true);
  assert.strictEqual(f.style.animationPlayState, 'paused');
  f.advance(10000);
  assert.strictEqual(f.view.phase(), 1000, 'reduced motion holds the crop');
  f.reduced(false);
  f.advance(500);
  f.image(null);
  assert.strictEqual(f.style.webkitAnimationPlayState, 'paused');
  f.advance(10000);
  assert.strictEqual(f.view.phase(), 1500, 'a blank background does not keep moving');
  console.log('  \u2713 image changes keep the phase; reduced motion and blank backgrounds pause it');
})();

(function unavailableStorage() {
  ['invalid', '-1', 'Infinity', '360000'].forEach(function (saved) {
    assert.strictEqual(fixture(saved).view.phase(), 0, 'invalid stored phases are ignored');
  });
  var f = fixture(null, true);
  f.image('morning');
  f.advance(1000);
  f.hidden(true);
  f.hidden(false);
  assert.strictEqual(f.view.phase(), 1000, 'motion still pauses and resumes without storage');
  console.log('  \u2713 malformed or unavailable storage does not interrupt wallpaper motion');
})();

console.log('All wallpaper drift tests passed.');
