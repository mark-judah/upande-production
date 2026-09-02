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
import { Card, Alert } from '@/src/components/Card';
import { Dropdown } from '@/src/components/Dropdown';
import { Pill } from '@/src/components/Pill';
import { Spinner } from '@/src/components/Spinner';
import { useToast } from '@/src/components/Toast';
import { borderRadius, colors, fontFamily, fontSize, spacing } from '@/src/theme';
import { useRefreshOnFocus } from '@/src/hooks/useRefreshOnFocus';
import { useCropCycleStore } from '@/src/stores/cropCycleStore';
import { useHarvestingStore } from '@/src/stores/harvestingStore';
import { useProductionProjectionStore } from '@/src/stores/productionProjectionStore';
import type { ProjectionUpdateRow } from '@/src/services/production-projection';

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

export default function ForecastingScreen() {
  const { showSuccess, showError } = useToast();
  const greenhouses = useCropCycleStore((s) => s.greenhouses);
  const loadPickers = useCropCycleStore((s) => s.loadPickers);

  // Reuse the per-greenhouse variety loader from the harvesting store.
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

  const [greenhouse, setGreenhouse] = useState('');
  const [variety, setVariety] = useState('');
  const year = String(new Date().getFullYear());

  const [editedForecasts, setEditedForecasts] = useState<Record<string, number>>({});
  const [editedComments, setEditedComments] = useState<Record<string, string>>({});
  const [refreshing, setRefreshing] = useState(false);

  // Pull-to-refresh clears the form (greenhouse/variety + any edited forecast
  // values) and refetches the pickers from scratch.
  const onRefresh = async () => {
    setRefreshing(true);
    try {
      setGreenhouse('');
      setVariety('');
      setEditedForecasts({});
      setEditedComments({});
      clearProjection();
      await loadPickers();
    } finally {
      setRefreshing(false);
    }
  };

  useRefreshOnFocus(loadPickers);

  useEffect(() => {
    if (greenhouse) {
      loadGreenhouseData(greenhouse);
      setVariety('');
      clearProjection();
    }
  }, [greenhouse, loadGreenhouseData, clearProjection]);

  useEffect(() => {
    if (greenhouse && variety) {
      setEditedForecasts({});
      setEditedComments({});
      fetchProjection(greenhouse, variety, year);
    }
  }, [greenhouse, variety, year, fetchProjection]);

  const currentWeek = useMemo(() => getISOWeek(new Date()), []);

  // Identify last week (current - 1) for the variance alert.
  const lastWeek = useMemo(() => {
    if (!projection) return null;
    return projection.weeks.find((w) => w.weekNo === currentWeek - 1) ?? null;
  }, [projection, currentWeek]);

  const variance = useMemo(() => {
    if (!lastWeek || lastWeek.projectedQty === 0) return null;
    return ((lastWeek.actualHarvest - lastWeek.projectedQty) / lastWeek.projectedQty) * 100;
  }, [lastWeek]);

  const needsComment = variance !== null && Math.abs(variance) >= 10;
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
        <Card>
          <Dropdown
            label="Greenhouse"
            value={greenhouse}
            onChange={setGreenhouse}
            options={greenhouses.map((g) => ({ value: g.name, label: g.label }))}
            placeholder="Select greenhouse"
          />
          <View style={{ height: spacing.md }} />
          <Dropdown
            label="Variety"
            value={variety}
            onChange={setVariety}
            options={varieties.map((v) => ({ value: v.name, label: v.label }))}
            placeholder={greenhouse ? 'Pick a variety' : 'Pick a greenhouse first'}
            disabled={!greenhouse || ghDataLoading}
          />
          <Text style={[s.hint, { marginTop: spacing.sm }]}>
            Year: <Text style={s.strong}>{year}</Text>
          </Text>
        </Card>

        {error ? <Alert tone="danger">{error}</Alert> : null}

        {loading ? (
          <Card><Spinner label="Loading projection…" /></Card>
        ) : null}

        {projection ? (
          <>
            <Card>
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
            </Card>

            {lastWeek && needsComment ? (
              <Card>
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
                  A comment is required when the actual harvest deviates from the projected qty
                  by 10% or more.
                </Text>
                <View style={{ height: spacing.md }} />
                <Text style={s.fieldLabel}>Comment (required)</Text>
                <TextInput
                  value={lastWeekCommentDraft}
                  onChangeText={(t) =>
                    setEditedComments((p) => ({ ...p, [lastWeek.name]: t }))
                  }
                  multiline
                  numberOfLines={3}
                  placeholder="Explain the variance"
                  placeholderTextColor={colors.textMuted}
                  style={s.textarea}
                />
              </Card>
            ) : null}

            <Card title="Weekly projections">
              {projection.weeks.map((w) => {
                const isCurrent = w.weekNo === currentWeek;
                const edited = editedForecasts[w.name];
                const currentRevised = edited ?? w.revisedForecast;
                const pctOfBudget = w.projectedQty > 0
                  ? Math.round((w.actualHarvest / w.projectedQty) * 100)
                  : 0;
                return (
                  <View key={w.name} style={[s.weekRow, isCurrent && s.weekRowCurrent]}>
                    <View style={s.weekHeader}>
                      <Text style={s.weekNo}>W{w.weekNo}</Text>
                      {isCurrent ? <Pill value="NOW" tone="success" /> : null}
                    </View>
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
                  </View>
                );
              })}
            </Card>
          </>
        ) : null}

        {!loading && !projection && !error && greenhouse && !variety ? (
          <Card><Alert tone="info">Pick a variety.</Alert></Card>
        ) : null}
      </KeyboardAwareScrollView>

      {projection && editCount > 0 ? (
        <View style={s.saveBar}>
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
        </View>
      ) : null}
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
  scroll: { padding: spacing.lg, paddingBottom: 120 },
  hint: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.textSecondary },
  muted: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.textMuted },
  strong: { fontFamily: fontFamily.semiBold, color: colors.text },

  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  summaryVariety: { fontFamily: fontFamily.bold, fontSize: fontSize.lg, color: colors.text },
  summarySub: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.textSecondary, marginTop: 2 },
  colourBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
  },
  colourText: { fontFamily: fontFamily.semiBold, fontSize: fontSize.xs, letterSpacing: 0.4 },

  totals: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  totalChip: {
    flex: 1,
    backgroundColor: colors.surfaceAlt,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  totalLabel: { fontFamily: fontFamily.medium, fontSize: 10, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.3 },
  totalValue: { fontFamily: fontFamily.bold, fontSize: fontSize.lg, color: colors.text, marginTop: 2 },

  varianceHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  varianceTitle: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: colors.text },

  fieldLabel: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: colors.text, marginBottom: spacing.sm },
  textarea: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.md,
    color: colors.text,
    backgroundColor: colors.background,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    minHeight: 80,
    textAlignVertical: 'top',
  },

  weekRow: {
    paddingVertical: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  weekRowCurrent: { backgroundColor: '#F0F9FF' },
  weekHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  weekNo: { fontFamily: fontFamily.semiBold, fontSize: fontSize.md, color: colors.text },
  weekMetrics: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },

  metricLabel: { fontFamily: fontFamily.medium, fontSize: 10, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.3 },
  metricInline: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  metricValue: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: colors.text },
  metricHint: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },

  revisedInput: {
    marginTop: 2,
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.sm,
    color: colors.text,
    backgroundColor: colors.background,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  revisedInputEdited: {
    borderColor: colors.primary,
    backgroundColor: '#F0F9FF',
  },

  saveBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: spacing.lg,
    backgroundColor: 'transparent',
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.full,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
  },
  saveBtnText: { fontFamily: fontFamily.bold, fontSize: fontSize.md, color: colors.textOnPrimary },
});
