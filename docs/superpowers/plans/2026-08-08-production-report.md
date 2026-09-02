# Production Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Reports section to the upande-production mobile app whose first report, Production, shows the day's harvest broken down by farm → variety → stem length, backed by one new Frappe aggregation server script.

**Architecture:** A sandbox-safe `productionHarvestReport` API server script aggregates submitted Harvesting `Stock Entry` quantities into a nested farm→variety→stem-length structure for a date (+ optional farm). The app adds a ported date-stepper, a typed service + Zustand store, and two screens (Reports list + Production report with a collapsible grouped table), wired into the drawer and homepage tiles.

**Tech Stack:** Expo SDK 54, React Native, TypeScript, Zustand, expo-router, Ionicons; Frappe API Server Script (sandbox).

**Source spec:** `docs/superpowers/specs/2026-08-08-production-report-design.md`
**Backend bench:** `http://kaitet.local:8002`, token `5085fc7f49c2a3f:3fb7f8e5a682288`.

## Global Constraints

- Icons: **Ionicons only** (`@expo/vector-icons`) — never MaterialCommunityIcons/other sets (AGENTS.md).
- Server Script sandbox: **no `import`**, no `_`-prefixed names, no f-strings, no `http_status_code`, no `frappe.get_roles`. Full-Python-only constructs are forbidden here.
- Dates are `YYYY-MM-DD` strings everywhere; default = today; report date capped at today (no future harvest).
- Reuse existing primitives: `Card`, `Dropdown`, `Spinner`, `Alert`, `useToast`, `cropCycleApi.listFarms`, shared `api()` / `mapAxiosError`. Do not add new dependencies.
- All app changes must pass `npx tsc --noEmit` (exit 0) before commit.
- Money/stems are integer stem counts; treat missing `custom_farm` / `custom_stem_length` as the literal string `"Unspecified"`.
- Server-script edits are pushed to the bench via `PUT /api/resource/Server Script/<name>` and also saved to `backend/server_scripts/scripts/<name>.json`.

---

### Task 1: Backend — `productionHarvestReport` server script + live test

**Files:**
- Create: `backend/server_scripts/scripts/ProductionHarvestReport.json` (repo copy)
- Deploy: Server Script `ProductionHarvestReport` on `kaitet.local:8002`

**Interfaces:**
- Produces API method `productionHarvestReport`. Input JSON `{ "date": "YYYY-MM-DD", "farm"?: string }`. Output `frappe.response["data"]`:
  `{ date, total_stems, farms: [ { farm, stems, varieties: [ { variety, stems, stem_lengths: [ { stem_length, stems } ] } ] } ] }` or `{ error }`.

- [ ] **Step 1: Write the script** (sandbox-safe) to `/tmp/.../scratchpad/harvest_report.py`:

```python
data = frappe.request.get_json() or {}
date = (data.get("date") or "").strip()
farm_filter = (data.get("farm") or "").strip()
if not date:
    frappe.response["data"] = {"error": "date is required."}
else:
    try:
        se_filters = {"stock_entry_type": "Harvesting", "docstatus": 1, "posting_date": date}
        if farm_filter:
            se_filters["custom_farm"] = farm_filter
        entries = frappe.get_all("Stock Entry", filters=se_filters,
            fields=["name", "custom_farm", "custom_stem_length"])
        meta = {}
        for e in entries:
            meta[e.get("name")] = {
                "farm": e.get("custom_farm") or "Unspecified",
                "stem_length": e.get("custom_stem_length") or "Unspecified",
            }
        rows = []
        if meta:
            rows = frappe.get_all("Stock Entry Detail",
                filters={"parent": ["in", list(meta.keys())]},
                fields=["parent", "item_code", "qty"])
        # nested aggregation: farm -> variety -> stem_length -> stems
        agg = {}
        total = 0
        for r in rows:
            info = meta.get(r.get("parent")) or {}
            farm = info.get("farm") or "Unspecified"
            variety = r.get("item_code") or "Unspecified"
            sl = info.get("stem_length") or "Unspecified"
            qty = int(r.get("qty") or 0)
            total = total + qty
            fbucket = agg.setdefault(farm, {})
            vbucket = fbucket.setdefault(variety, {})
            vbucket[sl] = vbucket.get(sl, 0) + qty
        farms_out = []
        for farm in sorted(agg.keys()):
            varieties_out = []
            farm_stems = 0
            for variety in sorted(agg[farm].keys()):
                sl_map = agg[farm][variety]
                sl_out = []
                variety_stems = 0
                for sl in sorted(sl_map.keys()):
                    sl_out.append({"stem_length": sl, "stems": sl_map[sl]})
                    variety_stems = variety_stems + sl_map[sl]
                varieties_out.append({"variety": variety, "stems": variety_stems, "stem_lengths": sl_out})
                farm_stems = farm_stems + variety_stems
            farms_out.append({"farm": farm, "stems": farm_stems, "varieties": varieties_out})
        frappe.response["data"] = {"date": date, "total_stems": total, "farms": farms_out}
    except Exception as e:
        frappe.log_error("productionHarvestReport error: " + str(e))
        frappe.response["data"] = {"error": str(e)}
```

- [ ] **Step 2: Create the Server Script on the bench** (script_type API, module "Upande Agriculture", api_method `productionHarvestReport`).

Run (Python one-off): `POST /api/resource/Server Script` with `{"doctype":"Server Script","script_type":"API","name":"ProductionHarvestReport","api_method":"productionHarvestReport","module":"Upande Agriculture","script":<the script>}` using the bench token. Expected: `data.name == "ProductionHarvestReport"`.

- [ ] **Step 3: Seed a known harvest + call the endpoint**

Create one submitted Harvesting Stock Entry via `createHarvestStockEntry` (bucket `RPT-TEST-<ts>`, farm `Nanyuki`, greenhouse `Nanyuki GH 01 - UFL`, harvester `John Njuguna Kinyanjua`, item `Athena`, stem_length `53CM`, quantity 30). Then:
Run: `POST /api/method/productionHarvestReport` `{"date":"<today>"}`.
Expected: `total_stems >= 30`; a `Nanyuki` farm entry containing an `Athena` variety with a `53CM` stem-length row summing correctly.

- [ ] **Step 4: Test the empty + farm-filter paths**

Run: `POST /api/method/productionHarvestReport` `{"date":"1900-01-01"}` → Expected `{date, total_stems: 0, farms: []}`.
Run with `{"date":"<today>","farm":"Nanyuki"}` → Expected only Nanyuki present.

- [ ] **Step 5: Clean up test data**

Cancel + delete the seeded Stock Entry and its `RPT-TEST-*` Bucket QR Code (they are real writes). Confirm deletion.

- [ ] **Step 6: Save repo copy + commit**

Write `backend/server_scripts/scripts/ProductionHarvestReport.json` (name, script_type, api_method, module, disabled, script). Commit:
```bash
git add backend/server_scripts/scripts/ProductionHarvestReport.json
git commit -m "feat(backend): productionHarvestReport aggregation script"
```

---

### Task 2: Date utilities + `DateSelector` component (ported from packhouse)

**Files:**
- Create: `src/date.ts`
- Create: `src/components/DateSelector.tsx`

**Interfaces:**
- Produces `src/date.ts`: `todayISO(): string`, `shiftISO(iso: string, days: number): string`, `formatDayLabel(iso: string): string`.
- Produces `DateSelector` component props: `{ value: string; onChange: (iso: string) => void; label?: string; maxDate?: string | null }` (default `label="Date"`, `maxDate=todayISO()`), rendering a ◀/▶ day stepper + a "Today" reset, using Ionicons `chevron-back`/`chevron-forward`.

- [ ] **Step 1: Implement `src/date.ts`**

```ts
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n: number) => String(n).padStart(2, '0');
const toISO = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function todayISO(): string {
  return toISO(new Date());
}
export function shiftISO(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return toISO(dt);
}
export function formatDayLabel(iso: string): string {
  const today = todayISO();
  if (iso === today) return 'Today';
  if (iso === shiftISO(today, 1)) return 'Tomorrow';
  if (iso === shiftISO(today, -1)) return 'Yesterday';
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return `${WEEKDAYS[dt.getDay()]} ${d} ${MONTHS[dt.getMonth()]}`;
}
```

- [ ] **Step 2: Implement `DateSelector`** using production theme + Ionicons

```tsx
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatDayLabel, shiftISO, todayISO } from '@/src/date';
import { borderRadius, colors, fontFamily, fontSize, spacing } from '@/src/theme';

export function DateSelector({
  value, onChange, label = 'Date', maxDate = todayISO(),
}: {
  value: string; onChange: (iso: string) => void; label?: string; maxDate?: string | null;
}) {
  const atMax = maxDate != null && value >= maxDate;
  return (
    <View style={s.wrap}>
      <Text style={s.label}>{label}</Text>
      <View style={s.row}>
        <Pressable style={s.btn} onPress={() => onChange(shiftISO(value, -1))} hitSlop={6}>
          <Ionicons name="chevron-back" size={20} color={colors.text} />
        </Pressable>
        <View style={s.center}>
          <Text style={s.dateText}>{formatDayLabel(value)}</Text>
          <Text style={s.dateSub}>{value}</Text>
        </View>
        <Pressable style={[s.btn, atMax && s.btnDisabled]} disabled={atMax}
          onPress={() => onChange(shiftISO(value, 1))} hitSlop={6}>
          <Ionicons name="chevron-forward" size={20} color={atMax ? colors.textMuted : colors.text} />
        </Pressable>
        {value !== todayISO() ? (
          <Pressable style={s.todayBtn} onPress={() => onChange(todayISO())} hitSlop={6}>
            <Text style={s.todayText}>Today</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { marginBottom: spacing.md },
  label: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: colors.text, marginBottom: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  btn: { width: 40, height: 40, borderRadius: borderRadius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  btnDisabled: { opacity: 0.4 },
  center: { flex: 1, alignItems: 'center' },
  dateText: { fontFamily: fontFamily.semiBold, fontSize: fontSize.md, color: colors.text },
  dateSub: { fontFamily: fontFamily.regular, fontSize: 10, color: colors.textMuted, marginTop: 1 },
  todayBtn: { paddingHorizontal: spacing.md, height: 40, borderRadius: borderRadius.sm, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  todayText: { fontFamily: fontFamily.semiBold, fontSize: fontSize.xs, color: colors.textOnPrimary },
});
```

> Before writing, confirm the referenced theme tokens exist: `grep -nE "surface|textMuted|textOnPrimary|border|primary|fontSize|borderRadius" src/theme.ts`. If a token name differs, use the actual name (do not invent tokens).

- [ ] **Step 3: Typecheck** — `npx tsc --noEmit`. Expected exit 0.

- [ ] **Step 4: Commit**
```bash
git add src/date.ts src/components/DateSelector.tsx
git commit -m "feat: dependency-free DateSelector + date helpers"
```

---

### Task 3: Reports service — `src/services/reports.ts`

**Files:**
- Create: `src/services/reports.ts`

**Interfaces:**
- Consumes: shared `api()` from `src/services/api.ts`.
- Produces:
```ts
export interface StemLengthRow { stemLength: string; stems: number; }
export interface VarietyRow { variety: string; stems: number; stemLengths: StemLengthRow[]; }
export interface FarmRow { farm: string; stems: number; varieties: VarietyRow[]; }
export interface HarvestReport { date: string; totalStems: number; farms: FarmRow[]; }
export const reportsApi = { harvestReport(date: string, farm?: string): Promise<HarvestReport> };
```

- [ ] **Step 1: Implement** (mirror the mapping style of `src/services/harvesting.ts`)

```ts
import { api } from '@/src/services/api';

export interface StemLengthRow { stemLength: string; stems: number; }
export interface VarietyRow { variety: string; stems: number; stemLengths: StemLengthRow[]; }
export interface FarmRow { farm: string; stems: number; varieties: VarietyRow[]; }
export interface HarvestReport { date: string; totalStems: number; farms: FarmRow[]; }

interface RawReport {
  data?: {
    date?: string;
    total_stems?: number;
    farms?: Array<{
      farm?: string; stems?: number;
      varieties?: Array<{
        variety?: string; stems?: number;
        stem_lengths?: Array<{ stem_length?: string; stems?: number }>;
      }>;
    }>;
    error?: string;
  };
}

export const reportsApi = {
  async harvestReport(date: string, farm?: string): Promise<HarvestReport> {
    const body = await api<RawReport>({
      method: 'POST',
      url: '/api/method/productionHarvestReport',
      data: { date, ...(farm ? { farm } : {}) },
    });
    const farms: FarmRow[] = (body.data?.farms ?? []).map((f) => ({
      farm: String(f.farm ?? 'Unspecified'),
      stems: Number(f.stems ?? 0),
      varieties: (f.varieties ?? []).map((v) => ({
        variety: String(v.variety ?? 'Unspecified'),
        stems: Number(v.stems ?? 0),
        stemLengths: (v.stem_lengths ?? []).map((sl) => ({
          stemLength: String(sl.stem_length ?? 'Unspecified'),
          stems: Number(sl.stems ?? 0),
        })),
      })),
    }));
    return { date: String(body.data?.date ?? date), totalStems: Number(body.data?.total_stems ?? 0), farms };
  },
};
```

- [ ] **Step 2: Typecheck** — `npx tsc --noEmit`. Expected exit 0.
- [ ] **Step 3: Commit** `feat: reports service (harvestReport)`.

---

### Task 4: Reports store — `src/stores/reportsStore.ts`

**Files:**
- Create: `src/stores/reportsStore.ts`

**Interfaces:**
- Consumes: `reportsApi.harvestReport` (Task 3), `mapAxiosError` from `src/services/api.ts`, `todayISO` (Task 2).
- Produces a Zustand store: state `{ date: string; farm: string; report: HarvestReport | null; loading: boolean; error: string | null }`, actions `setDate(iso: string): void`, `setFarm(farm: string): void`, `load(): Promise<void>`.

- [ ] **Step 1: Implement** (match the shape of `src/stores/harvestingStore.ts`)

```ts
import { create } from 'zustand';
import { mapAxiosError } from '@/src/services/api';
import { reportsApi, type HarvestReport } from '@/src/services/reports';
import { todayISO } from '@/src/date';

interface ReportsState {
  date: string;
  farm: string;
  report: HarvestReport | null;
  loading: boolean;
  error: string | null;
  setDate: (iso: string) => void;
  setFarm: (farm: string) => void;
  load: () => Promise<void>;
}

export const useReportsStore = create<ReportsState>((set, get) => ({
  date: todayISO(),
  farm: '',
  report: null,
  loading: false,
  error: null,
  setDate: (iso) => set({ date: iso }),
  setFarm: (farm) => set({ farm }),
  load: async () => {
    set({ loading: true, error: null });
    try {
      const report = await reportsApi.harvestReport(get().date, get().farm || undefined);
      set({ report, loading: false });
    } catch (err) {
      set({ error: mapAxiosError(err).message, loading: false, report: null });
    }
  },
}));
```

- [ ] **Step 2: Typecheck** — `npx tsc --noEmit`. Expected exit 0.
- [ ] **Step 3: Commit** `feat: reports store`.

---

### Task 5: Production report screen — `app/reports/production.tsx`

**Files:**
- Create: `app/reports/production.tsx`

**Interfaces:**
- Consumes: `useReportsStore` (Task 4), `DateSelector` (Task 2), `cropCycleApi.listFarms` (existing, returns `PickerOption[]` with `{name,label}`), `Card`/`Dropdown`/`Spinner`/`Alert` primitives.

- [ ] **Step 1: Verify `cropCycleApi.listFarms` signature** — `grep -nE "listFarms|PickerOption" src/services/crop-cycle.ts`. Confirm it returns `Promise<PickerOption[]>` where `PickerOption = { name: string; label: string }`. Use those names.

- [ ] **Step 2: Implement the screen**

```tsx
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Card, Alert } from '@/src/components/Card';
import { Dropdown } from '@/src/components/Dropdown';
import { Spinner } from '@/src/components/Spinner';
import { DateSelector } from '@/src/components/DateSelector';
import { useToast } from '@/src/components/Toast';
import { colors, fontFamily, fontSize, spacing } from '@/src/theme';
import { useReportsStore } from '@/src/stores/reportsStore';
import { cropCycleApi, type PickerOption } from '@/src/services/crop-cycle';

export default function ProductionReportScreen() {
  const router = useRouter();
  const { showError } = useToast();
  const date = useReportsStore((s) => s.date);
  const farm = useReportsStore((s) => s.farm);
  const report = useReportsStore((s) => s.report);
  const loading = useReportsStore((s) => s.loading);
  const error = useReportsStore((s) => s.error);
  const setDate = useReportsStore((s) => s.setDate);
  const setFarm = useReportsStore((s) => s.setFarm);
  const load = useReportsStore((s) => s.load);

  const [farms, setFarms] = useState<PickerOption[]>([]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  useEffect(() => { cropCycleApi.listFarms().then(setFarms).catch(() => {}); }, []);
  useEffect(() => { load(); }, [date, farm, load]);
  useEffect(() => { if (error) showError(error); }, [error, showError]);

  const toggle = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });

  const fmt = (n: number) => n.toLocaleString();
  const isEmpty = !loading && report != null && report.farms.length === 0;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <View style={s.header}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={s.headerBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={s.headerTitle}>Production</Text>
        <View style={s.headerBtn} />
      </View>

      <ScrollView contentContainerStyle={s.scroll}>
        <Card>
          <DateSelector value={date} onChange={setDate} label="Harvest date" />
          <Dropdown
            label="Farm"
            value={farm}
            onChange={setFarm}
            options={farms.map((f) => ({ value: f.name, label: f.label }))}
            placeholder="All farms"
          />
        </Card>

        {loading ? (
          <Card><Spinner label="Loading harvest…" /></Card>
        ) : isEmpty ? (
          <Card><Alert tone="info">No harvest recorded for this date.</Alert></Card>
        ) : report ? (
          <Card>
            {report.farms.map((f) => {
              const fKey = `farm:${f.farm}`;
              const fOpen = !collapsed.has(fKey);
              return (
                <View key={fKey}>
                  <Pressable style={s.farmRow} onPress={() => toggle(fKey)}>
                    <Ionicons name={fOpen ? 'chevron-down' : 'chevron-forward'} size={16} color={colors.text} />
                    <Text style={s.farmName}>{f.farm}</Text>
                    <Text style={s.farmStems}>{fmt(f.stems)} stems</Text>
                  </Pressable>
                  {fOpen && f.varieties.map((v) => {
                    const vKey = `${fKey}/var:${v.variety}`;
                    const vOpen = !collapsed.has(vKey);
                    return (
                      <View key={vKey}>
                        <Pressable style={s.varRow} onPress={() => toggle(vKey)}>
                          <Ionicons name={vOpen ? 'chevron-down' : 'chevron-forward'} size={14} color={colors.textSecondary} />
                          <Text style={s.varName}>{v.variety}</Text>
                          <Text style={s.varStems}>{fmt(v.stems)}</Text>
                        </Pressable>
                        {vOpen && v.stemLengths.map((sl) => (
                          <View key={`${vKey}/sl:${sl.stemLength}`} style={s.slRow}>
                            <Text style={s.slName}>{sl.stemLength}</Text>
                            <Text style={s.slStems}>{fmt(sl.stems)}</Text>
                          </View>
                        ))}
                      </View>
                    );
                  })}
                </View>
              );
            })}
            <View style={s.totalRow}>
              <Text style={s.totalLabel}>Total</Text>
              <Text style={s.totalStems}>{fmt(report.totalStems)} stems</Text>
            </View>
          </Card>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  headerBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', fontFamily: fontFamily.semiBold, fontSize: fontSize.lg, color: colors.text },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  farmRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  farmName: { flex: 1, fontFamily: fontFamily.semiBold, fontSize: fontSize.md, color: colors.text },
  farmStems: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: colors.text },
  varRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xs, paddingLeft: spacing.lg },
  varName: { flex: 1, fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: colors.textSecondary },
  varStems: { fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: colors.textSecondary },
  slRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2, paddingLeft: spacing.xxl },
  slName: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.textMuted },
  slStems: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.textMuted },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.md, paddingTop: spacing.sm, borderTopWidth: 2, borderTopColor: colors.border },
  totalLabel: { fontFamily: fontFamily.bold, fontSize: fontSize.md, color: colors.text },
  totalStems: { fontFamily: fontFamily.bold, fontSize: fontSize.md, color: colors.primary },
});
```

> Before writing, confirm token names used here (`textSecondary`, `textMuted`, `fontFamily.bold`, `spacing.xxl`, `fontSize.lg`) exist in `src/theme.ts`; substitute real names if any differ. Confirm `Alert` is exported from `@/src/components/Card` (it is — see `harvesting.tsx`).

- [ ] **Step 3: Typecheck** — `npx tsc --noEmit`. Expected exit 0.
- [ ] **Step 4: Commit** `feat: production report screen`.

---

### Task 6: Reports list screen — `app/reports/index.tsx`

**Files:**
- Create: `app/reports/index.tsx`

**Interfaces:**
- Consumes: `useRouter`. Standalone list of report tiles (only Production for now).

- [ ] **Step 1: Implement** (tile style mirrors `app/(tabs)/index.tsx`)

```tsx
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { colors, fontFamily, fontSize, spacing, borderRadius } from '@/src/theme';

const REPORTS = [
  { key: 'production', route: '/reports/production', label: 'Production', icon: 'cut-outline' as const, hint: 'Harvest by farm, variety, stem length' },
];

export default function ReportsScreen() {
  const router = useRouter();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <View style={s.header}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={s.headerBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={s.headerTitle}>Reports</Text>
        <View style={s.headerBtn} />
      </View>
      <ScrollView contentContainerStyle={s.scroll}>
        {REPORTS.map((r) => (
          <Pressable key={r.key} style={s.tile} onPress={() => router.push(r.route as never)}>
            <View style={s.tileIcon}><Ionicons name={r.icon} size={22} color={colors.text} /></View>
            <View style={{ flex: 1 }}>
              <Text style={s.tileLabel}>{r.label}</Text>
              <Text style={s.tileHint}>{r.hint}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </Pressable>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  headerBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', fontFamily: fontFamily.semiBold, fontSize: fontSize.lg, color: colors.text },
  scroll: { padding: spacing.lg, gap: spacing.md },
  tile: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg, borderRadius: borderRadius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  tileIcon: { width: 40, height: 40, borderRadius: borderRadius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceAlt },
  tileLabel: { fontFamily: fontFamily.semiBold, fontSize: fontSize.md, color: colors.text },
  tileHint: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
});
```

> Confirm `surfaceAlt`, `borderRadius.md` exist in `src/theme.ts`; substitute if needed.

- [ ] **Step 2: Typecheck** — `npx tsc --noEmit`. Expected exit 0.
- [ ] **Step 3: Commit** `feat: reports list screen`.

---

### Task 7: Wire navigation — drawer + homepage tile

**Files:**
- Modify: `src/components/DrawerMenu.tsx` (the `NAV_ITEMS` array, ~line 30-38)
- Modify: `app/(tabs)/index.tsx` (the `FEATURES` array, ~line 18-25)

**Interfaces:**
- Consumes: routes `/reports` (Task 6). No new exports.

- [ ] **Step 1: Add the drawer entry** — in `DrawerMenu.tsx`, append to `NAV_ITEMS`:
```ts
  { label: 'Reports', icon: 'bar-chart-outline', route: '/reports' },
```

- [ ] **Step 2: Add the homepage tile** — in `app/(tabs)/index.tsx`, append to `FEATURES`:
```ts
  { key: 'reports', route: '/reports', label: 'Reports', icon: 'bar-chart-outline', hint: 'Production harvest breakdown' },
```

- [ ] **Step 3: Typecheck** — `npx tsc --noEmit`. Expected exit 0.

- [ ] **Step 4: Verify routing** — confirm `app/reports/index.tsx` and `app/reports/production.tsx` exist so `router.push('/reports')` and `'/reports/production'` resolve (expo-router file-based). No `(tabs)` registration needed — they are outside the tab group, like `app/crop-cycle/new.tsx`.

- [ ] **Step 5: Commit** `feat: add Reports to drawer + homepage`.

---

### Task 8: End-to-end verification

**Files:** none (verification only).

- [ ] **Step 1: Full typecheck** — `npx tsc --noEmit`. Expected exit 0.

- [ ] **Step 2: Backend smoke test with real data** — seed a harvest (as Task 1 Step 3), call `productionHarvestReport` for today, confirm the nested totals match the seeded quantity, then clean up the Stock Entry + bucket.

- [ ] **Step 3: Drive the app** (invoke the `run` skill or `npx expo start`): open the app → Home shows a **Reports** tile and the drawer shows **Reports** → tap → Production → the date defaults to today, the farm filter lists farms, and the grouped table renders (or the "No harvest recorded" message). Step the date back a day and confirm it reloads. Trigger a load error path (e.g. bad token) and confirm the toast shows the real reason + error sound.

- [ ] **Step 4: Commit** any final fixes.

---

## Self-Review

**Spec coverage:** §2 data source → Task 1; §3 backend script (input/output/errors/test/cleanup) → Task 1; §4.1 date utils + DateSelector → Task 2; §4.2 service → Task 3; §4.3 store → Task 4; §4.4 screens (list + report, collapsible table, states) → Tasks 5–6; §4.5 nav registration → Task 7; §5 data flow exercised → Task 8; §6 reuse honored (Card/Dropdown/Spinner/Alert/listFarms/api) throughout; §7 error handling → store `error` → toast in Task 5. No uncovered section.

**Placeholder scan:** every code step contains full code; the three "confirm token names" notes are guardrails against inventing theme tokens, not deferred work — they instruct substituting real names discovered via grep. No TBD/TODO.

**Type consistency:** `HarvestReport`/`FarmRow`/`VarietyRow`/`StemLengthRow` and fields (`totalStems`, `stemLengths`, `stemLength`) are defined in Task 3 and used identically in Tasks 4–5. `reportsApi.harvestReport(date, farm?)`, `useReportsStore` action names (`setDate`/`setFarm`/`load`), and `DateSelector` props (`value`/`onChange`/`label`/`maxDate`) match across tasks. Backend output keys (`total_stems`, `stem_lengths`, `stem_length`) match the `RawReport` mapping in Task 3.

**Known guardrail:** theme token names (`surface`, `surfaceAlt`, `textSecondary`, `textMuted`, `textOnPrimary`, `fontFamily.bold`, `spacing.xxl`) are used per the packhouse/harvesting patterns but MUST be grep-verified against `src/theme.ts` at build time (noted in Tasks 2, 5, 6) since a mismatched token is a compile error.
