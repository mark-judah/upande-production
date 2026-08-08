import React, { useEffect, useState } from 'react';
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
                  {fOpen &&
                    f.varieties.map((v) => {
                      const vKey = `${fKey}/var:${v.variety}`;
                      const vOpen = !collapsed.has(vKey);
                      return (
                        <View key={vKey}>
                          <Pressable style={s.varRow} onPress={() => toggle(vKey)}>
                            <Ionicons name={vOpen ? 'chevron-down' : 'chevron-forward'} size={14} color={colors.textSecondary} />
                            <Text style={s.varName}>{v.variety}</Text>
                            <Text style={s.varStems}>{fmt(v.stems)}</Text>
                          </Pressable>
                          {vOpen &&
                            v.stemLengths.map((sl) => (
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
