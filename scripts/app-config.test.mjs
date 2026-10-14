import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const expo = JSON.parse(readFileSync(new URL('../app.json', import.meta.url), 'utf8')).expo;

test('release builds may reach plain-http instances (local bench, LAN sites)', () => {
  // Release APKs refuse cleartext http by default; the dev client allows it, which is how
  // "works in Expo, Network Error in the built APK" happens. Packhouse and Quality set this too.
  const entry = expo.plugins.find((p) => Array.isArray(p) && p[0] === 'expo-build-properties');
  assert.ok(entry, 'expo-build-properties plugin is configured');
  assert.equal(entry[1].android.usesCleartextTraffic, true);
});

test('expo-build-properties is a dependency', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.ok(pkg.dependencies['expo-build-properties']);
});
