import { test } from 'node:test';
import assert from 'node:assert/strict';
import { edgePoint, hitTest, polylineDist, slitherScore, worldToMap } from '../src/core/geometry';
import { pickServerEntry, sameServer } from '../src/core/servers';
import { sanitizeConfig, sanitizeSettings, DEFAULT_SETTINGS } from '../src/core/settings';
import { fmtCode, fmtDist, fmtScore, nameKey, newCode, normCode } from '../src/core/util';

test('friend codes are normalized and formatted', () => {
  assert.equal(normCode(' abcd-2345 '), 'ABCD2345');
  assert.equal(fmtCode('abcd2345'), 'ABCD-2345');
  assert.match(newCode(), /^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
});

test('names compare case-insensitively and with non-breaking spaces', () => {
  assert.equal(nameKey('  Big Snake '), 'big snake');
});

test('formatting', () => {
  assert.equal(fmtDist(950), '950');
  assert.equal(fmtDist(1840), '1.8k');
  assert.equal(fmtScore(12907), '12,907');
  assert.equal(fmtScore(null), '–');
});

test('same server is decided by server id, not by address (IPv4 vs IPv6)', () => {
  const v4 = { sid: 4263, ip: '57.129.37.42', po: 444 };
  const v6 = { sid: 4263, ip: '[2001:41d0:304:200::5a3]', po: 444 };
  assert.equal(sameServer(v4, v6), true);
  assert.equal(sameServer(v4, { ...v4, sid: 7806 }), false);
  assert.equal(sameServer(null, v4), false);
  // without ids, fall back to the address
  assert.equal(sameServer({ sid: 0, ip: 'a', po: 1 }, { sid: 0, ip: 'a', po: 1 }), true);
});

test('joining a server picks the IPv4 address for the server id', () => {
  const list = [
    { ip: '[2001:db8::1]', po: 444, sid: 4263 },
    { ip: '57.129.37.42', po: 444, sid: 4263 },
    { ip: '10.0.0.1', po: 444, sid: 7806 },
  ];
  assert.equal(pickServerEntry({ sid: 4263, ip: '[2001:db8::1]', po: 444 }, list)?.ip, '57.129.37.42');
  // unknown server id, IPv6 only -> refuse (the game would silently fall back to a random server)
  assert.equal(pickServerEntry({ sid: 9999, ip: '[2001:db8::9]', po: 444 }, list), null);
  // unknown server id, IPv4 -> use the address directly
  assert.equal(pickServerEntry({ sid: 9999, ip: '1.2.3.4', po: 444 }, list)?.ip, '1.2.3.4');
});

test('settings are sanitized', () => {
  const s = sanitizeSettings({ mapSize: 9999, myColor: 'red', markMode: 'nope', tracked: [{ name: '  Bob ' }, { name: '' }, null] });
  assert.equal(s.mapSize, 460);
  assert.equal(s.myColor, DEFAULT_SETTINGS.myColor);
  assert.equal(s.markMode, 'click');
  assert.deepEqual(s.tracked.map((t) => t.name), ['Bob']);
  assert.match(s.tracked[0].color, /^#[0-9a-f]{6}$/i);
});

test('config: own code and duplicates are removed from friends, missing code is generated', () => {
  const { config, generatedCode } = sanitizeConfig({
    profile: { code: 'aaaa-2222', name: 'Me' },
    friends: [{ code: 'AAAA2222' }, { code: 'bbbb-3333', label: 'Bob' }, { code: 'BBBB3333' }, { code: 'x' }],
  });
  assert.equal(generatedCode, false);
  assert.deepEqual(config.friends.map((f) => f.code), ['BBBB-3333']);
  assert.equal(sanitizeConfig({}).generatedCode, true);
});

test('score formula matches the game', () => {
  const fpsls = [0, 1, 2.2, 3.5];
  const fmlts = [1, 0.9, 0.8, 0.7];
  assert.equal(slitherScore(2, 0.4, fpsls, fmlts), Math.floor((2.2 + 0.4 / 0.8 - 1) * 15 - 5));
});

test('hit test uses the whole body line plus slack', () => {
  const snake = { id: 1, width: 30, points: () => [0, 0, 100, 0, 200, 0] };
  assert.equal(polylineDist(150, 10, snake.points()), 10);
  assert.equal(hitTest(150, 19, [snake], 5)?.id, 1);   // 19 < 15 + 5
  assert.equal(hitTest(150, 21, [snake], 5), null);
});

test('edge arrow position and minimap mapping', () => {
  const p = edgePoint(2000, 300, 800, 600, 48);
  assert.equal(Math.round(p.x), 752);
  assert.equal(Math.round(p.y), 300);
  assert.deepEqual(worldToMap(100, 100, 100, 50, 10, 20, 30), [10, 20]);
});
