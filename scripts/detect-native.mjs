#!/usr/bin/env node
/**
 * Compares the working tree with the last released tag and says whether the changes since
 * then need a new APK (see lib/native-change.mjs). Prints JSON: {native, reason, base}.
 * The first release (no tag yet) is always an APK.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { nativeChangeReason } from './lib/native-change.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
const tryGit = (...args) => { try { return git(...args); } catch { return ''; } };
const json = (text) => { try { return JSON.parse(text); } catch { return null; } };

const tag = tryGit('describe', '--tags', '--abbrev=0', '--match', 'v[0-9]*');
let result;
if (!tag) {
  result = { native: true, reason: 'first release (no previous tag)', base: null };
} else {
  const files = tryGit('diff', '--name-only', tag, 'HEAD').split('\n').filter(Boolean);
  const messages = tryGit('log', `${tag}..HEAD`, '--format=%B%x1e').split('\x1e').filter(Boolean);
  const read = (ref, file) => json(ref === 'HEAD' ? readFileSync(resolve(ROOT, file), 'utf8') : tryGit('show', `${ref}:${file}`));
  const reason = nativeChangeReason({
    files, messages,
    base: { pkg: read(tag, 'package.json'), app: read(tag, 'app.json') },
    head: { pkg: read('HEAD', 'package.json'), app: read('HEAD', 'app.json') },
  });
  result = { native: reason !== null, reason: reason ?? 'JS-only changes', base: tag };
}
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
