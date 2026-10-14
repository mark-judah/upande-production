# Build, Release & Update Gate

Upande Production ships like Upande Packhouse and Upande Quality: every merge to
`master` advances the version one step and either publishes a **JS update (OTA)** or
builds a **signed APK**. A server-side **minimum-version gate** stops out-of-date
builds from sending data, and the **Devices** screen (Support Team) shows who is
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
* **New minor/major** (or any Expo SDK change): new runtime → a new APK.

**The workflow chooses between the two for you.** Before planning the version it
compares the code with the last released tag (`scripts/detect-native.mjs`). It promotes
the release from a patch to a **minor (new APK)** when the changes since then include:

| Change | Why it needs an APK |
| --- | --- |
| `dependencies` in `package.json` added, removed or upgraded | a package may carry native code (devDependencies and scripts are ignored) |
| `app.json` edited (permissions, plugins, package name, ...) | baked into the Android manifest by prebuild; the version fields the bot writes are ignored |
| anything in `plugins/` or `patches/`, or `eas.json` | changes the native build |
| `[apk]` anywhere in a commit message | explicit override for anything the rules cannot see |

Everything else stays a patch OTA. The check is deliberately conservative: a JS-only
dependency bump also builds an APK (15 minutes) rather than risk shipping a JS bundle to
phones whose native side does not match. The reason is printed in the run summary
(*Why this release type*) and in the PR's *Version impact* table, so you see it before
merging. A manual **Run workflow** choice (`patch`/`minor`/`major`/`set_version`) always
overrides the automatic one.

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
| `block_unidentified` | **caution:** also blocks every caller that sends no `X-App-Name` on `upande_agriculture.mobile.*` — that includes the Quality and Packhouse apps, which share those methods and send no header. Leave off unless they send their own. |
| `latest_json_url` | where the newest-release file is read from |

Exempt from the gate (a blocked phone must still be able to sign in, report itself and
update): `login`, `mobileLogin`, `getCurrentUserRoles`, `reportDeviceTelemetry`,
`getReleaseInfo`, `getDeviceOverview`, `getSupportDashboard`, `setMinVersion`. The hook **fails open**: if the
check itself errors, the request goes through.

### Rollout order

1. Release the APK that contains the gate-aware app (this is `1.0.0`).
2. Watch **Devices running the app** until most devices are on it. Builds from before the gate do
   not send the headers, so they are never blocked — they show up with an amber version
   pill (or are missing from the list entirely) so Support can chase them.
3. Set the minimum version in *Mobile Release Policy* (desk). Check *Versions in use* first:
   everyone below the floor gets locked out.
4. Switch `enforce_gate` on.

**Emergency off:** set `enforce_gate` to 0 in *Mobile Release Policy*; it applies to the
very next request, and phones already showing the lock screen release themselves the
next time the app is brought to the foreground (no force-kill needed).

**Guard rail:** *Set minimum* refuses a version newer than the latest published release
(read from `latest.json`) — nothing could ever satisfy it and the whole fleet, Support
included, would be locked out. If the latest release is unknown the check is skipped.

**What the gate protects against, and what it does not:** the `X-App-*` headers are
supplied by the client, which is fine for stale builds but not a defence against a
malicious one. The telemetry endpoint is shared with other fleet apps; only reports
identifying as Upande Production (`app: "production"` or `app_name: "Upande Production"`)
create or update *Mobile Device* rows.

## Settings → App updates, This device, Devices running the app

**Settings** shows an *App updates* card (installed vs latest version, and *Check for
updates*) and a collapsible *This device* card (model, name, OS, install ID). Users with
the **Support Team** role (or System Manager) also get a *Devices running the app* row
there, which opens the **Devices** screen:

* tiles: devices, users, active in the last 7 / 30 days;
* *Versions in use*: how many devices are on each version, the latest flagged;
* *People*: one row per user with their device count, sign-ins (successful logins from
  Frappe's Activity Log), the version of their oldest device (green = latest, amber =
  behind) and when they were last seen;
* *All devices*: searchable by model, user, farm or IP, filterable to the last 7 / 30
  days, each with its version pill. Farm and phone come from the user's **Employee**
  record (`custom_farm`, `cell_number`).

The data comes from `upande_agriculture.mobile.support_api.getDeviceOverview`, which
re-checks the Support Team role on every call. The minimum version is set on *Mobile
Release Policy* in the desk (the `setMinVersion` API also remains, with its dry-run
count and the refusal of a floor above the latest release).

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
