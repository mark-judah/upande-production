# Release Pipeline, Update Gate & Support Install Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Upande Production an OTA + APK release pipeline, a server-enforced minimum-version gate with a lock screen, and a Support Team page showing which devices/users are behind.

**Architecture:** Port the Packhouse/Quality pipeline (odometer version script, self-hosted OTA on GitHub Pages, signed APK on GitHub Releases) to SDK 54. The app sends `X-App-*` headers; a Frappe `before_request` hook in `upande_agriculture` rejects stale clients with HTTP 426; a `Mobile Device` doctype (upserted from telemetry) feeds a role-gated dashboard endpoint rendered by a new screen.

**Tech Stack:** Expo SDK 54 (`expo-updates` 29.0.17), expo-router, zustand, axios, jest-expo, GitHub Actions, Frappe v16 (`upande_agriculture`), Python `FrappeTestCase`.

**Spec:** `docs/superpowers/specs/2026-10-14-release-pipeline-and-update-gate-design.md`

## Global Constraints

- Expo SDK **54**; never copy the SDK 57 `expo-updates` patch, regenerate against **29.0.17**.
- `versionCode = 100000 + (major*50 + minor)*100 + patch`; patch 0-99, minor 0-49 roll over.
- `runtimeVersion = "(100+major).minor"` (string). First release is `set_version 1.0.0` and ships as an APK.
- Header names: `X-App-Name: production`, `X-App-Version`, `X-App-Runtime`, `X-Device-Id`.
- Gate response: HTTP **426**, `error_code: "APP_UPDATE_REQUIRED"`. Exempt methods: `mobileLogin`, `login`, `getCurrentUserRoles`, `reportDeviceTelemetry`, `getReleaseInfo`, `getSupportDashboard`, `setMinVersion`. The hook **fails open** on internal errors. `enforce_gate` defaults **off**.
- Farm = `Employee.custom_farm` via `Employee.user_id`; phone = `Employee.cell_number`.
- Dashboard/`setMinVersion` roles: `Support Team` or `System Manager`.
- Production Frappe is read-only; build/test only on the local bench (`kaitet.local` in `/home/jk/Projects/upande-local-bench-v16`). Nothing is deployed or pushed to remotes.
- Design system: tokens from `src/theme.ts`, Ionicons only, no coffee accents.
- `latest.json` (deviation from spec, simpler CI): `{version, runtime, release, apkUrl, publishedAt, notes}`; `apkUrl` is the fixed `releases/latest/download/upande_production.apk` URL; APK size comes from the GitHub Releases API in the app.
- Backend repo `upande-local-bench-v16/apps/upande_agriculture` has unrelated uncommitted changes: work on a new branch, put new code in new modules, and stage only your own hunks (`git add -p` for `mobile/api.py`).

## Review Focus

- Version string malformed/missing (`""`, `"1.0"`, `"abc"`) reaching the gate or compare: must never lock out or crash (treat as unidentified).
- Device reports before it has a user/Employee (signed-out, or user with no Employee): upsert must still succeed with blank farm.
- Same device, two users: both appear in the device's user table, newest is `user`.
- Gate hook raising an unexpected error (missing policy doc, DB error): request must pass.
- Support dashboard called by a non-Support user, or with an empty fleet: forbidden / zero-filled, never a 500.
- Existing installs signed with the EAS key: first APK signed by a different key requires uninstall (documented in `docs/RELEASING.md`).

---

### Task 1: Test tooling + version math

**Files:**
- Modify: `package.json`
- Create: `jest.config.js`, `scripts/lib/version-math.mjs`, `scripts/version-math.test.mjs`

**Interfaces:**
- Produces: `parseVersion(v) -> {major,minor,patch}`, `nextVersion(current, bump='patch') -> string`, `versionCodeFor(v) -> number`, `runtimeVersionFor(v) -> string`, `promoteBumpForSdk(bump, sdkChanged) -> string`.

- [ ] **Step 1: Install jest-expo and scripts**

```bash
npx expo install jest-expo jest @types/jest -- --save-dev
npm pkg set scripts.test="jest --watchAll" scripts.test:ci="jest --ci" scripts.typecheck="tsc --noEmit" scripts.test:scripts="node --test scripts/" scripts.prebuild="expo prebuild --platform android --clean" scripts.build:apk="npm run prebuild && cd android && ./gradlew assembleRelease" scripts.version:next="node scripts/version.mjs" scripts.version:apply="node scripts/version.mjs --apply" scripts.version:notes="node scripts/version.mjs --notes" scripts.ota:build="node scripts/publish-ota.mjs" scripts.postinstall="patch-package"
```

- [ ] **Step 2: Create `jest.config.js`** (copy of Packhouse's, same async-storage mapping)

```js
module.exports = {
  preset: 'jest-expo',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    '^@react-native-async-storage/async-storage$':
      '<rootDir>/node_modules/@react-native-async-storage/async-storage/jest/async-storage-mock.js',
  },
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|react-native-svg)',
  ],
};
```

- [ ] **Step 3: Write the failing test `scripts/version-math.test.mjs`**

```js
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
```

- [ ] **Step 4: Run to verify failure**

Run: `node --test scripts/`  Expected: FAIL (module not found).

- [ ] **Step 5: Implement `scripts/lib/version-math.mjs`**

```js
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
```

- [ ] **Step 6: Run to verify pass** — `node --test scripts/` Expected: all PASS.
- [ ] **Step 7: Commit** — `git add package.json package-lock.json jest.config.js scripts && git commit -m "build: add jest and odometer version math"`

---

### Task 2: version.mjs, OTA publisher, plugins, patch, app.json

**Files:**
- Create: `scripts/version.mjs`, `scripts/publish-ota.mjs`, `scripts/setup-signing.sh`, `scripts/upload-secrets.sh`, `plugins/withReleaseSigning.js`, `plugins/withBuildTuning.js`, `patches/expo-updates+29.0.17.patch`
- Modify: `app.json`, `package.json`, `.gitignore`

**Interfaces:**
- Consumes: Task 1 `version-math.mjs`.
- Produces: `node scripts/version.mjs --json` (fields `version, versionCode, runtimeVersion, release, tag`), `npm run ota:build` writing `ota/android/<runtime>/manifest.json`.

- [ ] **Step 1: Copy from Packhouse**

```bash
P=/home/jk/Projects/upande-packhouse
cp $P/scripts/{version.mjs,publish-ota.mjs,setup-signing.sh,upload-secrets.sh} scripts/
cp $P/plugins/{withReleaseSigning.js,withBuildTuning.js} plugins/
sed -i 's/upande-packhouse/upande-production/g; s/upande_packhouse/upande_production/g; s/Upande Packhouse/Upande Production/g; s/packhouse/production/g' scripts/setup-signing.sh scripts/upload-secrets.sh scripts/publish-ota.mjs
```

- [ ] **Step 2: Make `version.mjs` use the shared math.** Delete the local `PATCH_LIMIT`/`MINOR_LIMIT`/`VERSION_CODE_BASE`/`RUNTIME_MAJOR_BASE` constants and the local `parseVersion`, `nextVersion`, `runtimeVersionFor`, `versionCodeFor` definitions; add at the top:

```js
import {
  parseVersion, nextVersion, versionCodeFor, runtimeVersionFor, promoteBumpForSdk,
} from './lib/version-math.mjs';
```
and replace `const bump = sdkChanged && requestedBump === 'patch' ? 'minor' : requestedBump;` with `const bump = promoteBumpForSdk(requestedBump, sdkChanged);`.

- [ ] **Step 3: Update comment in `publish-ota.mjs`** header so it no longer says the manifest is proxied through Frappe (the app reads Pages directly, patched client). Replace the "Who serves what" block with: `GitHub Pages serves manifest, bundle and assets. updates.url points at the manifest; the patched expo-updates (patches/expo-updates+29.0.17.patch) accepts it without the expo-protocol-version header.` Also change the final console line to print only `Pages serves ${base}/manifest.json`.

- [ ] **Step 4: Edit `app.json`.** Do NOT set `runtimeVersion` (keep `{"policy":"appVersion"}`), so the first CI run sees a runtime change and builds an APK. Set:

```json
"updates": {
  "enabled": true,
  "url": "https://mark-judah.github.io/upande-production/ota/android/101.0/manifest.json",
  "checkAutomatically": "ON_LOAD",
  "fallbackToCacheTimeout": 0
}
```
under `extra` add `"otaBaseUrl": "https://mark-judah.github.io/upande-production/ota"` and `"runtimeSdk": 54`; add `"./plugins/withReleaseSigning"` and `"./plugins/withBuildTuning"` as the first two `plugins` entries; add `"expo-intent-launcher"` to the plugins array is NOT needed (no config plugin).

- [ ] **Step 5: Install deps**

```bash
npx expo install expo-intent-launcher
npm i -D patch-package
echo -e "\n# release pipeline\nota/\n.ota-export/\nandroid/\n*.keystore\nSECRETS-TO-UPLOAD.txt\nversion.json\nRELEASE_NOTES.md" >> .gitignore
```

- [ ] **Step 6: Generate the SDK 54 patch.** Edit `node_modules/expo-updates/android/src/main/java/expo/modules/updates/manifest/UpdateFactory.kt`: replace the `null -> { throw Exception("Legacy manifests are no longer supported") }` branch body with

```kotlin
        // Upande: the manifest is served as a static file from GitHub Pages, which
        // cannot send the expo-protocol-version header. A body with a launchAsset is a
        // modern (protocol 1) manifest, so read it as one instead of refusing it.
        if (manifestJson.has("launchAsset")) {
          ExpoUpdatesUpdate.fromExpoUpdatesManifest(ExpoUpdatesManifest(manifestJson), extensions, configuration)
        } else {
          throw Exception("Legacy manifests are no longer supported")
        }
```
then run `npx patch-package expo-updates` and confirm `patches/expo-updates+29.0.17.patch` exists.

- [ ] **Step 7: Verify**

Run: `node scripts/version.mjs --json --set 1.0.0` → `release` is `apk`, `runtimeVersion` `101.0`, `versionCode` `105000`.
Run: `node scripts/version.mjs --json` (no set) → `1.0.0 → 1.0.1`, `release` `apk` (runtime is still the policy object).
Run: `npm run ota:build` (needs `runtimeVersion` string: first `cp app.json /tmp/app.json.bak && node scripts/version.mjs --apply --set 1.0.0`, run build, inspect `ota/android/101.0/manifest.json` has `launchAsset.url` starting `https://mark-judah.github.io/upande-production/ota/android/101.0/` and asset keys without `/`, then `cp /tmp/app.json.bak app.json && git checkout package.json && rm -rf ota .ota-export`).

- [ ] **Step 8: Commit** — `git add scripts plugins patches app.json package.json package-lock.json .gitignore && git commit -m "build: odometer versioning, self-hosted OTA publisher, signing plugins"`

---

### Task 3: CI workflows

**Files:** Create `.github/workflows/pr.yml`, `.github/workflows/release.yml`

**Interfaces:** Consumes Task 2 scripts. Produces Pages file `ota/latest.json`, release asset `upande_production_vX.Y.Z.apk` + `upande_production.apk`.

- [ ] **Step 1: Copy and rename**

```bash
mkdir -p .github/workflows
cp /home/jk/Projects/upande-quality/.github/workflows/release.yml .github/workflows/release.yml
cp /home/jk/Projects/upande-quality/.github/workflows/pr.yml .github/workflows/pr.yml
sed -i 's/upande_quality/upande_production/g; s/upande-quality/upande-production/g; s/Upande Quality/Upande Production/g; s/branches: \[origin\]/branches: [master]/' .github/workflows/*.yml
sed -i 's/upande_X/upande_production/g' .github/workflows/release.yml
grep -n "quality\|Quality\|origin\]" .github/workflows/*.yml
```
Expected: the grep prints nothing. Fix any remaining hits (comments mentioning the Frappe proxy become: "manifest is read straight from Pages by the patched expo-updates").

- [ ] **Step 2: In `pr.yml`**, replace the test step with `npm run test:ci` and add a step before it `run: node --test scripts/`. Ensure the lint job runs `npm run lint` and `npx tsc --noEmit`.

- [ ] **Step 3: Add the `latest.json` step** to `release.yml` immediately after `Build the JS update` and before `Publish the JS update to GitHub Pages`:

```yaml
      - name: Write latest.json
        run: |
          set -euo pipefail
          notes=$(node scripts/version.mjs --keep-version --notes | head -c 2000)
          jq -n \
            --arg version "${{ steps.version.outputs.version }}" \
            --arg runtime "${{ steps.version.outputs.runtime }}" \
            --arg release "${{ steps.version.outputs.release }}" \
            --arg apkUrl "https://github.com/${{ github.repository }}/releases/latest/download/upande_production.apk" \
            --arg publishedAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
            --arg notes "$notes" \
            '{version:$version, runtime:$runtime, release:$release, apkUrl:$apkUrl, publishedAt:$publishedAt, notes:$notes}' \
            > ota/latest.json
          cat ota/latest.json
```

- [ ] **Step 4: Validate** — `python3 -c "import yaml,sys;[yaml.safe_load(open(f)) for f in sys.argv[1:]]" .github/workflows/*.yml` (no error); if `actionlint` is installed run it too.
- [ ] **Step 5: Commit** — `git add .github && git commit -m "ci: PR checks and release workflow (OTA to Pages, APK to Releases, latest.json)"`

---

### Task 4: In-app updater (OTA auto-apply + APK download)

**Files:**
- Create: `src/services/version.ts`, `src/services/device-id.ts`, `src/services/updates/{compare-versions,releases,install-apk,dialog}.ts`, `src/services/updates/{UpdateProvider,ApkUpdateSection}.tsx`, `__tests__/compare-versions-test.ts`
- Modify: `src/services/storage.ts`, `app/settings.tsx`, `app/_layout.tsx`

**Interfaces:**
- Produces: `APP_VERSION`, `RUNTIME_VERSION`, `INSTALLED_APK_VERSION: string`; `getDeviceId(): Promise<string>`; `compareVersions(a,b): -1|0|1`; `useApkUpdate()`; `UpdateProvider`; `ApkUpdateSection`.

- [ ] **Step 1: Failing test `__tests__/compare-versions-test.ts`**

```ts
import { compareVersions } from '@/src/services/updates/compare-versions';

describe('compareVersions', () => {
  it('orders numerically, not lexically', () => expect(compareVersions('1.0.10', '1.0.9')).toBe(1));
  it('ignores a leading v and pre-release suffix', () => expect(compareVersions('v1.2.0-beta', '1.2.0')).toBe(0));
  it('pads short versions', () => expect(compareVersions('1.1', '1.1.0')).toBe(0));
  it('older is -1', () => expect(compareVersions('1.0.0', '1.0.1')).toBe(-1));
  it('garbage compares as 0.0.0 and never throws', () => {
    expect(compareVersions('', '0.0.0')).toBe(0);
    expect(compareVersions('abc', '1.0.0')).toBe(-1);
    expect(compareVersions(undefined as unknown as string, '1.0.0')).toBe(-1);
  });
});
```
- [ ] **Step 2:** Run `npx jest __tests__/compare-versions-test.ts` → FAIL.
- [ ] **Step 3: Create `src/services/updates/compare-versions.ts`**

```ts
/** 1 when `a` is newer, -1 when older, 0 when equal. Ignores a leading `v`
 *  and any pre-release suffix; pads so `1.1` equals `1.1.0`. */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string) =>
    String(v ?? '').trim().replace(/^v/i, '').split('-')[0].split('.').map((n) => parseInt(n, 10) || 0);
  const left = parse(a);
  const right = parse(b);
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    const l = left[i] ?? 0;
    const r = right[i] ?? 0;
    if (l !== r) return l > r ? 1 : -1;
  }
  return 0;
}
```
- [ ] **Step 4:** Run the test → PASS.
- [ ] **Step 5: Create `src/services/version.ts`** (no import of the API client, to avoid a cycle with `api.ts`):

```ts
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';

type OtaExtra = { expoClient?: { version?: string }; appVersion?: string };
const otaExtra = (Updates.manifest as { extra?: OtaExtra } | null)?.extra;

/** The running JS version: under an OTA bundle, the bundle's own (from its manifest). */
export const APP_VERSION: string =
  otaExtra?.expoClient?.version ?? otaExtra?.appVersion ?? Constants.expoConfig?.version ?? '1.0.0';
/** Version of the installed APK (native build); OTA never changes it. */
export const INSTALLED_APK_VERSION: string = Constants.nativeAppVersion ?? APP_VERSION;
export const RUNTIME_VERSION: string = Updates.runtimeVersion ?? '';
```
- [ ] **Step 6: Create `src/services/device-id.ts`**

```ts
import { Platform } from 'react-native';
import * as Application from 'expo-application';

let cached: string | null = null;

/** Android SSAID / iOS idForVendor; '' when unavailable. Cached. */
export async function getDeviceId(): Promise<string> {
  if (cached !== null) return cached;
  try {
    cached =
      Platform.OS === 'android'
        ? Application.getAndroidId() ?? ''
        : (await Application.getIosIdForVendorAsync()) ?? '';
  } catch {
    cached = '';
  }
  return cached;
}
```
- [ ] **Step 7: Port updater files from Packhouse with these exact changes**

```bash
P=/home/jk/Projects/upande-packhouse/src/core/updates
mkdir -p src/services/updates
cp $P/{releases.ts,install-apk.ts,UpdateProvider.tsx,ApkUpdateSection.tsx} src/services/updates/
```
- `releases.ts`: replace the local `compareVersions` function with `import { compareVersions } from './compare-versions'; export { compareVersions };`; `GITHUB_REPO = 'mark-judah/upande-production'`; imports `@/src/core/storage` → `@/src/services/storage`, `@/src/core/version` → `@/src/services/version`; the asset-name comment `upande_packhouse_v` → `upande_production_v`.
- `install-apk.ts`: no changes.
- `UpdateProvider.tsx`: no changes (imports are relative).
- `ApkUpdateSection.tsx`: `Button` from `@/src/components/Button`; `useToast` from `@/src/components/Toast`; `COLORS` → `colors` from `@/src/theme` (rename every `COLORS.` usage; keep `fontFamily, fontSize, spacing`); `showDialog` from `./dialog`; `useNetworkStore` from `@/src/stores/networkStore`, selector `(st) => st.online` unchanged.
- [ ] **Step 8: Create `src/services/updates/dialog.ts`** (production has no DialogHost; this keeps the ported call-sites unchanged):

```ts
import { Alert } from 'react-native';

type DialogButton = { text: string; style?: 'cancel' | 'default' | 'destructive'; onPress?: () => void };

/** Same call shape the ported updater uses; backed by the native Alert. */
export function showDialog(title: string, message: string, buttons: DialogButton[], _icon?: unknown): void {
  Alert.alert(title, message, buttons.map((b) => ({ text: b.text, style: b.style, onPress: b.onPress })));
}
```
- [ ] **Step 9: Edit `src/services/storage.ts`**: add `apkUpdateCheck: 'apk_update_check',` to `StorageKeys`.
- [ ] **Step 10: Edit `app/settings.tsx`**: import `ApkUpdateSection`; replace the manual "Check for updates" `<Button .../>` (and its `onCheckUpdates`, `updatesChecking` state and the now-unused `Updates` import) with `<ApkUpdateSection />`; the Version row shows `APP_VERSION` and `· runtime {RUNTIME_VERSION}` from `@/src/services/version`.
- [ ] **Step 11: Edit `app/_layout.tsx`**: import `UpdateProvider` and wrap the `<ToastProvider>` children: `<ToastProvider><UpdateProvider> ... </UpdateProvider></ToastProvider>`.
- [ ] **Step 12: Verify** — `npx tsc --noEmit` (no new errors vs. baseline: run it first on a stash-free baseline and compare) and `npm run lint` and `npx jest --ci`.
- [ ] **Step 13: Commit** — `git add src app __tests__ && git commit -m "feat(updates): auto-apply OTA on launch and in-app APK download"` (stage only files from this task; the working tree has unrelated WIP).

---

### Task 5: Client identifies itself + 426 handling + lock screen

**Files:**
- Create: `src/stores/updateRequiredStore.ts`, `src/services/release-info.ts`, `app/update-required.tsx`, `__tests__/update-required-store-test.ts`
- Modify: `src/services/api.ts`, `src/services/telemetry/collect.ts`, `app/_layout.tsx`

**Interfaces:**
- Consumes: `APP_VERSION`, `RUNTIME_VERSION`, `INSTALLED_APK_VERSION`, `getDeviceId`, `compareVersions`, `useApkUpdate`.
- Produces: `useUpdateRequiredStore` (`required`, `minVersion`, `latestVersion`, `trigger(body?)`, `clear()`), `parseGateBody(body): {minVersion, latestVersion}`, `getReleaseInfo(): Promise<ReleaseInfo | null>`.

- [ ] **Step 1: Failing test**

```ts
import { parseGateBody, useUpdateRequiredStore } from '@/src/stores/updateRequiredStore';

describe('updateRequiredStore', () => {
  beforeEach(() => useUpdateRequiredStore.getState().clear());
  it('parses a flat gate body', () => {
    expect(parseGateBody({ error_code: 'APP_UPDATE_REQUIRED', min_version: '1.2.0', latest_version: '1.3.0' }))
      .toEqual({ minVersion: '1.2.0', latestVersion: '1.3.0' });
  });
  it('parses a body nested under message', () => {
    expect(parseGateBody({ message: { min_version: '1.2.0' } })).toEqual({ minVersion: '1.2.0', latestVersion: null });
  });
  it('tolerates garbage', () => {
    expect(parseGateBody(null)).toEqual({ minVersion: null, latestVersion: null });
    expect(parseGateBody('x')).toEqual({ minVersion: null, latestVersion: null });
  });
  it('trigger sets and clear resets', () => {
    useUpdateRequiredStore.getState().trigger({ min_version: '1.2.0' });
    expect(useUpdateRequiredStore.getState().required).toBe(true);
    expect(useUpdateRequiredStore.getState().minVersion).toBe('1.2.0');
    useUpdateRequiredStore.getState().clear();
    expect(useUpdateRequiredStore.getState().required).toBe(false);
  });
});
```
- [ ] **Step 2:** `npx jest __tests__/update-required-store-test.ts` → FAIL.
- [ ] **Step 3: Create `src/stores/updateRequiredStore.ts`**

```ts
import { create } from 'zustand';

export type GateInfo = { minVersion: string | null; latestVersion: string | null };

/** The gate response body is read leniently: Frappe may nest custom keys. */
export function parseGateBody(body: unknown): GateInfo {
  const empty: GateInfo = { minVersion: null, latestVersion: null };
  if (!body || typeof body !== 'object') return empty;
  const b = body as Record<string, any>;
  const src = typeof b.min_version === 'string' || typeof b.latest_version === 'string' ? b : b.message ?? b.data ?? {};
  return {
    minVersion: typeof src.min_version === 'string' ? src.min_version : null,
    latestVersion: typeof src.latest_version === 'string' ? src.latest_version : null,
  };
}

interface UpdateRequiredState extends GateInfo {
  required: boolean;
  trigger: (body?: unknown) => void;
  clear: () => void;
}

export const useUpdateRequiredStore = create<UpdateRequiredState>((set) => ({
  required: false,
  minVersion: null,
  latestVersion: null,
  trigger: (body) => set({ required: true, ...parseGateBody(body) }),
  clear: () => set({ required: false, minVersion: null, latestVersion: null }),
}));
```
- [ ] **Step 4:** Run the test → PASS.
- [ ] **Step 5: Edit `src/services/api.ts`.** Add imports `APP_VERSION, RUNTIME_VERSION` from `./version`, `getDeviceId` from `./device-id`, `useUpdateRequiredStore` from `@/src/stores/updateRequiredStore`. In the request interceptor after the Content-Type block add:

```ts
    const h = config.headers as Record<string, string>;
    h['X-App-Name'] = 'production';
    h['X-App-Version'] = APP_VERSION;
    h['X-App-Runtime'] = RUNTIME_VERSION;
    const deviceId = await getDeviceId();
    if (deviceId) h['X-Device-Id'] = deviceId;
```
In the response error handler, right after the `if (!error.response) {...}` block add:

```ts
      if (error.response.status === 426) {
        try { useUpdateRequiredStore.getState().trigger(error.response.data); } catch {}
        return Promise.reject(error);
      }
```
- [ ] **Step 6: Edit `src/services/telemetry/collect.ts`**: add `native_version: string; runtime: string;` to `TelemetryPayload`; delete the local `deviceId()` and use `getDeviceId()`; set `app_version: APP_VERSION`, `native_version: INSTALLED_APK_VERSION`, `runtime: RUNTIME_VERSION` (imports from `./../version`, `../device-id`).
- [ ] **Step 7: Create `src/services/release-info.ts`**

```ts
import { api } from './api';

export type ReleaseInfo = {
  latest: string | null;
  runtime: string | null;
  apkUrl: string | null;
  publishedAt: string | null;
  minSupported: string | null;
  enforced: boolean;
};

/** Never throws: the lock screen and dashboard degrade without it. */
export async function getReleaseInfo(): Promise<ReleaseInfo | null> {
  try {
    const res = await api<{ message?: ReleaseInfo }>({
      method: 'POST',
      url: '/api/method/upande_agriculture.mobile.release_api.getReleaseInfo',
      data: {},
    });
    return res?.message ?? null;
  } catch {
    return null;
  }
}
```
- [ ] **Step 8: Create `app/update-required.tsx`** (full-screen lock; no back):

```tsx
import React, { useCallback, useEffect, useState } from 'react';
import { AppState, BackHandler, StyleSheet, Text, View } from 'react-native';
import * as Updates from 'expo-updates';
import { Screen } from '@/src/components/Screen';
import { Button } from '@/src/components/Button';
import { useUpdateRequiredStore } from '@/src/stores/updateRequiredStore';
import { useApkUpdate } from '@/src/services/updates/UpdateProvider';
import { formatBytes } from '@/src/services/updates/releases';
import { compareVersions } from '@/src/services/updates/compare-versions';
import { getReleaseInfo } from '@/src/services/release-info';
import { APP_VERSION } from '@/src/services/version';
import { colors, fontFamily, fontSize, spacing } from '@/src/theme';

export default function UpdateRequiredScreen() {
  const { minVersion, latestVersion, clear } = useUpdateRequiredStore();
  const { check, refresh, install, downloading, progress, downloaded, installError } = useApkUpdate();
  const [otaReady, setOtaReady] = useState(false);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, []);

  const recheck = useCallback(async () => {
    setWorking(true);
    setMessage(null);
    try {
      const info = await getReleaseInfo();
      if (info?.minSupported && compareVersions(APP_VERSION, info.minSupported) >= 0) {
        clear();
        return;
      }
      if (!__DEV__ && Updates.isEnabled) {
        try {
          const found = await Updates.checkForUpdateAsync();
          if (found.isAvailable) {
            const fetched = await Updates.fetchUpdateAsync();
            if (fetched.isNew) setOtaReady(true);
          }
        } catch {
          // No OTA for this runtime: fall through to the APK.
        }
      }
      await refresh();
    } finally {
      setWorking(false);
    }
  }, [clear, refresh]);

  useEffect(() => {
    recheck();
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') recheck(); });
    return () => sub.remove();
  }, [recheck]);

  const apk = check?.apk ?? null;
  const apkReady = !!apk && downloaded === apk.version;

  const onPress = async () => {
    if (otaReady) { await Updates.reloadAsync(); return; }
    if (apk && check?.available) { await install(); return; }
    await recheck();
    if (!otaReady) setMessage('No update is available yet. Check your connection and try again.');
  };

  let label = 'Check for update';
  if (otaReady) label = 'Apply update';
  else if (downloading) label = progress?.fraction != null ? `Downloading ${Math.round(progress.fraction * 100)}%` : 'Downloading…';
  else if (apkReady && apk) label = `Install v${apk.version}`;
  else if (apk && check?.available) label = `Download v${apk.version}${formatBytes(apk.sizeBytes) ? ` (${formatBytes(apk.sizeBytes)})` : ''}`;

  return (
    <Screen>
      <View style={s.wrap}>
        <Text style={s.title}>Update required</Text>
        <Text style={s.body}>
          This version of Upande Production (v{APP_VERSION}) is no longer supported
          {minVersion ? `; v${minVersion} or newer is needed` : ''}. Update to keep recording data.
        </Text>
        {latestVersion ? <Text style={s.hint}>Latest version: v{latestVersion}</Text> : null}
        {message ? <Text style={s.hint}>{message}</Text> : null}
        {installError ? <Text style={s.error}>{installError.message}</Text> : null}
        <View style={{ height: spacing.lg }} />
        <Button label={label} onPress={onPress} loading={working || downloading} iconLeft="cloud-download-outline" />
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'center', padding: spacing.lg },
  title: { fontFamily: fontFamily.bold, fontSize: fontSize.xl, color: colors.text, marginBottom: spacing.md },
  body: { fontFamily: fontFamily.regular, fontSize: fontSize.md, color: colors.textSecondary },
  hint: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.textMuted, marginTop: spacing.sm },
  error: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.danger, marginTop: spacing.sm },
});
```
- [ ] **Step 9: Edit `app/_layout.tsx`**: import `useUpdateRequiredStore`; `const updateRequired = useUpdateRequiredStore((s) => s.required);`; in the auth-gate effect, after the `biometricLocked` block and before the `inAuthFlow` redirect add

```ts
    if (updateRequired) {
      if (first !== 'update-required') router.replace('/update-required');
      return;
    }
    if (first === 'update-required') { router.replace('/'); return; }
```
add `updateRequired` to the effect deps, and `<Stack.Screen name="update-required" options={{ gestureEnabled: false, animation: 'fade' }} />` to the Stack.
- [ ] **Step 10: Verify** — `npx tsc --noEmit`, `npm run lint`, `npx jest --ci`.
- [ ] **Step 11: Commit** (stage only this task's files).

---

### Task 6: Backend — version helper + policy access (new branch)

**Files (repo `/home/jk/Projects/upande-local-bench-v16/apps/upande_agriculture`):**
- Create: `upande_agriculture/mobile/versioning.py`, `upande_agriculture/tests/test_versioning.py`

**Interfaces:**
- Produces: `parse_version(v) -> tuple[int,int,int] | None`, `is_below(version, floor) -> bool` (False when either is unparseable), `compare(a,b) -> int|None`.

- [ ] **Step 1:** `git switch -c feature/mobile-update-gate` (leave existing dirty files untouched).
- [ ] **Step 2: Failing test** `tests/test_versioning.py` (pure, no bench needed):

```python
import unittest

from upande_agriculture.mobile.versioning import compare, is_below, parse_version


class TestVersioning(unittest.TestCase):
    def test_parse_valid(self):
        self.assertEqual(parse_version("1.2.3"), (1, 2, 3))
        self.assertEqual(parse_version(" v1.2.3 "), (1, 2, 3))

    def test_parse_invalid_is_none(self):
        for bad in ("", None, "1.0", "abc", "1.0.x", "1.0.0.0", "-1.0.0"):
            self.assertIsNone(parse_version(bad), bad)

    def test_numeric_not_lexical(self):
        self.assertTrue(is_below("1.0.9", "1.0.10"))
        self.assertFalse(is_below("1.0.10", "1.0.9"))

    def test_equal_is_not_below(self):
        self.assertFalse(is_below("1.2.0", "1.2.0"))

    def test_unparseable_never_below(self):
        self.assertFalse(is_below("", "1.0.0"))
        self.assertFalse(is_below("1.0.0", ""))
        self.assertFalse(is_below(None, None))

    def test_compare(self):
        self.assertEqual(compare("1.0.1", "1.0.0"), 1)
        self.assertEqual(compare("1.0.0", "1.0.1"), -1)
        self.assertEqual(compare("1.0.0", "1.0.0"), 0)
        self.assertIsNone(compare("x", "1.0.0"))
```
- [ ] **Step 3:** `cd /home/jk/Projects/upande-local-bench-v16/apps/upande_agriculture && python3 -m unittest upande_agriculture.tests.test_versioning` → FAIL (import error). (`upande_agriculture/__init__.py` imports nothing heavy; if the package import needs frappe, run via `../../env/bin/python -m unittest ...`.)
- [ ] **Step 4: Implement `mobile/versioning.py`**

```python
"""x.y.z version helpers shared by the update gate and the Support dashboard."""


def parse_version(value):
    """(major, minor, patch) or None when the value is not a valid x.y.z."""
    if not isinstance(value, str):
        return None
    parts = value.strip().lstrip("vV").split(".")
    if len(parts) != 3:
        return None
    try:
        nums = tuple(int(p) for p in parts)
    except ValueError:
        return None
    if any(n < 0 for n in nums):
        return None
    return nums


def compare(a, b):
    """1 / 0 / -1, or None when either side is unparseable."""
    pa, pb = parse_version(a), parse_version(b)
    if pa is None or pb is None:
        return None
    return (pa > pb) - (pa < pb)


def is_below(version, floor):
    """True only when both parse and version < floor (garbage never blocks)."""
    return compare(version, floor) == -1
```
- [ ] **Step 5:** Run the tests → PASS.
- [ ] **Step 6: Commit** — `git add upande_agriculture/mobile/versioning.py upande_agriculture/tests/test_versioning.py && git commit -m "feat(mobile): x.y.z version helpers"`

---

### Task 7: Backend — doctypes, role, patch

**Files:** Create under `upande_agriculture/upande_agriculture/doctype/`: `mobile_release_policy/{__init__.py,mobile_release_policy.json,mobile_release_policy.py}`, `mobile_device/{__init__.py,mobile_device.json,mobile_device.py}`, `mobile_device_user/{__init__.py,mobile_device_user.json,mobile_device_user.py}`; `upande_agriculture/patches/v1_0/create_support_team_role.py`; modify `upande_agriculture/patches.txt`; test `tests/test_mobile_doctypes.py`.

**Interfaces:** Produces doctypes `Mobile Release Policy` (Single: `enforce_gate`, `min_supported_version`, `block_unidentified`, `latest_json_url`, `notes_for_users`), `Mobile Device` (autoname `field:device_id`, fields listed in spec §5, child `users` → `Mobile Device User`), role `Support Team`.

- [ ] **Step 1: Failing test `tests/test_mobile_doctypes.py`**

```python
import frappe
from frappe.tests.utils import FrappeTestCase


class TestMobileDoctypes(FrappeTestCase):
    def test_policy_defaults_off(self):
        policy = frappe.get_single("Mobile Release Policy")
        self.assertEqual(int(policy.enforce_gate or 0), 0)

    def test_device_roundtrip_with_users(self):
        d = frappe.get_doc({
            "doctype": "Mobile Device", "device_id": "test-dev-1", "app_version": "1.0.0",
            "users": [{"user": "Administrator", "full_name": "Administrator"}],
        }).insert(ignore_permissions=True)
        self.assertEqual(d.name, "test-dev-1")
        self.assertEqual(len(frappe.get_doc("Mobile Device", "test-dev-1").users), 1)

    def test_support_team_role_exists(self):
        self.assertTrue(frappe.db.exists("Role", "Support Team"))
```
- [ ] **Step 2: Create the doctype files.** Each `.py` is `import frappe\nfrom frappe.model.document import Document\n\n\nclass <ClassName>(Document):\n    pass\n`. JSON (all with `"module": "Upande Agriculture"`, `"doctype": "DocType"`, `"engine": "InnoDB"`, `"owner": "Administrator"`, `"sort_field": "modified"`, `"sort_order": "DESC"`, `"permissions": [{"role": "System Manager", "read": 1, "write": 1, "create": 1, "delete": 1}]`):
  - `mobile_release_policy.json`: `"issingle": 1`; fields `enforce_gate` Check; `min_supported_version` Data; `block_unidentified` Check; `latest_json_url` Data default `https://mark-judah.github.io/upande-production/ota/latest.json`; `notes_for_users` Small Text.
  - `mobile_device_user.json`: `"istable": 1`; fields `user` Link User, `full_name` Data, `first_login` Datetime, `last_login` Datetime.
  - `mobile_device.json`: `"autoname": "field:device_id"`, `"track_changes": 0`; fields `device_id` Data (reqd, unique), `device_name`, `model`, `brand`, `os`, `os_version` Data; `user` Link User; `user_full_name`, `employee` (Link Employee), `farm` Data, `phone`, `designation` Data; `app_version`, `native_version`, `runtime`, `ota_update_id` Data; `first_seen`, `last_seen`, `last_version_change_at`, `last_blocked_at` Datetime; `storage_free` Float; `blocked_count` Int; `users` Table → `Mobile Device User`.
- [ ] **Step 3: Create patch `patches/v1_0/create_support_team_role.py`**

```python
import frappe


def execute():
    if not frappe.db.exists("Role", "Support Team"):
        frappe.get_doc({"doctype": "Role", "role_name": "Support Team", "desk_access": 0}).insert(ignore_permissions=True)
```
and append `upande_agriculture.patches.v1_0.create_support_team_role` as a new last line of `patches.txt`.
- [ ] **Step 4: Migrate and test**

```bash
cd /home/jk/Projects/upande-local-bench-v16
bench --site kaitet.local migrate
bench --site kaitet.local run-tests --app upande_agriculture --module upande_agriculture.tests.test_mobile_doctypes
```
Expected: PASS (3 tests). If `bench` reports maintenance mode, run `bench --site kaitet.local set-maintenance-mode off` first and restore it to `on` afterwards.
- [ ] **Step 5: Commit** — `git add` the new doctype dirs, the patch, `patches.txt`, the test; commit `feat(mobile): Mobile Device, Mobile Release Policy doctypes and Support Team role`.

---

### Task 8: Backend — telemetry upsert + prune job

**Files:** Create `mobile/devices.py`, `tests/test_devices.py`; modify `mobile/api.py` (`reportDeviceTelemetry`, 3 lines), `hooks.py` (scheduler), `scheduled.py` (prune).

**Interfaces:**
- Consumes: Task 6/7. Produces `devices.upsert_from_telemetry(data: dict) -> str | None` (device name), `devices.resolve_employee(user) -> dict` (`employee, farm, phone, designation`, blank values when none), `devices.record_block(device_id, version) -> None`, `scheduled.prune_device_telemetry()`.

- [ ] **Step 1: Failing tests `tests/test_devices.py`**

```python
import frappe
from frappe.tests.utils import FrappeTestCase

from upande_agriculture.mobile import devices


class TestDevices(FrappeTestCase):
    def setUp(self):
        frappe.db.delete("Mobile Device", {"device_id": ["like", "tst-%"]})

    def _payload(self, **kw):
        base = {"device_id": "tst-1", "device_name": "Pixel", "model": "P7", "os": "android",
                "os_version": "14", "app_version": "1.0.1", "native_version": "1.0.0",
                "runtime": "101.0", "storage_free": 5e8, "user": "Administrator",
                "user_full_name": "Admin", "captured_at": "2026-10-14T10:00:00.000Z"}
        base.update(kw)
        return base

    def test_creates_device(self):
        name = devices.upsert_from_telemetry(self._payload())
        d = frappe.get_doc("Mobile Device", name)
        self.assertEqual(d.app_version, "1.0.1")
        self.assertEqual(d.user, "Administrator")
        self.assertEqual(len(d.users), 1)

    def test_blank_user_and_unknown_employee_do_not_fail(self):
        name = devices.upsert_from_telemetry(self._payload(device_id="tst-2", user="", user_full_name=""))
        self.assertTrue(frappe.db.exists("Mobile Device", name))
        self.assertEqual(devices.resolve_employee("nobody@example.com")["farm"], "")

    def test_second_user_appended_and_becomes_current(self):
        devices.upsert_from_telemetry(self._payload())
        devices.upsert_from_telemetry(self._payload(user="Guest", user_full_name="Guest"))
        d = frappe.get_doc("Mobile Device", "tst-1")
        self.assertEqual({u.user for u in d.users}, {"Administrator", "Guest"})
        self.assertEqual(d.user, "Guest")

    def test_version_change_stamps_time(self):
        devices.upsert_from_telemetry(self._payload())
        first = frappe.db.get_value("Mobile Device", "tst-1", "last_version_change_at")
        devices.upsert_from_telemetry(self._payload(app_version="1.0.2"))
        d = frappe.get_doc("Mobile Device", "tst-1")
        self.assertEqual(d.app_version, "1.0.2")
        self.assertGreaterEqual(d.last_version_change_at, first)

    def test_missing_device_id_returns_none(self):
        self.assertIsNone(devices.upsert_from_telemetry({"app_version": "1.0.0"}))

    def test_record_block_creates_minimal_row_and_counts(self):
        devices.record_block("tst-3", "0.9.0")
        devices.record_block("tst-3", "0.9.0")
        self.assertEqual(frappe.db.get_value("Mobile Device", "tst-3", "blocked_count"), 2)
```
- [ ] **Step 2:** Run `bench --site kaitet.local run-tests --app upande_agriculture --module upande_agriculture.tests.test_devices` → FAIL (module missing).
- [ ] **Step 3: Implement `mobile/devices.py`**

```python
"""Mobile Device upkeep: one row per physical device, fed by telemetry and the gate."""

import frappe
from frappe.utils import now_datetime


def _ts(value):
    if not value:
        return now_datetime()
    return str(value).replace("T", " ").replace("Z", "")[:26]


def resolve_employee(user):
    blank = {"employee": "", "farm": "", "phone": "", "designation": ""}
    if not user:
        return blank
    row = frappe.db.get_value(
        "Employee", {"user_id": user},
        ["name", "custom_farm", "cell_number", "designation"], as_dict=True,
    )
    if not row:
        return blank
    return {"employee": row.name, "farm": row.custom_farm or "", "phone": row.cell_number or "",
            "designation": row.designation or ""}


def upsert_from_telemetry(data):
    device_id = (data or {}).get("device_id")
    if not device_id:
        return None
    now = now_datetime()
    user = data.get("user") or ""
    if frappe.db.exists("Mobile Device", device_id):
        d = frappe.get_doc("Mobile Device", device_id)
    else:
        d = frappe.new_doc("Mobile Device")
        d.device_id = device_id
        d.first_seen = now
    new_version = data.get("app_version") or ""
    if new_version and new_version != (d.app_version or ""):
        d.last_version_change_at = now
    for field in ("device_name", "model", "brand", "os", "os_version", "native_version",
                  "runtime", "ota_update_id"):
        if data.get(field) not in (None, ""):
            d.set(field, data.get(field))
    d.app_version = new_version or d.app_version
    if isinstance(data.get("storage_free"), (int, float)):
        d.storage_free = data.get("storage_free")
    d.last_seen = _ts(data.get("captured_at"))
    if user:
        d.user = user
        d.user_full_name = data.get("user_full_name") or ""
        info = resolve_employee(user)
        d.employee, d.farm, d.phone, d.designation = (
            info["employee"], info["farm"], info["phone"], info["designation"])
        existing = [u for u in d.users if u.user == user]
        if existing:
            existing[0].last_login = now
        else:
            d.append("users", {"user": user, "full_name": data.get("user_full_name") or "",
                               "first_login": now, "last_login": now})
    d.flags.ignore_permissions = True
    d.save() if d.get("__islocal") is None and not d.is_new() else d.insert()
    return d.name


def record_block(device_id, version):
    """Count a gate rejection. Commits itself: the request is about to fail and roll back."""
    if not device_id:
        return
    if not frappe.db.exists("Mobile Device", device_id):
        d = frappe.get_doc({"doctype": "Mobile Device", "device_id": device_id,
                            "app_version": version or "", "first_seen": now_datetime(),
                            "last_seen": now_datetime(), "blocked_count": 0})
        d.insert(ignore_permissions=True)
    frappe.db.sql(
        "update `tabMobile Device` set blocked_count = ifnull(blocked_count, 0) + 1, "
        "last_blocked_at = %s where name = %s",
        (now_datetime(), device_id),
    )
    frappe.db.commit()
```
(Simplify the save/insert line to `d.save()` if `d.is_new()` is False else `d.insert()`:

```python
    if d.is_new():
        d.insert()
    else:
        d.save()
```
Use that form — it replaces the conditional-expression line above.)
- [ ] **Step 4: Edit `mobile/api.py` `reportDeviceTelemetry`**: inside the `try`, after `frappe.db.commit()` and before the success message, add

```python
        try:
            from upande_agriculture.mobile import devices
            devices.upsert_from_telemetry(data)
            frappe.db.commit()
        except Exception:
            frappe.log_error(frappe.get_traceback(), "Mobile Device upsert failed")
```
(also add `"native_version", "runtime"` to nothing in `fields`: Device Telemetry history does not get them; they live in `raw_json`.)
- [ ] **Step 5: Prune job.** In `scheduled.py` append

```python
def prune_device_telemetry():
    import frappe
    from frappe.utils import add_days, nowdate
    frappe.db.delete("Device Telemetry", {"creation": ["<", add_days(nowdate(), -30)]})
```
and add `"upande_agriculture.scheduled.prune_device_telemetry"` to the `daily` list in `hooks.py`'s `scheduler_events`.
- [ ] **Step 6:** Run the tests → PASS.
- [ ] **Step 7: Commit** — stage `mobile/devices.py`, `tests/test_devices.py`, `scheduled.py`, `hooks.py`; for `mobile/api.py` use `git add -p` and accept only the `reportDeviceTelemetry` hunk. Commit `feat(mobile): upsert Mobile Device from telemetry; prune old telemetry`.

---

### Task 9: Backend — the gate hook

**Files:** Create `mobile/gate.py`, `tests/test_gate.py`; modify `hooks.py` (`before_request`).

**Interfaces:** Consumes `versioning`, `devices.record_block`. Produces `gate.AppUpdateRequired` (HTTP 426), `gate.evaluate(path, headers, policy) -> dict | None` (pure: returns `{"min_version", "device_id", "version"}` when the request must be blocked), `gate.before_request()`.

- [ ] **Step 1: Failing tests `tests/test_gate.py`** (pure, using `evaluate`)

```python
import unittest

from upande_agriculture.mobile.gate import evaluate

POLICY = {"enforce_gate": 1, "min_supported_version": "1.2.0", "block_unidentified": 0}
P = "/api/method/upande_agriculture.mobile.api.productionCreateCropCycle"
H = {"X-App-Name": "production", "X-App-Version": "1.1.0", "X-Device-Id": "d1"}


class TestGate(unittest.TestCase):
    def test_blocks_below_floor(self):
        r = evaluate(P, H, POLICY)
        self.assertEqual(r["min_version"], "1.2.0")
        self.assertEqual(r["device_id"], "d1")

    def test_allows_at_and_above_floor(self):
        self.assertIsNone(evaluate(P, {**H, "X-App-Version": "1.2.0"}, POLICY))
        self.assertIsNone(evaluate(P, {**H, "X-App-Version": "2.0.0"}, POLICY))

    def test_gate_off_allows(self):
        self.assertIsNone(evaluate(P, H, {**POLICY, "enforce_gate": 0}))

    def test_no_floor_allows(self):
        self.assertIsNone(evaluate(P, H, {**POLICY, "min_supported_version": ""}))

    def test_exempt_methods_always_allowed(self):
        for m in ("upande_packhouse.mobile.api.mobileLogin", "login",
                  "upande_packhouse.mobile.api.getCurrentUserRoles",
                  "upande_agriculture.mobile.api.reportDeviceTelemetry",
                  "upande_agriculture.mobile.release_api.getReleaseInfo",
                  "upande_agriculture.mobile.support_api.getSupportDashboard",
                  "upande_agriculture.mobile.support_api.setMinVersion"):
            self.assertIsNone(evaluate("/api/method/" + m, H, POLICY), m)

    def test_other_apps_and_paths_untouched(self):
        self.assertIsNone(evaluate(P, {"X-App-Name": "quality", "X-App-Version": "0.1.0"}, POLICY))
        self.assertIsNone(evaluate("/api/resource/Item", H, POLICY))
        self.assertIsNone(evaluate("/api/method/frappe.ping", H, POLICY))

    def test_no_header_allowed_unless_block_unidentified(self):
        self.assertIsNone(evaluate(P, {}, POLICY))
        self.assertIsNotNone(evaluate(P, {"X-App-Name": "production"}, {**POLICY, "block_unidentified": 1}))

    def test_garbage_version_is_unidentified_not_blocked(self):
        self.assertIsNone(evaluate(P, {**H, "X-App-Version": "abc"}, POLICY))
        self.assertIsNone(evaluate(P, {**H, "X-App-Version": ""}, POLICY))

    def test_garbage_floor_never_blocks(self):
        self.assertIsNone(evaluate(P, H, {**POLICY, "min_supported_version": "oops"}))

    def test_packhouse_methods_the_app_calls_are_gated(self):
        r = evaluate("/api/method/upande_packhouse.mobile.api.fetchStockEntryByBunch", H, POLICY)
        self.assertIsNotNone(r)
```
- [ ] **Step 2:** `python3 -m unittest upande_agriculture.tests.test_gate` (or via the bench env python) → FAIL.
- [ ] **Step 3: Implement `mobile/gate.py`**

```python
"""Minimum-version gate for the Upande Production mobile app.

A before_request hook: requests carrying `X-App-Name: production` for the app's
own API methods are rejected with HTTP 426 when `X-App-Version` is below the
floor in Mobile Release Policy. Any internal error lets the request through --
a bug here must never take the farm offline.
"""

import frappe

from upande_agriculture.mobile.versioning import is_below, parse_version

GATED_PREFIXES = ("upande_agriculture.mobile.",)
GATED_PACKHOUSE = ("upande_packhouse.mobile.api.fetchStockEntryByBunch",)
EXEMPT_METHODS = (
    "login",
    "upande_packhouse.mobile.api.mobileLogin",
    "upande_packhouse.mobile.api.getCurrentUserRoles",
    "upande_agriculture.mobile.api.reportDeviceTelemetry",
    "upande_agriculture.mobile.release_api.getReleaseInfo",
    "upande_agriculture.mobile.support_api.getSupportDashboard",
    "upande_agriculture.mobile.support_api.setMinVersion",
)
METHOD_PATH = "/api/method/"


class AppUpdateRequired(frappe.ValidationError):
    http_status_code = 426


def _method_of(path):
    if not path or not path.startswith(METHOD_PATH):
        return None
    return path[len(METHOD_PATH):].split("?")[0]


def _is_gated(method):
    if not method or method in EXEMPT_METHODS:
        return False
    return method.startswith(GATED_PREFIXES) or method in GATED_PACKHOUSE


def _header(headers, name):
    value = headers.get(name)
    return (value or "").strip() if isinstance(value, str) else ""


def evaluate(path, headers, policy):
    """Pure decision: a dict describing the block, or None to let the request pass."""
    if not int(policy.get("enforce_gate") or 0):
        return None
    floor = policy.get("min_supported_version") or ""
    if parse_version(floor) is None:
        return None
    method = _method_of(path)
    if not _is_gated(method):
        return None
    app = _header(headers, "X-App-Name")
    version = _header(headers, "X-App-Version")
    device_id = _header(headers, "X-Device-Id")
    if app != "production":
        if app == "" and int(policy.get("block_unidentified") or 0):
            return {"min_version": floor, "device_id": device_id, "version": version}
        return None
    if parse_version(version) is None:
        # A production client that sent no usable version: only blocked when asked.
        if int(policy.get("block_unidentified") or 0):
            return {"min_version": floor, "device_id": device_id, "version": version}
        return None
    if is_below(version, floor):
        return {"min_version": floor, "device_id": device_id, "version": version}
    return None


def before_request():
    try:
        policy = frappe.db.get_singles_dict("Mobile Release Policy") or {}
        request = frappe.request
        if request is None:
            return
        decision = evaluate(request.path, request.headers, policy)
    except Exception:
        frappe.log_error(frappe.get_traceback(), "update gate check failed (allowing request)")
        return
    if not decision:
        return

    try:
        from upande_agriculture.mobile import devices
        devices.record_block(decision["device_id"], decision["version"])
    except Exception:
        frappe.log_error(frappe.get_traceback(), "update gate: recording block failed")

    latest = None
    try:
        from upande_agriculture.mobile.release_api import cached_latest_version
        latest = cached_latest_version()
    except Exception:
        pass
    frappe.local.response["error_code"] = "APP_UPDATE_REQUIRED"
    frappe.local.response["min_version"] = decision["min_version"]
    frappe.local.response["latest_version"] = latest
    raise AppUpdateRequired("APP_UPDATE_REQUIRED")
```
Note: `evaluate` receives Werkzeug `request.headers` (case-insensitive `.get`) in production and a plain dict in tests; test headers use the canonical casing so `.get` works for both.
- [ ] **Step 4:** Run the gate tests → PASS.
- [ ] **Step 5: Register the hook.** In `hooks.py` replace the commented `# before_request = [...]` line with `before_request = ["upande_agriculture.mobile.gate.before_request"]`.
- [ ] **Step 6: Live HTTP check on the bench** (hook only runs through a real request). Needs `release_api.cached_latest_version` from Task 10; if running before Task 10, temporarily skip. After Task 10:

```bash
cd /home/jk/Projects/upande-local-bench-v16
bench --site kaitet.local execute frappe.client.set_value --args '["Mobile Release Policy","Mobile Release Policy","enforce_gate",1]'
bench --site kaitet.local execute frappe.client.set_value --args '["Mobile Release Policy","Mobile Release Policy","min_supported_version","9.9.9"]'
# with the bench running (bench start) and a valid session cookie $SID:
curl -s -i -X POST http://kaitet.local:8001/api/method/upande_agriculture.mobile.api.productionListFarms \
  -H "Cookie: sid=$SID" -H 'Content-Type: application/json' -H 'X-App-Name: production' \
  -H 'X-App-Version: 1.0.0' -H 'X-Device-Id: curl-test' -d '{}' | head -20
```
Expected: `HTTP/1.1 426`, body contains `error_code`/`min_version`. Record whether the keys are top-level; the client parser accepts either. Then reset: `enforce_gate` 0.
- [ ] **Step 7: Commit** — `git add mobile/gate.py tests/test_gate.py hooks.py` (hooks.py also carries Task 8's scheduler hunk already committed; stage only the `before_request` hunk with `git add -p`). Commit `feat(mobile): minimum-version gate (before_request, HTTP 426)`.

---

### Task 10: Backend — `getReleaseInfo`

**Files:** Create `mobile/release_api.py`, `tests/test_release_api.py`.

**Interfaces:** Produces `parse_latest(raw: dict) -> dict`, `cached_latest_version() -> str | None`, whitelisted `getReleaseInfo()` returning `{latest, runtime, apkUrl, publishedAt, minSupported, enforced}`.

- [ ] **Step 1: Failing test**

```python
import unittest

from upande_agriculture.mobile.release_api import parse_latest


class TestParseLatest(unittest.TestCase):
    def test_extracts_fields(self):
        r = parse_latest({"version": "1.2.3", "runtime": "101.2", "apkUrl": "u", "publishedAt": "t", "x": 1})
        self.assertEqual(r, {"latest": "1.2.3", "runtime": "101.2", "apkUrl": "u", "publishedAt": "t"})

    def test_garbage_is_all_none(self):
        for bad in (None, "x", [], {}):
            self.assertEqual(parse_latest(bad), {"latest": None, "runtime": None, "apkUrl": None, "publishedAt": None})

    def test_rejects_unparseable_version(self):
        self.assertIsNone(parse_latest({"version": "nightly"})["latest"])
```
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implement `mobile/release_api.py`**

```python
"""Release info for the mobile app: latest published version + the enforced floor."""

import json
import urllib.request

import frappe

from upande_agriculture.mobile.versioning import parse_version

CACHE_KEY = "upande_production_latest_json"
CACHE_SECONDS = 300
EMPTY = {"latest": None, "runtime": None, "apkUrl": None, "publishedAt": None}


def parse_latest(raw):
    if not isinstance(raw, dict):
        return dict(EMPTY)
    version = raw.get("version")
    return {
        "latest": version if parse_version(version) else None,
        "runtime": raw.get("runtime") if isinstance(raw.get("runtime"), str) else None,
        "apkUrl": raw.get("apkUrl") if isinstance(raw.get("apkUrl"), str) else None,
        "publishedAt": raw.get("publishedAt") if isinstance(raw.get("publishedAt"), str) else None,
    }


def _fetch(url):
    with urllib.request.urlopen(url, timeout=8) as res:  # noqa: S310 - fixed https URL from policy
        return json.loads(res.read().decode("utf-8"))


def latest_release():
    """Cached 5 minutes; on a failed fetch the last good value (or empty) is returned."""
    cache = frappe.cache()
    hit = cache.get_value(CACHE_KEY)
    if hit:
        return hit
    stale = cache.get_value(CACHE_KEY + "_stale") or dict(EMPTY)
    url = frappe.db.get_single_value("Mobile Release Policy", "latest_json_url")
    if not url or not str(url).startswith("https://"):
        return stale
    try:
        fresh = parse_latest(_fetch(url))
    except Exception:
        return stale
    if fresh["latest"]:
        cache.set_value(CACHE_KEY, fresh, expires_in_sec=CACHE_SECONDS)
        cache.set_value(CACHE_KEY + "_stale", fresh)
        return fresh
    return stale


def cached_latest_version():
    return latest_release().get("latest")


@frappe.whitelist()
def getReleaseInfo():
    policy = frappe.db.get_singles_dict("Mobile Release Policy") or {}
    info = dict(latest_release())
    info["minSupported"] = policy.get("min_supported_version") or None
    info["enforced"] = bool(int(policy.get("enforce_gate") or 0))
    return info
```
- [ ] **Step 4:** Run → PASS. Then `bench --site kaitet.local execute upande_agriculture.mobile.release_api.getReleaseInfo` returns a dict without raising (empty `latest` is fine when Pages has no `latest.json` yet).
- [ ] **Step 5: Commit** `feat(mobile): getReleaseInfo (cached latest.json + policy floor)`.

---

### Task 11: Backend — Support dashboard + `setMinVersion`

**Files:** Create `mobile/support_api.py`, `tests/test_support_api.py`.

**Interfaces:**
- Consumes `versioning`, `release_api.latest_release`.
- Produces pure `classify_device(row, latest, now) -> {"behind": bool, "reason": str|None, "blocked_recent": bool}`, whitelisted `getSupportDashboard()` → `{status, summary, distribution, behind, never_reported, blocked}`, `setMinVersion(version, dry_run=0)` → `{status, would_lock_devices, would_lock_users}` or saved confirmation.

Reason codes: `needs_apk`, `low_storage`, `offline`, `missed_ota`. Precedence `needs_apk > low_storage > offline > missed_ota`. `blocked_recent` = `blocked_count > 0` and `last_blocked_at` within 24 h.

- [ ] **Step 1: Failing tests** (pure `classify_device`; thresholds: offline = not seen for ≥ 2 days; low storage = `storage_free` known and < 150 MB)

```python
import datetime
import unittest

from upande_agriculture.mobile.support_api import classify_device

NOW = datetime.datetime(2026, 10, 14, 12, 0, 0)
LATEST = {"latest": "1.2.0", "runtime": "101.2"}


def row(**kw):
    base = {"app_version": "1.1.0", "runtime": "101.2", "storage_free": 1e9,
            "last_seen": NOW - datetime.timedelta(hours=1), "blocked_count": 0, "last_blocked_at": None}
    base.update(kw)
    return base


class TestClassify(unittest.TestCase):
    def test_current_device_not_behind(self):
        self.assertFalse(classify_device(row(app_version="1.2.0"), LATEST, NOW)["behind"])

    def test_newer_than_latest_not_behind(self):
        self.assertFalse(classify_device(row(app_version="1.3.0"), LATEST, NOW)["behind"])

    def test_missed_ota(self):
        r = classify_device(row(), LATEST, NOW)
        self.assertEqual((r["behind"], r["reason"]), (True, "missed_ota"))

    def test_needs_apk_when_runtime_differs(self):
        self.assertEqual(classify_device(row(runtime="101.1"), LATEST, NOW)["reason"], "needs_apk")

    def test_needs_apk_beats_low_storage_and_offline(self):
        r = classify_device(row(runtime="101.1", storage_free=1e6,
                                last_seen=NOW - datetime.timedelta(days=5)), LATEST, NOW)
        self.assertEqual(r["reason"], "needs_apk")

    def test_low_storage_beats_offline(self):
        r = classify_device(row(storage_free=1e6, last_seen=NOW - datetime.timedelta(days=5)), LATEST, NOW)
        self.assertEqual(r["reason"], "low_storage")

    def test_offline(self):
        r = classify_device(row(last_seen=NOW - datetime.timedelta(days=3)), LATEST, NOW)
        self.assertEqual(r["reason"], "offline")

    def test_unknown_storage_is_not_low(self):
        self.assertEqual(classify_device(row(storage_free=None), LATEST, NOW)["reason"], "missed_ota")

    def test_blocked_recent_is_additional(self):
        r = classify_device(row(blocked_count=3, last_blocked_at=NOW - datetime.timedelta(hours=2)), LATEST, NOW)
        self.assertTrue(r["blocked_recent"])
        self.assertEqual(r["reason"], "missed_ota")

    def test_old_block_not_recent(self):
        r = classify_device(row(blocked_count=3, last_blocked_at=NOW - datetime.timedelta(days=3)), LATEST, NOW)
        self.assertFalse(r["blocked_recent"])

    def test_no_latest_known_means_nothing_is_behind(self):
        self.assertFalse(classify_device(row(), {"latest": None, "runtime": None}, NOW)["behind"])

    def test_unparseable_device_version_is_behind_unknown(self):
        r = classify_device(row(app_version=""), LATEST, NOW)
        self.assertTrue(r["behind"])
```
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implement `mobile/support_api.py`**

```python
"""Support Team install dashboard + minimum-version control."""

import datetime

import frappe
from frappe.utils import now_datetime

from upande_agriculture.mobile.release_api import latest_release
from upande_agriculture.mobile.versioning import compare, parse_version

ALLOWED_ROLES = ("Support Team", "System Manager")
LOW_STORAGE_BYTES = 150 * 1024 * 1024
OFFLINE_AFTER = datetime.timedelta(days=2)
BLOCK_WINDOW = datetime.timedelta(hours=24)


def classify_device(row, latest, now):
    """Pure: is the device behind the latest release, and what should Support do about it."""
    latest_version = (latest or {}).get("latest")
    latest_runtime = (latest or {}).get("runtime")
    last_blocked = row.get("last_blocked_at")
    blocked_recent = bool(
        (row.get("blocked_count") or 0) > 0 and last_blocked and (now - last_blocked) <= BLOCK_WINDOW
    )
    if not latest_version:
        return {"behind": False, "reason": None, "blocked_recent": blocked_recent}
    cmp = compare(row.get("app_version"), latest_version)
    behind = True if cmp is None else cmp < 0
    if not behind:
        return {"behind": False, "reason": None, "blocked_recent": blocked_recent}

    reason = "missed_ota"
    if latest_runtime and row.get("runtime") and row.get("runtime") != latest_runtime:
        reason = "needs_apk"
    elif row.get("storage_free") is not None and 0 <= row.get("storage_free") < LOW_STORAGE_BYTES:
        reason = "low_storage"
    elif row.get("last_seen") and (now - row.get("last_seen")) >= OFFLINE_AFTER:
        reason = "offline"
    return {"behind": True, "reason": reason, "blocked_recent": blocked_recent}


def _require_role():
    roles = set(frappe.get_roles())
    if not roles.intersection(ALLOWED_ROLES):
        frappe.local.response["http_status_code"] = 403
        frappe.throw("Support Team role required", frappe.PermissionError)


def _devices():
    return frappe.get_all(
        "Mobile Device",
        fields=["name", "device_name", "model", "os_version", "user", "user_full_name", "employee",
                "farm", "phone", "designation", "app_version", "native_version", "runtime",
                "first_seen", "last_seen", "last_version_change_at", "storage_free",
                "blocked_count", "last_blocked_at"],
        limit_page_length=0,
    )


def _days_between(a, b):
    return max(0, (a - b).days) if a and b else None


@frappe.whitelist()
def getSupportDashboard():
    _require_role()
    now = now_datetime()
    latest = latest_release()
    policy = frappe.db.get_singles_dict("Mobile Release Policy") or {}
    rows = _devices()

    distribution, behind, blocked = {}, [], []
    for r in rows:
        key = r.app_version or "unknown"
        distribution[key] = distribution.get(key, 0) + 1
        c = classify_device(r, latest, now)
        card = {
            "device_id": r.name, "device": r.device_name or r.model or r.name, "model": r.model,
            "user": r.user, "user_full_name": r.user_full_name or r.user, "employee": r.employee,
            "farm": r.farm or "Unknown farm", "phone": r.phone, "designation": r.designation,
            "app_version": r.app_version, "runtime": r.runtime, "native_version": r.native_version,
            "last_seen": str(r.last_seen) if r.last_seen else None,
            "days_since_seen": _days_between(now, r.last_seen),
            "days_behind": _days_between(now, r.last_version_change_at or r.first_seen) if c["behind"] else 0,
            "storage_free": r.storage_free, "blocked_count": r.blocked_count or 0,
            "reason": c["reason"], "blocked_recent": c["blocked_recent"],
        }
        if c["behind"]:
            behind.append(card)
        if c["blocked_recent"]:
            blocked.append(card)

    total = len(rows)
    on_latest = total - len(behind)
    reported_users = {r.user for r in rows if r.user}
    mobile_users = frappe.get_all("Employee", filters={"user_id": ["is", "set"], "status": "Active"},
                                  fields=["name", "employee_name", "user_id", "custom_farm", "cell_number",
                                          "designation"], limit_page_length=0)
    never = [
        {"employee": e.name, "name": e.employee_name, "user": e.user_id,
         "farm": e.custom_farm or "Unknown farm", "phone": e.cell_number, "designation": e.designation}
        for e in mobile_users if e.user_id not in reported_users
    ]
    return {
        "status": "success",
        "summary": {
            "latest": latest.get("latest"), "published_at": latest.get("publishedAt"),
            "min_supported": policy.get("min_supported_version") or None,
            "enforced": bool(int(policy.get("enforce_gate") or 0)),
            "total_devices": total, "on_latest": on_latest, "behind": len(behind),
            "pct_on_latest": round(100 * on_latest / total) if total else 0,
            "blocked_24h": len(blocked), "never_reported": len(never),
        },
        "distribution": [{"version": k, "count": v} for k, v in sorted(
            distribution.items(), key=lambda kv: parse_version(kv[0]) or (-1, 0, 0), reverse=True)],
        "behind": behind, "blocked": blocked, "never_reported": never,
    }


@frappe.whitelist()
def setMinVersion(version=None, dry_run=0):
    _require_role()
    if parse_version(version) is None:
        return {"status": "error", "message": "Version must look like 1.2.3"}
    rows = _devices()
    lock = [r for r in rows if compare(r.app_version, version) == -1]
    if int(dry_run or 0):
        return {"status": "success", "dry_run": True, "would_lock_devices": len(lock),
                "would_lock_users": len({r.user for r in lock if r.user})}
    policy = frappe.get_single("Mobile Release Policy")
    policy.min_supported_version = version.strip().lstrip("vV")
    policy.flags.ignore_permissions = True
    policy.save()
    frappe.db.commit()
    return {"status": "success", "dry_run": False, "min_supported_version": policy.min_supported_version,
            "locked_devices": len(lock)}
```
- [ ] **Step 4:** Run the classify tests → PASS.
- [ ] **Step 5: Bench integration test** `tests/test_support_api_bench.py` (FrappeTestCase): with `Administrator`, insert two `Mobile Device` rows (one current, one behind), monkeypatch `latest_release` via `unittest.mock.patch("upande_agriculture.mobile.support_api.latest_release", return_value={"latest":"1.2.0","runtime":"101.2"})`, call `getSupportDashboard()` and assert `summary.total_devices == 2`, `summary.behind == 1`; call as a user with no Support/System role (`frappe.set_user("Guest")`) and assert it raises `frappe.PermissionError`; `setMinVersion("bad")` returns status `error`; `setMinVersion("9.9.9", 1)` returns `would_lock_devices == 2`. Empty fleet (delete test rows first, patch to no devices) → `total_devices == 0`, `pct_on_latest == 0`.
- [ ] **Step 6:** `bench --site kaitet.local run-tests --app upande_agriculture --module upande_agriculture.tests.test_support_api_bench` → PASS.
- [ ] **Step 7: Commit** `feat(mobile): Support dashboard endpoint and setMinVersion`.

---

### Task 12: Support page in the app

**Files:** Create `src/services/support-installs.ts`, `src/stores/supportInstallsStore.ts`, `app/support-installs.tsx`, `__tests__/support-filters-test.ts`; modify `src/components/DrawerMenu.tsx`, `app/_layout.tsx` (register screen).

**Interfaces:**
- Consumes endpoints from Task 11.
- Produces `fetchSupportDashboard(): Promise<SupportDashboard>`, `previewMinVersion(v)`, `applyMinVersion(v)`, pure `filterByVersion(cards, version|null)`, `groupByFarm(cards) -> {farm, cards}[]`, `reasonLabel(reason)`.

- [ ] **Step 1: Failing test `__tests__/support-filters-test.ts`**

```ts
import { filterByVersion, groupByFarm, reasonLabel, type BehindCard } from '@/src/stores/supportInstallsStore';

const c = (o: Partial<BehindCard>): BehindCard => ({
  device_id: 'd', device: 'Pixel', model: null, user: 'u', user_full_name: 'U', employee: null,
  farm: 'A', phone: null, designation: null, app_version: '1.0.0', runtime: '101.0', native_version: null,
  last_seen: null, days_since_seen: 0, days_behind: 1, storage_free: null, blocked_count: 0,
  reason: 'missed_ota', blocked_recent: false, ...o,
});

describe('support filters', () => {
  it('filters by version, null keeps all', () => {
    const cards = [c({ app_version: '1.0.0' }), c({ app_version: '1.1.0' })];
    expect(filterByVersion(cards, '1.1.0')).toHaveLength(1);
    expect(filterByVersion(cards, null)).toHaveLength(2);
  });
  it('groups by farm, biggest group first, Unknown farm last', () => {
    const cards = [c({ farm: 'Unknown farm' }), c({ farm: 'B' }), c({ farm: 'B' }), c({ farm: 'A' })];
    expect(groupByFarm(cards).map((g) => [g.farm, g.cards.length])).toEqual([['B', 2], ['A', 1], ['Unknown farm', 1]]);
  });
  it('labels every reason and tolerates unknown', () => {
    expect(reasonLabel('needs_apk')).toBe('Needs new APK');
    expect(reasonLabel('missed_ota')).toBe('Missed update');
    expect(reasonLabel('offline', 4)).toBe('Offline 4d');
    expect(reasonLabel('low_storage')).toBe('Low storage');
    expect(reasonLabel(null)).toBe('');
    expect(reasonLabel('weird')).toBe('');
  });
});
```
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Create `src/services/support-installs.ts`**

```ts
import { api } from './api';

const BASE = '/api/method/upande_agriculture.mobile.support_api.';

export type BehindCardWire = {
  device_id: string; device: string; model: string | null; user: string | null; user_full_name: string | null;
  employee: string | null; farm: string; phone: string | null; designation: string | null;
  app_version: string | null; runtime: string | null; native_version: string | null;
  last_seen: string | null; days_since_seen: number | null; days_behind: number | null;
  storage_free: number | null; blocked_count: number; reason: string | null; blocked_recent: boolean;
};

export type SupportDashboard = {
  summary: {
    latest: string | null; published_at: string | null; min_supported: string | null; enforced: boolean;
    total_devices: number; on_latest: number; behind: number; pct_on_latest: number;
    blocked_24h: number; never_reported: number;
  };
  distribution: { version: string; count: number }[];
  behind: BehindCardWire[];
  blocked: BehindCardWire[];
  never_reported: { employee: string; name: string; user: string; farm: string; phone: string | null; designation: string | null }[];
};

export async function fetchSupportDashboard(): Promise<SupportDashboard> {
  const res = await api<{ message?: SupportDashboard & { status?: string } }>({
    method: 'POST', url: `${BASE}getSupportDashboard`, data: {},
  });
  if (!res?.message || res.message.status !== 'success') throw new Error('Could not load install stats.');
  return res.message;
}

export async function previewMinVersion(version: string): Promise<{ devices: number; users: number }> {
  const res = await api<{ message?: { status: string; would_lock_devices?: number; would_lock_users?: number; message?: string } }>({
    method: 'POST', url: `${BASE}setMinVersion`, data: { version, dry_run: 1 },
  });
  const m = res?.message;
  if (!m || m.status !== 'success') throw new Error(m?.message || 'Could not preview.');
  return { devices: m.would_lock_devices ?? 0, users: m.would_lock_users ?? 0 };
}

export async function applyMinVersion(version: string): Promise<void> {
  const res = await api<{ message?: { status: string; message?: string } }>({
    method: 'POST', url: `${BASE}setMinVersion`, data: { version, dry_run: 0 },
  });
  if (res?.message?.status !== 'success') throw new Error(res?.message?.message || 'Could not save.');
}
```
- [ ] **Step 4: Create `src/stores/supportInstallsStore.ts`**

```ts
import { create } from 'zustand';
import { fetchSupportDashboard, type BehindCardWire, type SupportDashboard } from '@/src/services/support-installs';

export type BehindCard = BehindCardWire;

export function filterByVersion(cards: BehindCard[], version: string | null): BehindCard[] {
  return version ? cards.filter((c) => c.app_version === version) : cards;
}

export function groupByFarm(cards: BehindCard[]): { farm: string; cards: BehindCard[] }[] {
  const map = new Map<string, BehindCard[]>();
  for (const c of cards) map.set(c.farm, [...(map.get(c.farm) ?? []), c]);
  return [...map.entries()]
    .map(([farm, list]) => ({ farm, cards: list }))
    .sort((a, b) => {
      if (a.farm === 'Unknown farm') return 1;
      if (b.farm === 'Unknown farm') return -1;
      return b.cards.length - a.cards.length || a.farm.localeCompare(b.farm);
    });
}

export function reasonLabel(reason: string | null, days?: number | null): string {
  switch (reason) {
    case 'needs_apk': return 'Needs new APK';
    case 'missed_ota': return 'Missed update';
    case 'low_storage': return 'Low storage';
    case 'offline': return `Offline ${days ?? '?'}d`;
    default: return '';
  }
}

interface State {
  data: SupportDashboard | null;
  loading: boolean;
  error: string | null;
  versionFilter: string | null;
  load: () => Promise<void>;
  setVersionFilter: (v: string | null) => void;
}

export const useSupportInstallsStore = create<State>((set) => ({
  data: null, loading: false, error: null, versionFilter: null,
  load: async () => {
    set({ loading: true, error: null });
    try { set({ data: await fetchSupportDashboard(), loading: false }); }
    catch (e) { set({ loading: false, error: e instanceof Error ? e.message : 'Could not load install stats.' }); }
  },
  setVersionFilter: (v) => set((s) => ({ versionFilter: s.versionFilter === v ? null : v })),
}));
```
- [ ] **Step 5:** Run the filter tests → PASS.
- [ ] **Step 6: Create `app/support-installs.tsx`.** `Screen` with pull-to-refresh via `useRefreshOnFocus`/`load()`; sections in this order, styled with `Card`, `Pill`, `colors`, `spacing` from the design system and Ionicons only:
  1. Header tiles (2×2 grid): Latest (`v{latest}` + date), Minimum (`v{min}` or "Not set", with "gate off" suffix when `!enforced`), On latest (`{pct}%`, `{on_latest}/{total}`), Behind (`{behind}`), plus a full-width Blocked 24h tile when `blocked_24h > 0`.
  2. Distribution bar: one row per `distribution` entry (version, count, proportional bar); tapping calls `setVersionFilter(version)`; the selected row is highlighted.
  3. "Behind" section: `groupByFarm(filterByVersion(data.behind, versionFilter))`; per card: name + designation, device, `v{app_version} → v{latest}`, `{days_behind}d behind`, last seen (`days_since_seen`), a `Pill` with `reasonLabel`, an extra red `Blocked {n}×` pill when `blocked_recent`, and buttons Call (`Linking.openURL('tel:' + phone)`) and WhatsApp (`https://wa.me/<digits>`), hidden when `phone` is empty. Tapping the card opens a `Sheet` with all fields incl. `runtime`, `native_version`, free storage in MB.
  4. "Never reported": list of `never_reported` with the same Call/WhatsApp buttons.
  5. Actions row: **Copy list** (builds text lines `Farm — Name — phone — vX → vY — reason` for the filtered behind list, `Clipboard.setStringAsync` from `expo-clipboard`, installed via `npx expo install expo-clipboard`) and **Set minimum version** (prompt for a version with `Alert.prompt` on iOS / a `LabeledInput` inside a `Sheet` on Android; validate `^\d+\.\d+\.\d+$`; call `previewMinVersion`, then `Alert.alert('Lock out N devices (M users)?', ..., [Cancel, Confirm])`; on confirm `applyMinVersion` then `load()`).
  6. Forbidden/error state: if `load` fails show the message and a Retry button; empty states ("Everyone is up to date" / "No devices have reported yet").
- [ ] **Step 7: Drawer entry.** In `DrawerMenu.tsx` add `const hasRole = useAuthStore((s) => s.hasRole);` and, where `NAV_ITEMS.map` renders, use `[...NAV_ITEMS, ...(hasRole('Support Team') ? [{ label: 'Install Stats', icon: 'phone-portrait-outline' as const, route: '/support-installs' }] : [])].map(...)`. (`hasRole` also returns true for `Administrator`; the server re-checks.)
- [ ] **Step 8: Register the route** in `app/_layout.tsx`: `<Stack.Screen name="support-installs" />` (inside the existing Stack).
- [ ] **Step 9: Verify** — `npx tsc --noEmit`, `npm run lint`, `npx jest --ci`; then run `npx expo start` against `kaitet.local:8001` (LAN IP of this machine as the instance URL), sign in as a user with `Support Team`, and confirm the page renders with at least one `Mobile Device` row (insert via `bench --site kaitet.local execute` or by letting the app report telemetry).
- [ ] **Step 10: Commit** — stage only this task's files.

---

### Task 13: Docs, rollout checklist, end-to-end verification

**Files:** Create `docs/RELEASING.md`; modify `README.md` (link to it).

- [ ] **Step 1: Write `docs/RELEASING.md`** adapted from Packhouse's, with these corrections: self-hosted OTA on Pages (no EAS/`EXPO_TOKEN`); version/runtime formulas from Global Constraints; first release is an APK via `workflow_dispatch` with `set_version 1.0.0`; the **signing-key warning** (existing EAS-signed installs must be uninstalled before the first CI-signed APK installs; decide upload keystore vs debug key before the first release); the rollout order: (1) release the APK containing the gate client, (2) wait until the Support page shows most devices on it, (3) set `min_supported_version`, (4) preview the lock-out count, (5) switch `enforce_gate` on; and how to switch the gate off in an emergency (`Mobile Release Policy.enforce_gate` = 0, takes effect on the next request).
- [ ] **Step 2: End-to-end checks on the local bench** (record results in the PR description):
  1. Gate off: request with an old `X-App-Version` passes.
  2. Gate on, floor `9.9.9`: request returns 426; exempt methods (`getReleaseInfo`, `reportDeviceTelemetry`) still pass; `Mobile Device.blocked_count` increments.
  3. App (dev build) receives 426 → lands on the lock screen; lowering the floor and foregrounding the app clears it.
  4. Telemetry from the app creates/updates its `Mobile Device` row with farm/phone resolved from an Employee linked to the test user.
  5. A non-Support user calling `getSupportDashboard` is refused; a `Support Team` user sees the page.
  6. `npm run ota:build` output matches Task 2 Step 7.
- [ ] **Step 3: Final checks** — `node --test scripts/`, `npx jest --ci`, `npx tsc --noEmit`, `npm run lint`, backend `bench --site kaitet.local run-tests --app upande_agriculture --module upande_agriculture.tests.test_versioning` (and `test_gate`, `test_devices`, `test_release_api`, `test_support_api`, `test_support_api_bench`, `test_mobile_doctypes`).
- [ ] **Step 4: Commit** `docs: release process, rollout checklist`.
