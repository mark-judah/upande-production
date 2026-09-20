import React, { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Card, Alert } from '@/src/components/Card';
import { LabeledInput } from '@/src/components/LabeledInput';
import { Dropdown, type DropdownOption } from '@/src/components/Dropdown';
import { Spinner } from '@/src/components/Spinner';
import { Button } from '@/src/components/Button';
import { useToast } from '@/src/components/Toast';
import { setCameraResultCallback } from '@/src/components/CameraScannerScreen';
import { borderRadius, colors, fontFamily, fontSize, spacing } from '@/src/theme';
import { formatExactTime } from '@/src/date';
import { parseScanned } from '@/src/services/grading';
import { harvestingApi } from '@/src/services/harvesting';
import { bucketStatusApi, type BucketEntry, type BucketStatus } from '@/src/services/bucketStatus';

function openScanner(onScan: (code: string) => void) {
  setCameraResultCallback(onScan);
  router.push('/camera-scanner' as never);
}

function toOptions(list: { name: string; label: string }[]): DropdownOption[] {
  return list.map((o) => ({ value: o.name, label: o.label }));
}

export default function BucketStatusScreen() {
  const { showError, showSuccess } = useToast();
  const [raw, setRaw] = useState('');
  const [bucketId, setBucketId] = useState('');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [result, setResult] = useState<BucketStatus | null>(null);

  // Only one row's editor is ever open at a time, so a flat index (rather
  // than per-row state) is enough here.
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editVariety, setEditVariety] = useState('');
  const [editStemLength, setEditStemLength] = useState('');
  const [editCutStage, setEditCutStage] = useState('');
  const [editQty, setEditQty] = useState('');
  const [editVarietyOptions, setEditVarietyOptions] = useState<DropdownOption[]>([]);
  const [editStemLengthOptions, setEditStemLengthOptions] = useState<DropdownOption[]>([]);
  const [editCutStageOptions, setEditCutStageOptions] = useState<DropdownOption[]>([]);
  const [editOptionsLoading, setEditOptionsLoading] = useState(false);
  const [editSaving, setEditSaving] = useState(false);

  // Only a deliberate submit (keyboard "done" or a completed camera scan)
  // triggers a lookup -- not every keystroke while the operator is still
  // typing a bucket ID by hand.
  const submit = (text: string) => {
    const parsed = parseScanned(text, 'bucket') || text.trim();
    if (parsed) setBucketId(parsed);
  };

  const loadStatus = useCallback(
    (id: string) => {
      setLoading(true);
      return bucketStatusApi
        .getStatus(id)
        .then((status) => setResult(status))
        .catch((err) => showError(err?.message || 'Could not look up that bucket.'))
        .finally(() => setLoading(false));
    },
    [showError],
  );

  useEffect(() => {
    if (!bucketId) return;
    setResult(null);
    setEditingIndex(null);
    loadStatus(bucketId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bucketId]);

  // Re-runs the current lookup. Nothing to refresh until a bucket has been
  // looked up at least once.
  const onRefresh = async () => {
    if (!bucketId) return;
    setRefreshing(true);
    try {
      await loadStatus(bucketId);
    } finally {
      setRefreshing(false);
    }
  };

  const fmt = (n: number) => n.toLocaleString();

  const startEdit = (index: number, entry: BucketEntry) => {
    setEditingIndex(index);
    setEditVariety(entry.variety);
    setEditStemLength(entry.stemLength);
    setEditCutStage(entry.cutStage);
    setEditQty(String(entry.qty));
    setEditVarietyOptions([]);
    setEditStemLengthOptions([]);
    setEditCutStageOptions([]);
    setEditOptionsLoading(true);
    Promise.all([harvestingApi.getGreenhouseData(entry.greenhouse), harvestingApi.listStemLengths()])
      .then(([ghData, stemLengths]) => {
        setEditVarietyOptions(toOptions(ghData.varieties));
        setEditStemLengthOptions(toOptions(stemLengths));
        setEditCutStageOptions(ghData.cutStages.map((c) => ({ value: c, label: c })));
      })
      .catch((err) => showError(err?.message || 'Could not load variety/length options.'))
      .finally(() => setEditOptionsLoading(false));
  };

  const cancelEdit = () => setEditingIndex(null);

  const saveEdit = (entry: BucketEntry) => {
    if (!entry.name) {
      showError('This entry is missing its reference — pull to refresh and try again.');
      return;
    }
    const qty = Number(editQty);
    if (!Number.isFinite(qty) || qty <= 0) {
      showError('Quantity must be a positive number.');
      return;
    }
    setEditSaving(true);
    bucketStatusApi
      .editEntry({
        stockEntryName: entry.name,
        variety: editVariety,
        stemLength: editStemLength,
        cutStage: editCutStage,
        qty,
      })
      .then(() => {
        showSuccess('Entry updated.');
        setEditingIndex(null);
        return loadStatus(bucketId);
      })
      .catch((err) => showError(err?.message || 'Could not save that edit.'))
      .finally(() => setEditSaving(false));
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={s.scroll}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <Card>
        <LabeledInput
          label="Bucket"
          value={raw}
          onChangeText={setRaw}
          onSubmitEditing={() => submit(raw)}
          placeholder="Scan or type the bucket QR"
          iconLeft="cube-outline"
          trailingIcon="camera-outline"
          onPressTrailing={() =>
            openScanner((code) => {
              setRaw(code);
              submit(code);
            })
          }
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />
      </Card>

      {loading ? (
        <Card>
          <Spinner label="Looking up…" />
        </Card>
      ) : result ? (
        result.received === null ? (
          <Card>
            <Alert tone="info">Bucket {result.bucketId} has never been harvested into.</Alert>
          </Card>
        ) : (
          <Card>
            <Text style={s.bucketTitle}>Bucket {result.bucketId}</Text>
            <View style={[s.statusBadge, result.received ? s.statusReceived : s.statusPending]}>
              <Text style={[s.statusText, result.received ? s.statusReceivedText : s.statusPendingText]}>
                {result.received
                  ? `Received ${result.receivedAt ? formatExactTime(result.receivedAt) : ''}`
                  : 'Not yet received'}
              </Text>
            </View>
            <Text style={s.bucketTotal}>
              Latest journey · {fmt(result.totalStems)} stems · {result.entries.length}{' '}
              {result.entries.length === 1 ? 'entry' : 'entries'}
            </Text>
            <View style={s.table}>
              {result.entries.map((e, i) =>
                editingIndex === i ? (
                  <View key={i} style={[s.row, s.rowEditing, i === 0 && s.rowFirst]}>
                    <View style={s.editForm}>
                      <Text style={s.editLabel}>Correcting entry from {formatExactTime(e.time)}</Text>
                      {editOptionsLoading ? (
                        <Spinner inline label="Loading options…" />
                      ) : (
                        <>
                          <Dropdown
                            label="Variety"
                            value={editVariety}
                            onChange={setEditVariety}
                            options={editVarietyOptions}
                            emptyText={`No varieties planted in ${e.greenhouse}`}
                          />
                          <View style={{ height: spacing.sm }} />
                          <Dropdown
                            label="Stem Length"
                            value={editStemLength}
                            onChange={setEditStemLength}
                            options={editStemLengthOptions}
                          />
                          <View style={{ height: spacing.sm }} />
                          <Dropdown
                            label="Cut stage"
                            value={editCutStage}
                            onChange={setEditCutStage}
                            options={editCutStageOptions}
                            searchable={false}
                          />
                          <View style={{ height: spacing.sm }} />
                          <LabeledInput
                            label="Number of stems"
                            value={editQty}
                            onChangeText={setEditQty}
                            keyboardType="number-pad"
                          />
                        </>
                      )}
                      <View style={s.editActions}>
                        <View style={{ flex: 1 }}>
                          <Button label="Cancel" variant="outline" onPress={cancelEdit} disabled={editSaving} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Button
                            label="Save"
                            onPress={() => saveEdit(e)}
                            loading={editSaving}
                            disabled={
                              editOptionsLoading ||
                              (!editVariety && !editStemLength && !editCutStage && !editQty)
                            }
                          />
                        </View>
                      </View>
                    </View>
                  </View>
                ) : (
                  <View key={i} style={[s.row, i === 0 && s.rowFirst]}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.variety}>{e.variety}</Text>
                      <Text style={s.meta}>
                        {e.greenhouse} · {e.stemLength}
                      </Text>
                      <Text style={s.meta}>
                        {e.cutStage} · {e.harvester}
                      </Text>
                      <Text style={s.time}>{formatExactTime(e.time)}</Text>
                    </View>
                    <Text style={s.qty}>{fmt(e.qty)}</Text>
                    {!result.received ? (
                      <TouchableOpacity
                        onPress={() => startEdit(i, e)}
                        hitSlop={8}
                        style={s.editButton}
                        disabled={editingIndex !== null}
                      >
                        <Ionicons name="pencil-outline" size={16} color={colors.textSecondary} />
                      </TouchableOpacity>
                    ) : null}
                  </View>
                ),
              )}
            </View>
          </Card>
        )
      ) : null}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  bucketTitle: { fontFamily: fontFamily.bold, fontSize: fontSize.lg, color: colors.text },
  statusBadge: {
    alignSelf: 'flex-start',
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    marginTop: spacing.xs,
  },
  statusReceived: { backgroundColor: '#DCFCE7' },
  statusPending: { backgroundColor: '#FEF3C7' },
  statusText: { fontFamily: fontFamily.semiBold, fontSize: fontSize.xs },
  statusReceivedText: { color: colors.success },
  statusPendingText: { color: colors.warning },
  bucketTotal: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginTop: 2,
    marginBottom: spacing.sm,
  },
  table: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  rowFirst: { borderTopWidth: 0 },
  variety: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: colors.text },
  meta: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 2 },
  time: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
  qty: { fontFamily: fontFamily.semiBold, fontSize: fontSize.md, color: colors.primary, marginLeft: spacing.sm },
  editButton: {
    marginLeft: spacing.sm,
    width: 28,
    height: 28,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
  },
  rowEditing: { backgroundColor: colors.surfaceAlt },
  editForm: { flex: 1, padding: spacing.xs, gap: spacing.xs },
  editLabel: { fontFamily: fontFamily.medium, fontSize: fontSize.xs, color: colors.textSecondary, marginBottom: 2 },
  editActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
});
