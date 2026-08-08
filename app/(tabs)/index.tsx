import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '@/src/components/Card';
import { borderRadius, colors, fontFamily, fontSize, spacing } from '@/src/theme';
import { useAuthStore } from '@/src/stores/authStore';

interface FeatureItem {
  key: string;
  route: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  hint: string;
}

const FEATURES: FeatureItem[] = [
  { key: 'crop-cycle',       route: '/crop-cycle',       label: 'Crop Cycle',         icon: 'leaf-outline',          hint: 'Planting, uprooting, replanting' },
  { key: 'harvesting',       route: '/harvesting',       label: 'Harvesting',         icon: 'cut-outline',           hint: 'Daily harvest entry' },
  { key: 'propagation',      route: '/propagation',      label: 'Propagation',        icon: 'sparkles-outline',      hint: 'Batches, mortality, seedling requests' },
  { key: 'greenhouse-ops',   route: '/greenhouse-ops',   label: 'Greenhouse Ops',     icon: 'shield-checkmark-outline', hint: 'Scouting, integrity inspection' },
  { key: 'trials',           route: '/trials',           label: 'Trials',             icon: 'flask-outline',         hint: 'Scouting, harvest, vase life' },
  { key: 'forecasting',      route: '/forecasting',      label: 'Forecasting',        icon: 'trending-up-outline',   hint: 'Production projection vs actual' },
  { key: 'field-rejects',    route: '/field-rejects',    label: 'Field Rejects',      icon: 'warning-outline',       hint: 'Quality control on the field' },
  { key: 'greenhouse-specs', route: '/greenhouse-specs', label: 'Greenhouse Specs',   icon: 'home-outline',          hint: 'Bed, bay, variety lookup' },
  { key: 'reports',          route: '/reports',          label: 'Reports',            icon: 'bar-chart-outline',     hint: 'Production harvest breakdown' },
];

export default function HomeScreen() {
  const router = useRouter();
  const fullName = useAuthStore((s) => s.fullName);
  const email = useAuthStore((s) => s.email);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={s.scroll}
      showsVerticalScrollIndicator={false}
    >
      <Card>
        <Text style={s.greeting}>Welcome,</Text>
        <Text style={s.name}>{fullName || email || 'Field user'}</Text>
      </Card>

      <View style={s.grid}>
        {FEATURES.map((f) => (
          <Pressable
            key={f.key}
            onPress={() => router.push(f.route as any)}
            style={({ pressed }) => [s.tile, pressed && { opacity: 0.7 }]}
          >
            <View style={s.tileIcon}>
              <Ionicons name={f.icon} size={22} color={colors.text} />
            </View>
            <Text style={s.tileLabel}>{f.label}</Text>
            <Text style={s.tileHint} numberOfLines={2}>{f.hint}</Text>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl },
  greeting: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.textSecondary },
  name: { fontFamily: fontFamily.bold, fontSize: fontSize.lg, color: colors.text, marginTop: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.xs },
  tile: {
    flexBasis: '48%',
    flexGrow: 0,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    gap: spacing.xs,
  },
  tileIcon: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  tileLabel: { fontFamily: fontFamily.semiBold, fontSize: fontSize.md, color: colors.text },
  tileHint: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textMuted, lineHeight: 16 },
});
