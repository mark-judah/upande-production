# Release Pipeline, Update Gate & Support Install Dashboard

**Date:** 2026-10-14
**Status:** Design, approved in conversation; pending written-spec review
**Area:** Expo app (SDK 54), GitHub Actions, Frappe `upande_agriculture` app

## 1. Problem and goal

Changes are deployed but some users never receive them, and those stale clients
submit broken data. Goals:

1. **Release pipeline.** Give Upande Production the same OTA + APK pipeline that
   Upande Packhouse and Upande Quality already use: version bumps on merge, JS-only
   OTA for patch releases, a signed APK on a GitHub Release for native changes,
   auto-applied OTA on launch, and an in-app APK downloader.
2. **Hard update gate.** Devices below a server-held minimum version are rejected
   on every data endpoint and locked to an "Update required" screen.
3. **Support dashboard.** Users with the `Support Team` role see which devices and
   users are behind, on which farm, why, and how to reach them.

Success: after a deploy, Support can see within seconds exactly who is still behind
and why, and a stale client cannot write data once the floor is raised.

## 2. Constraints and decisions

- **Expo SDK 54** (`expo-updates` ~29.0.x). The reference apps are on SDK 57; nothing
  SDK-specific is copied blindly (see 3.5).
- Production Frappe (`upande-kaitet2.c.frappe.cloud`) is read-only for development.
  Backend work is built and tested on `kaitet.local:8001` / the v16 bench only.
- **Enforcement:** hard gate (decided). Server-side `before_request` hook, not per
  endpoint, not client-only.
- **Latest version source:** `latest.json` published to `gh-pages` by CI, fetched and
  cached by the server. CI never writes to Frappe.
- **Farm source:** `Employee.custom_farm`, joined through `Employee.user_id`
  (decided). Phone: `Employee.cell_number`.
- Existing telemetry client (`src/services/telemetry/`) and endpoint
  `upande_agriculture.mobile.api.reportDeviceTelemetry` are reused and extended.

## 3. Part A: Release pipeline

### 3.1 Versioning
Port `scripts/version.mjs` from Packhouse unchanged in behaviour:
`app.json` `expo.version` is the source of truth; patch 0-99, minor 0-49 roll over;
`versionCode = 100000 + (major*50 + minor)*100 + patch`;
`runtimeVersion = "(100+major).minor"`. A change of `expo` SDK major forces a minor
bump (`extra.runtimeSdk`). The first release is run with `set_version 1.0.0` and is
an APK, because current builds use `runtimeVersion: {policy: "appVersion"}`.

### 3.2 Workflows
- `.github/workflows/pr.yml`: lint, `tsc --noEmit`, tests (if a test script exists),
  version preview, debug APK artifact. Targets `master`.
- `.github/workflows/release.yml`: on push to `master` (paths-ignore md/docs) and
  manual dispatch (`bump`, `set_version`). Plans the bump, builds the OTA bundle,
  publishes to `gh-pages` (`keep_files: true`), builds and verifies a signed APK when
  the runtime changes, commits `chore(release): x.y.z [skip ci]`, tags `vx.y.z`,
  creates a GitHub Release. 45-minute timeout; skip when head commit starts with
  `chore(release):`.
- APK asset `upande_production_vX.Y.Z.apk`, plus a fixed-name copy
  `upande_production.apk` so `releases/latest/download/upande_production.apk`
  works. OTA-only releases use `make_latest: false`.
- **New vs Packhouse:** the release job also writes `latest.json` to `gh-pages`:
  `{version, runtime, apkUrl, apkSize, publishedAt, notes}`. `apkUrl`/`apkSize`
  always describe the newest APK release; `version`/`publishedAt` describe the
  newest release of any kind.

### 3.3 Config and plugins
- `app.json`: `runtimeVersion` string, `updates.url` = Pages manifest for the
  runtime, `checkAutomatically: ON_LOAD`, `fallbackToCacheTimeout: 0`,
  `extra.otaBaseUrl`, `extra.runtimeSdk: 54`, android `versionCode`.
- Copy `plugins/withReleaseSigning.js` and `plugins/withBuildTuning.js`; copy
  `scripts/setup-signing.sh` and `upload-secrets.sh` (renamed for this app).
- `scripts/publish-ota.mjs` ported with the same manifest rules: fresh UUID per
  publish, launch-asset key = bundle file name, asset keys = bare hashes, refuse to
  publish a key containing a path separator, include `extra.expoClient` and
  `extra.appVersion`.

### 3.4 App code (`src/services/updates/`)
- `releases.ts`: GitHub Releases check, once a day, newest release with an `.apk`.
- `install-apk.ts`: resumable download via `expo-file-system/legacy`, content-URI
  hand-off, `expo-intent-launcher` loaded only if the native module exists.
- `UpdateProvider.tsx`: check + fetch OTA on launch, `reloadAsync()` only within 20 s
  of opening; exposes APK check/download/install state.
- `ApkUpdateSection` in `app/settings.tsx`, next to the existing "Check for updates".
- `src/services/version.ts`: `APP_VERSION` read from the OTA manifest
  (`extra.expoClient.version` / `extra.appVersion`), falling back to
  `Constants.expoConfig.version`; `INSTALLED_APK_VERSION` from
  `Constants.nativeAppVersion`.
- `UpdateProvider` mounted in `app/_layout.tsx`.

### 3.5 SDK 54 specifics
- Add `expo-intent-launcher` and `patch-package` via `npx expo install`.
- Pages cannot send the `expo-protocol-version` header. Regenerate the
  `expo-updates` patch against **29.0.17** (do not reuse the 57.0.24 patch); apply
  with `postinstall: patch-package`. Verify the patch on a real build before the
  first release.
- `expo-file-system/legacy` is the SDK 54 import path for resumable downloads.
- The existing `expo-file-system` `Paths.*` telemetry code is unaffected.

## 4. Part B: Update gate

### 4.1 Client
- `src/services/api.ts` request interceptor adds headers on every request:
  `X-App-Name: production`, `X-App-Version`, `X-App-Runtime`, `X-Device-Id`.
- Response interceptor: HTTP 426 with `error_code: "APP_UPDATE_REQUIRED"` sets
  `updateRequiredStore` `{minVersion, latestVersion}` and rejects the call.
- `app/_layout.tsx` redirects to `app/update-required.tsx` while the store is set,
  after the auth gate. The screen is outside the tabs and drawer, with the back
  gesture disabled.
- The screen shows why, then either **Apply update** (OTA fetched, `reloadAsync`)
  or **Download APK** (runtime too old: existing download/installer flow). It
  re-checks when the app returns to the foreground and clears itself once the
  running version is at or above the floor.

### 4.2 Server
- `before_request` hook registered in `upande_agriculture/hooks.py`. It acts only
  when header `X-App-Name == production` and the request path is a method in
  `upande_agriculture.mobile.api.*` or the Packhouse methods the app calls
  (`mobileLogin`, `getCurrentUserRoles`, `fetchStockEntryByBunch`).
- If `Mobile Release Policy.enforce_gate` and the version is below
  `min_supported_version` (compared as x.y.z integers), it raises an exception with
  `http_status_code = 426` and body `{error_code, min_version, latest_version}`,
  and increments that device's `blocked_count`, sets `last_blocked_at`.
- **Exempt** (must always work): `mobileLogin`, `login`, `getCurrentUserRoles`,
  `reportDeviceTelemetry`, `getReleaseInfo`, `getSupportDashboard`, `setMinVersion`.
- No `X-App-Name` header: not gated, unless `block_unidentified` is set.
- Known limit: builds that predate this feature do not send the header. They are
  not blocked, but appear as "behind" or "never reported" on the Support page, so
  Support can chase them manually. The first release containing the gate must reach
  everyone by APK.
- Rollout safety: `enforce_gate` defaults off.

## 5. Part C: Backend data

All in the `upande_agriculture` app (fixtures shipped with the app).

- **`Mobile Release Policy`** (Single): `enforce_gate` (check),
  `min_supported_version` (data, x.y.z), `block_unidentified` (check),
  `latest_json_url` (data), `notes_for_users` (small text).
- **`Mobile Device`** (autoname = `device_id`): `device_id`, `device_name`, `model`,
  `brand`, `os`, `os_version`, `user`, `user_full_name`, `employee`, `farm`,
  `phone`, `designation`, `app_version`, `native_version`, `runtime`,
  `ota_update_id`, `first_seen`, `last_seen`, `last_version_change_at`,
  `storage_free`, `blocked_count`, `last_blocked_at`; child table
  **`Mobile Device User`** (`user`, `full_name`, `first_login`, `last_login`).
- `reportDeviceTelemetry` additionally upserts `Mobile Device` (resolve Employee via
  `user_id`; copy `custom_farm`, `cell_number`, `designation`; append to the user
  table when a new user appears; set `last_version_change_at` when `app_version`
  changes) and still inserts the `Device Telemetry` history row. Telemetry payload
  gains `native_version` and `runtime`.
- A scheduled job deletes `Device Telemetry` rows older than 30 days.
- `getReleaseInfo` (whitelisted, any logged-in user): fetch `latest_json_url`,
  cache 5 minutes, return `{latest, runtime, apkUrl, apkSize, publishedAt, minSupported}`;
  on failure return the last cached value or `{latest: null}`.
- `getSupportDashboard` (whitelisted): requires `Support Team` or `System Manager`
  (checked via `Has Role` on the session user); otherwise a forbidden response.
  Returns `summary`, `distribution`, `behind[]`, `never_reported[]`, `blocked[]`.
- `setMinVersion(version)`: same role check; validates x.y.z; returns the
  would-be-locked counts when called with `dry_run=1`, otherwise saves the policy.
- The `Support Team` role is created via fixture. Nothing is deployed to production
  as part of this work.

## 6. Part D: Support Team page

- Drawer entry shown only when `hasRole('Support Team')` (cosmetic; the server
  re-checks every call). Route `app/support-installs.tsx`, state in
  `src/stores/supportInstallsStore.ts`, API in `src/services/support-installs.ts`.
- **Header tiles:** latest version + date, current floor, % of devices on latest,
  devices behind, blocked in the last 24 h.
- **Distribution bar:** one segment per version; tapping filters the list.
- **Behind list, grouped by farm.** Card: employee/user name, designation, call
  button; device model; version vs latest; days behind; last seen; one reason badge:
  - *Missed OTA, online*: same runtime as latest, seen in the last 24 h.
  - *Needs new APK*: runtime differs from latest.
  - *Offline Nd*: not seen for 2 or more days.
  - *Low storage*: `storage_free` below APK size plus margin.
  - *Blocked N×*: `blocked_count` in the last 24 h.
  Precedence when several apply: Needs new APK, Low storage, Offline, Missed OTA;
  *Blocked* is shown in addition.
- **Never reported:** Employees with a mobile-role user and no `Mobile Device`.
- **Device detail sheet:** all users who have logged in on the device, version
  history (from telemetry), first/last seen.
- **Actions:** call, WhatsApp (`wa.me`), copy list as text, **Set minimum version**
  with a confirm dialog showing the dry-run count of devices and users it would
  lock out now.
- **Out of scope (v1):** push notifications, historical charts, iOS, background
  reporting.

## 7. Error handling

- `getReleaseInfo` failure: lock screen and dashboard fall back to the last cached
  latest; the gate never depends on it (the floor is in the policy doc).
- Gate hook errors fail **open** (log, allow the request): a bug in the check must
  never take the whole farm offline.
- Lock screen with no connectivity: shows the offline banner; retry on reconnect.
- Telemetry upsert failure does not fail the report; history row insert is still
  attempted.
- CI: an OTA publish failure leaves no tag, so the next run retries (as in
  Packhouse).

## 8. Testing

- `version.mjs`: unit tests for odometer rollover, `versionCode`, runtime mapping,
  SDK-change promotion.
- Gate hook: tests for below/at/above floor, exempt methods, missing header with
  and without `block_unidentified`, `enforce_gate` off, hook exception fails open.
- Version comparison helper shared by hook and `getSupportDashboard` (single
  implementation, tested).
- `getSupportDashboard`: role check, reason-badge precedence, farm grouping,
  never-reported list.
- Client: 426 interceptor sets the store; lock screen clears when version catches up.
- End to end on the local bench: publish OTA to a scratch Pages branch, confirm a
  device applies it on launch; raise the floor, confirm lock and unlock.

## 9. Open items to confirm before the plan

1. Which Frappe instance(s) receive the backend app changes first (local bench v16
   assumed), and who deploys to production.
2. The GitHub secrets for signing (`ANDROID_KEYSTORE_*`) and Pages enabled on
   `mark-judah/upande-production`.
3. Whether `Support Team` should be allowed to change the floor, or only view
   (spec assumes it can).
