import React, { useEffect, useMemo, useState } from 'react';
import {
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { getISOWeek } from 'date-fns';
import { Ionicons } from '@expo/vector-icons';
import { Alert } from '@/src/components/Card';
import { Pill } from '@/src/components/Pill';
import { Spinner } from '@/src/components/Spinner';
import { useToast } from '@/src/components/Toast';
import { borderRadius, colors, fontFamily, fontSize, shadow, spacing } from '@/src/theme';
import { useRefreshOnFocus } from '@/src/hooks/useRefreshOnFocus';
import { useCropCycleStore } from '@/src/stores/cropCycleStore';
import { useHarvestingStore } from '@/src/stores/harvestingStore';
import { useProductionProjectionStore } from '@/src/stores/productionProjectionStore';
import type { ProjectionUpdateRow } from '@/src/services/production-projection';

/**
 * Forecasting — laid out like mona-shelve's Production Planning screen:
 * every greenhouse listed up front (searchable, collapsible), an Edit /
 * Compare toggle, and a summary line instead of a bare picker form. The
 * underlying data is still one full-year Production Projection per
 * (greenhouse, variety) — this restyles the container, it doesn't change
 * what's fetched or saved.
 */

const COLOUR_BG: Record<string, string> = {
  RED: '#FEE2E2',
  PINK: '#FCE7F3',
  WHITE: '#F4F4F5',
  YELLOW: '#FEF3C7',
  ORANGE: '#FFEDD5',
  PEACH: '#FFE4D6',
};
const COLOUR_FG: Record<string, string> = {
  RED: '#991B1B',
  PINK: '#9D174D',
  WHITE: '#3F3F46',
  YELLOW: '#92400E',
  ORANGE: '#9A3412',
  PEACH: '#9A3412',
};

type ViewMode = 'edit' | 'compare';

export default function ForecastingScreen() {
  const { showSuccess, showError } = useToast();
  const greenhouses = useCropCycleStore((s) => s.greenhouses);
  const loadPickers = useCropCycleStore((s) => s.loadPickers);

  // Reuse the per-greenhouse variety loader from the harvesting store. Only
  // one greenhouse card is ever expanded at a time, so its single-slot
  // `varieties` cache never collides across cards.
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
  const [viewMode, setViewMode] = useState<ViewMode>('edit');
  const [expandedGreenhouse, setExpandedGreenhouse] = useState<string | null>(null);
  const [variety, setVariety] = useState('');
  // Most supervisors only care about "this week" at a time, not a 52-row
  // scroll through the whole year — default to it, let them page or opt
  // into the full list.
  const [weekFilter, setWeekFilter] = useState<number | 'all'>(currentWeek);
  const stepWeek = (delta: number) => {
    setWeekFilter((w) => {
      const base = w === 'all' ? currentWeek : w;
      return Math.min(53, Math.max(1, base + delta));
    });
  };

  const [editedForecasts, setEditedForecasts] = useState<Record<string, number>>({});
  const [editedComments, setEditedComments] = useState<Record<string, string>>({});
  const [refreshing, setRefreshing] = useState(false);

  useRefreshOnFocus(loadPickers);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      setExpandedGreenhouse(null);
      setVariety('');
      setEditedForecasts({});
      setEditedComments({});
      clearProjection();
      await loadPickers();
    } finally {
      setRefreshing(false);
    }
  };

  const toggleGreenhouse = (gh: string) => {
    setEditedForecasts({});
    setEditedComments({});
    setExpandedGreenhouse((prev) => (prev === gh ? null : gh));
  };

  useEffect(() => {
    if (expandedGreenhouse) {
      loadGreenhouseData(expandedGreenhouse);
      setVariety('');
      clearProjection();
    }
  }, [expandedGreenhouse, loadGreenhouseData, clearProjection]);

  useEffect(() => {
    if (expandedGreenhouse && variety) {
      setEditedForecasts({});
      setEditedComments({});
      fetchProjection(expandedGreenhouse, variety, year);
    }
  }, [expandedGreenhouse, variety, year, fetchProjection]);

  const filteredGreenhouses = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return greenhouses;
    return greenhouses.filter((g) => g.label.toLowerCase().includes(q));
  }, [greenhouses, search]);

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

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <KeyboardAwareScrollView
        contentContainerStyle={s.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        enableOnAndroid
        extraScrollHeight={20}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={s.modeBar}>
          <Text style={s.yearText}>Year <Text style={s.yearStrong}>{year}</Text></Text>
          <View style={s.segmented}>
            {(['edit', 'compare'] as ViewMode[]).map((m) => (
              <TouchableOpacity
                key={m}
                style={[s.segItem, viewMode === m && s.segItemActive]}
                onPress={() => setViewMode(m)}
                activeOpacity={0.7}
              >
                <Text style={[s.segText, viewMode === m && s.segTextActive]}>
                  {m === 'edit' ? 'Edit' : 'Compare'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

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
          <TouchableOpacity
            onPress={() => setWeekFilter((w) => (w === 'all' ? currentWeek : 'all'))}
            style={s.weekNavToggle}
            activeOpacity={0.7}
          >
            <Text style={s.weekNavToggleText}>{weekFilter === 'all' ? 'Just this week' : 'All weeks'}</Text>
          </TouchableOpacity>
        </View>

        <View style={s.summary}>
          <Text style={s.summaryValue}>{greenhouses.length}</Text>
          <Text style={s.summaryLabel}>greenhouses with a projection</Text>
        </View>

        {greenhouses.length > 0 ? (
          <View style={s.searchWrap}>
            <Ionicons name="search-outline" size={16} color={colors.textMuted} style={s.searchIcon} />
            <TextInput
              style={s.searchInput}
              value={search}
              onChangeText={setSearch}
              placeholder="Search greenhouse…"
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
        ) : null}

        {greenhouses.length === 0 ? (
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
                    {open && variety ? (
                      <Text style={s.ghMeta} numberOfLines={1}>{varietyLabel}</Text>
                    ) : null}
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
                            <Text style={[s.varietyChipText, variety === v.name && s.varietyChipTextActive]}>
                              {v.label}
                            </Text>
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
                              A comment is required when the actual harvest deviates from the projected qty by
                              10% or more.
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
                        {visibleWeeks.length === 0 ? (
                          <Text style={s.emptyText}>No data for that week.</Text>
                        ) : null}
                        {visibleWeeks.map((w) => {
                          const isCurrent = w.weekNo === currentWeek;
                          const edited = editedForecasts[w.name];
                          const currentRevised = edited ?? w.revisedForecast;
                          const pctOfBudget = w.projectedQty > 0
                            ? Math.round((w.actualHarvest / w.projectedQty) * 100)
                            : 0;
                          const weekVariance = w.actualHarvest - w.projectedQty;
                          const varianceColor =
                            weekVariance > 0 ? colors.success : weekVariance < 0 ? colors.error : colors.textMuted;

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
                          <TouchableOpacity
                            onPress={onSave}
                            disabled={acting}
                            activeOpacity={0.85}
                            style={[s.saveBtn, acting && { opacity: 0.6 }]}
                          >
                            <Ionicons name="save-outline" size={18} color={colors.textOnPrimary} />
                            <Text style={s.saveBtnText}>
                              {acting ? 'Saving…' : `Save ${editCount} change${editCount === 1 ? '' : 's'}`}
                            </Text>
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
    </View>
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

  modeBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  yearText: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.textSecondary },
  yearStrong: { fontFamily: fontFamily.semiBold, color: colors.text },
  segmented: {
    flexDirection: 'row', backgroundColor: colors.surfaceAlt,
    borderRadius: borderRadius.full, padding: 2,
  },
  segItem: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: borderRadius.full },
  segItemActive: { backgroundColor: colors.primary },
  segText: { fontFamily: fontFamily.medium, fontSize: fontSize.xs, color: colors.textSecondary },
  segTextActive: { color: colors.textOnPrimary },

  weekNav: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    marginBottom: spacing.md,
  },
  weekNavArrow: {
    width: 32, height: 32, borderRadius: borderRadius.md,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
  },
  weekNavLabelWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, justifyContent: 'center' },
  weekNavLabel: { fontFamily: fontFamily.bold, fontSize: fontSize.md, color: colors.text },
  weekNavToggle: {
    marginLeft: 'auto', paddingHorizontal: spacing.sm, paddingVertical: spacing.xs,
    borderRadius: borderRadius.full, backgroundColor: colors.surfaceAlt,
  },
  weekNavToggleText: { fontFamily: fontFamily.medium, fontSize: fontSize.xs, color: colors.textSecondary },

  summary: {
    flexDirection: 'row', alignItems: 'baseline', gap: 6,
    backgroundColor: colors.surface, borderRadius: borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
    paddingVertical: spacing.md, paddingHorizontal: spacing.lg, marginBottom: spacing.md,
    ...shadow.sm,
  },
  summaryValue: { fontFamily: fontFamily.bold, fontSize: fontSize.lg, color: colors.text },
  summaryLabel: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.textMuted },

  searchWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surface, borderRadius: borderRadius.md,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
    paddingHorizontal: spacing.md, marginBottom: spacing.md,
  },
  searchIcon: { marginRight: spacing.sm },
  searchInput: {
    flex: 1, fontFamily: fontFamily.regular, fontSize: fontSize.sm,
    color: colors.text, paddingVertical: spacing.sm,
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
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border,
    paddingTop: spacing.sm,
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

  varianceCard: {
    marginTop: spacing.md, padding: spacing.md, borderRadius: borderRadius.md,
    backgroundColor: colors.surfaceAlt,
  },
  varianceHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  varianceTitle: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: colors.text },
  muted: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.textMuted },
  fieldLabel: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: colors.text, marginBottom: spacing.sm },
  textarea: {
    fontFamily: fontFamily.regular, fontSize: fontSize.md, color: colors.text,
    backgroundColor: colors.background, borderRadius: borderRadius.sm,
    borderWidth: 1, borderColor: colors.border, padding: spacing.md,
    minHeight: 80, textAlignVertical: 'top',
  },

  weeksTitle: {
    fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: colors.text,
    marginTop: spacing.lg, marginBottom: spacing.xs,
  },
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

  emptyText: {
    fontFamily: fontFamily.regular, fontSize: fontSize.sm,
    color: colors.textMuted, paddingVertical: spacing.lg, textAlign: 'center',
  },
});
