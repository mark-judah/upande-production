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
import { Card } from '@/src/components/Card';
import { Button } from '@/src/components/Button';
import { LabeledInput } from '@/src/components/LabeledInput';
import { Dropdown } from '@/src/components/Dropdown';
import { Spinner } from '@/src/components/Spinner';
import { useToast } from '@/src/components/Toast';
import { borderRadius, colors, fontFamily, fontSize, spacing } from '@/src/theme';
import { useCropCycleStore } from '@/src/stores/cropCycleStore';
import { REPLANT_REASONS } from '@/src/services/crop-cycle';

function todayIso(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export default function ReplantCropCycleScreen() {
  const router = useRouter();
  const toast = useToast();
  const params = useLocalSearchParams<{ cycle?: string }>();
  const cycleName = typeof params.cycle === 'string' ? decodeURIComponent(params.cycle) : '';

  const cycles = useCropCycleStore((s) => s.cycles);
  const load = useCropCycleStore((s) => s.load);
  const varieties = useCropCycleStore((s) => s.varieties);
  const loadPickers = useCropCycleStore((s) => s.loadPickers);
  const acting = useCropCycleStore((s) => s.acting);
  const recordReplant = useCropCycleStore((s) => s.recordReplant);

  const cycle = useMemo(() => cycles.find((c) => c.name === cycleName), [cycles, cycleName]);

  const [refreshing, setRefreshing] = useState(false);
  const [date, setDate] = useState(todayIso());
  const [fromBed, setFromBed] = useState('');
  const [toBed, setToBed] = useState('');
  const [newVariety, setNewVariety] = useState('');
  const [qtyUprooted, setQtyUprooted] = useState('');
  const [qtyReplanted, setQtyReplanted] = useState('');
  const [costPerPlant, setCostPerPlant] = useState('');
  const [sourceType, setSourceType] = useState<'Propagation Batch' | 'Purchase Order' | ''>('');
  const [reason, setReason] = useState('');
  const [remarks, setRemarks] = useState('');

  useEffect(() => {
    loadPickers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    await Promise.all([load(), loadPickers()]);
    setRefreshing(false);
  };

  const currentPlants = cycle?.plants ?? 0;
  const qtyUprootedNum = Number(qtyUprooted) || 0;
  const qtyReplantedNum = Number(qtyReplanted) || 0;
  const remaining = Math.max(currentPlants - qtyUprootedNum, 0) + qtyReplantedNum;

  const onSubmit = async () => {
    if (!cycle) {
      toast.showError('Crop cycle not found.');
      return;
    }
    if (!date || !fromBed || !toBed || !newVariety || !qtyUprooted || !qtyReplanted || !reason) {
      toast.showError('Fill all required fields.');
      return;
    }
    const outcome = await recordReplant({
      crop_cycle: cycle.name,
      replanting_date: date,
      from_bed: Number(fromBed),
      to_bed: Number(toBed),
      new_variety: newVariety,
      qty_uprooted: Number(qtyUprooted),
      qty_replanted: Number(qtyReplanted),
      cost_per_plant: costPerPlant ? Number(costPerPlant) : undefined,
      source_type: sourceType || undefined,
      reason,
      remarks: remarks || undefined,
    });
    if (outcome.ok) {
      toast.showSuccess(outcome.message || 'Replant recorded.');
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
        <Text style={s.headerTitle}>Record Replant</Text>
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
                Replacing {cycle.variety ? `${cycle.variety} — ${cycle.greenhouse}` : cycle.greenhouse}
              </Text>
              <Text style={s.cycleSub}>{cycle.farm || '—'}</Text>

              <View style={s.statRow}>
                <View style={s.statBox}>
                  <Text style={s.statLabel}>Current plants</Text>
                  <Text style={s.statValue}>{currentPlants}</Text>
                </View>
                <Ionicons name="arrow-forward" size={16} color={colors.textMuted} style={s.statArrow} />
                <View style={s.statBox}>
                  <Text style={[s.statValue, qtyUprootedNum > 0 && { color: colors.danger }]}>−{qtyUprootedNum}</Text>
                  <Text style={s.statLabel}>Uprooted</Text>
                </View>
                <Text style={s.statPlus}>+</Text>
                <View style={s.statBox}>
                  <Text style={[s.statValue, qtyReplantedNum > 0 && { color: colors.success }]}>+{qtyReplantedNum}</Text>
                  <Text style={s.statLabel}>Replanted</Text>
                </View>
                <Ionicons name="arrow-forward" size={16} color={colors.textMuted} style={s.statArrow} />
                <View style={s.statBox}>
                  <Text style={s.statLabel}>After</Text>
                  <Text style={s.statValue}>{remaining}</Text>
                </View>
              </View>
            </Card>

            <Card title="Replant details">
              <LabeledInput
                label="Replanting date"
                value={date}
                onChangeText={setDate}
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

              <Dropdown
                label="New variety"
                value={newVariety}
                onChange={setNewVariety}
                options={varieties.map((v) => ({ value: v.name, label: v.label }))}
                placeholder="Pick the variety being planted"
              />
              <View style={{ height: spacing.md }} />

              <View style={s.row2}>
                <View style={{ flex: 1 }}>
                  <LabeledInput
                    label="Qty uprooted"
                    value={qtyUprooted}
                    onChangeText={setQtyUprooted}
                    keyboardType="number-pad"
                    iconLeft="trash-outline"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <LabeledInput
                    label="Qty replanted"
                    value={qtyReplanted}
                    onChangeText={setQtyReplanted}
                    keyboardType="number-pad"
                    iconLeft="leaf-outline"
                  />
                </View>
              </View>

              <LabeledInput
                label="Cost per plant (optional)"
                value={costPerPlant}
                onChangeText={setCostPerPlant}
                keyboardType="decimal-pad"
                iconLeft="cash-outline"
              />

              <Dropdown
                label="Source (optional)"
                value={sourceType}
                onChange={(v) => setSourceType(v as 'Propagation Batch' | 'Purchase Order' | '')}
                options={[
                  { value: 'Propagation Batch', label: 'Propagation Batch' },
                  { value: 'Purchase Order', label: 'Purchase Order' },
                ]}
                searchable={false}
                placeholder="Where do the seedlings come from?"
              />
              <View style={{ height: spacing.md }} />

              <Dropdown
                label="Reason"
                value={reason}
                onChange={setReason}
                options={REPLANT_REASONS.map((r) => ({ value: r, label: r }))}
                searchable={false}
                placeholder="Pick a reason"
              />

              <View style={{ height: spacing.md }} />
              <Text style={s.fieldLabel}>Remarks (optional)</Text>
              <TextInput
                value={remarks}
                onChangeText={setRemarks}
                multiline
                numberOfLines={3}
                placeholder="Anything worth noting"
                placeholderTextColor={colors.textMuted}
                style={s.textarea}
              />
            </Card>

            <Button label="Submit replant" loading={acting} onPress={onSubmit} style={{ marginTop: spacing.sm }} />
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
  statPlus: { fontFamily: fontFamily.bold, fontSize: fontSize.md, color: colors.textMuted },
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
