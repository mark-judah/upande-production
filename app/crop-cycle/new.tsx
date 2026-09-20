import React, { useEffect, useMemo, useState } from 'react';
import { RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '@/src/components/Card';
import { Button } from '@/src/components/Button';
import { Dropdown, type DropdownOption } from '@/src/components/Dropdown';
import { LabeledInput } from '@/src/components/LabeledInput';
import { useToast } from '@/src/components/Toast';
import { borderRadius, colors, fontFamily, fontSize, spacing } from '@/src/theme';
import { useCropCycleStore } from '@/src/stores/cropCycleStore';
import { type BedConfigInput } from '@/src/services/crop-cycle';

interface BedRow {
  fromBed: string;
  toBed: string;
  variety: string;
  length: string;
  width: string;
  plantingDate: string;
}

const emptyBed = (): BedRow => ({
  fromBed: '',
  toBed: '',
  variety: '',
  length: '',
  width: '',
  plantingDate: '',
});

export default function NewCropCycleScreen() {
  const router = useRouter();
  const toast = useToast();
  const params = useLocalSearchParams<{ greenhouse?: string }>();
  const prefillGreenhouse = typeof params.greenhouse === 'string' ? params.greenhouse : '';
  const greenhouses = useCropCycleStore((s) => s.greenhouses);
  const varieties = useCropCycleStore((s) => s.varieties);
  const loadPickers = useCropCycleStore((s) => s.loadPickers);
  const acting = useCropCycleStore((s) => s.acting);
  const createCycle = useCropCycleStore((s) => s.createCycle);

  const [greenhouse, setGreenhouse] = useState(prefillGreenhouse);
  const [plantsPerSqm, setPlantsPerSqm] = useState('');
  const [grossArea, setGrossArea] = useState('');
  const [beds, setBeds] = useState<BedRow[]>([emptyBed()]);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadPickers();
  }, [loadPickers]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await loadPickers();
    } finally {
      setRefreshing(false);
    }
  };

  const ghOptions: DropdownOption[] = useMemo(
    () => greenhouses.map((g) => ({ label: g.label, value: g.name, sublabel: g.farm })),
    [greenhouses],
  );
  // Farm is a Crop Cycle field; derive it from the chosen greenhouse's picker.
  const farm = useMemo(
    () => greenhouses.find((g) => g.name === greenhouse)?.farm ?? '',
    [greenhouses, greenhouse],
  );
  const varietyOptions: DropdownOption[] = useMemo(
    () => varieties.map((v) => ({ label: v.label, value: v.name })),
    [varieties],
  );

  const updateBed = (i: number, patch: Partial<BedRow>) =>
    setBeds((prev) => prev.map((b, idx) => (idx === i ? { ...b, ...patch } : b)));

  const num = (v: string): number => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };

  const onSubmit = async () => {
    if (!greenhouse) {
      toast.showError('Select a greenhouse.');
      return;
    }
    const bedPayload: BedConfigInput[] = beds
      .filter((b) => b.fromBed && b.toBed && b.variety)
      .map((b) => ({
        from_bed: num(b.fromBed),
        to_bed: num(b.toBed),
        variety: b.variety,
        bed_length: num(b.length),
        bed_width: num(b.width),
        planting_date: b.plantingDate || undefined,
      }));

    if (bedPayload.length === 0) {
      toast.showError('Add at least one bed range (variety + bed numbers).');
      return;
    }

    const r = await createCycle({
      greenhouse,
      farm: farm || undefined,
      plants_per_sqm: plantsPerSqm ? num(plantsPerSqm) : undefined,
      gross_area: grossArea ? num(grossArea) : undefined,
      bed_config: bedPayload,
    });
    if (r.ok) {
      toast.showSuccess(r.message || 'Crop cycle created.');
      router.back();
    } else {
      toast.showError(r.error);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8} style={s.headerBtn}>
          <Ionicons name="close" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>New Crop Cycle</Text>
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
        <Card title="Greenhouse">
          <Dropdown
            label="Greenhouse"
            value={greenhouse}
            options={ghOptions}
            onChange={setGreenhouse}
            placeholder="Select greenhouse…"
          />
          <View style={s.twoCol}>
            <View style={s.col}>
              <LabeledInput
                label="Plants / m²"
                value={plantsPerSqm}
                onChangeText={setPlantsPerSqm}
                keyboardType="numeric"
                placeholder="e.g. 7"
              />
            </View>
            <View style={s.col}>
              <LabeledInput
                label="Gross area m²"
                value={grossArea}
                onChangeText={setGrossArea}
                keyboardType="numeric"
                placeholder="e.g. 7315"
              />
            </View>
          </View>
        </Card>

        <Card title="Bed configuration">
          {beds.map((b, i) => (
            <View key={i} style={s.rowBlock}>
              <View style={s.rowHead}>
                <Text style={s.rowHeadText}>Range {i + 1}</Text>
                {beds.length > 1 ? (
                  <TouchableOpacity onPress={() => setBeds((p) => p.filter((_, idx) => idx !== i))} hitSlop={8}>
                    <Ionicons name="trash-outline" size={18} color={colors.danger} />
                  </TouchableOpacity>
                ) : null}
              </View>
              <View style={s.twoCol}>
                <View style={s.col}>
                  <LabeledInput label="From bed" value={b.fromBed} onChangeText={(t) => updateBed(i, { fromBed: t })} keyboardType="numeric" />
                </View>
                <View style={s.col}>
                  <LabeledInput label="To bed" value={b.toBed} onChangeText={(t) => updateBed(i, { toBed: t })} keyboardType="numeric" />
                </View>
              </View>
              <Dropdown
                label="Variety"
                value={b.variety}
                options={varietyOptions}
                onChange={(v) => updateBed(i, { variety: v })}
                placeholder="Select variety…"
              />
              <View style={s.twoCol}>
                <View style={s.col}>
                  <LabeledInput label="Bed length m" value={b.length} onChangeText={(t) => updateBed(i, { length: t })} keyboardType="numeric" />
                </View>
                <View style={s.col}>
                  <LabeledInput label="Bed width m" value={b.width} onChangeText={(t) => updateBed(i, { width: t })} keyboardType="numeric" />
                </View>
              </View>
              <LabeledInput label="Planting date" value={b.plantingDate} onChangeText={(t) => updateBed(i, { plantingDate: t })} placeholder="YYYY-MM-DD (optional)" />
            </View>
          ))}
          <Button label="Add bed range" variant="outline" iconLeft="add" onPress={() => setBeds((p) => [...p, emptyBed()])} />
        </Card>

        <Button label="Create crop cycle" onPress={onSubmit} loading={acting} style={{ marginTop: spacing.sm }} />
        <Text style={s.note}>Beds, varieties grown and totals are generated automatically from the bed configuration.</Text>
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
  twoCol: { flexDirection: 'row', gap: spacing.md },
  col: { flex: 1 },
  rowBlock: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.xs,
  },
  rowHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs },
  rowHeadText: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: colors.text },
  note: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textMuted, textAlign: 'center', marginTop: spacing.sm },
});
