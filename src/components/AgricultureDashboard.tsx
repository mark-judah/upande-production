import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { borderRadius, colors, fontFamily, fontSize, spacing } from '@/src/theme';
import { useDashboardStore } from '@/src/stores/dashboardStore';
import { useNetworkStore } from '@/src/stores/networkStore';
import { AgricultureDashboardSkeleton } from '@/src/components/Skeleton';
import { dashboardApi, type DashboardGreenhouse, type GreenhouseVarietyRow } from '@/src/services/dashboard';

function formatAging(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

/**
 * Home-tab dashboard — today's harvested-vs-received picture, styled to the
 * same bar as mona-shelve's DashboardScreen: a dark hero, dark saturated
 * bento tiles for the volume metrics, an amber reconciliation card for the
 * headline variance, and compact greenhouse rows with an arrow-pair
 * (harvested → received) and a proportion bar.
 *
 * The two dark bento tiles and the reject tile's "active" tone are literal
 * dark shades, not new per-feature accent colours — Received/Good Stems use
 * the app's own near-black neutral (colors.primary's family) at two depths,
 * and the reject tile only ever darkens the shared `error` status hue. The
 * amber variance card, quarantine banner, and greenhouse bar all use the
 * shared success/warning/error tokens from theme.ts, same as elsewhere in
 * the app — nothing here introduces a new hue.
 */

const HERO_BG = '#052E16';
const HERO_ACCENT = '#0A4A22';
const DARK_RECEIVED = '#171717';
const DARK_GOOD = '#1C1917';
const DARK_REJECT_ACTIVE = '#3B0A0A';

function formatToday(): string {
  const d = new Date();
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]}`;
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

  const fade = useRef(new Animated.Value(0)).current;
  const showSkeleton = loading && !data;
  const [missingFor, setMissingFor] = useState<{ ghLabel: string; row: GreenhouseVarietyRow } | null>(null);

  useEffect(() => {
    if (showSkeleton) {
      fade.setValue(0);
    } else {
      Animated.timing(fade, { toValue: 1, duration: 280, useNativeDriver: true }).start();
    }
  }, [showSkeleton, fade]);

  const farmGroups = useMemo(() => groupByFarm(data?.greenhouseData ?? []), [data]);
  const topVarieties = useMemo(
    () => (data?.topVarieties ?? []).filter((v) => v.harvested > 0).slice(0, 8),
    [data],
  );

  if (showSkeleton) {
    return <AgricultureDashboardSkeleton />;
  }

  const kpi = data?.kpi;
  const rejects = (kpi?.quarantineRejects ?? 0) + (kpi?.packhouseRejects ?? 0);
  const hasRejects = rejects > 0;
  const difference = (kpi?.received ?? 0) - (kpi?.harvested ?? 0);
  const differencePct = kpi?.harvested ? Math.round((difference / kpi.harvested) * 100) : 0;
  const isEmpty = !loading && data && kpi?.harvested === 0 && farmGroups.length === 0;
  const greenhouseCount = farmGroups.reduce((n, f) => n + f.greenhouses.length, 0);

  return (
    <Animated.View style={{ opacity: fade }}>
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
        <Text style={s.heroNumber} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5}>
          {(kpi?.harvested ?? 0).toLocaleString()}
        </Text>
        <Text style={s.heroUnit}>stems · {greenhouseCount} {greenhouseCount === 1 ? 'greenhouse' : 'greenhouses'} picked</Text>
        <Ionicons name="leaf" size={72} color="rgba(255,255,255,0.06)" style={s.heroIcon} />
      </Pressable>

      {/* Received + Good stems — dark volume tiles */}
      <View style={s.row}>
        <View style={[s.tile, { backgroundColor: DARK_RECEIVED }]}>
          <Text style={s.tileChip}>RECEIVED</Text>
          <Text style={s.tileNumber} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5}>
            {(kpi?.received ?? 0).toLocaleString()}
          </Text>
          <Text style={s.tileUnit}>stems</Text>
        </View>
        <View style={[s.tile, { backgroundColor: DARK_GOOD }]}>
          <Text style={s.tileChip}>GOOD STEMS</Text>
          <Text style={s.tileNumber} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5}>
            {(kpi?.goodStems ?? 0).toLocaleString()}
          </Text>
          <Text style={s.tileUnit}>stems</Text>
        </View>
      </View>

      {/* Rejects — dark, turns to a dark red only when there's something in it */}
      <View style={[s.rejectTile, hasRejects && s.rejectTileActive]}>
        <View style={s.rejectTileLeft}>
          <Text style={[s.tileChip, hasRejects && { color: '#FECACA' }]}>REJECTS</Text>
          <Text
            style={[s.rejectNumber, hasRejects ? { color: '#FCA5A5' } : { color: colors.textMuted }]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.5}
          >
            {rejects.toLocaleString()}
          </Text>
          <Text style={[s.tileUnit, hasRejects && { color: '#FCA5A5' }]}>stems today</Text>
        </View>
        {hasRejects ? (
          <View style={s.rejectBreakdown}>
            <View style={s.rejectBreakdownRow}>
              <Text style={s.rejectBreakdownLabel}>Quarantine</Text>
              <Text style={s.rejectBreakdownValue}>{(kpi?.quarantineRejects ?? 0).toLocaleString()}</Text>
            </View>
            <View style={s.rejectBreakdownRow}>
              <Text style={s.rejectBreakdownLabel}>Packhouse</Text>
              <Text style={s.rejectBreakdownValue}>{(kpi?.packhouseRejects ?? 0).toLocaleString()}</Text>
            </View>
          </View>
        ) : null}
      </View>

      {/* Quarantine pending — slim banner, only when there's something waiting */}
      {(kpi?.quarantinePending ?? 0) > 0 ? (
        <View style={s.pendingBanner}>
          <Ionicons name="time-outline" size={15} color="#92400E" />
          <Text style={s.pendingText}>
            <Text style={s.pendingNum}>{(kpi!.quarantinePending).toLocaleString()}</Text> stems pending quarantine review
          </Text>
        </View>
      ) : null}

      {/* Variance card — the harvested-vs-received reconciliation */}
      <View style={s.varianceCard}>
        <Text style={s.varianceLabel}>HARVESTED VS RECEIVED</Text>
        <View style={s.varianceBody}>
          <View style={s.varianceStat}>
            <Text style={s.varianceStatLabel}>Harvested</Text>
            <Text style={s.varianceStatNum} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
              {(kpi?.harvested ?? 0).toLocaleString()}
            </Text>
            <Text style={s.varianceStatUnit}>stems</Text>
          </View>
          <View style={s.varianceDivider} />
          <View style={s.varianceStat}>
            <Text style={s.varianceStatLabel}>Received</Text>
            <Text style={s.varianceStatNum} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
              {(kpi?.received ?? 0).toLocaleString()}
            </Text>
            <Text style={s.varianceStatUnit}>stems</Text>
          </View>
          <View style={s.varianceDivider} />
          <View style={s.varianceStat}>
            <Text style={s.varianceStatLabel}>Difference</Text>
            <Text
              style={[s.varianceStatNum, difference >= 0 ? s.deltaPos : s.deltaNeg]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.6}
            >
              {difference > 0 ? '+' : ''}{difference.toLocaleString()}
            </Text>
            <Text style={[s.varianceStatUnit, difference >= 0 ? s.deltaPos : s.deltaNeg]}>
              {differencePct > 0 ? '+' : ''}{differencePct}%
            </Text>
          </View>
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
            <View key={f.farm}>
              {farmGroups.length > 1 ? <Text style={s.farmLabel}>{f.farm}</Text> : null}
              {f.greenhouses.map((g) => (
                <GreenhouseRow
                  key={g.greenhouse}
                  g={g}
                  onShowMissing={(row) => setMissingFor({ ghLabel: g.greenhouseName, row })}
                />
              ))}
            </View>
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
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.actionsRow}>
          <ActionChip icon="cut-outline" label="Harvesting" onPress={() => router.push('/harvesting' as any)} />
          <ActionChip icon="bar-chart-outline" label="Production report" onPress={() => router.push('/reports/production' as any)} />
          <ActionChip icon="cube-outline" label="Bucket status" onPress={() => router.push('/bucket-status' as any)} />
          <ActionChip icon="warning-outline" label="Field rejects" onPress={() => router.push('/field-rejects' as any)} />
          <ActionChip icon="leaf-outline" label="Crop cycle" onPress={() => router.push('/crop-cycle' as any)} />
        </ScrollView>
      </View>

      <MissingBucketsSheet
        greenhouseLabel={missingFor?.ghLabel ?? ''}
        row={missingFor?.row ?? null}
        onClose={() => setMissingFor(null)}
      />
    </Animated.View>
  );
}

function GreenhouseRow({
  g,
  onShowMissing,
}: {
  g: DashboardGreenhouse;
  onShowMissing: (row: GreenhouseVarietyRow) => void;
}) {
  const ratio = g.harvested > 0 ? Math.min(1, g.received / g.harvested) : 0;
  const ratioPct = Math.round(ratio * 100);
  const complete = g.harvested > 0 && g.received >= g.harvested;

  const [open, setOpen] = useState(false);
  const [varieties, setVarieties] = useState<GreenhouseVarietyRow[] | null>(null);
  const [loadingVarieties, setLoadingVarieties] = useState(false);

  const toggle = () => {
    setOpen((prev) => !prev);
    if (varieties === null) {
      setLoadingVarieties(true);
      dashboardApi
        .fetchGreenhouseBreakdown(g.greenhouse)
        .then(setVarieties)
        .catch(() => setVarieties([]))
        .finally(() => setLoadingVarieties(false));
    }
  };

  return (
    <View style={s.ghRowCard}>
      <Pressable onPress={toggle} style={({ pressed }) => pressed && { opacity: 0.85 }}>
        <View style={s.ghRowMain}>
          <View style={s.ghRowLeft}>
            <Text style={s.ghRowName} numberOfLines={1}>{g.greenhouseName}</Text>
            <View style={s.ghRowMetaLine}>
              {g.budget > 0 ? <Text style={s.ghRowMeta}>{g.budgetAchievementPct}% of budget</Text> : null}
              {g.totalRejects > 0 ? (
                <Text style={s.ghRowRejText}>{g.budget > 0 ? ' · ' : ''}{g.totalRejects.toLocaleString()} rej</Text>
              ) : null}
            </View>
          </View>
          <View style={s.ghRowRight}>
            <View style={s.ghRowPair}>
              <Text style={s.ghRowNum} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                {g.harvested.toLocaleString()}
              </Text>
              <Text style={s.ghRowArrow}>→</Text>
              <Text
                style={[s.ghRowNum, g.received === 0 && s.ghRowNumMuted, complete && s.ghRowNumGood]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.7}
              >
                {g.received.toLocaleString()}
              </Text>
            </View>
            <Text style={s.ghRowRatio}>{g.harvested > 0 ? `${ratioPct}% received` : '—'}</Text>
          </View>
          <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={14} color={colors.textMuted} style={{ marginLeft: spacing.sm }} />
        </View>
        <View style={s.ghRowBarTrack}>
          <View style={[s.ghRowBarFill, complete && s.ghRowBarFillFull, { width: `${ratioPct}%` }]} />
        </View>
      </Pressable>

      {open ? (
        loadingVarieties ? (
          <View style={s.varietyLoading}>
            <ActivityIndicator size="small" color={colors.textMuted} />
          </View>
        ) : varieties && varieties.length > 0 ? (
          <View style={s.varietyList}>
            {varieties.map((v) => {
              const hasMissing = v.missingBuckets.length > 0;
              return (
                <Pressable
                  key={v.variety}
                  style={({ pressed }) => [s.varietyRow, pressed && hasMissing && { opacity: 0.6 }]}
                  disabled={!hasMissing}
                  delayLongPress={400}
                  onLongPress={() => hasMissing && onShowMissing(v)}
                >
                  <Text style={s.varietyRowName} numberOfLines={1}>{v.variety}</Text>
                  <View style={s.varietyRowPair}>
                    <Text style={s.varietyRowNum}>{v.harvested.toLocaleString()}</Text>
                    <Text style={s.ghRowArrow}>→</Text>
                    <Text style={[s.varietyRowNum, v.received === 0 && s.ghRowNumMuted]}>
                      {v.received.toLocaleString()}
                    </Text>
                    {hasMissing ? <Text style={s.varietyRowWarn}>({v.variance.toLocaleString()})</Text> : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
        ) : (
          <Text style={s.varietyEmpty}>No variety detail for today.</Text>
        )
      ) : null}
    </View>
  );
}

function MissingBucketsSheet({
  greenhouseLabel,
  row,
  onClose,
}: {
  greenhouseLabel: string;
  row: GreenhouseVarietyRow | null;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  if (!row) return null;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.modalOverlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[s.modalSheet, { paddingBottom: insets.bottom + spacing.md }]}>
          <View style={s.modalHeader}>
            <View style={{ flex: 1 }}>
              <Text style={s.modalTitle}>Missing buckets</Text>
              <Text style={s.modalSubtitle} numberOfLines={1}>{greenhouseLabel} · {row.variety}</Text>
            </View>
            <Pressable onPress={onClose} style={s.modalCloseBtn} hitSlop={8}>
              <Ionicons name="close" size={20} color={colors.textSecondary} />
            </Pressable>
          </View>
          {row.missingBuckets.length === 0 ? (
            <Text style={s.varietyEmpty}>Fully reconciled — nothing missing.</Text>
          ) : (
            row.missingBuckets.map((b) => (
              <View key={b.bucketId} style={s.missingRow}>
                <Text style={s.missingBucketId} numberOfLines={1}>{b.bucketId}</Text>
                <Text style={s.missingQty}>{b.variance.toLocaleString()} stems</Text>
                <Text style={s.missingAging}>{formatAging(b.agingMinutes)}</Text>
              </View>
            ))
          )}
        </View>
      </View>
    </Modal>
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
    borderRadius: 24,
    padding: spacing.xl,
    marginBottom: spacing.sm,
    overflow: 'hidden',
    minHeight: 160,
  },
  heroBubble: {
    position: 'absolute', width: 200, height: 200, borderRadius: 100,
    backgroundColor: HERO_ACCENT, bottom: -60, right: -40,
  },
  heroChip: {
    fontFamily: fontFamily.medium, fontSize: fontSize.xs,
    color: 'rgba(255,255,255,0.55)', letterSpacing: 1.2, marginBottom: spacing.sm,
  },
  heroNumber: { fontFamily: fontFamily.bold, fontSize: 52, color: '#FFFFFF', lineHeight: 56 },
  heroUnit: { fontFamily: fontFamily.regular, fontSize: fontSize.md, color: 'rgba(255,255,255,0.6)', marginTop: 4 },
  heroIcon: { position: 'absolute', bottom: spacing.lg, right: spacing.xl },

  row: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  tile: {
    flex: 1, borderRadius: 20, padding: spacing.lg,
    minHeight: 110, justifyContent: 'flex-end',
  },
  tileChip: {
    fontFamily: fontFamily.medium, fontSize: 10,
    color: 'rgba(255,255,255,0.5)', letterSpacing: 1, marginBottom: spacing.xs,
  },
  tileNumber: { fontFamily: fontFamily.bold, fontSize: 34, color: '#FFFFFF', lineHeight: 38 },
  tileUnit: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: 'rgba(255,255,255,0.5)', marginTop: 2 },

  rejectTile: {
    backgroundColor: DARK_GOOD, borderRadius: 20, padding: spacing.lg, marginBottom: spacing.sm,
    flexDirection: 'row', alignItems: 'flex-start', gap: spacing.lg,
  },
  rejectTileActive: { backgroundColor: DARK_REJECT_ACTIVE },
  rejectTileLeft: { flex: 1 },
  rejectNumber: { fontFamily: fontFamily.bold, fontSize: 36, lineHeight: 40 },
  rejectBreakdown: { justifyContent: 'center', gap: spacing.xs, paddingTop: 6 },
  rejectBreakdownRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    justifyContent: 'space-between', minWidth: 110,
  },
  rejectBreakdownLabel: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: 'rgba(255,255,255,0.45)' },
  rejectBreakdownValue: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: '#FCA5A5' },

  pendingBanner: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A',
    borderRadius: borderRadius.md, padding: spacing.md, marginBottom: spacing.sm,
  },
  pendingText: { flex: 1, fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: '#92400E' },
  pendingNum: { fontFamily: fontFamily.bold },

  varianceCard: {
    backgroundColor: '#FFFBEB', borderRadius: 20, padding: spacing.lg,
    marginBottom: spacing.sm, borderWidth: 1, borderColor: '#FDE68A',
  },
  varianceLabel: { fontFamily: fontFamily.medium, fontSize: 10, color: '#92400E', letterSpacing: 1.2 },
  varianceBody: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', marginTop: spacing.md },
  varianceStat: { alignItems: 'center', flex: 1 },
  varianceDivider: { width: 1, height: 40, backgroundColor: '#FDE68A' },
  varianceStatLabel: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: '#92400E', marginBottom: 4 },
  varianceStatNum: { fontFamily: fontFamily.bold, fontSize: fontSize.xl, color: colors.text },
  varianceStatUnit: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
  deltaPos: { color: '#16A34A' },
  deltaNeg: { color: '#DC2626' },

  varietySection: { marginTop: spacing.sm, marginBottom: spacing.sm },
  varietyRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  varietyChip: {
    backgroundColor: colors.surface, borderRadius: borderRadius.md,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm, minWidth: 92,
  },
  varietyChipStems: { fontFamily: fontFamily.bold, fontSize: fontSize.md, color: colors.text },
  varietyChipName: { fontFamily: fontFamily.regular, fontSize: 10, color: colors.textMuted, marginTop: 1, maxWidth: 100 },

  farmSection: { marginTop: spacing.md, marginBottom: spacing.sm },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between',
    marginBottom: spacing.sm, paddingHorizontal: 2,
  },
  sectionLabel: { fontFamily: fontFamily.semiBold, fontSize: 10, color: colors.textMuted, letterSpacing: 1.4 },
  sectionCount: { fontFamily: fontFamily.medium, fontSize: 10, color: colors.textMuted },
  farmLabel: {
    fontFamily: fontFamily.semiBold, fontSize: fontSize.xs, color: colors.textSecondary,
    marginTop: spacing.sm, marginBottom: spacing.xs, paddingHorizontal: 2,
  },

  ghRowCard: {
    backgroundColor: colors.surface, borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
    paddingHorizontal: spacing.md, paddingTop: spacing.sm + 2, paddingBottom: 0,
    marginBottom: spacing.xs + 2, overflow: 'hidden',
  },
  ghRowMain: { flexDirection: 'row', alignItems: 'center', paddingBottom: spacing.sm },
  ghRowLeft: { flex: 1, paddingRight: spacing.sm },
  ghRowName: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: colors.text },
  ghRowMetaLine: { flexDirection: 'row', alignItems: 'center', marginTop: 1 },
  ghRowMeta: { fontFamily: fontFamily.regular, fontSize: 10, color: colors.textMuted },
  ghRowRejText: { fontFamily: fontFamily.medium, fontSize: 10, color: '#DC2626' },
  ghRowRight: { alignItems: 'flex-end' },
  ghRowPair: { flexDirection: 'row', alignItems: 'baseline' },
  ghRowNum: { fontFamily: fontFamily.bold, fontSize: 17, color: colors.text, minWidth: 36, textAlign: 'right' },
  ghRowNumMuted: { color: colors.textMuted, fontFamily: fontFamily.regular },
  ghRowNumGood: { color: '#15803D' },
  ghRowArrow: { fontFamily: fontFamily.regular, fontSize: 12, color: colors.textMuted, marginHorizontal: 6 },
  ghRowRatio: {
    fontFamily: fontFamily.medium, fontSize: 9, color: colors.textMuted,
    letterSpacing: 0.6, marginTop: 1, textTransform: 'uppercase',
  },
  ghRowBarTrack: { height: 3, backgroundColor: colors.background, marginHorizontal: -spacing.md },
  ghRowBarFill: { height: '100%', backgroundColor: '#22C55E' },
  ghRowBarFillFull: { backgroundColor: '#15803D' },

  varietyLoading: { paddingVertical: spacing.md, alignItems: 'center' },
  varietyList: { paddingTop: spacing.xs, paddingBottom: spacing.sm },
  varietyRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: spacing.xs + 2,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border,
  },
  varietyRowName: { flex: 1, fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textSecondary },
  varietyRowPair: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  varietyRowNum: { fontFamily: fontFamily.semiBold, fontSize: fontSize.xs, color: colors.text },
  varietyRowWarn: { fontFamily: fontFamily.medium, fontSize: 10, color: '#DC2626', marginLeft: 2 },
  varietyEmpty: {
    fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textMuted,
    paddingVertical: spacing.sm,
  },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: spacing.lg, paddingTop: spacing.lg, maxHeight: '80%',
  },
  modalHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md },
  modalTitle: { fontFamily: fontFamily.bold, fontSize: fontSize.lg, color: colors.text },
  modalSubtitle: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.textSecondary, marginTop: 2 },
  modalCloseBtn: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: colors.surfaceAlt,
    justifyContent: 'center', alignItems: 'center',
  },

  missingRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
  },
  missingBucketId: { flex: 1, fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: colors.text },
  missingQty: { fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: '#DC2626' },
  missingAging: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textMuted, minWidth: 48, textAlign: 'right' },

  emptyCard: {
    alignItems: 'center', backgroundColor: colors.surface, borderRadius: 20,
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
  actionsRow: { gap: spacing.sm, paddingBottom: 4 },
  actionChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.surface, borderRadius: borderRadius.full,
    borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
  },
  actionChipLabel: { fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: colors.text },
});
