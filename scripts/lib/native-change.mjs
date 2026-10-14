/**
 * Does a set of changes need a new APK instead of an OTA?
 *
 * An OTA ships only JS and assets to phones that already have the native build. Anything
 * that changes that native build cannot go over the air, so it must promote the release
 * from a patch (OTA) to a minor (new runtime, new APK):
 *
 *   - dependencies (a new / removed / upgraded package may carry native code)
 *   - app.json (permissions, plugins, package name, ...) apart from the fields the
 *     release bot itself writes
 *   - plugins/, patches/, eas.json
 *   - an explicit `[apk]` in a commit message
 *
 * Deliberately conservative: a JS-only dependency bump also triggers an APK. A needless
 * APK costs 15 minutes; a missed one ships a build whose native side does not match.
 */

const NATIVE_PATHS = [/^plugins\//, /^patches\//, /^eas\.json$/];

/** Fields version.mjs rewrites on every release; they never mean "native changed". */
function withoutBotFields(app) {
  if (!app || typeof app !== 'object') return null;
  const copy = JSON.parse(JSON.stringify(app));
  const e = copy.expo ?? {};
  delete e.version;
  delete e.runtimeVersion;
  if (e.android) delete e.android.versionCode;
  if (e.updates) delete e.updates.url;
  if (e.extra) delete e.extra.runtimeSdk;
  return copy;
}

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${stable(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function changedDependencies(basePkg, headPkg) {
  const a = basePkg?.dependencies ?? {};
  const b = headPkg?.dependencies ?? {};
  return [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => a[k] !== b[k]).sort();
}

/** A short human reason, or null when an OTA is enough. */
export function nativeChangeReason({ files = [], messages = [], base = {}, head = {} }) {
  if (messages.some((m) => /\[apk\]/i.test(m))) return 'a commit asked for an APK ([apk])';

  const path = files.find((f) => NATIVE_PATHS.some((re) => re.test(f)));
  if (path) return `native build config changed (${path})`;

  if (files.includes('package.json')) {
    const deps = changedDependencies(base.pkg, head.pkg);
    if (deps.length) return `dependencies changed (${deps.slice(0, 5).join(', ')}${deps.length > 5 ? ', ...' : ''})`;
  }

  if (files.includes('app.json') && stable(withoutBotFields(base.app)) !== stable(withoutBotFields(head.app))) {
    return 'app.json changed';
  }
  return null;
}
