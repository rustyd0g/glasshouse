/* Home-first cold boots open Glasshouse Home without displacing a chosen app. */
var assert = require('assert');
var child = require('child_process');
var fs = require('fs');
var os = require('os');
var path = require('path');

console.log('Running test-home-boot.js ...');

var hook = fs.readFileSync(path.join(__dirname, '../server/50-tvweb.sh'), 'utf8');
var source = hook.match(/^home_open_at_boot\(\) \{\n[\s\S]*?^\}/m);
assert.ok(source, 'the boot hook has its Home launch function');
var dir = fs.mkdtempSync ? fs.mkdtempSync(path.join(os.tmpdir(), 'home-boot-'))
  : path.join(os.tmpdir(), 'home-boot-' + process.pid + '-' + Date.now());
if (!fs.existsSync(dir)) fs.mkdirSync(dir);
process.on('exit', function () {
  fs.readdirSync(dir).forEach(function (file) { fs.unlinkSync(path.join(dir, file)); });
  fs.rmdirSync(dir);
});

function quote(value) { return "'" + value.replace(/'/g, "'\\''") + "'"; }
var marker = path.join(dir, 'opened');
var launches = path.join(dir, 'launches');
var script = path.join(dir, 'boot.sh');
var replacements = {
  '/var/lib/tvweb/home.json': path.join(dir, 'home.json'),
  '/var/log/bootd.log': path.join(dir, 'bootd.log'),
  '/tmp/glasshouse-home-opened-at-boot': marker
};
var code = source[0];
Object.keys(replacements).forEach(function (file) {
  code = code.split(file).join(quote(replacements[file]));
});
// Only this function runs: none of the boot hook's mounts, kills or services.
fs.writeFileSync(script, 'webos_major=$BOOT_TEST_WEBOS\n' + code + '\nhome_open_at_boot\n');
fs.writeFileSync(path.join(dir, 'luna-send'), '#!/bin/sh\n' +
  'case "$3" in\n' +
  '  */getSystemSettings) printf \'%s\\n\' "$BOOT_TEST_SETTINGS" ;;\n' +
  '  */getPowerOnReason) printf \'%s\\n\' "$BOOT_TEST_REASON" ;;\n' +
  '  */getConfigs) printf \'%s\\n\' "$BOOT_TEST_REASONS" ;;\n' +
  '  */getForegroundAppInfo) printf \'%s\\n\' "$BOOT_TEST_FRONT" ;;\n' +
  '  */launch) printf \'%s\\n\' "$4" >> "$BOOT_TEST_LAUNCHES"; printf \'%s\\n\' "$BOOT_TEST_LAUNCH_REPLY" ;;\n' +
  '  *) exit 1 ;;\n' +
  'esac\n', { mode: 493 });

var LG_HOME = 'com.webos.app.home';
var LIVE_TV = 'com.webos.app.livetv';
var YOUTUBE = 'youtube.leanback.v4';
var cases = [
  { name: 'Home first and still in front', boot: LG_HOME, front: LG_HOME, target: LG_HOME },
  { name: 'YouTube opened after Home, as in the C3 log', boot: LG_HOME, front: YOUTUBE, later: YOUTUBE },
  { name: 'an input selected after Home', boot: LG_HOME, front: LIVE_TV },
  { name: 'no foreground reply', boot: LG_HOME, front: '' },
  { name: 'Live TV still in front', boot: LIVE_TV, front: LIVE_TV, target: LG_HOME },
  { name: 'HDMI still in front', boot: 'com.webos.app.hdmi2', front: 'com.webos.app.hdmi2', target: LG_HOME },
  { name: 'Home respawned after starting on Live TV', boot: LIVE_TV, front: LG_HOME, target: LG_HOME },
  { name: 'an app selected after Live TV', boot: LIVE_TV, front: YOUTUBE },
  { name: 'a different starting app', boot: YOUTUBE, front: LG_HOME },
  { name: 'no recorded starting app', boot: '', front: LG_HOME },
  { name: 'Home Auto Launch switched off', boot: LG_HOME, front: LG_HOME, autoLaunch: 'off' },
  { name: 'saved auto launch while LG has it held off', boot: LG_HOME, front: LG_HOME,
    savedAutoLaunch: 'on', autoLaunch: 'off', target: LG_HOME },
  { name: 'a channel-update boot', boot: LG_HOME, front: LG_HOME, reason: 'channelUpdate' },
  { name: 'no configured reason list uses LG defaults', boot: LG_HOME, front: LG_HOME, noReasons: true, target: LG_HOME },
  { name: 'the TV supplies its own allowed power-on reasons', boot: LG_HOME, front: LG_HOME,
    reason: 'customKey', reasons: ['customKey'], target: LG_HOME },
  { name: 'standalone Home on webOS 5', boot: LG_HOME, front: LG_HOME, webos: 5, target: 'com.tvweb.home' },
  { name: 'a refused launch leaves no boot marker', boot: LG_HOME, front: LG_HOME, target: LG_HOME, launchOk: false }
];

function run(index) {
  if (index === cases.length) return console.log('ALL test-home-boot.js assertions passed!');
  var test = cases[index], env = {};
  Object.keys(process.env).forEach(function (key) { env[key] = process.env[key]; });
  env.PATH = dir + path.delimiter + process.env.PATH;
  env.BOOT_TEST_WEBOS = String(test.webos || 10);
  env.BOOT_TEST_SETTINGS = JSON.stringify({ returnValue: true, settings: { homeAutoLaunch: test.autoLaunch || 'on' } });
  env.BOOT_TEST_REASON = JSON.stringify({ returnValue: true, reason: test.reason || 'remoteKey' });
  var configs = {};
  if (!test.noReasons) configs['com.webos.service.tvpower.fullHomeBootingPowerOnReasons'] = test.reasons || ['remoteKey'];
  env.BOOT_TEST_REASONS = JSON.stringify({ returnValue: true, configs: configs });
  env.BOOT_TEST_FRONT = JSON.stringify({ returnValue: true, appId: test.front });
  env.BOOT_TEST_LAUNCHES = launches;
  env.BOOT_TEST_LAUNCH_REPLY = JSON.stringify({ returnValue: test.launchOk !== false });
  fs.writeFileSync(path.join(dir, 'home.json'), JSON.stringify({ lgAutoLaunch: test.savedAutoLaunch || null }));
  var log = test.boot ? "DEBUG(14.4) : BootSequencer) '" + test.boot + "' is foreground\n" : '';
  if (test.later) log += "DEBUG(30.7) : BootSequencer) '" + test.later + "' is foreground\n";
  fs.writeFileSync(path.join(dir, 'bootd.log'), log);
  [launches, marker].forEach(function (file) { if (fs.existsSync(file)) fs.unlinkSync(file); });
  child.execFile('/bin/sh', [script], { env: env }, function (error, stdout, stderr) {
    assert.ifError(error);
    assert.strictEqual(stderr, '', test.name + ': no shell errors');
    var sent = fs.existsSync(launches) ? fs.readFileSync(launches, 'utf8').trim().split('\n').map(JSON.parse) : [];
    assert.deepEqual(sent, test.target ? [{ id: test.target }] : [], test.name + '\n' + stdout);
    assert.strictEqual(fs.existsSync(marker), !!test.target && test.launchOk !== false,
      test.name + ': only a successful launch arms the server watchdog');
    console.log('  \u2713 ' + test.name);
    run(index + 1);
  });
}
run(0);
