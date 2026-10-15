import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { useRouter } from 'expo-router';
import { getISOWeek } from 'date-fns';
import { Ionicons } from '@expo/vector-icons';
import { Dropdown } from '@/src/components/Dropdown';
import { Pill } from '@/src/components/Pill';
import { borderRadius, colors, fontFamily, fontSize, shadow, spacing } from '@/src/theme';
import { useRefreshOnFocus } from '@/src/hooks/useRefreshOnFocus';
import { useCropCycleStore } from '@/src/stores/cropCycleStore';
import { ForecastThisWeek } from '@/src/components/ForecastThisWeek';
import type { PickerOption } from '@/src/services/crop-cycle';

/**
 * Forecasting — the screen exists to fill in Revised, so "This Week" (the
 * entry checklist in ForecastThisWeek) is the whole point and the default.
 * Everything else — which week, This Week vs. the full-year Browse view,
 * off-budget filtering — is a way of narrowing that one job, not a
 * permanent fixture, so it lives behind the filter sheet instead of a
 * stack of always-visible header bars. The screen itself shows only
 * search + filter + overflow, matching the app-wide header (title +
 * hamburger) rather than adding a second one under it.
 *
 * Browse mode is a plain drill-down list: tapping a greenhouse pushes its
 * own page (app/forecast/[greenhouse].tsx) instead of expanding inline, so
 * the default page always stays "all greenhouses" and picking one is a
 * normal navigation, not a growing accordion.
 */

type ScreenMode = 'thisWeek' | 'browse';

export default function ForecastingScreen() {
  const router = useRouter();
  const greenhouses = useCropCycleStore((s) => s.greenhouses);
  const farms = useCropCycleStore((s) => s.farms);
  const loadPickers = useCropCycleStore((s) => s.loadPickers);

  const currentWeek = useMemo(() => getISOWeek(new Date()), []);
  const year = String(new Date().getFullYear());

  const [search, setSearch] = useState('');
  const [screenMode, setScreenMode] = useState<ScreenMode>('thisWeek');
  const [weekFilter, setWeekFilter] = useState<number | 'all'>(currentWeek);
  const [offBudgetOnly, setOffBudgetOnly] = useState(false);
  const [farmFilter, setFarmFilter] = useState('');
  const [greenhouseFilter, setGreenhouseFilter] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  // The default page is "all greenhouses" — Refresh (below) resets back to
  // exactly this rather than just reloading data under whatever filters
  // happen to be set.
  const resetToDefault = () => {
    setSearch('');
    setScreenMode('thisWeek');
    setWeekFilter(currentWeek);
    setOffBudgetOnly(false);
    setFarmFilter('');
    setGreenhouseFilter('');
  };

  const stepWeek = (delta: number) => {
    setWeekFilter((w) => {
      const base = w === 'all' ? currentWeek : w;
      return Math.min(53, Math.max(1, base + delta));
    });
  };

  useEffect(() => {
    setOffBudgetOnly(false);
  }, [weekFilter]);

  useEffect(() => {
    if (!farmFilter || !greenhouseFilter) return;
    const gh = greenhouses.find((g) => g.name === greenhouseFilter);
    if (gh && gh.farm !== farmFilter) setGreenhouseFilter('');
  }, [farmFilter, greenhouseFilter, greenhouses]);

  useRefreshOnFocus(loadPickers);

  // Farm/greenhouse scope only -- NOT search. ForecastThisWeek does its own
  // row-level search across both greenhouse AND variety labels, so pre-
  // filtering this list by search text would hide a variety-name match
  // whose greenhouse label doesn't happen to match too.
  const scopedGreenhouses = useMemo(() => {
    return greenhouses.filter((g) => {
      if (farmFilter && g.farm !== farmFilter) return false;
      if (greenhouseFilter && g.name !== greenhouseFilter) return false;
      return true;
    });
  }, [greenhouses, farmFilter, greenhouseFilter]);

  // Browse mode's own card list has no row-level search of its own, so the
  // search text narrows it directly here.
  const filteredGreenhouses = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return scopedGreenhouses;
    return scopedGreenhouses.filter((g) => g.label.toLowerCase().includes(q));
  }, [scopedGreenhouses, search]);

  // Greenhouse filter options narrow to the selected farm, same as choosing
  // it clears an incompatible greenhouse already picked.
  const greenhouseFilterOptions = useMemo(
    () => greenhouses.filter((g) => !farmFilter || g.farm === farmFilter),
    [greenhouses, farmFilter],
  );

  const activeFilters =
    (weekFilter !== currentWeek ? 1 : 0) +
    (offBudgetOnly ? 1 : 0) +
    (screenMode === 'browse' ? 1 : 0) +
    (farmFilter ? 1 : 0) +
    (greenhouseFilter ? 1 : 0);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={s.topBar}>
        <View style={s.searchWrap}>
          <Ionicons name="search-outline" size={16} color={colors.textMuted} />
          <TextInput
            style={s.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Search greenhouse or variety…"
            placeholderTextColor={colors.textMuted}
            autoCorrect={false}
            autoCapitalize="none"
          />
          {search.length > 0 ? (
            <TouchableOpacity onPress={() => setSearch('')} hitSlop={8}>
              <Ionicons name="close-circle" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          ) : null}
        </View>
        <TouchableOpacity style={s.iconBtn} onPress={() => setFilterOpen(true)} hitSlop={6}>
          <Ionicons name="options-outline" size={19} color={colors.text} />
          {activeFilters > 0 ? <View style={s.iconBtnDot} /> : null}
        </TouchableOpacity>
        <TouchableOpacity style={s.iconBtn} onPress={() => setMenuOpen(true)} hitSlop={6}>
          <Ionicons name="ellipsis-vertical" size={19} color={colors.text} />
        </TouchableOpacity>
      </View>

      <KeyboardAwareScrollView
        contentContainerStyle={s.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        enableOnAndroid
        extraScrollHeight={20}
      >
        {screenMode === 'thisWeek' ? (
          <ForecastThisWeek
            greenhouses={scopedGreenhouses}
            year={year}
            weekNo={weekFilter === 'all' ? currentWeek : weekFilter}
            currentWeek={currentWeek}
            search={search}
            offBudgetOnly={offBudgetOnly}
          />
        ) : greenhouses.length === 0 ? (
          <Text style={s.emptyText}>No greenhouses available</Text>
        ) : filteredGreenhouses.length === 0 ? (
          <Text style={s.emptyText}>No greenhouse matches &quot;{search}&quot;</Text>
        ) : (
          filteredGreenhouses.map((gh) => (
            <TouchableOpacity
              key={gh.name}
              style={s.ghCard}
              activeOpacity={0.7}
              onPress={() => router.push(`/forecast/${encodeURIComponent(gh.name)}` as never)}
            >
              <View style={s.ghHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={s.ghName}>{gh.label}</Text>
                  {gh.farm ? <Text style={s.ghMeta}>{gh.farm}</Text> : null}
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </View>
            </TouchableOpacity>
          ))
        )}
      </KeyboardAwareScrollView>

      <FilterSheet
        visible={filterOpen}
        onClose={() => setFilterOpen(false)}
        year={year}
        screenMode={screenMode}
        setScreenMode={setScreenMode}
        weekFilter={weekFilter}
        setWeekFilter={setWeekFilter}
        stepWeek={stepWeek}
        currentWeek={currentWeek}
        offBudgetOnly={offBudgetOnly}
        setOffBudgetOnly={setOffBudgetOnly}
        farms={farms}
        farmFilter={farmFilter}
        setFarmFilter={setFarmFilter}
        greenhouseOptions={greenhouseFilterOptions}
        greenhouseFilter={greenhouseFilter}
        setGreenhouseFilter={setGreenhouseFilter}
      />

      <MenuSheet
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        onRefresh={() => {
          resetToDefault();
          loadPickers();
          setMenuOpen(false);
        }}
        onGoToLastWeek={() => {
          setScreenMode('thisWeek');
          setWeekFilter(currentWeek - 1);
          setMenuOpen(false);
        }}
      />
    </View>
  );
}

function FilterSheet({
  visible,
  onClose,
  year,
  screenMode,
  setScreenMode,
  weekFilter,
  setWeekFilter,
  stepWeek,
  currentWeek,
  offBudgetOnly,
  setOffBudgetOnly,
  farms,
  farmFilter,
  setFarmFilter,
  greenhouseOptions,
  greenhouseFilter,
  setGreenhouseFilter,
}: {
  visible: boolean;
  onClose: () => void;
  year: string;
  screenMode: ScreenMode;
  setScreenMode: (m: ScreenMode) => void;
  weekFilter: number | 'all';
  setWeekFilter: React.Dispatch<React.SetStateAction<number | 'all'>>;
  stepWeek: (delta: number) => void;
  currentWeek: number;
  offBudgetOnly: boolean;
  setOffBudgetOnly: (v: boolean) => void;
  farms: PickerOption[];
  farmFilter: string;
  setFarmFilter: (v: string) => void;
  greenhouseOptions: PickerOption[];
  greenhouseFilter: string;
  setGreenhouseFilter: (v: string) => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.modalOverlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[s.modalSheet, { paddingBottom: insets.bottom + spacing.lg }]}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>Filter</Text>
            <TouchableOpacity onPress={onClose} style={s.modalCloseBtn} hitSlop={8}>
              <Ionicons name="close" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <Text style={s.filterLabel}>FARM</Text>
          <Dropdown
            label="Farm"
            value={farmFilter}
            onChange={setFarmFilter}
            options={farms.map((f) => ({ value: f.name, label: f.label }))}
            placeholder="All farms"
          />
          {farmFilter ? (
            <TouchableOpacity style={s.clearBtn} onPress={() => setFarmFilter('')}>
              <Ionicons name="close-circle-outline" size={14} color={colors.textMuted} />
              <Text style={s.clearText}>All farms</Text>
            </TouchableOpacity>
          ) : null}

          <Text style={s.filterLabel}>GREENHOUSE</Text>
          <Dropdown
            label="Greenhouse"
            value={greenhouseFilter}
            onChange={setGreenhouseFilter}
            options={greenhouseOptions.map((g) => ({ value: g.name, label: g.label }))}
            placeholder="All greenhouses"
          />
          {greenhouseFilter ? (
            <TouchableOpacity style={s.clearBtn} onPress={() => setGreenhouseFilter('')}>
              <Ionicons name="close-circle-outline" size={14} color={colors.textMuted} />
              <Text style={s.clearText}>All greenhouses</Text>
            </TouchableOpacity>
          ) : null}

          <Text style={s.filterLabel}>VIEW</Text>
          <View style={s.segmented}>
            {(['thisWeek', 'browse'] as ScreenMode[]).map((m) => (
              <TouchableOpacity
                key={m}
                style={[s.segItem, screenMode === m && s.segItemActive]}
                onPress={() => setScreenMode(m)}
              >
                <Text style={[s.segText, screenMode === m && s.segTextActive]}>{m === 'thisWeek' ? 'This Week' : 'Browse'}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={s.filterLabel}>WEEK · {year}</Text>
          <View style={s.weekNav}>
            <TouchableOpacity onPress={() => stepWeek(-1)} style={s.weekNavArrow} hitSlop={8}>
              <Ionicons name="chevron-back" size={18} color={colors.text} />
            </TouchableOpacity>
            <View style={s.weekNavLabelWrap}>
              <Text style={s.weekNavLabel}>{weekFilter === 'all' ? 'All weeks' : `Week ${weekFilter}`}</Text>
              {weekFilter === currentWeek ? <Pill value="NOW" tone="success" /> : null}
            </View>
            <TouchableOpacity onPress={() => stepWeek(1)} style={s.weekNavArrow} hitSlop={8}>
              <Ionicons name="chevron-forward" size={18} color={colors.text} />
            </TouchableOpacity>
          </View>

          {screenMode === 'thisWeek' ? (
            <TouchableOpacity style={s.toggleRow} onPress={() => setOffBudgetOnly(!offBudgetOnly)}>
              <Text style={s.toggleLabel}>Off-budget only</Text>
              <View style={[s.switchTrack, offBudgetOnly && s.switchTrackOn]}>
                <View style={[s.switchThumb, offBudgetOnly && s.switchThumbOn]} />
              </View>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

function MenuSheet({
  visible,
  onClose,
  onRefresh,
  onGoToLastWeek,
}: {
  visible: boolean;
  onClose: () => void;
  onRefresh: () => void;
  onGoToLastWeek: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.modalOverlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[s.modalSheet, { paddingBottom: insets.bottom + spacing.lg }]}>
          <TouchableOpacity style={s.menuItem} onPress={onRefresh}>
            <Ionicons name="refresh-outline" size={18} color={colors.text} />
            <Text style={s.menuItemText}>Refresh</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.menuItem} onPress={onGoToLastWeek}>
            <Ionicons name="time-outline" size={18} color={colors.text} />
            <Text style={s.menuItemText}>Review last week&apos;s variance</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl },

  topBar: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm,
  },
  searchWrap: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.surfaceAlt, borderRadius: borderRadius.full,
    paddingHorizontal: spacing.md, height: 38,
  },
  searchInput: { flex: 1, fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.text },
  iconBtn: {
    width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
  },
  iconBtnDot: {
    position: 'absolute', top: 7, right: 7, width: 7, height: 7, borderRadius: 4,
    backgroundColor: colors.primary,
  },

  ghCard: {
    backgroundColor: colors.surface, borderRadius: borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
    marginBottom: spacing.md, overflow: 'hidden', ...shadow.sm,
  },
  ghHeader: { flexDirection: 'row', alignItems: 'center', padding: spacing.md },
  ghName: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: colors.text },
  ghMeta: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },

  emptyText: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.textMuted, paddingVertical: spacing.lg, textAlign: 'center' },

  // Filter / menu sheets
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: spacing.lg, paddingTop: spacing.lg,
  },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  modalTitle: { fontFamily: fontFamily.bold, fontSize: fontSize.lg, color: colors.text },
  modalCloseBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.surfaceAlt, justifyContent: 'center', alignItems: 'center' },

  filterLabel: {
    fontFamily: fontFamily.semiBold, fontSize: 10, color: colors.textMuted,
    letterSpacing: 1.2, marginTop: spacing.lg, marginBottom: spacing.sm,
  },
  clearBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, padding: 4, alignSelf: 'flex-end' },
  clearText: { fontFamily: fontFamily.medium, fontSize: fontSize.xs, color: colors.textMuted },
  segmented: { flexDirection: 'row', backgroundColor: colors.surfaceAlt, borderRadius: borderRadius.full, padding: 2 },
  segItem: { flex: 1, alignItems: 'center', paddingVertical: spacing.sm, borderRadius: borderRadius.full },
  segItemActive: { backgroundColor: colors.primary },
  segText: { fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: colors.textSecondary },
  segTextActive: { color: colors.textOnPrimary },

  weekNav: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  weekNavArrow: {
    width: 34, height: 34, borderRadius: borderRadius.md, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
  },
  weekNavLabelWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, justifyContent: 'center' },
  weekNavLabel: { fontFamily: fontFamily.bold, fontSize: fontSize.md, color: colors.text },

  toggleRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: spacing.lg, paddingVertical: spacing.xs,
  },
  toggleLabel: { fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: colors.text },
  switchTrack: { width: 40, height: 24, borderRadius: 12, backgroundColor: colors.border, padding: 2, justifyContent: 'center' },
  switchTrackOn: { backgroundColor: colors.primary },
  switchThumb: { width: 20, height: 20, borderRadius: 10, backgroundColor: colors.surface },
  switchThumbOn: { alignSelf: 'flex-end' },

  menuItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  menuItemText: { fontFamily: fontFamily.medium, fontSize: fontSize.md, color: colors.text },
});
