/* Shared reads in the Home view: completion, retry and stale replies. */
var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');

console.log('Running test-home-refresh.js ...');
var html = fs.readFileSync(path.join(__dirname, '../server/assets/home.html'), 'utf8');
var start = html.indexOf('  function refreshJson(');
var end = html.indexOf('  // ---------------------------------------------------------------- stage', start);
assert.ok(start > 0 && end > start, 'the shared refresh helper exists');

function fixture() {
  var requests = [];
  var sandbox = {
    getJson: function (url, cb) { requests.push({ url: url, reply: cb }); }
  };
  vm.runInNewContext('var refreshGeneration = 0, layoutRevision = 0, pendingRefreshes = Object.create(null);\n' +
    html.slice(start, end) + '\nthis.view = { read: refreshJson, save: function () { layoutRevision++; },' +
    ' relaunch: function () { refreshGeneration++; } };', sandbox);
  return { view: sandbox.view, requests: requests };
}

(function sharedCompletion() {
  var f = fixture(), applied = [], finished = [];
  function apply(value) { applied.push(value); return value !== null; }
  function done(ok) { finished.push(ok); }
  f.view.read('/catalogue', apply, done);
  f.view.read('/catalogue', apply, done);
  f.view.read('/guide', apply, done);
  assert.strictEqual(f.requests.length, 2, 'different endpoints can run together; identical reads share');
  f.requests[0].reply('catalogue');
  assert.deepEqual(applied, ['catalogue'], 'the shared result is applied once');
  assert.deepEqual(finished, [true, true], 'every caller waiting for completion is released');
  f.requests[1].reply(null);
  assert.deepEqual(finished, [true, true, false], 'a failed read reports failure');
  f.view.read('/guide', apply, done);
  assert.strictEqual(f.requests.length, 3, 'failure releases the endpoint for a retry');
  f.requests[2].reply('guide');
  assert.deepEqual(applied, ['catalogue', null, 'guide']);
  console.log('  \u2713 shared reads apply once, notify all callers and retry after failure');
})();

(function saveInvalidatesPendingReads() {
  var f = fixture(), applied = [], finished = [];
  function apply(value) { applied.push(value); }
  f.view.read('/catalogue', apply, function (ok) { finished.push(ok); });
  f.view.save();
  f.view.read('/catalogue', apply, function (ok) { finished.push(ok); });
  assert.strictEqual(f.requests.length, 2, 'a save needs a fresh read');
  f.requests[0].reply('before save');
  assert.deepEqual(applied, [], 'the older catalogue cannot replace saved changes');
  assert.deepEqual(finished, [false], 'the invalidated caller is still released');
  f.view.read('/catalogue', apply);
  assert.strictEqual(f.requests.length, 2, 'an old reply cannot release a newer pending read');
  f.requests[1].reply('after save');
  assert.deepEqual(applied, ['after save']);
  assert.deepEqual(finished, [false, true]);
  console.log('  \u2713 saves reject older replies without releasing the newer read');
})();

(function relaunchInvalidatesPendingReads() {
  var f = fixture(), source = null, oldFinished = null;
  function apply(value) { source = value; }
  f.view.read('/now', apply, function (ok) { oldFinished = ok; });
  f.view.relaunch();
  f.view.read('/now', apply);
  f.requests[1].reply('new source');
  f.requests[0].reply('old source');
  assert.strictEqual(source, 'new source', 'a late reply cannot undo the relaunched source');
  assert.strictEqual(oldFinished, false);
  console.log('  \u2713 a late reply after a relaunch cannot restore an old source');
})();

(function completionCanStartAnotherRead() {
  var f = fixture();
  f.view.read('/guide', function () {}, function () { f.view.read('/guide', function () {}); });
  f.requests[0].reply({});
  assert.strictEqual(f.requests.length, 2, 'completion can request a new read');
  console.log('  \u2713 completion callbacks can start another read');
})();

console.log('All home refresh tests passed.');
