import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { borderRadius, colors, fontFamily, fontSize, shadow, spacing } from '@/src/theme';
import { useToast } from '@/src/components/Toast';
import { mapAxiosError } from '@/src/services/api';
import { productionProjectionApi, type ProjectionWeek } from '@/src/services/production-projection';
import type { PickerOption } from '@/src/services/crop-cycle';

/**
 * "This Week" — the actual job Forecasting exists for: fill in Revised for
 * every greenhouse×variety, for one week, as fast as typing a spreadsheet
 * column. Not a review dashboard with edit bolted on. Rows come a page at a
 * time from one server call; rows needing a comment come first.
 */

const PAGE_SIZE = 50;

interface EntryRow {
  key: string;
  greenhouse: string;
  greenhouseLabel: string;
  variety: string;
  varietyLabel: string;
  projectionName: string;
  flagged: boolean;
  week: ProjectionWeek;
}

type RowStatus = 'idle' | 'saving' | 'saved' | 'error';

export function ForecastThisWeek({
  greenhouses,
  year,
  weekNo,
  currentWeek,
  search = '',
  offBudgetOnly = false,
}: {
  greenhouses: PickerOption[];
  year: string;
  weekNo: number;
  currentWeek: number;
  /** Filters rows by greenhouse or variety name. Owned by the screen (shared
   *  with Browse mode's search box) rather than this component. */
  search?: string;
  /** Owned by the screen's filter sheet, not this component, so it can be
   *  reset centrally and shown/hidden alongside the other filter controls. */
  offBudgetOnly?: boolean;
}) {
  const { showError } = useToast();

  const [rows, setRows] = useState<EntryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [filledCount, setFilledCount] = useState(0);
  const [query, setQuery] = useState(search.trim());
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [comments, setComments] = useState<Record<string, string>>({});
  const [rowStatus, setRowStatus] = useState<Record<string, RowStatus>>({});

  const inputRefs = useRef<Record<string, TextInput | null>>({});
  const loadSeq = useRef(0);
  // Guards against out-of-order save responses: if a row is blurred twice in
  // quick succession, only the response to the LAST save should be allowed
  // to update local state, even if an earlier request happens to resolve
  // later (slow network, retry, etc.).
  const saveGen = useRef<Record<string, number>>({});

  const hasActualContext = weekNo <= currentWeek;

  useEffect(() => {
    const t = setTimeout(() => setQuery(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(0);
  }, [greenhouses, year, weekNo, query, offBudgetOnly]);

  useEffect(() => {
    const seq = ++loadSeq.current;
    setDrafts({});
    setComments({});
    setRowStatus({});
    if (greenhouses.length === 0) {
      setRows([]);
      setTotal(0);
      setFilledCount(0);
      return;
    }
    setLoading(true);
    const labels = new Map(greenhouses.map((g) => [g.name, g.label]));
    productionProjectionApi
      .fetchWeekPage({
        greenhouses: greenhouses.map((g) => g.name),
        year,
        weekNo,
        currentWeek,
        search: query,
        offBudgetOnly,
        start: page * PAGE_SIZE,
        pageLength: PAGE_SIZE,
      })
      .then((res) => {
        if (loadSeq.current !== seq) return;
        setTotal(res.total);
        setFilledCount(res.filled);
        setRows(
          res.rows.map((r) => ({
            key: `${r.greenhouse}::${r.variety}`,
            greenhouse: r.greenhouse,
            greenhouseLabel: labels.get(r.greenhouse) ?? r.greenhouse,
            variety: r.variety,
            varietyLabel: r.variety,
            projectionName: r.projectionName,
            flagged: r.flagged,
            week: r.week,
          })),
        );
      })
      .catch((err) => {
        if (loadSeq.current !== seq) return;
        setRows([]);
        setTotal(0);
        showError(mapAxiosError(err).message);
      })
      .finally(() => {
        if (loadSeq.current === seq) setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- showError is a fresh closure each render
  }, [greenhouses, year, weekNo, currentWeek, query, offBudgetOnly, page]);

  const isFlagged = (row: EntryRow): boolean => row.flagged;
  const sortedRows = rows;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

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
      if (!(row.week.revisedForecast > 0) && n > 0) setFilledCount((c) => c + 1);
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
      <Text style={s.progressText}>{loading ? 'Loading…' : `${filledCount} of ${total} filled`}</Text>

      {loading ? (
        <View style={s.loadingCard}>
          <ActivityIndicator color={colors.textMuted} />
        </View>
      ) : rows.length === 0 ? (
        <Text style={s.emptyText}>
          {query || offBudgetOnly ? `No match${query ? ` for "${query}"` : ''}.` : `No projections found for week ${weekNo}.`}
        </Text>
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

      {!loading && total > PAGE_SIZE ? (
        <View style={s.pager}>
          <TouchableOpacity
            onPress={() => setPage((p) => p - 1)}
            disabled={page === 0}
            style={[s.pageBtn, page === 0 && s.pageBtnOff]}
          >
            <Ionicons name="chevron-back" size={16} color={colors.text} />
          </TouchableOpacity>
          <Text style={s.pageText}>
            {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
          </Text>
          <TouchableOpacity
            onPress={() => setPage((p) => p + 1)}
            disabled={page >= pages - 1}
            style={[s.pageBtn, page >= pages - 1 && s.pageBtnOff]}
          >
            <Ionicons name="chevron-forward" size={16} color={colors.text} />
          </TouchableOpacity>
        </View>
      ) : null}
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
  progressText: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: colors.text, marginBottom: spacing.md },

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

  pager: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.md, paddingVertical: spacing.md },
  pageBtn: {
    padding: spacing.sm, borderRadius: borderRadius.sm, backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
  },
  pageBtnOff: { opacity: 0.4 },
  pageText: { fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: colors.text },
});
