import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { borderRadius, colors, fontFamily, fontSize, spacing } from '@/src/theme';
import { useDashboardStore } from '@/src/stores/dashboardStore';
import { useNetworkStore } from '@/src/stores/networkStore';
import type { DashboardGreenhouse } from '@/src/services/dashboard';

/**
 * Home-tab dashboard — today's harvested-vs-received picture, the numbers a
 * supervisor actually checks first. Backed by the live `get_production_
 * dashboard_data` Server Script on Kaitet (src/services/dashboard.ts).
 *
 * Deliberately NOT a crop-cycle summary — planting/bed data has its own home
 * on the Crop Cycle tab. This screen is what was picked, what made it to the
 * cold store, and what's still out in the greenhouse.
 */

function formatToday(): string {
  const d = new Date();
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]}`;
}

function formatAging(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

interface FarmGroup {
  farm: string;
  harvested: number;
  received: number;
  variance: number;
  greenhouses: DashboardGreenhouse[];
}

function groupByFarm(rows: DashboardGreenhouse[]): FarmGroup[] {
  const farms = new Map<string, FarmGroup>();
  for (const g of rows) {
    const key = g.farm || 'Unassigned';
    let f = farms.get(key);
    if (!f) {
      f = { farm: key, harvested: 0, received: 0, variance: 0, greenhouses: [] };
      farms.set(key, f);
    }
    f.harvested += g.harvested;
    f.received += g.received;
    f.variance += g.variance;
    f.greenhouses.push(g);
  }
  return Array.from(farms.values())
    .map((f) => ({ ...f, greenhouses: f.greenhouses.sort((a, b) => b.harvested - a.harvested) }))
    .sort((a, b) => b.harvested - a.harvested);
}

export function AgricultureDashboard() {
  const router = useRouter();
  const data = useDashboardStore((s) => s.data);
  const loading = useDashboardStore((s) => s.loading);
  const error = useDashboardStore((s) => s.error);
  const online = useNetworkStore((s) => s.online);

  const farmGroups = useMemo(() => groupByFarm(data?.greenhouseData ?? []), [data]);

  const agingByGreenhouse = useMemo(() => {
    const map = new Map<string, number>();
    for (const f of data?.unreceived.tree ?? []) {
      for (const g of f.greenhouses) map.set(g.greenhouse, g.agingMinutes);
    }
    return map;
  }, [data]);

  const topVarieties = useMemo(
    () => (data?.topVarieties ?? []).filter((v) => v.harvested > 0).slice(0, 8),
    [data],
  );

  if (loading && !data) {
    return (
      <View style={s.hero}>
        <Text style={s.heroChip}>HARVESTED TODAY</Text>
        <View style={s.heroSkeletonNum} />
      </View>
    );
  }

  const kpi = data?.kpi;
  const rejects = (kpi?.quarantineRejects ?? 0) + (kpi?.packhouseRejects ?? 0);
  const isEmpty = !loading && data && kpi?.harvested === 0 && farmGroups.length === 0;

  return (
    <View>
      <View style={s.topRow}>
        <Text style={s.dateText}>{formatToday()}</Text>
        <View style={[s.statusPill, online ? s.pillLive : s.pillOffline]}>
          <View style={[s.statusDot, online ? s.dotLive : s.dotOffline]} />
          <Text style={[s.statusText, online ? s.statusTextLive : s.statusTextOffline]}>
            {online ? 'Live' : 'Offline'}
          </Text>
        </View>
      </View>

      {error ? (
        <View style={s.errorBanner}>
          <Ionicons name="alert-circle-outline" size={16} color="#991B1B" />
          <Text style={s.errorText}>{error}</Text>
        </View>
      ) : null}

      {/* Hero — harvested today across every greenhouse */}
      <Pressable style={s.hero} onPress={() => router.push('/reports/production' as any)}>
        <View style={s.heroBubble} />
        <Text style={s.heroChip}>HARVESTED TODAY</Text>
        <Text style={s.heroNumber}>{(kpi?.harvested ?? 0).toLocaleString()}</Text>
        <Text style={s.heroUnit}>
          {(kpi?.received ?? 0).toLocaleString()} received · {farmGroups.reduce((n, f) => n + f.greenhouses.length, 0)} greenhouses picked
        </Text>
        <Ionicons name="cut" size={64} color="rgba(255,255,255,0.07)" style={s.heroIcon} />
      </Pressable>

      {/* Bento — received / unreceived / quarantine / rejects */}
      <View style={s.bentoGrid}>
        <View style={[s.bentoTile, { backgroundColor: '#DCFCE7' }]}>
          <Text style={[s.bentoChip, { color: '#166534' }]}>RECEIVED</Text>
          <Text style={[s.bentoNumber, { color: '#166534' }]}>{(kpi?.received ?? 0).toLocaleString()}</Text>
        </View>
        <View style={[s.bentoTile, { backgroundColor: (kpi?.recvVariance ?? 0) > 0 ? '#FEF3C7' : '#DCFCE7' }]}>
          <Text style={[s.bentoChip, { color: (kpi?.recvVariance ?? 0) > 0 ? '#92400E' : '#166534' }]}>UNRECEIVED</Text>
          <Text style={[s.bentoNumber, { color: (kpi?.recvVariance ?? 0) > 0 ? '#92400E' : '#166534' }]}>
            {(kpi?.recvVariance ?? 0).toLocaleString()}
          </Text>
        </View>
        <View style={[s.bentoTile, { backgroundColor: (kpi?.quarantinePending ?? 0) > 0 ? '#FEF3C7' : colors.surfaceAlt }]}>
          <Text style={[s.bentoChip, { color: (kpi?.quarantinePending ?? 0) > 0 ? '#92400E' : colors.textMuted }]}>QUARANTINE PENDING</Text>
          <Text style={[s.bentoNumber, { color: (kpi?.quarantinePending ?? 0) > 0 ? '#92400E' : colors.text }]}>
            {(kpi?.quarantinePending ?? 0).toLocaleString()}
          </Text>
        </View>
        <View style={[s.bentoTile, { backgroundColor: rejects > 0 ? '#FEE2E2' : colors.surfaceAlt }]}>
          <Text style={[s.bentoChip, { color: rejects > 0 ? '#991B1B' : colors.textMuted }]}>REJECTS</Text>
          <Text style={[s.bentoNumber, { color: rejects > 0 ? '#991B1B' : colors.text }]}>{rejects.toLocaleString()}</Text>
        </View>
      </View>

      {/* Top varieties, today */}
      {topVarieties.length > 0 ? (
        <View style={s.varietySection}>
          <Text style={s.sectionLabel}>TOP VARIETIES TODAY</Text>
          <View style={s.varietyRow}>
            {topVarieties.map((v) => (
              <View key={v.itemCode} style={s.varietyChip}>
                <Text style={s.varietyChipStems}>{v.harvested.toLocaleString()}</Text>
                <Text style={s.varietyChipName} numberOfLines={1}>{v.itemName}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {/* Farm → greenhouse breakdown */}
      {farmGroups.length > 0 ? (
        <View style={s.farmSection}>
          <View style={s.sectionHeader}>
            <Text style={s.sectionLabel}>GREENHOUSES</Text>
            <Text style={s.sectionCount}>{farmGroups.length} {farmGroups.length === 1 ? 'farm' : 'farms'}</Text>
          </View>
          {farmGroups.map((f) => (
            <FarmCard key={f.farm} group={f} agingByGreenhouse={agingByGreenhouse} />
          ))}
        </View>
      ) : isEmpty ? (
        <View style={s.emptyCard}>
          <Ionicons name="cut-outline" size={28} color={colors.textMuted} />
          <Text style={s.emptyTitle}>Nothing harvested yet today</Text>
          <Text style={s.emptyBody}>Recorded harvests will show up here as they come in.</Text>
          <Pressable style={s.emptyCta} onPress={() => router.push('/harvesting' as any)}>
            <Ionicons name="add" size={16} color={colors.textOnPrimary} />
            <Text style={s.emptyCtaText}>Record harvest</Text>
          </Pressable>
        </View>
      ) : null}

      {/* Quick actions */}
      <View style={s.actionsWrap}>
        <Text style={s.sectionLabel}>QUICK ACTIONS</Text>
        <View style={s.actionsRow}>
          <ActionChip icon="cut-outline" label="Harvesting" onPress={() => router.push('/harvesting' as any)} />
          <ActionChip icon="bar-chart-outline" label="Production report" onPress={() => router.push('/reports/production' as any)} />
          <ActionChip icon="cube-outline" label="Bucket status" onPress={() => router.push('/bucket-status' as any)} />
          <ActionChip icon="warning-outline" label="Field rejects" onPress={() => router.push('/field-rejects' as any)} />
          <ActionChip icon="leaf-outline" label="Crop cycle" onPress={() => router.push('/crop-cycle' as any)} />
        </View>
      </View>
    </View>
  );
}

function FarmCard({
  group,
  agingByGreenhouse,
}: {
  group: FarmGroup;
  agingByGreenhouse: Map<string, number>;
}) {
  const [open, setOpen] = useState(true);
  const hasMultipleHouses = group.greenhouses.length > 1;

  return (
    <View style={s.farmCard}>
      <Pressable
        onPress={() => hasMultipleHouses && setOpen(!open)}
        style={s.farmMain}
        disabled={!hasMultipleHouses}
      >
        <View style={{ flex: 1 }}>
          <Text style={s.farmName} numberOfLines={1}>{group.farm}</Text>
          <Text style={s.farmMeta}>
            {group.greenhouses.length} {group.greenhouses.length === 1 ? 'greenhouse' : 'greenhouses'} · {group.received.toLocaleString()} received
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={s.farmPlants}>{group.harvested.toLocaleString()}</Text>
          <Text style={s.farmPlantsUnit}>harvested</Text>
        </View>
        {hasMultipleHouses ? (
          <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={14} color={colors.textMuted} style={{ marginLeft: spacing.sm }} />
        ) : null}
      </Pressable>
      {open ? (
        <View style={s.ghList}>
          {group.greenhouses.map((g) => {
            const pct = g.harvested > 0 ? Math.min(100, Math.round((g.received / g.harvested) * 100)) : 100;
            const aging = agingByGreenhouse.get(g.greenhouse);
            return (
              <View key={g.greenhouse} style={s.ghRow}>
                <View style={s.ghRowTop}>
                  <Text style={s.ghName} numberOfLines={1}>{g.greenhouseName}</Text>
                  <Text style={s.ghStat}>{g.harvested.toLocaleString()} harvested</Text>
                </View>
                <View style={s.ghBarTrack}>
                  <View style={[s.ghBarFill, { width: `${pct}%`, backgroundColor: pct < 90 ? colors.warning : colors.success }]} />
                </View>
                <View style={s.ghRowBottom}>
                  <Text style={s.ghSubStat}>{pct}% received</Text>
                  {g.variance > 0 ? (
                    <Text style={s.ghWarn}>
                      {g.variance.toLocaleString()} unreceived{aging != null ? ` · ${formatAging(aging)}` : ''}
                    </Text>
                  ) : null}
                  {g.budget > 0 ? (
                    <Text style={s.ghSubStat}>{g.budgetAchievementPct}% of budget</Text>
                  ) : null}
                </View>
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

function ActionChip({
  icon,
  label,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={({ pressed }) => [s.actionChip, pressed && { opacity: 0.7 }]} onPress={onPress}>
      <Ionicons name={icon} size={15} color={colors.text} />
      <Text style={s.actionChipLabel}>{label}</Text>
    </Pressable>
  );
}

const HERO_BG = '#14532D';
const HERO_ACCENT = '#166534';

const s = StyleSheet.create({
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  dateText: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textMuted },
  statusPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: spacing.sm, paddingVertical: 4,
    borderRadius: borderRadius.full, borderWidth: 1,
  },
  pillLive: { backgroundColor: '#DCFCE7', borderColor: '#86EFAC' },
  pillOffline: { backgroundColor: '#FEF3C7', borderColor: '#FCD34D' },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  dotLive: { backgroundColor: '#16A34A' },
  dotOffline: { backgroundColor: '#D97706' },
  statusText: { fontFamily: fontFamily.medium, fontSize: fontSize.xs },
  statusTextLive: { color: '#16A34A' },
  statusTextOffline: { color: '#D97706' },

  errorBanner: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: '#FEF2F2', borderRadius: borderRadius.md,
    padding: spacing.md, marginBottom: spacing.md,
  },
  errorText: { flex: 1, fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: '#991B1B' },

  hero: {
    backgroundColor: HERO_BG,
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    marginBottom: spacing.sm,
    overflow: 'hidden',
    minHeight: 148,
  },
  heroBubble: {
    position: 'absolute', width: 180, height: 180, borderRadius: 90,
    backgroundColor: HERO_ACCENT, bottom: -60, right: -30,
  },
  heroChip: {
    fontFamily: fontFamily.medium, fontSize: fontSize.xs,
    color: 'rgba(255,255,255,0.55)', letterSpacing: 1.2, marginBottom: spacing.sm,
  },
  heroNumber: { fontFamily: fontFamily.bold, fontSize: 44, color: '#FFFFFF', lineHeight: 48 },
  heroUnit: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: 'rgba(255,255,255,0.6)', marginTop: 4 },
  heroIcon: { position: 'absolute', bottom: spacing.lg, right: spacing.xl },
  heroSkeletonNum: { width: 140, height: 40, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.12)', marginTop: 4 },

  bentoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.sm },
  bentoTile: {
    flexBasis: '48%',
    flexGrow: 1,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
  },
  bentoChip: {
    fontFamily: fontFamily.medium, fontSize: 10,
    letterSpacing: 1, marginBottom: spacing.xs,
  },
  bentoNumber: { fontFamily: fontFamily.bold, fontSize: 24, lineHeight: 28 },

  varietySection: { marginTop: spacing.sm, marginBottom: spacing.sm },
  varietyRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  varietyChip: {
    backgroundColor: colors.surface, borderRadius: borderRadius.md,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    minWidth: 92,
  },
  varietyChipStems: { fontFamily: fontFamily.bold, fontSize: fontSize.md, color: colors.text },
  varietyChipName: { fontFamily: fontFamily.regular, fontSize: 10, color: colors.textMuted, marginTop: 1, maxWidth: 100 },

  farmSection: { marginTop: spacing.sm, marginBottom: spacing.sm },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between',
    marginBottom: spacing.sm, paddingHorizontal: 2,
  },
  sectionLabel: { fontFamily: fontFamily.semiBold, fontSize: 10, color: colors.textMuted, letterSpacing: 1.4 },
  sectionCount: { fontFamily: fontFamily.medium, fontSize: 10, color: colors.textMuted },

  farmCard: {
    backgroundColor: colors.surface, borderRadius: borderRadius.md,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
    paddingHorizontal: spacing.md, paddingTop: spacing.sm + 2, paddingBottom: spacing.xs,
    marginBottom: spacing.xs + 2, overflow: 'hidden',
  },
  farmMain: { flexDirection: 'row', alignItems: 'center', paddingBottom: spacing.sm },
  farmName: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: colors.text },
  farmMeta: { fontFamily: fontFamily.regular, fontSize: 10, color: colors.textMuted, marginTop: 1 },
  farmPlants: { fontFamily: fontFamily.bold, fontSize: fontSize.md, color: colors.text },
  farmPlantsUnit: { fontFamily: fontFamily.regular, fontSize: 10, color: colors.textMuted, marginTop: 1 },
  ghList: { paddingTop: spacing.xs, gap: spacing.sm },
  ghRow: { paddingVertical: spacing.xs },
  ghRowTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  ghName: { flex: 1, fontFamily: fontFamily.medium, fontSize: fontSize.xs, color: colors.textSecondary },
  ghStat: { fontFamily: fontFamily.semiBold, fontSize: fontSize.xs, color: colors.text },
  ghBarTrack: { height: 4, borderRadius: 2, backgroundColor: colors.background, overflow: 'hidden' },
  ghBarFill: { height: '100%', borderRadius: 2 },
  ghRowBottom: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  ghSubStat: { fontFamily: fontFamily.regular, fontSize: 10, color: colors.textMuted },
  ghWarn: { fontFamily: fontFamily.medium, fontSize: 10, color: colors.warning },

  emptyCard: {
    alignItems: 'center', backgroundColor: colors.surface, borderRadius: borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
    padding: spacing.xl, marginBottom: spacing.sm, gap: spacing.xs,
  },
  emptyTitle: { fontFamily: fontFamily.semiBold, fontSize: fontSize.md, color: colors.text, marginTop: spacing.xs },
  emptyBody: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.textMuted, textAlign: 'center' },
  emptyCta: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.primary, borderRadius: borderRadius.full,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, marginTop: spacing.sm,
  },
  emptyCtaText: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: colors.textOnPrimary },

  actionsWrap: { marginTop: spacing.sm },
  actionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  actionChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.surface, borderRadius: borderRadius.full,
    borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
  },
  actionChipLabel: { fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: colors.text },
});
