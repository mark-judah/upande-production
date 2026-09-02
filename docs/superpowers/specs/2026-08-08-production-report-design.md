# Reports Section + Production Report — Design Spec

**Date:** 2026-08-08
**App:** `upande-production` (Expo SDK 54 mobile app) + one Frappe API server script.
**Backend:** `kaitet.local:8002` (dev bench; module **Upande Agriculture**).

## 1. Goal

Give supervisors an in-app **Reports** section. The first report — **Production** — shows the day's harvest **broken down by farm → variety → stem length**, with stem totals at each level and a grand total, filterable by date and farm.

### Success criteria
- A supervisor opens Reports → Production, sees today's harvest grouped Farm → Variety → Stem length with correct stem totals.
- They can step the date (default today, capped at today) and filter by farm.
- Empty days show a clear "no harvest" message; load failures surface the real reason via the shared error toast.

### Non-goals (v1 — YAGNI)
- Charts, CSV/PDF export, multi-day ranges, auto-scoping to the user's farm (no farm/station on the profile yet), other report types.

## 2. Data source

Harvest = `Stock Entry`, `stock_entry_type = "Harvesting"`, `docstatus = 1`.
- Parent fields: `custom_farm`, `custom_stem_length`, `posting_date`.
- Child `Stock Entry Detail`: `item_code` (the variety), `qty` (stems).

Aggregation key: `custom_farm` → `item_code` → `custom_stem_length`, summing `qty`.

## 3. Backend — `productionHarvestReport` (new API server script)

Module Upande Agriculture, `api_method = productionHarvestReport`. Sandbox-safe (no imports, no f-strings, no `_`-prefixed names).

**Input:** `{ "date": "YYYY-MM-DD", "farm": "<optional Farm>" }`
**Logic:**
1. Validate `date` present.
2. `frappe.get_all("Stock Entry", filters={stock_entry_type:"Harvesting", docstatus:1, posting_date:date, (custom_farm:farm if given)}, fields=["name","custom_farm","custom_stem_length"])`.
3. If any, `frappe.get_all("Stock Entry Detail", filters={parent: ["in", se_names]}, fields=["parent","item_code","qty"])`; build a map of parent → list of (item_code, qty).
4. Aggregate into nested dict keyed farm → variety → stem_length, summing qty; also accumulate per-farm, per-variety, and grand totals. Treat missing farm/stem_length as `"Unspecified"`.
5. Sort farms, varieties, stem lengths alphabetically for stable output.

**Output (`frappe.response["data"]`):**
```json
{
  "date": "2026-08-08",
  "total_stems": 3550,
  "farms": [
    { "farm": "Nanyuki", "stems": 2400, "varieties": [
      { "variety": "Athena", "stems": 1600, "stem_lengths": [
        { "stem_length": "43CM", "stems": 600 },
        { "stem_length": "53CM", "stems": 1000 } ] } ] } ]
}
```
On error: `frappe.response["data"] = {"error": "<reason>"}` (surfaced by the app's `api()` wrapper).

**Testing (build phase):** call the endpoint on the bench for a date with a known harvest and assert the totals; verify empty-date returns `total_stems: 0, farms: []`. Any test Stock Entries created are cancelled + deleted afterward.

## 4. App structure

### 4.1 Date utilities & picker (ported from packhouse)
- `src/date.ts` — dependency-free helpers: `todayISO()`, `shiftISO(iso, days)`, `formatDayLabel(iso)` (Today/Yesterday/"Wed 18 Jun"). Copied from `upande-packhouse/src/core/date.ts`.
- `src/components/DateSelector.tsx` — day-stepper (◀ / ▶ chevrons + "Today" reset), YYYY-MM-DD in/out, `maxDate` cap (default today). Ported from packhouse's `DateSelector`, adapted to production's `@/src/theme` tokens and **Ionicons** (`chevron-back` / `chevron-forward`) per AGENTS.md (Ionicons only).

### 4.2 Service — `src/services/reports.ts`
```ts
export interface StemLengthRow { stemLength: string; stems: number; }
export interface VarietyRow { variety: string; stems: number; stemLengths: StemLengthRow[]; }
export interface FarmRow { farm: string; stems: number; varieties: VarietyRow[]; }
export interface HarvestReport { date: string; totalStems: number; farms: FarmRow[]; }
export const reportsApi = {
  harvestReport(date: string, farm?: string): Promise<HarvestReport>;  // POST /api/method/productionHarvestReport
};
```
Maps the raw nested response into camelCase; uses the shared `api()` wrapper so soft errors throw.

### 4.3 Store — `src/stores/reportsStore.ts`
State: `date` (default `todayISO()`), `farm` (`''` = all), `report: HarvestReport | null`, `loading`, `error`. Actions: `setDate`, `setFarm`, `load()`. `load()` calls `reportsApi.harvestReport(date, farm||undefined)`, sets `report`/`error`. Re-loads on date/farm change (via the screen's effect).

### 4.4 Screens
- `app/reports/index.tsx` — **Reports list**. One tile "Production" (`hint`: "Harvest by farm, variety, stem length") → `/reports/production`. Card/Pressable tiles matching the homepage style, so future reports slot in.
- `app/reports/production.tsx` — **Production report**:
  - Header row: `DateSelector` (default today, `maxDate = todayISO()`).
  - Farm `Dropdown` (options from existing `productionListFarms` via `cropCycleApi.listFarms()`; placeholder "All farms", clearable).
  - Body: collapsible **Farm → Variety → Stem length** table. Farm and Variety rows show their stem total and toggle expand/collapse (expanded by default); stem-length leaves show `43CM … 600`. Grand total row pinned at the bottom.
  - States: `Spinner` while loading; `Alert tone="info"` "No harvest recorded for this date." when `farms` empty; errors via toast (shared mapper).
  - Local `useState` sets of collapsed farm/variety keys drive expansion.

### 4.5 Navigation registration
- `src/components/DrawerMenu.tsx` — add `{ label: 'Reports', icon: 'bar-chart-outline', route: '/reports' }`.
- `app/(tabs)/index.tsx` — add `{ key: 'reports', route: '/reports', label: 'Reports', icon: 'bar-chart-outline', hint: 'Production harvest breakdown' }` to the tiles.
- `app/reports/` routes live outside `(tabs)` (like `app/crop-cycle/new.tsx`), pushed via `router.push`.

## 5. Data flow
```
production.tsx  ──(date, farm)──▶ reportsStore.load()
      │                                   │
      │                                   ▼
      │                        reportsApi.harvestReport ──POST──▶ productionHarvestReport
      │                                   │                          (aggregate SUM(qty) by
      ▼                                   ▼                           farm→variety→stem length)
 collapsible table  ◀── HarvestReport ◀── mapped nested rows
```

## 6. Components & reuse
- Reuse: `Card`, `Dropdown`, `Spinner`, `Alert`, `useToast`, `cropCycleApi.listFarms`, shared `api()`/`mapAxiosError`.
- New: `src/date.ts`, `DateSelector`, `reports.ts`, `reportsStore.ts`, `app/reports/index.tsx`, `app/reports/production.tsx`.
- Each file has one responsibility; the screen holds only UI + expansion state, the store holds fetch state, the service holds the API contract.

## 7. Error handling
- Backend soft errors → `{data:{error}}` → `api()` throws `HttpError` → store `error` → toast shows the real reason (with error sound).
- No writes: the report is read-only; no idempotency/cleanup concerns in production use.
