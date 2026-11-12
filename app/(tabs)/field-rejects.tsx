import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { Card, Alert } from '@/src/components/Card';
import { Button } from '@/src/components/Button';
import { LabeledInput } from '@/src/components/LabeledInput';
import { Dropdown } from '@/src/components/Dropdown';
import { FAB } from '@/src/components/FAB';
import { Sheet } from '@/src/components/Sheet';
import { useToast } from '@/src/components/Toast';
import { Pill } from '@/src/components/Pill';
import { borderRadius, colors, fontFamily, fontSize, shadow, spacing } from '@/src/theme';
import { useRefreshOnFocus } from '@/src/hooks/useRefreshOnFocus';
import { useCropCycleStore } from '@/src/stores/cropCycleStore';
import { useFieldRejectsStore } from '@/src/stores/fieldRejectsStore';

export default function FieldRejectsScreen() {
  const [open, setOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const loadPickers = useCropCycleStore((s) => s.loadPickers);
  const loadRejectionReasons = useCropCycleStore((s) => s.loadRejectionReasons);
  const farms = useCropCycleStore((s) => s.farms);
  const greenhouses = useCropCycleStore((s) => s.greenhouses);

  const entries = useFieldRejectsStore((s) => s.entries);
  const total = useFieldRejectsStore((s) => s.total);
  const totalStems = useFieldRejectsStore((s) => s.totalStems);
  const listLoading = useFieldRejectsStore((s) => s.listLoading);
  const listError = useFieldRejectsStore((s) => s.listError);
  const filterFarm = useFieldRejectsStore((s) => s.filterFarm);
  const filterGreenhouse = useFieldRejectsStore((s) => s.filterGreenhouse);
  const setFilters = useFieldRejectsStore((s) => s.setFilters);
  const loadEntries = useFieldRejectsStore((s) => s.loadEntries);
  const loadMore = useFieldRejectsStore((s) => s.loadMore);

  useRefreshOnFocus(() => {
    loadPickers();
    loadRejectionReasons();
    loadEntries();
  });

  const onRefresh = async () => {
    setRefreshing(true);
    try { await Promise.all([loadPickers(), loadRejectionReasons(), loadEntries()]); } finally { setRefreshing(false); }
  };

  const farmOptions = useMemo(
    () => [{ value: '', label: 'All farms' }, ...farms.map((f) => ({ value: f.name, label: f.label }))],
    [farms],
  );
  const greenhouseOptions = useMemo(
    () => [
      { value: '', label: 'All greenhouses' },
      ...greenhouses
        .filter((g) => !filterFarm || g.farm === filterFarm)
        .map((g) => ({ value: g.name, label: g.label })),
    ],
    [greenhouses, filterFarm],
  );

  const onFarm = (farm: string) => {
    const gh = greenhouses.find((g) => g.name === filterGreenhouse);
    setFilters(farm, farm && gh && gh.farm !== farm ? '' : filterGreenhouse);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={s.filters}>
          <View style={{ flex: 1 }}>
            <Dropdown value={filterFarm} onChange={onFarm} options={farmOptions} placeholder="All farms" />
          </View>
          <View style={{ flex: 1 }}>
            <Dropdown
              value={filterGreenhouse}
              onChange={(gh) => setFilters(filterFarm, gh)}
              options={greenhouseOptions}
              placeholder="All greenhouses"
              searchable
            />
          </View>
        </View>

        <View style={s.summary}>
          <Pill label="Entries" value={total.toLocaleString()} />
          <Pill label="Stems" value={Math.round(totalStems).toLocaleString()} tone="danger" />
        </View>

        {listError ? <Card><Alert tone="danger">{listError}</Alert></Card> : null}

        {listLoading && entries.length === 0 ? (
          <ActivityIndicator color={colors.textMuted} style={{ marginTop: spacing.xl }} />
        ) : entries.length === 0 && !listError ? (
          <Card><Alert tone="info">No field rejects.</Alert></Card>
        ) : (
          entries.map((e) => (
            <View key={`${e.name}::${e.variety}::${e.greenhouse}`} style={s.entry}>
              <View style={s.entryHead}>
                <Text style={s.entryTitle} numberOfLines={1}>{e.variety}</Text>
                <Text style={s.entryStems}>{Math.round(e.stems).toLocaleString()} stems</Text>
              </View>
              <Text style={s.entryMeta} numberOfLines={1}>
                {[e.greenhouse, e.farm].filter(Boolean).join(' · ')}
              </Text>
              {e.reason ? <Text style={s.entryReason}>{e.reason}</Text> : null}
              <Text style={s.entryFoot} numberOfLines={1}>
                {[e.date, e.time].filter(Boolean).join(' ')}
                {e.recordedBy ? ` · ${e.recordedBy}` : ''} · {e.name}
              </Text>
            </View>
          ))
        )}

        {entries.length > 0 && entries.length < total ? (
          <TouchableOpacity onPress={loadMore} disabled={listLoading} style={s.more}>
            {listLoading ? (
              <ActivityIndicator color={colors.textMuted} />
            ) : (
              <Text style={s.moreText}>Load more ({entries.length} of {total})</Text>
            )}
          </TouchableOpacity>
        ) : null}
      </ScrollView>

      <FAB
        icon="add"
        expanded={open}
        onPress={() => setOpen((p) => !p)}
      />

      <NewFieldRejectSheet visible={open} onClose={() => setOpen(false)} />
    </View>
  );
}

function NewFieldRejectSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { showSuccess, showError } = useToast();
  const greenhouses = useCropCycleStore((st) => st.greenhouses);
  const farms = useCropCycleStore((st) => st.farms);
  const rejectionReasons = useCropCycleStore((st) => st.rejectionReasons);
  const acting = useFieldRejectsStore((st) => st.acting);
  const submit = useFieldRejectsStore((st) => st.submit);

  // Varieties are scoped to the selected greenhouse and come from the real
  // Item master (via getGreenhouseData — the same endpoint the known-correct
  // Harvesting screen uses), not a narrow, separately-configured allow-list.
  const varieties = useFieldRejectsStore((st) => st.varieties);
  const varietiesLoading = useFieldRejectsStore((st) => st.varietiesLoading);
  const loadVarietiesForGreenhouse = useFieldRejectsStore((st) => st.loadVarietiesForGreenhouse);
  const resetVarieties = useFieldRejectsStore((st) => st.resetVarieties);

  const [variety, setVariety] = useState('');
  const [farm, setFarm] = useState('');
  const [greenhouse, setGreenhouse] = useState('');
  const [stems, setStems] = useState('');
  const [reason, setReason] = useState('');

  // Greenhouse picks its own varieties -- clear + refetch whenever it changes,
  // same cascade as the Harvesting screen.
  useEffect(() => {
    setVariety('');
    if (greenhouse) {
      loadVarietiesForGreenhouse(greenhouse);
    } else {
      resetVarieties();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [greenhouse]);

  const reset = () => {
    setVariety('');
    setFarm('');
    setGreenhouse('');
    setStems('');
    setReason('');
    resetVarieties();
  };

  const onSubmit = async () => {
    if (!variety || !farm || !greenhouse || !stems || !reason) {
      showError('Fill every field.');
      return;
    }
    const qty = Number(stems);
    if (!Number.isFinite(qty) || qty <= 0) {
      showError('Number of stems must be a positive integer.');
      return;
    }
    const outcome = await submit({
      variety,
      no_of_stems: qty,
      rejection_reason: reason,
      farm,
      greenhouse,
    });
    if (outcome.ok) {
      showSuccess(outcome.message);
      reset();
      onClose();
    } else {
      showError(outcome.error);
    }
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="New field rejection" hideCloseButton>
      <KeyboardAwareScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} bottomOffset={40}>
        <Dropdown
          label="Farm"
          value={farm}
          onChange={setFarm}
          options={farms.map((f) => ({ value: f.name, label: f.label }))}
          placeholder="Pick the farm"
        />
        <View style={{ height: spacing.md }} />

        <Dropdown
          label="Greenhouse"
          value={greenhouse}
          onChange={setGreenhouse}
          options={greenhouses.map((g) => ({ value: g.name, label: g.label }))}
          placeholder="Pick the greenhouse"
        />
        <View style={{ height: spacing.md }} />

        {/* Scoped to the selected greenhouse — real Items standing in it
            (via getGreenhouseData), not a separate narrow allow-list. */}
        <Dropdown
          label="Variety"
          value={variety}
          onChange={setVariety}
          options={varieties.map((v) => ({ value: v.name, label: v.label }))}
          placeholder={
            !greenhouse
              ? 'Pick a greenhouse first'
              : varietiesLoading
                ? 'Loading…'
                : 'Pick the rose variety'
          }
          disabled={!greenhouse || varietiesLoading}
        />
        <View style={{ height: spacing.md }} />

        <LabeledInput
          label="Number of stems"
          value={stems}
          onChangeText={setStems}
          keyboardType="number-pad"
          iconLeft="trash-outline"
          placeholder="e.g. 50"
        />

        <Dropdown
          label="Rejection reason"
          value={reason}
          onChange={setReason}
          options={rejectionReasons.map((r) => ({ value: r.name, label: r.label }))}
          placeholder="Pick a reason"
        />
        <View style={{ height: spacing.md }} />

        <Button label="Submit rejection" loading={acting} onPress={onSubmit} />
        <View style={{ height: spacing.xl }} />
      </KeyboardAwareScrollView>
    </Sheet>
  );
}

const s = StyleSheet.create({
  scroll: { padding: spacing.lg, paddingBottom: 96 },
  filters: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  summary: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  entry: {
    backgroundColor: colors.surface, borderRadius: borderRadius.md,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
    padding: spacing.md, marginBottom: spacing.sm, ...shadow.sm,
  },
  entryHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  entryTitle: { flex: 1, fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: colors.text },
  entryStems: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: colors.error },
  entryMeta: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 2 },
  entryReason: { fontFamily: fontFamily.medium, fontSize: fontSize.xs, color: colors.text, marginTop: spacing.xs },
  entryFoot: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textMuted, marginTop: spacing.xs },
  more: { paddingVertical: spacing.md, alignItems: 'center' },
  moreText: { fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: colors.primary },
});
