import React, { useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { Card, Alert } from '@/src/components/Card';
import { Button } from '@/src/components/Button';
import { LabeledInput } from '@/src/components/LabeledInput';
import { Dropdown } from '@/src/components/Dropdown';
import { FAB } from '@/src/components/FAB';
import { Sheet } from '@/src/components/Sheet';
import { useToast } from '@/src/components/Toast';
import { colors, spacing } from '@/src/theme';
import { useRefreshOnFocus } from '@/src/hooks/useRefreshOnFocus';
import { useCropCycleStore } from '@/src/stores/cropCycleStore';
import { useFieldRejectsStore } from '@/src/stores/fieldRejectsStore';

export default function FieldRejectsScreen() {
  const [open, setOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const loadPickers = useCropCycleStore((s) => s.loadPickers);
  const loadRejectionReasons = useCropCycleStore((s) => s.loadRejectionReasons);

  useRefreshOnFocus(() => {
    loadPickers();
    loadRejectionReasons();
  });

  const onRefresh = async () => {
    setRefreshing(true);
    try { await Promise.all([loadPickers(), loadRejectionReasons()]); } finally { setRefreshing(false); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Empty list — for now we only support submission, not history view */}
        <Card><Alert tone="info">Tap the + button to log a rejection.</Alert></Card>
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
  const varieties = useCropCycleStore((st) => st.varieties);
  const farms = useCropCycleStore((st) => st.farms);
  const rejectionReasons = useCropCycleStore((st) => st.rejectionReasons);
  const acting = useFieldRejectsStore((st) => st.acting);
  const submit = useFieldRejectsStore((st) => st.submit);

  const [variety, setVariety] = useState('');
  const [farm, setFarm] = useState('');
  const [greenhouse, setGreenhouse] = useState('');
  const [stems, setStems] = useState('');
  const [reason, setReason] = useState('');

  const reset = () => {
    setVariety('');
    setFarm('');
    setGreenhouse('');
    setStems('');
    setReason('');
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
      <KeyboardAwareScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} enableOnAndroid extraScrollHeight={40}>
        <Dropdown
          label="Variety"
          value={variety}
          onChange={setVariety}
          options={varieties.map((v) => ({ value: v.name, label: v.label }))}
          placeholder="Pick the rose variety"
        />
        <View style={{ height: spacing.md }} />

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
});
