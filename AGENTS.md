# Upande Production — agent notes

This app is on **Expo SDK 54** to stay consistent with the rest of the Upande
fleet (upande-quality, upande-security, the coffee app). For SDK-specific
API questions read https://docs.expo.dev/versions/v54.0.0/ — not the latest.

## Reference docs in this repo and at /home/jk/Documents/

- `/home/jk/Documents/mobile-app-blueprint.html` — fleet-wide conventions (auth,
  client, components, OTA, anti-patterns, sandbox rules).
- `/home/jk/Documents/upande-production-build-guide.md` — what to build here:
  features, doctypes, server scripts, roles, bootstrap order.

## Design system

- Tokens live in `src/theme.ts`. Coffee-themed accents (`cherry`, `parchment`,
  `roast`) are intentionally stripped — do not reintroduce them.
- Body: DM Sans (400/500). Headings: Poppins (600/700). Loaded in
  `app/_layout.tsx` via `@expo-google-fonts/*` — block render until loaded.
- Icons: Ionicons only (`@expo/vector-icons`). Don't mix sets.

## Biometric

- Mandatory across all Upande apps. `src/services/biometric.ts` has the safe
  3-way native-module probe — never `require('expo-local-authentication')`
  directly. Read blueprint §13.4 for the full flow.

## Backend

- Three Frappe instances:
  - `http://kaitet.local:8001` (dev — destructive work allowed)
  - `https://kaitet-group.upande.com` (internal staging)
  - `https://upande-kaitet2.c.frappe.cloud` (production — READ-ONLY for development)
- Credentials in `/home/jk/Projects/upande-quality/.kaitet-credentials.json`
  (gitignored).
- Frappe sandbox rules (no `import`, no `_`-prefixed names, no f-strings, no
  `http_status_code`, no `frappe.get_roles`, etc.) — see blueprint §7.
