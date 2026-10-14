import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const yaml = createRequire(import.meta.url)('js-yaml');
const wf = yaml.load(readFileSync(new URL('../.github/workflows/release.yml', import.meta.url), 'utf8'));
const steps = wf.jobs.release.steps;
const idx = (name) => steps.findIndex((s) => s.name === name);

test('latest.json is published only after the GitHub Release exists', () => {
  // Advertising a release whose APK failed to build would mark every device "behind".
  const write = idx('Write latest.json');
  const publish = idx('Publish latest.json to GitHub Pages');
  assert.ok(write > -1 && publish > write, 'latest.json steps exist, write before publish');
  assert.ok(write > idx('Publish GitHub Release (APK)'), 'after the APK release');
  assert.ok(write > idx('Publish GitHub Release (OTA)'), 'after the OTA release');
  assert.ok(write > idx('Commit and tag the version bump'), 'after the tag');
});

test('the OTA bundle itself still goes out before the tag', () => {
  assert.ok(idx('Publish the JS update to GitHub Pages') < idx('Commit and tag the version bump'));
});

test('latest.json is not part of the early OTA publish', () => {
  const early = steps[idx('Build the JS update') + 1];
  assert.notEqual(early.name, 'Write latest.json');
});

test('release notes for latest.json come from the notes file, not from git after the tag', () => {
  const run = steps[idx('Write latest.json')].run;
  assert.match(run, /RELEASE_NOTES\.md/);
  assert.doesNotMatch(run, /version\.mjs/);
});
