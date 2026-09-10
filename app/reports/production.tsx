import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Card, Alert } from '@/src/components/Card';
import { Dropdown } from '@/src/components/Dropdown';
import { Segmented } from '@/src/components/Segmented';
import { Spinner } from '@/src/components/Spinner';
import { DateSelector } from '@/src/components/DateSelector';
import { useToast } from '@/src/components/Toast';
import { borderRadius, colors, fontFamily, fontSize, spacing } from '@/src/theme';
import { useReportsStore } from '@/src/stores/reportsStore';
import { cropCycleApi, type PickerOption } from '@/src/services/crop-cycle';
import type { VarietyRow } from '@/src/services/reports';

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
  const [mode, setMode] = useState<'harvested' | 'received'>('harvested');
  const [groupBy, setGroupBy] = useState<'farm' | 'greenhouse'>('farm');

  useEffect(() => {
    cropCycleApi.listFarms().then(setFarms).catch(() => {});
  }, []);
  useEffect(() => {
    load();
  }, [date, farm, load]);
  useEffect(() => {
    if (error) showError(error);
  }, [error, showError]);

  const toggle = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const fmt = (n: number) => n.toLocaleString();
  const activeTotal = report ? (mode === 'harvested' ? report.totalStems : report.receivedTotalStems) : 0;
  // Farm and greenhouse rows carry the same shape (stems + varieties), just
  // under a different label field -- normalize to one shape so the drill-down
  // below doesn't need to branch on groupBy at all.
  const activeGroups: Array<{ key: string; label: string; stems: number; varieties: VarietyRow[] }> = report
    ? (groupBy === 'farm'
        ? (mode === 'harvested' ? report.farms : report.receivedFarms).map((f) => ({
            key: f.farm, label: f.farm, stems: f.stems, varieties: f.varieties,
          }))
        : (mode === 'harvested' ? report.greenhouses : report.receivedGreenhouses).map((g) => ({
            key: g.greenhouse, label: g.greenhouse, stems: g.stems, varieties: g.varieties,
          })))
    : [];
  const isEmpty = !loading && report != null && activeGroups.length === 0;

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

        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { value: 'harvested', label: 'Harvested' },
            { value: 'received', label: 'Received' },
          ]}
        />

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
              No {mode === 'harvested' ? 'harvest' : 'receiving'} recorded for this date.
            </Alert>
          </Card>
        ) : report ? (
          <Card>
            {activeGroups.map((g, gi) => {
              const gKey = `${mode}/${groupBy}:${g.key}`;
              const gOpen = !collapsed.has(gKey);
              return (
                <View key={gKey} style={gi > 0 ? { marginTop: spacing.lg } : undefined}>
                  <Pressable style={s.farmRow} onPress={() => toggle(gKey)}>
                    <Ionicons name={gOpen ? 'chevron-down' : 'chevron-forward'} size={16} color={colors.text} />
                    <Text style={s.farmName}>{g.label}</Text>
                    <Text style={s.farmStems}>{fmt(g.stems)} stems</Text>
                  </Pressable>

                  {gOpen && (
                    <View style={s.table}>
                      <View style={[s.tr, s.thead]}>
                        <Text style={[s.th, s.colVariety]}>Variety</Text>
                        <Text style={[s.th, s.colLength]}>Length</Text>
                        <Text style={[s.th, s.colStems, s.right]}>Stems</Text>
                      </View>
                      {g.varieties.map((v) => (
                        <View key={`${gKey}/var:${v.variety}`}>
                          <View style={[s.tr, s.varHead]}>
                            <Text style={[s.tdVariety, s.colVariety]}>{v.variety}</Text>
                            <Text style={[s.td, s.colLength]} />
                            <Text style={[s.tdVariety, s.colStems, s.right]}>{fmt(v.stems)}</Text>
                          </View>
                          {v.stemLengths.map((sl) => (
                            <View key={`${gKey}/var:${v.variety}/sl:${sl.stemLength}`} style={s.tr}>
                              <Text style={[s.td, s.colVariety]} />
                              <Text style={[s.td, s.colLength]}>{sl.stemLength}</Text>
                              <Text style={[s.td, s.colStems, s.right]}>{fmt(sl.stems)}</Text>
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
              <Text style={s.totalLabel}>{mode === 'harvested' ? 'Total harvested' : 'Total received'}</Text>
              <Text style={s.totalStems}>{fmt(activeTotal)} stems</Text>
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
  colStems: { width: 72 },
  right: { textAlign: 'right' },

  totalRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.md, paddingTop: spacing.sm, borderTopWidth: 2, borderTopColor: colors.border },
  totalLabel: { fontFamily: fontFamily.bold, fontSize: fontSize.md, color: colors.text },
  totalStems: { fontFamily: fontFamily.bold, fontSize: fontSize.md, color: colors.primary },
});
