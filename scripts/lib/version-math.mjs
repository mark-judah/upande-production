export const PATCH_LIMIT = 100;
export const MINOR_LIMIT = 50;
export const VERSION_CODE_BASE = 100000;
export const RUNTIME_MAJOR_BASE = 100;

export function parseVersion(version) {
  const parts = String(version).split('.').map((n) => parseInt(n, 10));
  if (parts.length !== 3 || parts.some((n) => !Number.isInteger(n) || n < 0)) {
    throw new Error(`Not a valid x.y.z version: ${version}`);
  }
  const [major, minor, patch] = parts;
  if (minor >= MINOR_LIMIT) throw new Error(`Minor ${minor} in ${version} is out of range (max ${MINOR_LIMIT - 1}).`);
  if (patch >= PATCH_LIMIT) throw new Error(`Patch ${patch} in ${version} is out of range (max ${PATCH_LIMIT - 1}).`);
  return { major, minor, patch };
}

export function nextVersion(current, bump = 'patch') {
  let { major, minor, patch } = parseVersion(current);
  if (bump === 'major') return `${major + 1}.0.0`;
  if (bump === 'minor') { minor += 1; patch = 0; } else { patch += 1; }
  if (patch >= PATCH_LIMIT) { patch = 0; minor += 1; }
  if (minor >= MINOR_LIMIT) { minor = 0; major += 1; }
  return `${major}.${minor}.${patch}`;
}

export function versionCodeFor(version) {
  const { major, minor, patch } = parseVersion(version);
  return VERSION_CODE_BASE + (major * MINOR_LIMIT + minor) * PATCH_LIMIT + patch;
}

export function runtimeVersionFor(version) {
  const { major, minor } = parseVersion(version);
  return `${RUNTIME_MAJOR_BASE + major}.${minor}`;
}

/** A new Expo SDK can never ship over the air: a patch becomes a minor. */
export function promoteBumpForSdk(bump, sdkChanged) {
  return sdkChanged && bump === 'patch' ? 'minor' : bump;
}
