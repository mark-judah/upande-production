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
import { getISOWeek } from 'date-fns';
import { Ionicons } from '@expo/vector-icons';
import { Alert } from '@/src/components/Card';
import { Dropdown } from '@/src/components/Dropdown';
import { Pill } from '@/src/components/Pill';
import { Spinner } from '@/src/components/Spinner';
import { useToast } from '@/src/components/Toast';
import { borderRadius, colors, fontFamily, fontSize, shadow, spacing } from '@/src/theme';
import { useRefreshOnFocus } from '@/src/hooks/useRefreshOnFocus';
import { useCropCycleStore } from '@/src/stores/cropCycleStore';
import { useHarvestingStore } from '@/src/stores/harvestingStore';
import { useProductionProjectionStore } from '@/src/stores/productionProjectionStore';
import { ForecastThisWeek } from '@/src/components/ForecastThisWeek';
import type { ProjectionUpdateRow } from '@/src/services/production-projection';
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
 */

const COLOUR_BG: Record<string, string> = {
  RED: '#FEE2E2', PINK: '#FCE7F3', WHITE: '#F4F4F5',
  YELLOW: '#FEF3C7', ORANGE: '#FFEDD5', PEACH: '#FFE4D6',
};
const COLOUR_FG: Record<string, string> = {
  RED: '#991B1B', PINK: '#9D174D', WHITE: '#3F3F46',
  YELLOW: '#92400E', ORANGE: '#9A3412', PEACH: '#9A3412',
};

type ScreenMode = 'thisWeek' | 'browse';
type ViewMode = 'edit' | 'compare';

export default function ForecastingScreen() {
  const { showSuccess, showError } = useToast();
  const greenhouses = useCropCycleStore((s) => s.greenhouses);
  const farms = useCropCycleStore((s) => s.farms);
  const loadPickers = useCropCycleStore((s) => s.loadPickers);

  const varieties = useHarvestingStore((s) => s.varieties);
  const ghDataLoading = useHarvestingStore((s) => s.ghDataLoading);
  const loadGreenhouseData = useHarvestingStore((s) => s.loadGreenhouseData);

  const projection = useProductionProjectionStore((s) => s.projection);
  const loading = useProductionProjectionStore((s) => s.loading);
  const error = useProductionProjectionStore((s) => s.error);
  const acting = useProductionProjectionStore((s) => s.acting);
  const fetchProjection = useProductionProjectionStore((s) => s.fetch);
  const saveProjection = useProductionProjectionStore((s) => s.save);
  const clearProjection = useProductionProjectionStore((s) => s.clear);

  const year = String(new Date().getFullYear());
  const currentWeek = useMemo(() => getISOWeek(new Date()), []);

  const [search, setSearch] = useState('');
  const [screenMode, setScreenMode] = useState<ScreenMode>('thisWeek');
  const [weekFilter, setWeekFilter] = useState<number | 'all'>(currentWeek);
  const [offBudgetOnly, setOffBudgetOnly] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('edit');
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
    setViewMode('edit');
    setFarmFilter('');
    setGreenhouseFilter('');
    setExpandedGreenhouse(null);
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

  // Browse mode only, below.
  const [expandedGreenhouse, setExpandedGreenhouse] = useState<string | null>(null);
  const [variety, setVariety] = useState('');
  const [editedForecasts, setEditedForecasts] = useState<Record<string, number>>({});
  const [editedComments, setEditedComments] = useState<Record<string, string>>({});

  useRefreshOnFocus(loadPickers);

  const toggleGreenhouse = (gh: string) => {
    setEditedForecasts({});
    setEditedComments({});
    setExpandedGreenhouse((prev) => (prev === gh ? null : gh));
  };

  useEffect(() => {
    if (screenMode === 'browse' && expandedGreenhouse) {
      loadGreenhouseData(expandedGreenhouse);
      setVariety('');
      clearProjection();
    }
  }, [screenMode, expandedGreenhouse, loadGreenhouseData, clearProjection]);

  useEffect(() => {
    if (screenMode === 'browse' && expandedGreenhouse && variety) {
      setEditedForecasts({});
      setEditedComments({});
      fetchProjection(expandedGreenhouse, variety, year);
    }
  }, [screenMode, expandedGreenhouse, variety, year, fetchProjection]);

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

  const lastWeek = useMemo(() => {
    if (!projection) return null;
    return projection.weeks.find((w) => w.weekNo === currentWeek - 1) ?? null;
  }, [projection, currentWeek]);

  const variance = useMemo(() => {
    if (!lastWeek || lastWeek.projectedQty === 0) return null;
    return ((lastWeek.actualHarvest - lastWeek.projectedQty) / lastWeek.projectedQty) * 100;
  }, [lastWeek]);

  const needsComment = viewMode === 'edit' && variance !== null && Math.abs(variance) >= 10;
  const lastWeekCommentDraft =
    lastWeek && editedComments[lastWeek.name] !== undefined
      ? editedComments[lastWeek.name]
      : lastWeek?.customComment ?? '';

  const totals = useMemo(() => {
    if (!projection) return { budget: 0, actual: 0, revised: 0 };
    return projection.weeks.reduce(
      (acc, w) => ({
        budget: acc.budget + w.projectedQty,
        actual: acc.actual + w.actualHarvest,
        revised: acc.revised + (editedForecasts[w.name] ?? w.revisedForecast),
      }),
      { budget: 0, actual: 0, revised: 0 },
    );
  }, [projection, editedForecasts]);

  const visibleWeeks = useMemo(() => {
    if (!projection) return [];
    return weekFilter === 'all' ? projection.weeks : projection.weeks.filter((w) => w.weekNo === weekFilter);
  }, [projection, weekFilter]);

  const editCount = Object.keys(editedForecasts).length + Object.keys(editedComments).length;

  const onSave = async () => {
    if (!projection) return;
    if (needsComment && !lastWeekCommentDraft.trim()) {
      showError('A comment is required for last week (variance ≥ 10%).');
      return;
    }
    const rows: ProjectionUpdateRow[] = [];
    for (const [name, value] of Object.entries(editedForecasts)) {
      rows.push({ name, revised_forecast: value });
    }
    for (const [name, comment] of Object.entries(editedComments)) {
      const existing = rows.find((r) => r.name === name);
      if (existing) existing.custom_comment = comment;
      else rows.push({ name, custom_comment: comment });
    }
    if (rows.length === 0) {
      showError('No changes to save.');
      return;
    }
    const outcome = await saveProjection(rows);
    if (outcome.ok) {
      showSuccess(outcome.message);
      setEditedForecasts({});
      setEditedComments({});
    } else {
      showError(outcome.error);
    }
  };

  const colourBg = projection ? (COLOUR_BG[projection.colour] ?? colors.surfaceAlt) : colors.surfaceAlt;
  const colourFg = projection ? (COLOUR_FG[projection.colour] ?? colors.text) : colors.text;

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
          <Text style={s.emptyText}>No greenhouse matches "{search}"</Text>
        ) : (
          filteredGreenhouses.map((gh) => {
            const open = expandedGreenhouse === gh.name;
            const varietyLabel = varieties.find((v) => v.name === variety)?.label ?? variety;
            return (
              <View key={gh.name} style={s.ghCard}>
                <TouchableOpacity style={s.ghHeader} activeOpacity={0.7} onPress={() => toggleGreenhouse(gh.name)}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.ghName}>{gh.label}</Text>
                    {open && variety ? <Text style={s.ghMeta} numberOfLines={1}>{varietyLabel}</Text> : null}
                  </View>
                  <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
                </TouchableOpacity>

                {open ? (
                  <View style={s.ghBody}>
                    {ghDataLoading ? (
                      <Spinner label="Loading varieties…" />
                    ) : varieties.length === 0 ? (
                      <Text style={s.emptyText}>No varieties on this greenhouse</Text>
                    ) : (
                      <View style={s.varietyChips}>
                        {varieties.map((v) => (
                          <TouchableOpacity
                            key={v.name}
                            style={[s.varietyChip, variety === v.name && s.varietyChipActive]}
                            onPress={() => setVariety(v.name)}
                            activeOpacity={0.7}
                          >
                            <Text style={[s.varietyChipText, variety === v.name && s.varietyChipTextActive]}>{v.label}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}

                    {error ? <Alert tone="danger">{error}</Alert> : null}
                    {loading ? <Spinner label="Loading projection…" /> : null}
                    {!loading && variety && !projection && !error ? (
                      <Alert tone="info">No projection yet for this variety.</Alert>
                    ) : null}

                    {projection ? (
                      <View style={{ marginTop: spacing.md }}>
                        <View style={s.summaryRow}>
                          <View style={{ flex: 1 }}>
                            <Text style={s.summaryVariety}>{projection.cropVariety}</Text>
                            <Text style={s.summarySub}>
                              {projection.cropType}{projection.area ? ` · ${Math.round(projection.area)} m²` : ''}
                            </Text>
                          </View>
                          {projection.colour ? (
                            <View style={[s.colourBadge, { backgroundColor: colourBg }]}>
                              <Text style={[s.colourText, { color: colourFg }]}>{projection.colour}</Text>
                            </View>
                          ) : null}
                        </View>

                        <View style={s.totals}>
                          <TotalChip label="Budget" value={totals.budget} />
                          <TotalChip label="Actual" value={totals.actual} />
                          <TotalChip label="Revised" value={totals.revised} />
                        </View>

                        {lastWeek && needsComment ? (
                          <View style={s.varianceCard}>
                            <View style={s.varianceHeader}>
                              <Ionicons
                                name={(variance ?? 0) >= 0 ? 'trending-up' : 'trending-down'}
                                size={18}
                                color={(variance ?? 0) >= 0 ? colors.success : colors.error}
                              />
                              <Text style={s.varianceTitle}>
                                Last week (W{lastWeek.weekNo}) variance {(variance ?? 0).toFixed(1)}%
                              </Text>
                            </View>
                            <Text style={[s.muted, { marginTop: 4 }]}>
                              A comment is required when the actual harvest deviates from the projected qty by 10% or more.
                            </Text>
                            <View style={{ height: spacing.md }} />
                            <Text style={s.fieldLabel}>Comment (required)</Text>
                            <TextInput
                              value={lastWeekCommentDraft}
                              onChangeText={(t) => setEditedComments((p) => ({ ...p, [lastWeek.name]: t }))}
                              multiline
                              numberOfLines={3}
                              placeholder="Explain the variance"
                              placeholderTextColor={colors.textMuted}
                              style={s.textarea}
                            />
                          </View>
                        ) : null}

                        <Text style={s.weeksTitle}>Weekly {viewMode === 'edit' ? 'projections' : 'comparison'}</Text>
                        {visibleWeeks.length === 0 ? <Text style={s.emptyText}>No data for that week.</Text> : null}
                        {visibleWeeks.map((w) => {
                          const isCurrent = w.weekNo === currentWeek;
                          const edited = editedForecasts[w.name];
                          const currentRevised = edited ?? w.revisedForecast;
                          const pctOfBudget = w.projectedQty > 0 ? Math.round((w.actualHarvest / w.projectedQty) * 100) : 0;
                          const weekVariance = w.actualHarvest - w.projectedQty;
                          const varianceColor = weekVariance > 0 ? colors.success : weekVariance < 0 ? colors.error : colors.textMuted;

                          return (
                            <View key={w.name} style={[s.weekRow, isCurrent && s.weekRowCurrent]}>
                              <View style={s.weekHeader}>
                                <Text style={s.weekNo}>W{w.weekNo}</Text>
                                {isCurrent ? <Pill value="NOW" tone="success" /> : null}
                              </View>

                              {viewMode === 'edit' ? (
                                <View style={s.weekMetrics}>
                                  <Metric icon="flag-outline" label="Budget" value={w.projectedQty} />
                                  <Metric
                                    icon="checkmark-circle-outline"
                                    label="Actual"
                                    value={w.actualHarvest}
                                    hint={w.projectedQty > 0 ? `${pctOfBudget}%` : undefined}
                                  />
                                  <View style={{ flex: 1 }}>
                                    <Text style={s.metricLabel}>Revised</Text>
                                    <TextInput
                                      value={String(currentRevised || '')}
                                      onChangeText={(t) => {
                                        const n = Number(t);
                                        if (t === '') {
                                          setEditedForecasts((p) => {
                                            const { [w.name]: _, ...rest } = p;
                                            return rest;
                                          });
                                        } else if (Number.isFinite(n)) {
                                          setEditedForecasts((p) => ({ ...p, [w.name]: n }));
                                        }
                                      }}
                                      keyboardType="number-pad"
                                      placeholder="—"
                                      placeholderTextColor={colors.textMuted}
                                      style={[s.revisedInput, edited !== undefined && s.revisedInputEdited]}
                                    />
                                  </View>
                                </View>
                              ) : (
                                <View style={s.compareRow}>
                                  <View style={s.compareCell}>
                                    <Text style={s.metricLabel}>Budget</Text>
                                    <Text style={s.compareValue}>{Math.round(w.projectedQty).toLocaleString()}</Text>
                                  </View>
                                  <View style={s.compareCell}>
                                    <Text style={s.metricLabel}>Actual</Text>
                                    <Text style={s.compareValue}>{Math.round(w.actualHarvest).toLocaleString()}</Text>
                                  </View>
                                  <View style={s.compareCell}>
                                    <Text style={s.metricLabel}>Variance</Text>
                                    <Text style={[s.compareValue, { color: varianceColor }]}>
                                      {weekVariance > 0 ? '+' : ''}{Math.round(weekVariance).toLocaleString()}
                                    </Text>
                                  </View>
                                </View>
                              )}
                            </View>
                          );
                        })}

                        {viewMode === 'edit' && editCount > 0 ? (
                          <TouchableOpacity onPress={onSave} disabled={acting} activeOpacity={0.85} style={[s.saveBtn, acting && { opacity: 0.6 }]}>
                            <Ionicons name="save-outline" size={18} color={colors.textOnPrimary} />
                            <Text style={s.saveBtnText}>{acting ? 'Saving…' : `Save ${editCount} change${editCount === 1 ? '' : 's'}`}</Text>
                          </TouchableOpacity>
                        ) : null}
                      </View>
                    ) : null}
                  </View>
                ) : null}
              </View>
            );
          })
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
        viewMode={viewMode}
        setViewMode={setViewMode}
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
  viewMode,
  setViewMode,
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
  viewMode: ViewMode;
  setViewMode: (m: ViewMode) => void;
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
            {screenMode === 'browse' ? (
              <TouchableOpacity onPress={() => setWeekFilter((w) => (w === 'all' ? currentWeek : 'all'))} style={s.weekNavToggle}>
                <Text style={s.weekNavToggleText}>{weekFilter === 'all' ? 'Just this week' : 'All weeks'}</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          {screenMode === 'thisWeek' ? (
            <TouchableOpacity style={s.toggleRow} onPress={() => setOffBudgetOnly(!offBudgetOnly)}>
              <Text style={s.toggleLabel}>Off-budget only</Text>
              <View style={[s.switchTrack, offBudgetOnly && s.switchTrackOn]}>
                <View style={[s.switchThumb, offBudgetOnly && s.switchThumbOn]} />
              </View>
            </TouchableOpacity>
          ) : (
            <>
              <Text style={s.filterLabel}>BROWSE MODE</Text>
              <View style={s.segmented}>
                {(['edit', 'compare'] as ViewMode[]).map((m) => (
                  <TouchableOpacity key={m} style={[s.segItem, viewMode === m && s.segItemActive]} onPress={() => setViewMode(m)}>
                    <Text style={[s.segText, viewMode === m && s.segTextActive]}>{m === 'edit' ? 'Edit' : 'Compare'}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}
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
            <Text style={s.menuItemText}>Review last week's variance</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function TotalChip({ label, value }: { label: string; value: number }) {
  return (
    <View style={s.totalChip}>
      <Text style={s.totalLabel}>{label}</Text>
      <Text style={s.totalValue}>{Math.round(value).toLocaleString()}</Text>
    </View>
  );
}

function Metric({
  icon,
  label,
  value,
  hint,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: number;
  hint?: string;
}) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={s.metricLabel}>{label}</Text>
      <View style={s.metricInline}>
        <Ionicons name={icon} size={14} color={colors.textMuted} />
        <Text style={s.metricValue}>{Math.round(value).toLocaleString()}</Text>
      </View>
      {hint ? <Text style={s.metricHint}>{hint}</Text> : null}
    </View>
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
  ghBody: {
    paddingHorizontal: spacing.md, paddingBottom: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: spacing.sm,
  },

  varietyChips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  varietyChip: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderRadius: borderRadius.full, backgroundColor: colors.surfaceAlt,
    borderWidth: 1, borderColor: colors.border,
  },
  varietyChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  varietyChipText: { fontFamily: fontFamily.medium, fontSize: fontSize.xs, color: colors.text },
  varietyChipTextActive: { color: colors.textOnPrimary },

  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.md },
  summaryVariety: { fontFamily: fontFamily.bold, fontSize: fontSize.lg, color: colors.text },
  summarySub: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.textSecondary, marginTop: 2 },
  colourBadge: { paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: borderRadius.full },
  colourText: { fontFamily: fontFamily.semiBold, fontSize: fontSize.xs, letterSpacing: 0.4 },

  totals: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  totalChip: {
    flex: 1, backgroundColor: colors.surfaceAlt, borderRadius: borderRadius.md,
    paddingVertical: spacing.sm, paddingHorizontal: spacing.md,
  },
  totalLabel: { fontFamily: fontFamily.medium, fontSize: 10, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.3 },
  totalValue: { fontFamily: fontFamily.bold, fontSize: fontSize.lg, color: colors.text, marginTop: 2 },

  varianceCard: { marginTop: spacing.md, padding: spacing.md, borderRadius: borderRadius.md, backgroundColor: colors.surfaceAlt },
  varianceHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  varianceTitle: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: colors.text },
  muted: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.textMuted },
  fieldLabel: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: colors.text, marginBottom: spacing.sm },
  textarea: {
    fontFamily: fontFamily.regular, fontSize: fontSize.md, color: colors.text,
    backgroundColor: colors.background, borderRadius: borderRadius.sm,
    borderWidth: 1, borderColor: colors.border, padding: spacing.md, minHeight: 80, textAlignVertical: 'top',
  },

  weeksTitle: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: colors.text, marginTop: spacing.lg, marginBottom: spacing.xs },
  weekRow: { paddingVertical: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  weekRowCurrent: { backgroundColor: '#F0F9FF' },
  weekHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  weekNo: { fontFamily: fontFamily.semiBold, fontSize: fontSize.md, color: colors.text },
  weekMetrics: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },

  compareRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
  compareCell: { flex: 1 },
  compareValue: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: colors.text, marginTop: 2 },

  metricLabel: { fontFamily: fontFamily.medium, fontSize: 10, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.3 },
  metricInline: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  metricValue: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: colors.text },
  metricHint: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },

  revisedInput: {
    marginTop: 2, fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: colors.text,
    backgroundColor: colors.background, borderRadius: borderRadius.sm,
    borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.sm, paddingVertical: 6,
  },
  revisedInputEdited: { borderColor: colors.primary, backgroundColor: '#F0F9FF' },

  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    backgroundColor: colors.primary, borderRadius: borderRadius.full,
    paddingVertical: spacing.md, paddingHorizontal: spacing.xl, marginTop: spacing.lg,
  },
  saveBtnText: { fontFamily: fontFamily.bold, fontSize: fontSize.md, color: colors.textOnPrimary },

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
  weekNavToggle: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: borderRadius.full, backgroundColor: colors.surfaceAlt },
  weekNavToggleText: { fontFamily: fontFamily.medium, fontSize: fontSize.xs, color: colors.textSecondary },

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
