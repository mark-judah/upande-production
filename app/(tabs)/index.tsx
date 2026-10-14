import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { borderRadius, colors, fontFamily, fontSize, spacing } from '@/src/theme';
import { useAuthStore } from '@/src/stores/authStore';
import { useNetworkStore } from '@/src/stores/networkStore';
import { useCropCycleStore } from '@/src/stores/cropCycleStore';
import { listWeekOptions, todayISODate, useHomeFiltersStore, type HomeFilterWeek } from '@/src/stores/homeFiltersStore';
import { useRefreshOnFocus } from '@/src/hooks/useRefreshOnFocus';
import { AgricultureDashboard } from '@/src/components/AgricultureDashboard';
import { MultiSelectField } from '@/src/components/MultiSelectField';
import { DateField } from '@/src/components/DateField';

function weekKey(w: HomeFilterWeek): string {
  return `${w.year}-${w.week}`;
}

export default function HomeScreen() {
  const fullName = useAuthStore((s) => s.fullName);
  const email = useAuthStore((s) => s.email);
  const firstName = (fullName || email || 'there').split(' ')[0];

  const initNetwork = useNetworkStore((s) => s.init);

  const farms = useCropCycleStore((s) => s.farms);
  const greenhousesAll = useCropCycleStore((s) => s.greenhouses);
  const loadPickers = useCropCycleStore((s) => s.loadPickers);

  const filtersHydrated = useHomeFiltersStore((s) => s.hydrated);
  const selFarms = useHomeFiltersStore((s) => s.farms);
  const selGreenhouses = useHomeFiltersStore((s) => s.greenhouses);
  const selDate = useHomeFiltersStore((s) => s.date);
  const selWeeks = useHomeFiltersStore((s) => s.weeks);
  const hydrateFilters = useHomeFiltersStore((s) => s.hydrate);
  const setFarms = useHomeFiltersStore((s) => s.setFarms);
  const setGreenhouses = useHomeFiltersStore((s) => s.setGreenhouses);
  const setDate = useHomeFiltersStore((s) => s.setDate);
  const setWeeks = useHomeFiltersStore((s) => s.setWeeks);
  const clearAllFilters = useHomeFiltersStore((s) => s.clearAll);
  const refreshFiltered = useHomeFiltersStore((s) => s.refresh);

  const [refreshing, setRefreshing] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const loadAll = useCallback(async () => {
    initNetwork();
    if (!useHomeFiltersStore.getState().hydrated) await hydrateFilters();
    loadPickers();
    await refreshFiltered();
  }, [initNetwork, hydrateFilters, loadPickers, refreshFiltered]);

  useRefreshOnFocus(loadAll);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadPickers(), refreshFiltered()]);
    setRefreshing(false);
  }, [loadPickers, refreshFiltered]);

  // Greenhouse options cascade to the selected farm(s) — same relationship
  // the Crop Cycle filters use (farm scopes which greenhouses are offered).
  const greenhouseOptions = useMemo(() => {
    const pool =
      selFarms.length > 0 ? greenhousesAll.filter((g) => g.farm && selFarms.includes(g.farm)) : greenhousesAll;
    return pool.map((g) => ({ value: g.name, label: g.label, sublabel: selFarms.length !== 1 ? g.farm : undefined }));
  }, [greenhousesAll, selFarms]);

  // Narrowing the farm selection can orphan a previously-picked greenhouse
  // that belongs to a now-excluded farm — drop it, mirroring Crop Cycle's
  // "picking a different farm invalidates the greenhouse choice" behaviour.
  useEffect(() => {
    // Wait for the real greenhouse list to load before policing the
    // restored selection — otherwise the empty "still loading" options list
    // would look like every previously-picked greenhouse is now invalid and
    // wipe a perfectly valid persisted selection before it's had a chance.
    if (greenhousesAll.length === 0 || selGreenhouses.length === 0) return;
    const allowed = new Set(greenhouseOptions.map((o) => o.value));
    const next = selGreenhouses.filter((g) => allowed.has(g));
    if (next.length !== selGreenhouses.length) setGreenhouses(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [greenhouseOptions, greenhousesAll.length]);

  const weekOptions = useMemo(() => listWeekOptions(), []);
  const weekOptionsByKey = useMemo(() => {
    const map = new Map<string, HomeFilterWeek>();
    weekOptions.forEach((w) => map.set(weekKey(w), { year: w.year, week: w.week }));
    return map;
  }, [weekOptions]);
  const selWeekKeys = useMemo(() => selWeeks.map(weekKey), [selWeeks]);

  const activeFilterCount =
    selFarms.length + selGreenhouses.length + selWeeks.length + (selDate ? 1 : 0);

  if (!filtersHydrated) return null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.text} />}
      >
        <View style={s.headerRow}>
          <Text style={s.greeting}>Welcome back, {firstName}</Text>
          <Pressable style={s.filterBtn} onPress={() => setFiltersOpen(true)} hitSlop={6}>
            <Ionicons name="options-outline" size={18} color={colors.text} />
            <Text style={s.filterBtnText}>Filters</Text>
            {activeFilterCount > 0 ? (
              <View style={s.filterBadge}>
                <Text style={s.filterBadgeText}>{activeFilterCount}</Text>
              </View>
            ) : null}
          </Pressable>
        </View>

        <AgricultureDashboard />
      </ScrollView>

      <FiltersModal
        visible={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        farms={farms.map((f) => ({ value: f.name, label: f.label }))}
        selFarms={selFarms}
        onFarms={setFarms}
        greenhouseOptions={greenhouseOptions}
        selGreenhouses={selGreenhouses}
        onGreenhouses={setGreenhouses}
        date={selDate}
        onDate={setDate}
        weekOptions={weekOptions.map((w) => ({ value: weekKey(w), label: w.label }))}
        selWeekKeys={selWeekKeys}
        onWeekKeys={(keys) => setWeeks(keys.map((k) => weekOptionsByKey.get(k)).filter((w): w is HomeFilterWeek => !!w))}
        onClearAll={clearAllFilters}
        activeFilterCount={activeFilterCount}
      />
    </View>
  );
}

function FiltersModal({
  visible,
  onClose,
  farms,
  selFarms,
  onFarms,
  greenhouseOptions,
  selGreenhouses,
  onGreenhouses,
  date,
  onDate,
  weekOptions,
  selWeekKeys,
  onWeekKeys,
  onClearAll,
  activeFilterCount,
}: {
  visible: boolean;
  onClose: () => void;
  farms: { value: string; label: string }[];
  selFarms: string[];
  onFarms: (v: string[]) => void;
  greenhouseOptions: { value: string; label: string; sublabel?: string }[];
  selGreenhouses: string[];
  onGreenhouses: (v: string[]) => void;
  date: string | null;
  onDate: (v: string | null) => void;
  weekOptions: { value: string; label: string }[];
  selWeekKeys: string[];
  onWeekKeys: (v: string[]) => void;
  onClearAll: () => void;
  activeFilterCount: number;
}) {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.modalOverlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[s.modalSheet, { paddingBottom: insets.bottom + spacing.md }]}>
          <View style={s.modalHeader}>
            <View style={{ flex: 1 }}>
              <Text style={s.modalTitle}>Filters</Text>
              <Text style={s.modalSubtitle}>Scope the dashboard to a farm, greenhouse, date or week</Text>
            </View>
            <Pressable onPress={onClose} style={s.modalCloseBtn} hitSlop={8}>
              <Ionicons name="close" size={20} color={colors.textSecondary} />
            </Pressable>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled">
            <MultiSelectField label="Farm" options={farms} value={selFarms} onChange={onFarms} placeholder="All farms" />

            <MultiSelectField
              label="Greenhouse"
              options={greenhouseOptions}
              value={selGreenhouses}
              onChange={onGreenhouses}
              placeholder={selFarms.length > 0 ? 'All greenhouses on selected farm(s)' : 'All greenhouses'}
              emptyText="No greenhouses for the selected farm(s)"
            />

            <DateField
              label="Date"
              value={date ?? todayISODate()}
              onChange={(iso) => onDate(iso === todayISODate() ? null : iso)}
            />
            {date ? (
              <Pressable onPress={() => onDate(null)} style={s.resetDateBtn} hitSlop={6}>
                <Ionicons name="refresh" size={13} color={colors.textMuted} />
                <Text style={s.resetDateText}>Reset to today</Text>
              </Pressable>
            ) : null}

            <MultiSelectField
              label="Week"
              options={weekOptions}
              value={selWeekKeys}
              onChange={onWeekKeys}
              placeholder="No weeks selected"
            />
            <Text style={s.weekHint}>
              Picking week(s) widens the dashboard to that span and takes over from the Date filter above.
            </Text>
          </ScrollView>

          <View style={s.modalFooter}>
            <Pressable style={s.footerBtn} onPress={onClearAll} disabled={activeFilterCount === 0}>
              <Text style={[s.footerBtnText, activeFilterCount === 0 && s.footerBtnTextDisabled]}>Clear all</Text>
            </Pressable>
            <Pressable style={[s.footerBtn, s.footerBtnPrimary]} onPress={onClose}>
              <Text style={s.footerBtnPrimaryText}>Done</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  greeting: { fontFamily: fontFamily.semiBold, fontSize: fontSize.lg, color: colors.text, flex: 1 },

  filterBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface,
    borderRadius: borderRadius.full, paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
  },
  filterBtnText: { fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: colors.text },
  filterBadge: {
    minWidth: 18, height: 18, borderRadius: 9, backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4,
  },
  filterBadgeText: { fontFamily: fontFamily.bold, fontSize: 10, color: colors.textOnPrimary },

  resetDateBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', marginTop: -spacing.sm, marginBottom: spacing.md },
  resetDateText: { fontFamily: fontFamily.medium, fontSize: fontSize.xs, color: colors.textMuted },
  weekHint: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textMuted, marginTop: -spacing.sm, marginBottom: spacing.md },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: spacing.lg, paddingTop: spacing.lg, maxHeight: '88%',
  },
  modalHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md },
  modalTitle: { fontFamily: fontFamily.bold, fontSize: fontSize.lg, color: colors.text },
  modalSubtitle: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.textSecondary, marginTop: 2 },
  modalCloseBtn: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: colors.surfaceAlt,
    justifyContent: 'center', alignItems: 'center',
  },

  modalFooter: {
    flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm, paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border,
  },
  footerBtn: { flex: 1, height: 44, borderRadius: borderRadius.sm, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  footerBtnText: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: colors.text },
  footerBtnTextDisabled: { color: colors.textMuted },
  footerBtnPrimary: { backgroundColor: colors.primary, borderColor: colors.primary },
  footerBtnPrimaryText: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: colors.textOnPrimary },
});
