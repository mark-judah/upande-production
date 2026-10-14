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
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Card, Alert } from '@/src/components/Card';
import { Button } from '@/src/components/Button';
import { LabeledInput } from '@/src/components/LabeledInput';
import { Dropdown } from '@/src/components/Dropdown';
import { Spinner } from '@/src/components/Spinner';
import { useToast } from '@/src/components/Toast';
import { borderRadius, colors, fontFamily, fontSize, spacing } from '@/src/theme';
import { useCropCycleStore } from '@/src/stores/cropCycleStore';
import { UPROOT_REASONS } from '@/src/services/crop-cycle';

function todayIso(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export default function UprootCropCycleScreen() {
  const router = useRouter();
  const toast = useToast();
  const params = useLocalSearchParams<{ cycle?: string }>();
  const cycleName = typeof params.cycle === 'string' ? decodeURIComponent(params.cycle) : '';

  const cycles = useCropCycleStore((s) => s.cycles);
  const load = useCropCycleStore((s) => s.load);
  const acting = useCropCycleStore((s) => s.acting);
  const recordUproot = useCropCycleStore((s) => s.recordUproot);

  const cycle = useMemo(() => cycles.find((c) => c.name === cycleName), [cycles, cycleName]);

  const [refreshing, setRefreshing] = useState(false);
  const [uprootDate, setUprootDate] = useState(todayIso());
  const [fromBed, setFromBed] = useState('');
  const [toBed, setToBed] = useState('');
  const [qty, setQty] = useState('');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');

  // Seed the bed range once the cycle resolves (list may still be loading on
  // first mount, e.g. after a deep link or app restart).
  useEffect(() => {
    if (cycle) {
      setFromBed((prev) => prev || String(cycle.startBed ?? ''));
      setToBed((prev) => prev || String(cycle.endBed ?? ''));
    }
  }, [cycle]);

  useEffect(() => {
    if (!cycle) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const currentPlants = cycle?.plants ?? 0;
  const qtyNum = Number(qty) || 0;
  const remaining = Math.max(currentPlants - qtyNum, 0);
  const overCount = qtyNum > currentPlants;

  const onSubmit = async () => {
    if (!cycle) {
      toast.showError('Crop cycle not found.');
      return;
    }
    if (!uprootDate || !fromBed || !toBed || !qty || !reason) {
      toast.showError('Fill all required fields.');
      return;
    }
    const outcome = await recordUproot({
      crop_cycle: cycle.name,
      uproot_date: uprootDate,
      from_bed: Number(fromBed),
      to_bed: Number(toBed),
      qty_uprooted: Number(qty),
      reason,
      notes: notes || undefined,
    });
    if (outcome.ok) {
      toast.showSuccess(outcome.message || 'Uproot recorded.');
      router.back();
    } else {
      toast.showError(outcome.error);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8} style={s.headerBtn}>
          <Ionicons name="close" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Record Uproot</Text>
        <View style={s.headerBtn} />
      </View>

      <KeyboardAwareScrollView
        contentContainerStyle={s.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        enableOnAndroid
        extraScrollHeight={40}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {!cycle ? (
          <Card>
            <Spinner label="Loading crop cycle…" />
          </Card>
        ) : (
          <>
            <Card title="Crop cycle">
              <Text style={s.cycleTitle}>
                {cycle.variety ? `${cycle.variety} — ${cycle.greenhouse}` : cycle.greenhouse}
              </Text>
              <Text style={s.cycleSub}>{cycle.farm || '—'}</Text>

              <View style={s.statRow}>
                <View style={s.statBox}>
                  <Text style={s.statLabel}>Current plants</Text>
                  <Text style={s.statValue}>{currentPlants}</Text>
                </View>
                <Ionicons name="arrow-forward" size={16} color={colors.textMuted} style={s.statArrow} />
                <View style={s.statBox}>
                  <Text style={s.statLabel}>Uprooting now</Text>
                  <Text style={[s.statValue, qtyNum > 0 && { color: colors.danger }]}>{qtyNum}</Text>
                </View>
                <Ionicons name="arrow-forward" size={16} color={colors.textMuted} style={s.statArrow} />
                <View style={s.statBox}>
                  <Text style={s.statLabel}>Remaining</Text>
                  <Text style={s.statValue}>{remaining}</Text>
                </View>
              </View>
              {overCount ? (
                <Alert tone="warn">Qty uprooted is more than the current plant count for this cycle.</Alert>
              ) : null}
            </Card>

            <Card title="Uproot details">
              <LabeledInput
                label="Uproot date"
                value={uprootDate}
                onChangeText={setUprootDate}
                placeholder="YYYY-MM-DD"
                iconLeft="calendar-outline"
                autoCapitalize="none"
              />

              <View style={s.row2}>
                <View style={{ flex: 1 }}>
                  <LabeledInput
                    label="From bed"
                    value={fromBed}
                    onChangeText={setFromBed}
                    keyboardType="number-pad"
                    iconLeft="git-commit-outline"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <LabeledInput
                    label="To bed"
                    value={toBed}
                    onChangeText={setToBed}
                    keyboardType="number-pad"
                    iconLeft="git-commit-outline"
                  />
                </View>
              </View>

              <LabeledInput
                label="Qty uprooted"
                value={qty}
                onChangeText={setQty}
                keyboardType="number-pad"
                iconLeft="trash-outline"
              />

              <Dropdown
                label="Reason"
                value={reason}
                onChange={setReason}
                options={UPROOT_REASONS.map((r) => ({ value: r, label: r }))}
                searchable={false}
                placeholder="Pick a reason"
              />

              <View style={{ height: spacing.md }} />
              <Text style={s.fieldLabel}>Notes (optional)</Text>
              <TextInput
                value={notes}
                onChangeText={setNotes}
                multiline
                numberOfLines={3}
                placeholder="Anything worth noting"
                placeholderTextColor={colors.textMuted}
                style={s.textarea}
              />
            </Card>

            <Button label="Submit uproot" loading={acting} onPress={onSubmit} style={{ marginTop: spacing.sm }} />
          </>
        )}
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  headerBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', fontFamily: fontFamily.semiBold, fontSize: fontSize.lg, color: colors.text },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },

  cycleTitle: { fontFamily: fontFamily.bold, fontSize: fontSize.md, color: colors.text },
  cycleSub: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.textSecondary, marginTop: 2 },

  statRow: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.md, gap: spacing.xs },
  statBox: { flex: 1, alignItems: 'center', backgroundColor: colors.surfaceAlt, borderRadius: borderRadius.md, paddingVertical: spacing.sm },
  statArrow: { flexShrink: 0 },
  statLabel: { fontFamily: fontFamily.medium, fontSize: 10, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.3 },
  statValue: { fontFamily: fontFamily.bold, fontSize: fontSize.lg, color: colors.text, marginTop: 2 },

  row2: { flexDirection: 'row', gap: spacing.md },
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
});
