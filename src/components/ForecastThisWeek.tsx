import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { borderRadius, colors, fontFamily, fontSize, shadow, spacing } from '@/src/theme';
import { useToast } from '@/src/components/Toast';
import { mapAxiosError } from '@/src/services/api';
import { harvestingApi } from '@/src/services/harvesting';
import { productionProjectionApi, type ProjectionWeek } from '@/src/services/production-projection';
import type { PickerOption } from '@/src/services/crop-cycle';

/**
 * "This Week" — the actual job Forecasting exists for: fill in Revised for
 * every greenhouse×variety, for one week, as fast as typing a spreadsheet
 * column. Not a review dashboard with edit bolted on.
 *
 * Stopgap data source: there is no bulk "every projection for week N" API
 * yet (that needs a new Kaitet Server Script), so this discovers rows by
 * fetching each greenhouse's varieties, then each variety's full-year
 * projection, pulling out just the requested week — concurrency-limited so
 * it doesn't fire 100 requests at once. Slower to populate than a bulk
 * endpoint would be; correct and usable today. Swap the loader for a single
 * bulk call once that endpoint exists — everything below it stays the same.
 */

interface EntryRow {
  key: string;
  greenhouse: string;
  greenhouseLabel: string;
  variety: string;
  varietyLabel: string;
  projectionName: string;
  week: ProjectionWeek;
}

type RowStatus = 'idle' | 'saving' | 'saved' | 'error';

async function runPool<T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  let i = 0;
  const lane = async () => {
    while (i < items.length) {
      const item = items[i++];
      await worker(item);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, lane));
}

export function ForecastThisWeek({
  greenhouses,
  year,
  weekNo,
  currentWeek,
}: {
  greenhouses: PickerOption[];
  year: string;
  weekNo: number;
  currentWeek: number;
}) {
  const { showError } = useToast();

  const [rows, setRows] = useState<EntryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [comments, setComments] = useState<Record<string, string>>({});
  const [rowStatus, setRowStatus] = useState<Record<string, RowStatus>>({});
  const [offBudgetOnly, setOffBudgetOnly] = useState(false);

  const inputRefs = useRef<Record<string, TextInput | null>>({});
  const loadSeq = useRef(0);
  // Guards against out-of-order save responses: if a row is blurred twice in
  // quick succession, only the response to the LAST save should be allowed
  // to update local state, even if an earlier request happens to resolve
  // later (slow network, retry, etc.).
  const saveGen = useRef<Record<string, number>>({});

  const hasActualContext = weekNo <= currentWeek;
  const isCommentWeek = weekNo === currentWeek - 1;

  // The off-budget filter's toggle only renders when hasActualContext is
  // true; reset it on every week change so it can never get stuck "on" with
  // no visible control left to turn it off (e.g. paging into a future week).
  useEffect(() => {
    setOffBudgetOnly(false);
  }, [weekNo]);

  useEffect(() => {
    const seq = ++loadSeq.current;
    setRows([]);
    setDrafts({});
    setComments({});
    setRowStatus({});
    setProgress({ done: 0, total: greenhouses.length });
    if (greenhouses.length === 0) return;
    setLoading(true);

    runPool(greenhouses, 4, async (gh) => {
      try {
        const data = await harvestingApi.getGreenhouseData(gh.name);
        await runPool(data.varieties, 3, async (v) => {
          try {
            const proj = await productionProjectionApi.fetchProjection(gh.name, v.name, year);
            const week = proj.weeks.find((w) => w.weekNo === weekNo);
            if (week && loadSeq.current === seq) {
              const row: EntryRow = {
                key: `${gh.name}::${v.name}`,
                greenhouse: gh.name,
                greenhouseLabel: gh.label,
                variety: v.name,
                varietyLabel: v.label,
                projectionName: proj.name,
                week,
              };
              setRows((prev) => [...prev, row]);
            }
          } catch {
            // No projection for this variety this year — not every variety has one, skip.
          }
        });
      } catch {
        // Greenhouse has no crop/variety data — skip.
      } finally {
        if (loadSeq.current === seq) setProgress((p) => ({ ...p, done: p.done + 1 }));
      }
    }).finally(() => {
      if (loadSeq.current === seq) setLoading(false);
    });
  }, [greenhouses, year, weekNo]);

  const isFlagged = (row: EntryRow): boolean => {
    if (!isCommentWeek || row.week.projectedQty === 0) return false;
    const variance = ((row.week.actualHarvest - row.week.projectedQty) / row.week.projectedQty) * 100;
    return Math.abs(variance) >= 10;
  };

  const sortedRows = useMemo(() => {
    const filtered = offBudgetOnly
      ? rows.filter((r) => hasActualContext && r.week.actualHarvest !== r.week.projectedQty)
      : rows;
    const flagged = filtered.filter(isFlagged);
    const rest = filtered.filter((r) => !isFlagged(r));
    return [...flagged, ...rest];
  }, [rows, offBudgetOnly, hasActualContext, isCommentWeek]);

  const filledCount = rows.filter((r) => (r.week.revisedForecast || 0) > 0).length;

  const saveRow = async (row: EntryRow, overrideValue?: number) => {
    const draft = drafts[row.key];
    const baseline = row.week.revisedForecast || row.week.projectedQty;
    const n = overrideValue ?? (draft !== undefined ? Number(draft) : baseline);
    if (!Number.isFinite(n)) return;
    const commentDraft = comments[row.key];
    const commentChanged = commentDraft !== undefined && commentDraft !== row.week.customComment;
    if (n === baseline && !commentChanged) return;

    if (isFlagged(row) && !(commentDraft ?? row.week.customComment ?? '').trim()) {
      setRowStatus((p) => ({ ...p, [row.key]: 'error' }));
      showError(`${row.greenhouseLabel} · ${row.varietyLabel}: a comment is required (variance ≥ 10%).`);
      return;
    }

    const gen = (saveGen.current[row.key] ?? 0) + 1;
    saveGen.current[row.key] = gen;
    const isLatest = () => saveGen.current[row.key] === gen;

    setRowStatus((p) => ({ ...p, [row.key]: 'saving' }));
    try {
      await productionProjectionApi.updateRevisedForecast(row.projectionName, [
        {
          name: row.week.name,
          revised_forecast: n,
          ...(commentChanged ? { custom_comment: commentDraft } : {}),
        },
      ]);
      if (!isLatest()) return;
      setRowStatus((p) => ({ ...p, [row.key]: 'saved' }));
      setRows((prev) =>
        prev.map((r) =>
          r.key === row.key
            ? { ...r, week: { ...r.week, revisedForecast: n, customComment: commentChanged ? commentDraft! : r.week.customComment } }
            : r,
        ),
      );
    } catch (err) {
      if (!isLatest()) return;
      setRowStatus((p) => ({ ...p, [row.key]: 'error' }));
      showError(mapAxiosError(err).message);
    }
  };

  const focusNext = (idx: number) => {
    const next = sortedRows[idx + 1];
    if (next) inputRefs.current[next.key]?.focus();
  };

  return (
    <View>
      <View style={s.progressRow}>
        <Text style={s.progressText}>
          {loading && rows.length === 0
            ? `Loading… ${progress.done}/${progress.total} greenhouses`
            : `${filledCount} of ${rows.length} filled`}
        </Text>
        {hasActualContext ? (
          <TouchableOpacity
            onPress={() => setOffBudgetOnly((v) => !v)}
            style={[s.filterChip, offBudgetOnly && s.filterChipActive]}
            activeOpacity={0.7}
          >
            <Text style={[s.filterChipText, offBudgetOnly && s.filterChipTextActive]}>Off-budget only</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {loading && rows.length === 0 ? (
        <View style={s.loadingCard}>
          <ActivityIndicator color={colors.textMuted} />
        </View>
      ) : rows.length === 0 ? (
        <Text style={s.emptyText}>No projections found for week {weekNo}.</Text>
      ) : (
        sortedRows.map((row, idx) => {
          const flagged = isFlagged(row);
          const status = rowStatus[row.key] ?? 'idle';
          const draft = drafts[row.key] ?? (row.week.revisedForecast > 0 ? String(row.week.revisedForecast) : String(row.week.projectedQty || ''));
          const pctOfBudget = row.week.projectedQty > 0 ? Math.round((row.week.actualHarvest / row.week.projectedQty) * 100) : null;

          return (
            <View key={row.key} style={[s.row, flagged && s.rowFlagged]}>
              <View style={s.rowHead}>
                <Text style={s.rowTitle} numberOfLines={1}>
                  {row.greenhouseLabel} · {row.varietyLabel}
                </Text>
                <RowStatusIcon status={status} />
              </View>
              <Text style={s.rowContext}>
                Budget {Math.round(row.week.projectedQty).toLocaleString()}
                {hasActualContext ? ` · Actual ${Math.round(row.week.actualHarvest).toLocaleString()}${pctOfBudget != null ? ` (${pctOfBudget}%)` : ''}` : ''}
              </Text>

              {flagged ? (
                <TextInput
                  value={comments[row.key] ?? row.week.customComment}
                  onChangeText={(t) => setComments((p) => ({ ...p, [row.key]: t }))}
                  placeholder="Comment required — explain the variance"
                  placeholderTextColor={colors.textMuted}
                  style={s.commentInput}
                  multiline
                />
              ) : null}

              <View style={s.revisedRow}>
                <Text style={s.revisedLabel}>Revised</Text>
                <TextInput
                  ref={(el) => {
                    inputRefs.current[row.key] = el;
                  }}
                  value={draft}
                  onChangeText={(t) => setDrafts((p) => ({ ...p, [row.key]: t.replace(/[^0-9]/g, '') }))}
                  onBlur={() => saveRow(row)}
                  onSubmitEditing={() => {
                    saveRow(row);
                    focusNext(idx);
                  }}
                  returnKeyType={idx === sortedRows.length - 1 ? 'done' : 'next'}
                  keyboardType="number-pad"
                  placeholder="—"
                  placeholderTextColor={colors.textMuted}
                  style={s.revisedInput}
                />
                <TouchableOpacity
                  onPress={() => {
                    const budgetVal = row.week.projectedQty;
                    setDrafts((p) => ({ ...p, [row.key]: String(budgetVal) }));
                    saveRow(row, budgetVal);
                  }}
                  style={s.sameChip}
                >
                  <Text style={s.sameChipText}>= Budget</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })
      )}
    </View>
  );
}

function RowStatusIcon({ status }: { status: RowStatus }) {
  if (status === 'saving') return <ActivityIndicator size="small" color={colors.textMuted} />;
  if (status === 'saved') return <Ionicons name="checkmark-circle" size={16} color={colors.success} />;
  if (status === 'error') return <Ionicons name="alert-circle" size={16} color={colors.error} />;
  return null;
}

const s = StyleSheet.create({
  progressRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  progressText: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: colors.text },
  filterChip: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: borderRadius.full, backgroundColor: colors.surfaceAlt },
  filterChipActive: { backgroundColor: colors.primary },
  filterChipText: { fontFamily: fontFamily.medium, fontSize: fontSize.xs, color: colors.textSecondary },
  filterChipTextActive: { color: colors.textOnPrimary },

  loadingCard: { paddingVertical: spacing.xl, alignItems: 'center' },
  emptyText: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.textMuted, textAlign: 'center', paddingVertical: spacing.lg },

  row: {
    backgroundColor: colors.surface, borderRadius: borderRadius.md,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
    padding: spacing.md, marginBottom: spacing.sm, ...shadow.sm,
  },
  rowFlagged: { borderColor: colors.error, borderWidth: 1 },
  rowHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  rowTitle: { flex: 1, fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: colors.text },
  rowContext: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },

  commentInput: {
    marginTop: spacing.sm, fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.text,
    backgroundColor: colors.background, borderRadius: borderRadius.sm, borderWidth: 1, borderColor: colors.error,
    padding: spacing.sm, minHeight: 44, textAlignVertical: 'top',
  },

  revisedRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  revisedLabel: { fontFamily: fontFamily.medium, fontSize: fontSize.xs, color: colors.textMuted },
  revisedInput: {
    flex: 1, fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: colors.text,
    backgroundColor: colors.background, borderRadius: borderRadius.sm, borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: spacing.sm, paddingVertical: 6,
  },
  sameChip: { paddingHorizontal: spacing.sm, paddingVertical: 6, borderRadius: borderRadius.sm, backgroundColor: colors.surfaceAlt },
  sameChipText: { fontFamily: fontFamily.medium, fontSize: 10, color: colors.textSecondary },
});
