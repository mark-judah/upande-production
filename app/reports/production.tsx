import React, { useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Card, Alert } from '@/src/components/Card';
import { Dropdown } from '@/src/components/Dropdown';
import { Segmented } from '@/src/components/Segmented';
import { Spinner } from '@/src/components/Spinner';
import { DateRangeField } from '@/src/components/DateRangeField';
import { useToast } from '@/src/components/Toast';
import { borderRadius, colors, fontFamily, fontSize, spacing } from '@/src/theme';
import { useReportsStore } from '@/src/stores/reportsStore';
import { cropCycleApi, type PickerOption } from '@/src/services/crop-cycle';
import type { VarietyRow } from '@/src/services/reports';

interface MergedLength { stemLength: string; harvested: number; received: number; }
interface MergedHeadSize { headSize: string; harvested: number; }
interface MergedVariety {
  variety: string;
  harvested: number;
  received: number;
  lengths: MergedLength[];
  headSizes: MergedHeadSize[];
}
interface MergedGroup { key: string; harvested: number; received: number; varieties: MergedVariety[]; }

/** Harvested and received side by side: one row per group / variety / stem
 *  length present on either side. */
function mergeGroups(
  harvested: { key: string; varieties: VarietyRow[] }[],
  received: { key: string; varieties: VarietyRow[] }[],
): MergedGroup[] {
  const groups = new Map<string, Map<string, Map<string, MergedLength>>>();
  // Head size is only recorded at harvest, so it comes from the harvested side.
  const heads = new Map<string, Map<string, number>>();
  const add = (side: 'harvested' | 'received', rows: { key: string; varieties: VarietyRow[] }[]) => {
    for (const g of rows) {
      const vmap = groups.get(g.key) ?? new Map<string, Map<string, MergedLength>>();
      groups.set(g.key, vmap);
      for (const v of g.varieties) {
        const lmap = vmap.get(v.variety) ?? new Map<string, MergedLength>();
        vmap.set(v.variety, lmap);
        for (const sl of v.stemLengths) {
          const row = lmap.get(sl.stemLength) ?? { stemLength: sl.stemLength, harvested: 0, received: 0 };
          row[side] += sl.stems;
          lmap.set(sl.stemLength, row);
        }
        if (side === 'harvested') {
          const hkey = `${g.key}\u0000${v.variety}`;
          const hmap = heads.get(hkey) ?? new Map<string, number>();
          heads.set(hkey, hmap);
          for (const hs of v.headSizes) hmap.set(hs.headSize, (hmap.get(hs.headSize) ?? 0) + hs.stems);
        }
      }
    }
  };
  add('harvested', harvested);
  add('received', received);
  const sum = (rows: { harvested: number; received: number }[]) => ({
    harvested: rows.reduce((a, r) => a + r.harvested, 0),
    received: rows.reduce((a, r) => a + r.received, 0),
  });
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, vmap]) => {
      const varieties = [...vmap.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([variety, lmap]) => {
          const lengths = [...lmap.values()].sort((a, b) => a.stemLength.localeCompare(b.stemLength));
          const headSizes = [...(heads.get(`${key}\u0000${variety}`) ?? new Map<string, number>()).entries()]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([headSize, harvested]) => ({ headSize, harvested }));
          return { variety, lengths, headSizes, ...sum(lengths) };
        });
      return { key, varieties, ...sum(varieties) };
    });
}

export default function ProductionReportScreen() {
  const router = useRouter();
  const { showError } = useToast();
  const fromDate = useReportsStore((s) => s.fromDate);
  const toDate = useReportsStore((s) => s.toDate);
  const farm = useReportsStore((s) => s.farm);
  const report = useReportsStore((s) => s.report);
  const loading = useReportsStore((s) => s.loading);
  const error = useReportsStore((s) => s.error);
  const setRange = useReportsStore((s) => s.setRange);
  const setFarm = useReportsStore((s) => s.setFarm);
  const load = useReportsStore((s) => s.load);

  const [farms, setFarms] = useState<PickerOption[]>([]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [groupBy, setGroupBy] = useState<'farm' | 'greenhouse'>('farm');
  const [refreshing, setRefreshing] = useState(false);

  const loadFarms = () => cropCycleApi.listFarms().then(setFarms).catch(() => {});

  useEffect(() => {
    loadFarms();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    load();
  }, [fromDate, toDate, farm, load]);
  useEffect(() => {
    if (error) showError(error);
  }, [error, showError]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([loadFarms(), load()]);
    } finally {
      setRefreshing(false);
    }
  };

  const toggle = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const fmt = (n: number) => n.toLocaleString();
  const groups: MergedGroup[] = report
    ? groupBy === 'farm'
      ? mergeGroups(
          report.farms.map((f) => ({ key: f.farm, varieties: f.varieties })),
          report.receivedFarms.map((f) => ({ key: f.farm, varieties: f.varieties })),
        )
      : mergeGroups(
          report.greenhouses.map((g) => ({ key: g.greenhouse, varieties: g.varieties })),
          report.receivedGreenhouses.map((g) => ({ key: g.greenhouse, varieties: g.varieties })),
        )
    : [];
  const variance = (r: { harvested: number; received: number }) => r.received - r.harvested;
  const varianceText = (r: { harvested: number; received: number }) => {
    const v = variance(r);
    return `${v > 0 ? '+' : ''}${fmt(v)}`;
  };
  const isEmpty = !loading && report != null && groups.length === 0;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <View style={s.header}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={s.headerBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={s.headerTitle}>Production</Text>
        <View style={s.headerBtn} />
      </View>

      <ScrollView
        contentContainerStyle={s.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <Card>
          <DateRangeField label="Harvest date" from={fromDate} to={toDate} onChange={setRange} />
          <Dropdown
            label="Farm"
            value={farm}
            onChange={setFarm}
            options={farms.map((f) => ({ value: f.name, label: f.label }))}
            placeholder="All farms"
          />
        </Card>

        <Segmented
          value={groupBy}
          onChange={setGroupBy}
          options={[
            { value: 'farm', label: 'By farm' },
            { value: 'greenhouse', label: 'By greenhouse' },
          ]}
        />

        {loading ? (
          <Card><Spinner label="Loading…" /></Card>
        ) : isEmpty ? (
          <Card>
            <Alert tone="info">
              No harvest or receiving recorded for {fromDate === toDate ? 'this date' : 'these dates'}.
            </Alert>
          </Card>
        ) : report ? (
          <Card>
            {groups.map((g, gi) => {
              const gKey = `${groupBy}:${g.key}`;
              const gOpen = !collapsed.has(gKey);
              return (
                <View key={gKey} style={gi > 0 ? { marginTop: spacing.lg } : undefined}>
                  <Pressable style={s.farmRow} onPress={() => toggle(gKey)}>
                    <Ionicons name={gOpen ? 'chevron-down' : 'chevron-forward'} size={16} color={colors.text} />
                    <Text style={s.farmName}>{g.key}</Text>
                    <Text style={[s.farmStems, variance(g) < 0 ? s.neg : variance(g) > 0 ? s.pos : null]}>
                      {varianceText(g)}
                    </Text>
                  </Pressable>

                  {gOpen && (
                    <View style={s.table}>
                      <View style={[s.tr, s.thead]}>
                        <Text style={[s.th, s.colVariety]}>Variety</Text>
                        <Text style={[s.th, s.colLength]}>Length</Text>
                        <Text style={[s.th, s.colNum, s.right]}>Harv.</Text>
                        <Text style={[s.th, s.colNum, s.right]}>Recv.</Text>
                        <Text style={[s.th, s.colNum, s.right]}>Var.</Text>
                      </View>
                      {g.varieties.map((v) => (
                        <View key={`${gKey}/var:${v.variety}`}>
                          <View style={[s.tr, s.varHead]}>
                            <Text style={[s.tdVariety, s.colVariety]}>{v.variety}</Text>
                            <Text style={[s.td, s.colLength]} />
                            <Text style={[s.tdVariety, s.colNum, s.right]}>{fmt(v.harvested)}</Text>
                            <Text style={[s.tdVariety, s.colNum, s.right]}>{fmt(v.received)}</Text>
                            <Text style={[s.tdVariety, s.colNum, s.right, variance(v) < 0 ? s.neg : variance(v) > 0 ? s.pos : null]}>
                              {varianceText(v)}
                            </Text>
                          </View>
                          {v.lengths.map((sl) => (
                            <View key={`${gKey}/var:${v.variety}/sl:${sl.stemLength}`} style={s.tr}>
                              <Text style={[s.td, s.colVariety]} />
                              <Text style={[s.td, s.colLength]}>{sl.stemLength}</Text>
                              <Text style={[s.td, s.colNum, s.right]}>{fmt(sl.harvested)}</Text>
                              <Text style={[s.td, s.colNum, s.right]}>{fmt(sl.received)}</Text>
                              <Text style={[s.td, s.colNum, s.right, variance(sl) < 0 ? s.neg : variance(sl) > 0 ? s.pos : null]}>
                                {varianceText(sl)}
                              </Text>
                            </View>
                          ))}
                          {v.headSizes.length > 0 && (
                            <View style={s.tr}>
                              <Text style={[s.td, s.colVariety]} />
                              <Text style={[s.th, s.colLength]}>Head size</Text>
                              <Text style={[s.td, s.colNum]} />
                              <Text style={[s.td, s.colNum]} />
                              <Text style={[s.td, s.colNum]} />
                            </View>
                          )}
                          {v.headSizes.map((hs) => (
                            <View key={`${gKey}/var:${v.variety}/hs:${hs.headSize}`} style={s.tr}>
                              <Text style={[s.td, s.colVariety]} />
                              <Text style={[s.td, s.colLength]}>{hs.headSize}</Text>
                              <Text style={[s.td, s.colNum, s.right]}>{fmt(hs.harvested)}</Text>
                              <Text style={[s.td, s.colNum]} />
                              <Text style={[s.td, s.colNum]} />
                            </View>
                          ))}
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              );
            })}
            <View style={s.totalRow}>
              <Text style={s.totalLabel}>Total harvested</Text>
              <Text style={s.totalStems}>{fmt(report.totalStems)} stems</Text>
            </View>
            <View style={s.subTotalRow}>
              <Text style={s.totalLabel}>Total received</Text>
              <Text style={s.totalStems}>{fmt(report.receivedTotalStems)} stems</Text>
            </View>
            <View style={s.subTotalRow}>
              <Text style={s.totalLabel}>Variance</Text>
              <Text
                style={[
                  s.totalStems,
                  report.receivedTotalStems - report.totalStems < 0 ? s.neg : report.receivedTotalStems - report.totalStems > 0 ? s.pos : null,
                ]}
              >
                {varianceText({ harvested: report.totalStems, received: report.receivedTotalStems })} stems
              </Text>
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
  farmRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  farmName: { flex: 1, fontFamily: fontFamily.semiBold, fontSize: fontSize.md, color: colors.text },
  farmStems: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: colors.text },

  // Table
  table: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
    marginTop: spacing.xs,
  },
  tr: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  thead: { backgroundColor: colors.surfaceAlt, borderTopWidth: 0 },
  th: { fontFamily: fontFamily.semiBold, fontSize: fontSize.xs, color: colors.textMuted },
  varHead: { backgroundColor: colors.surfaceAlt },
  td: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.textSecondary },
  tdVariety: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: colors.text },
  colVariety: { flex: 1.4 },
  colLength: { flex: 1 },
  colNum: { width: 56 },
  pos: { color: colors.success },
  neg: { color: colors.danger },
  right: { textAlign: 'right' },

  totalRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.md, paddingTop: spacing.sm, borderTopWidth: 2, borderTopColor: colors.border },
  subTotalRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.xs },
  totalLabel: { fontFamily: fontFamily.bold, fontSize: fontSize.md, color: colors.text },
  totalStems: { fontFamily: fontFamily.bold, fontSize: fontSize.md, color: colors.primary },
});
