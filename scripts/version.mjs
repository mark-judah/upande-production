#!/usr/bin/env node
/**
 * Odometer versioning for the Expo app.
 *
 * Every merge to the release branch advances the version by exactly one step.
 * The digits roll over like an odometer with fixed limits:
 *
 *   patch (z) counts 0..99  — 1.0.99 + 1 -> 1.1.0
 *   minor (y) counts 0..49  — 1.49.99 + 1 -> 2.0.0
 *   major (x) is unbounded
 *
 * Because the limits are fixed, a version maps one-to-one onto a plain counter,
 * which is exactly what Android's versionCode wants:
 *
 *   versionCode = (major * 50 + minor) * 100 + patch
 *
 * So versionCode is dense, strictly increasing, and needs no external state.
 *
 * Single source of truth for the version is app.json -> expo.version.
 * package.json is kept in sync so `npm version`-style tooling stays honest.
 *
 * Usage:
 *   node scripts/version.mjs                 # print the next version (dry run)
 *   node scripts/version.mjs --json          # machine-readable, for CI outputs
 *   node scripts/version.mjs --apply         # write app.json + package.json
 *   node scripts/version.mjs --bump minor    # skip ahead to the next minor/major
 *   node scripts/version.mjs --notes         # print the release notes markdown
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseVersion, nextVersion, versionCodeFor, runtimeVersionFor, promoteBumpForSdk,
} from './lib/version-math.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const APP_JSON = resolve(ROOT, 'app.json');
const PKG_JSON = resolve(ROOT, 'package.json');

const argv = process.argv.slice(2);
const hasFlag = (name) => argv.includes(`--${name}`);
const flagValue = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? undefined : argv[i + 1];
};

function git(...args) {
  try {
    // stderr is swallowed: `git describe` on a repo with no tags is an expected
    // state (the first release), not something worth printing.
    return execFileSync('git', args, {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}

/** Most recent v* tag, or null on a repo that has never been released. */
function lastTag() {
  return git('describe', '--tags', '--abbrev=0', '--match', 'v[0-9]*') || null;
}

/**
 * Commits since the last tag. Records are NUL-separated so multi-line bodies
 * (where BREAKING CHANGE: footers live) survive parsing intact.
 */
function commitsSince(tag) {
  const range = tag ? `${tag}..HEAD` : 'HEAD';
  const raw = git('log', range, '--no-merges', '--format=%H%x1f%s%x1f%b%x1e');
  if (!raw) return [];
  return raw
    .split('\x1e')
    .map((record) => record.trim())
    .filter(Boolean)
    .map((record) => {
      const [hash, subject, body] = record.split('\x1f');
      return { hash, subject: subject ?? '', body: body ?? '' };
    });
}

const HEADER = /^(?<type>[a-z]+)(?:\((?<scope>[^)]+)\))?(?<breaking>!)?:\s*(?<description>.+)$/i;

function parse(commit) {
  const match = HEADER.exec(commit.subject);
  const breaking =
    Boolean(match?.groups?.breaking) || /^BREAKING[ -]CHANGE:/m.test(commit.body);
  return {
    ...commit,
    type: match?.groups?.type?.toLowerCase() ?? null,
    scope: match?.groups?.scope ?? null,
    description: match?.groups?.description ?? commit.subject,
    breaking,
  };
}

const SECTIONS = [
  ['feat', 'Features'],
  ['fix', 'Bug Fixes'],
  ['perf', 'Performance'],
  ['refactor', 'Refactoring'],
  ['docs', 'Documentation'],
  ['build', 'Build System'],
  ['ci', 'CI'],
  ['chore', 'Chores'],
];

function releaseNotes(version, commits, tag) {
  const line = (c) =>
    `- ${c.scope ? `**${c.scope}:** ` : ''}${c.description} (${c.hash.slice(0, 7)})`;

  const out = [`## v${version}`, ''];

  const breaking = commits.filter((c) => c.breaking);
  if (breaking.length) {
    out.push('### ⚠ BREAKING CHANGES', '', ...breaking.map(line), '');
  }

  for (const [type, heading] of SECTIONS) {
    const matching = commits.filter((c) => c.type === type && !c.breaking);
    if (matching.length) out.push(`### ${heading}`, '', ...matching.map(line), '');
  }

  const other = commits.filter(
    (c) => !c.breaking && !SECTIONS.some(([type]) => type === c.type),
  );
  if (other.length) out.push('### Other', '', ...other.map(line), '');

  if (commits.length === 0) out.push('_No commits since the previous release._', '');

  const repo = process.env.GITHUB_REPOSITORY;
  if (repo && tag) {
    out.push(
      `**Full changelog:** https://github.com/${repo}/compare/${tag}...v${version}`,
      '',
    );
  }

  return out.join('\n');
}

// --- main -------------------------------------------------------------------

const appConfig = JSON.parse(readFileSync(APP_JSON, 'utf8'));
const pkg = JSON.parse(readFileSync(PKG_JSON, 'utf8'));

const currentVersion = appConfig.expo.version;
const tag = lastTag();
const commits = commitsSince(tag).map(parse);
// The Expo SDK the installed APKs of this runtime were built with. A JS bundle
// from another SDK crashes on them, so a new SDK can never go out over the air:
// a patch bump is promoted to a minor one (new runtime, new APK).
const expoSdk = Number(String(pkg.dependencies?.expo ?? '').replace(/^[^\d]*/, '').split('.')[0]);
const runtimeSdk = appConfig.expo.extra?.runtimeSdk;
const sdkChanged = Number.isFinite(expoSdk) && runtimeSdk != null && runtimeSdk !== expoSdk;
// Always one step per merge; --bump only exists to skip to a round number.
const requestedBump = flagValue('bump') ?? 'patch';
const bump = promoteBumpForSdk(requestedBump, sdkChanged);
// --set X.Y.Z puts the version somewhere specific, e.g. 1.0.0 to start a new
// release line; otherwise one odometer step.
const setTo = flagValue('set');
if (setTo) parseVersion(setTo);
const version = hasFlag('keep-version')
  ? currentVersion
  : setTo || nextVersion(currentVersion, bump);
const versionCode = versionCodeFor(version);

if (hasFlag('apply')) {
  appConfig.expo.version = version;
  appConfig.expo.android = { ...appConfig.expo.android, versionCode };
  // expo-updates refuses a bundle whose runtime does not match the installed
  // build, so this is what keeps a 1.1.x update off a 1.0.x APK.
  appConfig.expo.runtimeVersion = runtimeVersionFor(version);
  if (Number.isFinite(expoSdk)) {
    appConfig.expo.extra = { ...appConfig.expo.extra, runtimeSdk: expoSdk };
  }
  // The update URL is the published manifest itself (GitHub Pages), one folder
  // per runtime, so it moves with the runtime.
  const updates = appConfig.expo.updates;
  if (updates?.url?.includes('/ota/android/')) {
    updates.url = updates.url.replace(
      /\/ota\/android\/[^/]+\/manifest\.json$/,
      `/ota/android/${appConfig.expo.runtimeVersion}/manifest.json`,
    );
  }
  writeFileSync(APP_JSON, `${JSON.stringify(appConfig, null, 2)}\n`);

  pkg.version = version;
  writeFileSync(PKG_JSON, `${JSON.stringify(pkg, null, 2)}\n`);
}

if (hasFlag('notes')) {
  process.stdout.write(releaseNotes(version, commits, tag));
} else if (hasFlag('json')) {
  process.stdout.write(
    `${JSON.stringify(
      {
        current: currentVersion,
        version,
        versionCode,
        runtimeVersion: runtimeVersionFor(version),
        currentRuntimeVersion: appConfig.expo.runtimeVersion,
        // `ota` when the new version stays on the runtime the installed APKs
        // already have; anything else — a new minor/major, or a runtime still
        // on the old `appVersion` policy object — needs an APK.
        release:
          appConfig.expo.runtimeVersion === runtimeVersionFor(version) ? 'ota' : 'apk',
        bump,
        tag: `v${version}`,
        previousTag: tag,
        commitCount: commits.length,
        breaking: commits.filter((c) => c.breaking).length,
      },
      null,
      2,
    )}\n`,
  );
} else {
  process.stdout.write(
    `${currentVersion} -> ${version} (${bump}, versionCode ${versionCode}, ` +
      `${commits.length} commit${commits.length === 1 ? '' : 's'} since ${tag ?? 'the beginning'})\n`,
  );
}
