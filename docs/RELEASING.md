# Build, Release & Update Gate

Upande Production ships like Upande Packhouse and Upande Quality: every merge to
`master` advances the version one step and either publishes a **JS update (OTA)** or
builds a **signed APK**. A server-side **minimum-version gate** stops out-of-date
builds from sending data, and the **Install Stats** page (Support Team) shows who is
behind. Expo SDK 54.

```
branch ──▶ PR to master ──▶ PR Checks ──▶ merge ──▶ Release ─┬─▶ 1.0.x : OTA on GitHub Pages
                                                              └─▶ 1.x.0 : signed APK on GitHub Releases
```

## Versioning

`app.json` → `expo.version` is the source of truth; `package.json` follows. Each merge
adds **one** odometer step: patch counts 0–99 then rolls into minor, minor counts 0–49
then rolls into major.

```
versionCode    = 100000 + (major*50 + minor)*100 + patch      1.0.0 → 105000, 1.1.0 → 105100
runtimeVersion = (100 + major).minor                          1.0.x → "101.0",  1.3.x → "101.3"
```

* **Patch release** (`1.0.5 → 1.0.6`): same runtime → JS-only update, installed `101.0`
  APKs pick it up.
* **New minor/major** (or any Expo SDK change): new runtime → a new APK. Run the
  **Release** workflow manually with `minor`/`major` whenever a change touches native
  code (new native package, config plugin, permissions, anything `app.json` bakes in).

Commit style does not affect the version. A `feat:`/`fix:` prefix only groups the
release notes. Preview locally: `npm run version:next`, `npm run version:notes`.

## First release (read this before merging to master)

1. The first release **must** be an APK: current builds use
   `runtimeVersion: {policy: "appVersion"}`, so none can accept a `major.minor` update.
   Run the **Release** workflow from the Actions tab with `set_version` = `1.0.0`.
2. **Signing key.** Android refuses to install an APK over one signed with a different
   key. Phones with an APK built through EAS must **uninstall** before the first
   GitHub-built APK installs. Decide the signing key *before* this release and keep it
   forever (see below), otherwise every later key change costs everyone a reinstall.
3. In the repo settings enable **GitHub Pages** from the `gh-pages` branch (the first
   release creates it).

## Signing

Without secrets the pipeline still builds and publishes a **debug-signed** APK
(sideloadable, not publishable to Play, and the debug key is public). To sign properly:

```bash
./scripts/setup-signing.sh      # makes upande-production-upload.keystore, uploads the secrets
```

Secrets (repository secrets, not environment secrets): `ANDROID_KEYSTORE_BASE64`,
`ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`, and optionally
`ANDROID_KEY_SHA256` so the build verifies it signed with *your* key. Signing switches
on only when all four of the first secrets exist. **Back up the keystore and password.**

## How OTA works here (no Expo account)

* `npm run ota:build` runs `expo export` and writes `ota/android/<runtime>/manifest.json`
  plus the bundle and assets; CI pushes `ota/` to the `gh-pages` branch.
* `app.json` → `updates.url` points at that runtime's manifest on Pages. Pages cannot
  send the `expo-protocol-version` header, so `patches/expo-updates+29.0.17.patch`
  (applied by `patch-package` on `npm install`) lets the client accept a manifest that
  has a `launchAsset`. **When Expo SDK or `expo-updates` is upgraded the patch must be
  regenerated** (`npx patch-package expo-updates` after re-applying the edit in
  `UpdateFactory.kt`) — the version is in the patch filename.
* The app checks on launch and restarts into a downloaded bundle only within the first
  20 s after opening, so nobody is restarted mid-task.
* CI also writes `ota/latest.json` (`version, runtime, release, apkUrl, publishedAt,
  notes`). The server reads it to know the newest release.

## The update gate

The app sends `X-App-Name`, `X-App-Version`, `X-App-Runtime`, `X-Device-Id` on every
request. In the `upande_agriculture` app, a `before_request` hook
(`upande_agriculture/mobile/gate.py`) rejects requests from builds below the floor with
**HTTP 426** (`error_code: APP_UPDATE_REQUIRED`); the app then locks to an
**Update required** screen that applies a JS update or downloads the APK.

Settings live in the single doctype **Mobile Release Policy**:

| Field | Meaning |
| --- | --- |
| `enforce_gate` | master switch — **off by default** |
| `min_supported_version` | x.y.z; builds below it are blocked |
| `block_unidentified` | also block clients that send no app/version header |
| `latest_json_url` | where the newest-release file is read from |

Exempt from the gate (a blocked phone must still be able to sign in, report itself and
update): `login`, `mobileLogin`, `getCurrentUserRoles`, `reportDeviceTelemetry`,
`getReleaseInfo`, `getSupportDashboard`, `setMinVersion`. The hook **fails open**: if the
check itself errors, the request goes through.

### Rollout order

1. Release the APK that contains the gate-aware app (this is `1.0.0`).
2. Watch **Install Stats** until most devices are on it. Builds from before the gate do
   not send the headers, so they are never blocked — they show up as *behind* or
   *never reported* so Support can chase them.
3. Set the minimum version (Install Stats → **Set minimum**). The dialog previews how
   many devices and users it would lock out.
4. Switch `enforce_gate` on.

**Emergency off:** set `enforce_gate` to 0 in *Mobile Release Policy*; it applies to the
very next request.

## Install Stats (Support Team)

Users with the **Support Team** role (or System Manager) get an *Install Stats* entry in
the drawer: latest vs. minimum version, % of devices on the latest, a version
distribution (tap to filter), and the devices that are behind grouped by farm, each
with a reason (*Missed update*, *Needs new APK*, *Offline Nd*, *Low storage*,
*Blocked N×*), the user's phone (call / WhatsApp) and a share-list button. Farm and
phone come from the user's **Employee** record (`custom_farm`, `cell_number`).
The role is created by patch `create_support_team_role`; the server re-checks it on
every call.

## Local builds

```bash
npm ci
npm run build:apk     # prebuild + gradlew assembleRelease (debug-signed unless signing props are given)
```

JDK 17 and the Android SDK are required. `expo prebuild` rewrites some `package.json`
scripts; discard that (`git checkout -- package.json`) and delete `android/` afterwards.

## Tests

```bash
npm run test:scripts     # version math (node:test)
npm run test:ci          # app (jest-expo)
```

Backend (`upande_agriculture`): `test_versioning`, `test_gate`, `test_devices`,
`test_release_api`, `test_support_api`, `test_support_api_bench`, `test_mobile_doctypes`.
If `bench run-tests` cannot bootstrap the site, run a module in-site with
`bench --site <site> execute upande_agriculture.tests.runner.run --args '["upande_agriculture.tests.test_devices"]'`.
