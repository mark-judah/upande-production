import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { borderRadius, colors, fontFamily, fontSize, spacing } from '@/src/theme';

const REPORTS = [
  {
    key: 'production',
    route: '/reports/production',
    label: 'Production',
    icon: 'cut-outline' as const,
    hint: 'Harvest by farm, variety, stem length',
  },
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
            <View style={s.tileIcon}>
              <Ionicons name={r.icon} size={22} color={colors.text} />
            </View>
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
