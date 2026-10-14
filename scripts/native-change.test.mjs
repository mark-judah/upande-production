import test from 'node:test';
import assert from 'node:assert/strict';
import { nativeChangeReason } from './lib/native-change.mjs';

const app = (o = {}) => ({
  expo: {
    name: 'X', version: '1.0.1', runtimeVersion: '101.0',
    android: { package: 'com.x', versionCode: 105001, permissions: ['CAMERA'] },
    updates: { url: 'https://h/ota/android/101.0/manifest.json', enabled: true },
    extra: { runtimeSdk: 54, otaBaseUrl: 'https://h/ota' },
    plugins: ['expo-router'],
    ...o,
  },
});
const pkg = (o = {}) => ({ name: 'x', version: '1.0.1', scripts: { a: '1' }, dependencies: { expo: '~54.0.0', axios: '1.0.0' }, devDependencies: { jest: '1' }, ...o });
const base = { pkg: pkg(), app: app() };
const run = (over = {}) => nativeChangeReason({ files: [], messages: [], base, head: base, ...over });

test('nothing changed is not native', () => assert.equal(run(), null));

test('JS-only changes are not native', () => {
  assert.equal(run({ files: ['app/index.tsx', 'src/services/api.ts', 'docs/x.md'] }), null);
});

test('the release bot bumping version fields is not native', () => {
  const head = {
    pkg: pkg({ version: '1.0.2' }),
    app: app({ version: '1.0.2', runtimeVersion: '101.0',
      android: { package: 'com.x', versionCode: 105002, permissions: ['CAMERA'] },
      updates: { url: 'https://h/ota/android/101.0/manifest.json', enabled: true },
      extra: { runtimeSdk: 54, otaBaseUrl: 'https://h/ota' } }),
  };
  assert.equal(run({ files: ['app.json', 'package.json', 'package-lock.json'], head }), null);
});

test('a bumped runtime URL (bot-managed) is not native on its own', () => {
  const head = { pkg: pkg(), app: app({ runtimeVersion: '101.1', updates: { url: 'https://h/ota/android/101.1/manifest.json', enabled: true } }) };
  assert.equal(run({ files: ['app.json'], head }), null);
});

test('adding, removing or changing a dependency is native', () => {
  const added = { pkg: pkg({ dependencies: { expo: '~54.0.0', axios: '1.0.0', 'expo-build-properties': '~1.0.10' } }), app: app() };
  assert.match(run({ files: ['package.json'], head: added }), /dependencies.*expo-build-properties/);
  const removed = { pkg: pkg({ dependencies: { expo: '~54.0.0' } }), app: app() };
  assert.match(run({ files: ['package.json'], head: removed }), /axios/);
  const bumped = { pkg: pkg({ dependencies: { expo: '~54.0.0', axios: '1.1.0' } }), app: app() };
  assert.match(run({ files: ['package.json'], head: bumped }), /axios/);
});

test('devDependencies and scripts do not matter', () => {
  const head = { pkg: pkg({ devDependencies: { jest: '2' }, scripts: { a: '2' } }), app: app() };
  assert.equal(run({ files: ['package.json'], head }), null);
});

test('an app.json change that is not bot-managed is native', () => {
  const head = { pkg: pkg(), app: app({ plugins: ['expo-router', ['expo-build-properties', { android: { usesCleartextTraffic: true } }]] }) };
  assert.match(run({ files: ['app.json'], head }), /app\.json/);
  const perms = { pkg: pkg(), app: app({ android: { package: 'com.x', versionCode: 105001, permissions: ['CAMERA', 'RECORD_AUDIO'] } }) };
  assert.match(run({ files: ['app.json'], head: perms }), /app\.json/);
});

test('plugins, patches and eas.json are native', () => {
  for (const f of ['plugins/withX.js', 'patches/expo-updates+29.0.17.patch', 'eas.json']) {
    assert.match(run({ files: [f] }), new RegExp(f.replace(/[.+/]/g, '\\$&')));
  }
});

test('an explicit [apk] marker in a commit message forces an APK', () => {
  assert.match(run({ messages: ['fix: x\n\nships a native thing [apk]'] }), /\[apk\]/);
  assert.equal(run({ messages: ['fix: apk is fine as a word'] }), null);
});

test('missing or unparseable base files never throw', () => {
  assert.equal(run({ files: ['package.json', 'app.json'], base: { pkg: null, app: null }, head: { pkg: null, app: null } }), null);
  assert.match(run({ files: ['app.json'], base: { pkg: null, app: null }, head: base }), /app\.json/);
});
