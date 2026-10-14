import React, { useEffect, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Card, Alert } from '@/src/components/Card';
import { Button } from '@/src/components/Button';
import { Pill } from '@/src/components/Pill';
import { Sheet } from '@/src/components/Sheet';
import { Spinner } from '@/src/components/Spinner';
import { LabeledInput } from '@/src/components/LabeledInput';
import { useToast } from '@/src/components/Toast';
import { borderRadius, colors, fontFamily, fontSize, spacing } from '@/src/theme';
import { useGreenhouseSpecsStore } from '@/src/stores/greenhouseSpecsStore';
import { useAuthStore } from '@/src/stores/authStore';
import type { GreenhouseSpec } from '@/src/services/greenhouse-specs';

const MANAGE_ROLE = 'Production Section Head';

export default function GreenhouseSpecDetail() {
  const params = useLocalSearchParams<{ greenhouse: string }>();
  // The route segment can carry several greenhouse names joined by commas —
  // the list screen's "View" action does this when more than one greenhouse
  // is selected. A single name still works exactly as before.
  const raw = decodeURIComponent(String(params.greenhouse ?? ''));
  const names = raw.split(',').filter(Boolean);
  const namesKey = names.join(',');
  const isMulti = names.length > 1;
  const router = useRouter();
  const toast = useToast();

  const specs = useGreenhouseSpecsStore((s) => s.specs);
  const loading = useGreenhouseSpecsStore((s) => s.specLoading);
  const error = useGreenhouseSpecsStore((s) => s.specError);
  const loadSpec = useGreenhouseSpecsStore((s) => s.loadSpec);
  const acting = useGreenhouseSpecsStore((s) => s.acting);
  const addGrower = useGreenhouseSpecsStore((s) => s.addGrower);
  const removeGrower = useGreenhouseSpecsStore((s) => s.removeGrower);
  const candidates = useGreenhouseSpecsStore((s) => s.candidates);
  const candidatesLoading = useGreenhouseSpecsStore((s) => s.candidatesLoading);
  const loadCandidates = useGreenhouseSpecsStore((s) => s.loadCandidates);

  const canManage = useAuthStore((s) => s.hasRole(MANAGE_ROLE));

  const [refreshing, setRefreshing] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    loadSpec(namesKey ? namesKey.split(',') : []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [namesKey, loadSpec]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadSpec(names);
    setRefreshing(false);
  };

  // Growers are added/removed one greenhouse at a time (that's how the
  // backend mutation works), so management only applies when exactly one
  // greenhouse is in view.
  const single: GreenhouseSpec | null = !isMulti ? specs[0] ?? null : null;

  const openAdd = () => {
    setSearch('');
    loadCandidates('');
    setSheetOpen(true);
  };

  const onSearch = (text: string) => {
    setSearch(text);
    loadCandidates(text);
  };

  const onPick = async (employee: string) => {
    if (!single) return;
    const r = await addGrower(employee, single.name);
    if (r.ok) {
      toast.showSuccess(r.message);
      setSheetOpen(false);
    } else {
      toast.showError(r.error);
    }
  };

  const onRemove = async (employee: string) => {
    if (!single) return;
    const r = await removeGrower(employee, single.name);
    if (r.ok) toast.showSuccess(r.message);
    else toast.showError(r.error);
  };

  const growerEmployees = new Set((single?.growers ?? []).map((g) => g.employee));

  const headerTitle = isMulti
    ? `${names.length} greenhouses`
    : single?.label || names[0] || '';

  // Rollup across the selected greenhouses, shown above the per-greenhouse
  // breakdown when more than one is selected.
  const totals = isMulti
    ? specs.reduce(
        (acc, sp) => ({
          beds: acc.beds + sp.totalBeds,
          area: acc.area + sp.totalPlantedArea,
          plants: acc.plants + sp.numberOfPlants,
          varieties: acc.varieties + sp.varietyCount,
        }),
        { beds: 0, area: 0, plants: 0, varieties: 0 },
      )
    : null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8} style={s.headerBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={s.headerTitle} numberOfLines={1}>
          {headerTitle}
        </Text>
        <View style={s.headerBtn} />
      </View>

      <ScrollView
        contentContainerStyle={s.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {loading && specs.length === 0 ? (
          <Card>
            <Spinner label="Loading spec…" />
          </Card>
        ) : error ? (
          <Alert tone="danger">{error}</Alert>
        ) : specs.length === 0 ? (
          <Card>
            <Alert tone="info">Not found.</Alert>
          </Card>
        ) : isMulti ? (
          <>
            {totals ? (
              <Card title="Combined totals">
                <View style={s.kpis}>
                  <Pill label="Beds" value={String(totals.beds)} />
                  <Pill label="Planted m²" value={Math.round(totals.area).toLocaleString()} />
                  <Pill label="Varieties" value={String(totals.varieties)} />
                  <Pill label="Plants" value={totals.plants.toLocaleString()} />
                </View>
              </Card>
            ) : null}

            {specs.map((sp) => (
              <GreenhouseSpecCard key={sp.name} spec={sp} />
            ))}
          </>
        ) : single ? (
          <>
            <Text style={s.farm}>{single.farm || '—'}</Text>

            {/* KPI overview */}
            <View style={s.kpis}>
              <Pill label="Beds" value={String(single.totalBeds)} />
              <Pill label="Planted m²" value={Math.round(single.totalPlantedArea).toLocaleString()} />
              <Pill label="Varieties" value={String(single.varietyCount)} />
              <Pill label="Plants" value={single.numberOfPlants.toLocaleString()} />
            </View>

            {!single.hasCycle ? (
              <Alert tone="info">
                Nothing is standing in this greenhouse yet. Plant a crop cycle to build its ledger.
              </Alert>
            ) : null}

            {/* Varieties grown */}
            {single.varieties.length > 0 ? (
              <Card title="Varieties grown">
                <View style={[s.trow, s.thead]}>
                  <Text style={[s.th, { flex: 2 }]}>Variety</Text>
                  <Text style={[s.th, s.numCol]}>Beds</Text>
                  <Text style={[s.th, s.numCol]}>Plants</Text>
                  <Text style={[s.th, s.areaCol]}>Area m²</Text>
                </View>
                {single.varieties.map((v, i) => (
                  <View key={v.variety + i} style={s.trow}>
                    <Text style={[s.td, { flex: 2 }]} numberOfLines={1}>
                      {v.variety}
                    </Text>
                    <Text style={[s.td, s.numCol]}>{v.beds}</Text>
                    <Text style={[s.td, s.numCol]}>{v.plants.toLocaleString()}</Text>
                    <Text style={[s.td, s.areaCol]}>{Math.round(v.area).toLocaleString()}</Text>
                  </View>
                ))}
              </Card>
            ) : null}

            {/* Bed ledger breakdown (from the Greenhouse doctype) */}
            {single.bedSummary.length > 0 ? (
              <Card title="Bed status">
                <View style={[s.trow, s.thead]}>
                  <Text style={[s.th, { flex: 2 }]}>Status</Text>
                  <Text style={[s.th, s.numCol]}>Beds</Text>
                  <Text style={[s.th, s.numCol]}>Plants</Text>
                  <Text style={[s.th, s.areaCol]}>Area m²</Text>
                </View>
                {single.bedSummary.map((b, i) => (
                  <View key={b.status + i} style={s.trow}>
                    <Text style={[s.td, { flex: 2 }]} numberOfLines={1}>{b.status}</Text>
                    <Text style={[s.td, s.numCol]}>{b.beds}</Text>
                    <Text style={[s.td, s.numCol]}>{b.plants.toLocaleString()}</Text>
                    <Text style={[s.td, s.areaCol]}>{Math.round(b.area).toLocaleString()}</Text>
                  </View>
                ))}
              </Card>
            ) : null}

            {/* Bays (legacy — never populated by the new model) */}
            {single.bays.length > 0 ? (
              <Card title="Bays">
                <View style={[s.trow, s.thead]}>
                  <Text style={[s.th, { flex: 2 }]}>Bay</Text>
                  <Text style={[s.th, { flex: 1.5 }]}>Span</Text>
                  <Text style={[s.th, s.numCol]}>Beds</Text>
                  <Text style={[s.th, s.areaCol]}>Area m²</Text>
                </View>
                {single.bays.map((b, i) => (
                  <View key={b.bayNumber + '-' + i} style={s.trow}>
                    <Text style={[s.td, { flex: 2 }]} numberOfLines={1}>
                      {b.bayName || 'Bay ' + b.bayNumber}
                    </Text>
                    <Text style={[s.td, { flex: 1.5 }]}>
                      {b.startBed}–{b.endBed}
                    </Text>
                    <Text style={[s.td, s.numCol]}>{b.beds}</Text>
                    <Text style={[s.td, s.areaCol]}>{Math.round(b.area).toLocaleString()}</Text>
                  </View>
                ))}
              </Card>
            ) : null}

            {/* Growers */}
            <Card title={'Growers (' + single.growers.length + ')'}>
              {single.growers.length === 0 ? (
                <Text style={s.muted}>No growers assigned.</Text>
              ) : (
                single.growers.map((g) => (
                  <View key={g.employee} style={s.growerRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.growerName}>{g.employeeName}</Text>
                      <Text style={s.growerMeta}>
                        {g.employee}
                        {g.designation ? ' · ' + g.designation : ''}
                      </Text>
                    </View>
                    {canManage ? (
                      <TouchableOpacity
                        onPress={() => onRemove(g.employee)}
                        disabled={acting}
                        hitSlop={8}
                        style={s.removeBtn}
                      >
                        <Ionicons name="trash-outline" size={18} color={colors.danger} />
                      </TouchableOpacity>
                    ) : null}
                  </View>
                ))
              )}
              {canManage ? (
                <Button
                  label="Add grower"
                  variant="outline"
                  iconLeft="add"
                  onPress={openAdd}
                  style={{ marginTop: spacing.md }}
                />
              ) : null}
            </Card>
          </>
        ) : null}
      </ScrollView>

      {/* Grower picker */}
      <Sheet visible={sheetOpen} onClose={() => setSheetOpen(false)} title="Add grower" subtitle="Employees with the Grower designation">
        <LabeledInput
          label="Search"
          value={search}
          onChangeText={onSearch}
          placeholder="Type a name…"
          autoCapitalize="characters"
        />
        <View style={{ maxHeight: 320 }}>
          {candidatesLoading ? (
            <Spinner label="Searching…" />
          ) : candidates.length === 0 ? (
            <Text style={s.muted}>No matching growers.</Text>
          ) : (
            <ScrollView keyboardShouldPersistTaps="handled">
              {candidates.map((c) => {
                const already = growerEmployees.has(c.employee);
                return (
                  <TouchableOpacity
                    key={c.employee}
                    disabled={already || acting}
                    onPress={() => onPick(c.employee)}
                    style={s.candidateRow}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[s.candidateName, already && { color: colors.textMuted }]}>
                        {c.employeeName}
                      </Text>
                      <Text style={s.growerMeta}>{c.employee}</Text>
                    </View>
                    {already ? (
                      <Text style={s.muted}>Added</Text>
                    ) : (
                      <Ionicons name="add-circle-outline" size={20} color={colors.primary} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}
        </View>
      </Sheet>
    </SafeAreaView>
  );
}

/** Read-only per-greenhouse breakdown used when several greenhouses are
 *  selected at once. Grower management is intentionally left out here —
 *  adding/removing a grower is a single-greenhouse action on the backend,
 *  so it only appears in the single-greenhouse view above. */
function GreenhouseSpecCard({ spec }: { spec: GreenhouseSpec }) {
  return (
    <Card title={spec.label}>
      <Text style={s.farm}>{spec.farm || '—'}</Text>
      <View style={s.kpis}>
        <Pill label="Beds" value={String(spec.totalBeds)} />
        <Pill label="Planted m²" value={Math.round(spec.totalPlantedArea).toLocaleString()} />
        <Pill label="Varieties" value={String(spec.varietyCount)} />
        <Pill label="Plants" value={spec.numberOfPlants.toLocaleString()} />
      </View>

      {!spec.hasCycle ? (
        <Alert tone="info">Nothing is standing in this greenhouse yet.</Alert>
      ) : null}

      {spec.varieties.length > 0 ? (
        <View style={{ marginTop: spacing.md }}>
          <Text style={s.subhead}>Varieties grown</Text>
          <View style={[s.trow, s.thead]}>
            <Text style={[s.th, { flex: 2 }]}>Variety</Text>
            <Text style={[s.th, s.numCol]}>Beds</Text>
            <Text style={[s.th, s.numCol]}>Plants</Text>
            <Text style={[s.th, s.areaCol]}>Area m²</Text>
          </View>
          {spec.varieties.map((v, i) => (
            <View key={v.variety + i} style={s.trow}>
              <Text style={[s.td, { flex: 2 }]} numberOfLines={1}>
                {v.variety}
              </Text>
              <Text style={[s.td, s.numCol]}>{v.beds}</Text>
              <Text style={[s.td, s.numCol]}>{v.plants.toLocaleString()}</Text>
              <Text style={[s.td, s.areaCol]}>{Math.round(v.area).toLocaleString()}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {spec.bedSummary.length > 0 ? (
        <View style={{ marginTop: spacing.md }}>
          <Text style={s.subhead}>Bed status</Text>
          <View style={[s.trow, s.thead]}>
            <Text style={[s.th, { flex: 2 }]}>Status</Text>
            <Text style={[s.th, s.numCol]}>Beds</Text>
            <Text style={[s.th, s.numCol]}>Plants</Text>
            <Text style={[s.th, s.areaCol]}>Area m²</Text>
          </View>
          {spec.bedSummary.map((b, i) => (
            <View key={b.status + i} style={s.trow}>
              <Text style={[s.td, { flex: 2 }]} numberOfLines={1}>{b.status}</Text>
              <Text style={[s.td, s.numCol]}>{b.beds}</Text>
              <Text style={[s.td, s.numCol]}>{b.plants.toLocaleString()}</Text>
              <Text style={[s.td, s.areaCol]}>{Math.round(b.area).toLocaleString()}</Text>
            </View>
          ))}
        </View>
      ) : null}

      <View style={{ marginTop: spacing.md }}>
        <Text style={s.subhead}>{'Growers (' + spec.growers.length + ')'}</Text>
        {spec.growers.length === 0 ? (
          <Text style={s.muted}>No growers assigned.</Text>
        ) : (
          spec.growers.map((g) => (
            <View key={g.employee} style={s.growerRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.growerName}>{g.employeeName}</Text>
                <Text style={s.growerMeta}>
                  {g.employee}
                  {g.designation ? ' · ' + g.designation : ''}
                </Text>
              </View>
            </View>
          ))
        )}
      </View>
    </Card>
  );
}

const s = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  headerBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.lg,
    color: colors.text,
  },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  farm: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.textSecondary },
  subhead: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.sm,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  kpis: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  trow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  thead: { borderBottomColor: colors.border },
  th: { fontFamily: fontFamily.semiBold, fontSize: fontSize.xs, color: colors.textMuted },
  td: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.text },
  numCol: { flex: 1, textAlign: 'right' },
  areaCol: { flex: 1.2, textAlign: 'right' },
  growerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    gap: spacing.md,
  },
  growerName: { fontFamily: fontFamily.medium, fontSize: fontSize.md, color: colors.text },
  growerMeta: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textMuted, marginTop: 1 },
  removeBtn: { padding: spacing.xs },
  muted: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: colors.textMuted,
    paddingVertical: spacing.sm,
  },
  candidateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    gap: spacing.md,
  },
  candidateName: { fontFamily: fontFamily.medium, fontSize: fontSize.md, color: colors.text },
});
