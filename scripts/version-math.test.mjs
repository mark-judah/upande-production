import test from 'node:test';
import assert from 'node:assert/strict';
import {
  nextVersion, versionCodeFor, runtimeVersionFor, parseVersion, promoteBumpForSdk,
} from './lib/version-math.mjs';

test('patch steps by one', () => assert.equal(nextVersion('1.0.0'), '1.0.1'));
test('patch rolls into minor at 100', () => assert.equal(nextVersion('1.0.99'), '1.1.0'));
test('minor rolls into major at 50', () => assert.equal(nextVersion('1.49.99'), '2.0.0'));
test('bump minor resets patch', () => assert.equal(nextVersion('1.2.7', 'minor'), '1.3.0'));
test('bump minor on 1.49.5 carries to 2.0.0', () => assert.equal(nextVersion('1.49.5', 'minor'), '2.0.0'));
test('bump major', () => assert.equal(nextVersion('1.2.7', 'major'), '2.0.0'));
test('versionCode formula', () => {
  assert.equal(versionCodeFor('1.0.0'), 105000);
  assert.equal(versionCodeFor('1.0.99'), 105099);
  assert.equal(versionCodeFor('1.1.0'), 105100);
  assert.equal(versionCodeFor('2.0.0'), 110000);
});
test('versionCode rises by exactly 1 per release', () => {
  assert.equal(versionCodeFor(nextVersion('1.0.99')) - versionCodeFor('1.0.99'), 1);
});
test('runtime is (100+major).minor', () => {
  assert.equal(runtimeVersionFor('1.0.5'), '101.0');
  assert.equal(runtimeVersionFor('1.3.0'), '101.3');
  assert.equal(runtimeVersionFor('2.0.0'), '102.0');
});
test('out-of-range versions throw', () => {
  assert.throws(() => parseVersion('1.50.0'), /out of range/);
  assert.throws(() => parseVersion('1.0.100'), /out of range/);
  assert.throws(() => parseVersion('1.0'), /valid x.y.z/);
  assert.throws(() => parseVersion('abc'), /valid x.y.z/);
});
test('sdk change promotes patch to minor only', () => {
  assert.equal(promoteBumpForSdk('patch', true), 'minor');
  assert.equal(promoteBumpForSdk('patch', false), 'patch');
  assert.equal(promoteBumpForSdk('major', true), 'major');
});
