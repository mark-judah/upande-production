# Upande Mobile Kit — design

Status: build started on the user's go-ahead ("yes" to skipping questions). Decisions below are the builder's calls, not agreed items; review them.

## Why
upande-packhouse and upande-quality each carry their own copy of: OTA apply-on-open, APK check/download/install, biometric unlock, Settings screen, device register + Devices screen, version scripts and the release workflow. Copies have already drifted. The server half (Mobile App / Mobile App Install doctypes, register_install, installs, OTA manifest proxy) lives inside upande_quality although it already serves "every Upande mobile app".

Goal: installing one npm package in a new Expo app and one Frappe app on the site gives the app its Settings page (versions, OTA, APK, biometric, devices) with no per-app copies.

Non-goals: replacing each app's own login/auth store, theme or API client; moving existing apps over in this pass; Play Store / EAS flows.
Anti-goal: breaking installed APKs — they call `upande_quality.mobile.mobile_app.*` and `upande_packhouse.api.ota.manifest`; those paths must keep working.

## Pieces
### 1. npm package `@upande/mobile-kit` (repo /home/jk/Projects/upande-mobile-kit)
- TypeScript source shipped as-is (Metro compiles it). Peer deps: react-native, expo, expo-router, expo-updates, expo-constants, expo-file-system, expo-intent-launcher (optional), expo-local-authentication (optional, via the safe probe — never required directly).
- `configureMobileKit({ appName, githubRepo, api, storage, auth, theme })` — the host injects its own Frappe client (axios-style `api(config)`), key/value storage, auth hooks (isSystemManager, biometricEnabled get/set, logout, forgetDevice, instanceUrl, user) and theme tokens. The kit never imports host paths.
- `<MobileKitProvider>`: apply-OTA-on-open (20 s window), daily APK check, install reporting (launch/foreground/login).
- Screens: `SettingsScreen` (profile slot, Security/biometric, App & Server versions, OTA code line, APK update section, Devices link for System Managers, Session slot, `extraSections`), `DevicesScreen`. Ionicons only.
- Modules: biometric (3-way probe), version, releases (GitHub), install-apk, device register, devices-api, restart.
- CLI `upande-mobile-kit`: `init` (writes `app/settings.tsx`, `app/devices.tsx` one-line re-exports, wraps nothing else, adds release workflow caller), `version`, `publish-ota` (the shared scripts), `doctor` (checks app.json updates.url / runtimeVersion / Frappe app reachable).
- Reusable GitHub workflow in the kit repo (`workflow_call`) replacing the ~340-line per-app release.yml; apps keep a ~15-line caller (branch, app name, apk name).
- Expo config plugins: build tuning + release signing (from the apps' `plugins/`), and one that sets `updates.url` to the site's manifest endpoint.

### 2. Frappe app `upande_mobile` (bench apps dir)
- Doctypes Mobile App, Mobile App Install, Mobile App Install User (same names/fields as upande_quality's, so data carries over).
- `upande_mobile.api`: `register_install`, `installs`, `refresh_now`, `app_versions` (replaces the per-app version report), `ota.manifest` generic over `?app=<Mobile App>`; hourly `refresh_latest`.
- `ensure` flow: Mobile App row auto-created on first report (as `_ensure_app` does today).
- Patch: moves the three doctypes' module from upande_quality to Upande Mobile when both are installed; upande_quality's old whitelisted functions become shims calling `upande_mobile` (done later, not in this pass).

## Builder's calls (check these)
- Package name `@upande/mobile-kit`, Frappe app name `upande_mobile`; both new, existing apps untouched this pass.
- Host injects api/storage/auth/theme instead of the kit bundling its own (apps already have differing clients and themes).
- Reusable workflow over copy-paste; version/OTA scripts ship as the kit's bin.
- Not published to npm: consumed by git URL / `npm pack` until you pick a registry.

## Decided by the user
- Registry: public npm (`@upande/mobile-kit`, `publishConfig.access: public`). The source, including endpoint paths, will be world-readable, so no secrets, hostnames or keys may go in the package.

## Open for the user
- Which app migrates first (suggest upande-quality, it already owns the server half).
