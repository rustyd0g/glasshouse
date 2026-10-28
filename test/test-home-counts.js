/* Row counts stay independent, including the TV app's visibility switches. */
var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');

function text(key, fallback, values) {
  return fallback.replace(/\{(\w+)\}/g, function (match, name) { return values[name]; });
}

var homeHtml = fs.readFileSync(path.join(__dirname, '../server/assets/home.html'), 'utf8');
var start = homeHtml.indexOf('  function rowNote(');
var end = homeHtml.indexOf('  function render()', start);
var lists = { app: [{ id: 'app1' }, { id: 'app2' }], dev: [{ port: 1 }, { port: 2 }], ch: [{ id: 'ch1' }] };
var view = {
  layout: {}, state: { arranging: false }, data: { order: { app: ['app1', 'app2'] }, sources: { channels: 1 } },
  t: text, folderItems: function () { return []; }, items: function (kind) { return lists[kind]; }
};
vm.runInNewContext(homeHtml.slice(start, end), view);
var keys = ['showAppCount', 'showInputCount', 'showChannelCount'], kinds = ['app', 'dev', 'ch'];
keys.forEach(function (key, index) {
  view.layout = {};
  view.layout[key] = false;
  kinds.forEach(function (kind, row) {
    assert.strictEqual(!!view.rowNote(kind, lists[kind]), row !== index, key + ' affects only its own heading');
  });
  view.layout[key] = true;
  assert.ok(view.rowNote(kinds[index], lists[kinds[index]]), key + ' can be switched back on');
});
view.layout.showChannelCount = false;
assert.strictEqual(view.rowNote('ch', []), 'Add channels in Glasshouse\u2019s Home settings', 'empty row guidance survives hiding the count');
view.data.sources.channels = 0;
assert.strictEqual(view.rowNote('ch', []), 'This TV has no channels tuned');

var tvHtml = fs.readFileSync(path.join(__dirname, '../server/assets/dashboard.html'), 'utf8');
start = tvHtml.indexOf('function glasshouseHomeRows(');
end = tvHtml.indexOf('\n}\n', start) + 3;
var tv = { t: text, head: function (label) { return { label: label, head: true }; } };
vm.runInNewContext(tvHtml.slice(start, end), tv);
var status = { supported: { ok: true }, enabled: true, writable: true, hideLgHomeAtStartAvailable: false, layout: {} };
function countRow(key) {
  return tv.glasshouseHomeRows(status).filter(function (row) { return row.key === key; })[0];
}
keys.forEach(function (key) {
  assert.strictEqual(countRow(key).act, 'homeShow');
  assert.strictEqual(countRow(key).on, true, 'older layouts show counts');
  status.layout[key] = false;
  assert.strictEqual(countRow(key).on, false);
  status.layout.view = 'alternative';
  assert.strictEqual(countRow(key).act, null, 'Alternative View has no row headings');
  assert.strictEqual(countRow(key).on, false, 'Alternative View preserves the saved choice');
  status.layout.view = 'standard';
  assert.strictEqual(countRow(key).act, 'homeShow');
  assert.strictEqual(countRow(key).on, false);
});
console.log('All Home row count assertions passed.');
