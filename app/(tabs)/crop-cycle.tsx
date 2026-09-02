import React, { useEffect, useState } from 'react';
import {
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Card, Alert } from '@/src/components/Card';
import { Button } from '@/src/components/Button';
import { LabeledInput } from '@/src/components/LabeledInput';
import { Dropdown } from '@/src/components/Dropdown';
import { Pill } from '@/src/components/Pill';
import { FAB } from '@/src/components/FAB';
import { Sheet } from '@/src/components/Sheet';
import { Spinner } from '@/src/components/Spinner';
import { useToast } from '@/src/components/Toast';
import { borderRadius, colors, fontFamily, fontSize, spacing } from '@/src/theme';
import { useRefreshOnFocus } from '@/src/hooks/useRefreshOnFocus';
import { useCropCycleStore } from '@/src/stores/cropCycleStore';
import { useHarvestingStore } from '@/src/stores/harvestingStore';
import {
  REPLANT_REASONS,
  UPROOT_REASONS,
  type CropCycle,
} from '@/src/services/crop-cycle';

function todayIso(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

type SheetKind = 'plant' | 'uproot' | 'replant' | null;

export default function CropCycleScreen() {
  const cycles = useCropCycleStore((s) => s.cycles);
  const loading = useCropCycleStore((s) => s.loading);
  const error = useCropCycleStore((s) => s.error);
  const load = useCropCycleStore((s) => s.load);
  const loadPickers = useCropCycleStore((s) => s.loadPickers);
  const filters = useCropCycleStore((s) => s.filters);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<CropCycle | null>(null);
  const [sheet, setSheet] = useState<SheetKind>(null);
  const router = useRouter();

  useRefreshOnFocus(() => {
    load();
    loadPickers();
  });

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        contentContainerStyle={s.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <FiltersCard />

        {error ? <Alert tone="danger">{error}</Alert> : null}

        {loading && cycles.length === 0 ? (
          <Card>
            <Spinner label="Loading cycles…" />
          </Card>
        ) : cycles.length === 0 ? (
          <Card>
            <Alert tone="info">No active crop cycles.</Alert>
          </Card>
        ) : (
          cycles.map((c) => (
            <Pressable
              key={c.name}
              onPress={() => setSelected(c)}
              style={({ pressed }) => [s.row, pressed && { opacity: 0.7 }]}
            >
              <View style={s.rowHeader}>
                <Text style={s.rowTitle} numberOfLines={1}>
                  {c.variety ? `${c.variety} — ${c.greenhouse}` : c.greenhouse}
                </Text>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </View>
              <Text style={s.rowSub} numberOfLines={1}>{c.farm || '—'}</Text>
              <View style={s.rowPills}>
                <Pill label="Beds" value={String(c.beds)} />
                <Pill
                  label={c.variety ? 'Plants' : 'Varieties'}
                  value={String(c.variety ? c.plants : c.varieties)}
                />
                <Pill label="Area" value={`${Math.round(c.area)} m²`} />
              </View>
            </Pressable>
          ))
        )}
      </ScrollView>

      {/* FAB stays mounted across the planting flow so it can smoothly morph
          into the close button. Other sheets (uproot/replant/detail) hide it. */}
      <FAB
        icon="add"
        onPress={() =>
          router.push({
            pathname: '/crop-cycle/new',
            params: {
              ...(filters.greenhouse ? { greenhouse: filters.greenhouse } : {}),
              ...(filters.farm ? { farm: filters.farm } : {}),
            },
          } as never)
        }
        visible={!selected && sheet === null}
      />

      {/* Old in-screen planting sheet is retired in favour of the dedicated
          /crop-cycle/new screen (new doctype model). Kept inert for now while
          uproot/replant still use the old flow. */}
      <PlantingSheet visible={false} onClose={() => setSheet(null)} />

      {/* Cycle detail sheet — opens when a list row is tapped */}
      {selected ? (
        <CycleDetailSheet
          cycle={selected}
          onClose={() => setSelected(null)}
          onUproot={() => setSheet('uproot')}
          onReplant={() => setSheet('replant')}
        />
      ) : null}

      {/* Action sheets */}
      {sheet === 'uproot' && selected ? (
        <UprootSheet
          cycle={selected}
          onClose={() => setSheet(null)}
          onDone={() => { setSheet(null); setSelected(null); }}
        />
      ) : null}
      {sheet === 'replant' && selected ? (
        <ReplantSheet
          cycle={selected}
          onClose={() => setSheet(null)}
          onDone={() => { setSheet(null); setSelected(null); }}
        />
      ) : null}
    </View>
  );
}

/* ─── Filters card ─────────────────────────────────────────────────────── */

function FiltersCard() {
  const farms = useCropCycleStore((st) => st.farms);
  const filters = useCropCycleStore((st) => st.filters);
  const setFilters = useCropCycleStore((st) => st.setFilters);
  const clearFilters = useCropCycleStore((st) => st.clearFilters);

  const farmGreenhouses = useHarvestingStore((st) => st.farmGreenhouses);
  const farmGreenhousesLoading = useHarvestingStore((st) => st.farmGreenhousesLoading);
  const loadGreenhousesForFarm = useHarvestingStore((st) => st.loadGreenhousesForFarm);

  React.useEffect(() => {
    if (filters.farm) loadGreenhousesForFarm(filters.farm);
  }, [filters.farm, loadGreenhousesForFarm]);

  const onFarm = (farm: string) => {
    // Picking a different farm invalidates any greenhouse choice
    setFilters({ ...filters, farm: farm || undefined, greenhouse: undefined });
  };
  const onGreenhouse = (gh: string) => {
    setFilters({ ...filters, greenhouse: gh || undefined });
  };

  const hasActive = !!(filters.farm || filters.greenhouse);

  return (
    <Card>
      <Dropdown
        label="Farm"
        value={filters.farm || ''}
        onChange={onFarm}
        options={farms.map((f) => ({ value: f.name, label: f.label }))}
        placeholder="All farms"
      />
      <View style={{ height: spacing.md }} />
      <Dropdown
        label="Greenhouse"
        value={filters.greenhouse || ''}
        onChange={onGreenhouse}
        options={farmGreenhouses.map((g) => ({ value: g.name, label: g.label }))}
        placeholder={
          !filters.farm
            ? 'Pick a farm first'
            : farmGreenhousesLoading
              ? 'Loading greenhouses…'
              : 'All greenhouses on this farm'
        }
        disabled={!filters.farm || farmGreenhousesLoading}
      />
      {hasActive ? (
        <View style={s.filterFooter}>
          <Pressable onPress={clearFilters} hitSlop={6} style={s.clearBtn}>
            <Ionicons name="close-circle" size={14} color={colors.textMuted} />
            <Text style={s.clearText}>Clear filters</Text>
          </Pressable>
        </View>
      ) : null}
    </Card>
  );
}

/* ─── Cycle detail sheet ───────────────────────────────────────────────── */

function CycleDetailSheet({
  cycle,
  onClose,
  onUproot,
  onReplant,
}: {
  cycle: CropCycle;
  onClose: () => void;
  onUproot: () => void;
  onReplant: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[s.sheet, { paddingBottom: insets.bottom + spacing.md }]}>
          <SheetHeader
            title={cycle.variety ? `${cycle.variety} — ${cycle.greenhouse}` : cycle.greenhouse}
            subtitle={cycle.farm || '—'}
            onClose={onClose}
          />

          <View style={s.detailGrid}>
            <Detail label="Beds" value={String(cycle.beds)} />
            {cycle.variety ? (
              <Detail label="Planted" value={cycle.plantingDate || '—'} />
            ) : (
              <Detail label="Bays" value={String(cycle.bays)} />
            )}
            {cycle.variety ? (
              <Detail label="Variety" value={cycle.variety} />
            ) : (
              <Detail label="Varieties" value={String(cycle.varieties)} />
            )}
            <Detail label="Area" value={`${Math.round(cycle.area)} m²`} />
            <Detail label="Plants" value={String(cycle.plants)} />
          </View>

          <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
            <Button label="Record uproot" iconLeft="trending-down" variant="outline" onPress={onUproot} />
            <Button label="Record replant" iconLeft="refresh" variant="outline" onPress={onReplant} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.detailItem}>
      <Text style={s.detailLabel}>{label}</Text>
      <Text style={s.detailValue}>{value}</Text>
    </View>
  );
}

/* ─── Planting sheet ───────────────────────────────────────────────────── */

function PlantingSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { showSuccess, showError } = useToast();
  const greenhouses = useCropCycleStore((st) => st.greenhouses);
  const varieties = useCropCycleStore((st) => st.varieties);
  const acting = useCropCycleStore((st) => st.acting);
  const createPlanting = useCropCycleStore((st) => st.createPlanting);

  const [greenhouse, setGreenhouse] = useState('');
  const [variety, setVariety] = useState('');
  const [startBed, setStartBed] = useState('');
  const [endBed, setEndBed] = useState('');
  const [bedWidth, setBedWidth] = useState('0.8');
  const [area, setArea] = useState('');
  const [plantingDate, setPlantingDate] = useState(todayIso());
  const [varietyYield, setVarietyYield] = useState('');

  const submit = async () => {
    if (!greenhouse || !variety || !startBed || !endBed || !bedWidth || !area || !plantingDate) {
      showError('Fill all required fields.');
      return;
    }
    const outcome = await createPlanting({
      greenhouse,
      variety,
      start_bed: Number(startBed),
      end_bed: Number(endBed),
      bed_width: Number(bedWidth),
      area: Number(area),
      variety_yield: varietyYield ? Number(varietyYield) : undefined,
      planting_date: plantingDate,
    });
    if (outcome.ok) {
      showSuccess(outcome.message || 'Crop cycle created.');
      onClose();
    } else {
      showError(outcome.error);
    }
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="New planting"
      subtitle="Start a new crop cycle"
      hideCloseButton
    >
      <KeyboardAwareScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} enableOnAndroid extraScrollHeight={40}>
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
          placeholder="Select variety"
        />
        <View style={{ height: spacing.md }} />

        <View style={s.row2}>
          <View style={{ flex: 1 }}>
            <LabeledInput label="Start bed" value={startBed} onChangeText={setStartBed} keyboardType="number-pad" iconLeft="git-commit-outline" />
          </View>
          <View style={{ flex: 1 }}>
            <LabeledInput label="End bed" value={endBed} onChangeText={setEndBed} keyboardType="number-pad" iconLeft="git-commit-outline" />
          </View>
        </View>

        <View style={s.row2}>
          <View style={{ flex: 1 }}>
            <LabeledInput label="Bed width (m)" value={bedWidth} onChangeText={setBedWidth} keyboardType="decimal-pad" iconLeft="resize-outline" />
          </View>
          <View style={{ flex: 1 }}>
            <LabeledInput label="Area (m²)" value={area} onChangeText={setArea} keyboardType="decimal-pad" iconLeft="grid-outline" />
          </View>
        </View>

        <LabeledInput
          label="Planting date"
          value={plantingDate}
          onChangeText={setPlantingDate}
          placeholder="YYYY-MM-DD"
          iconLeft="calendar-outline"
          autoCapitalize="none"
        />

        <LabeledInput
          label="Variety yield (stems/m²/yr) — optional"
          value={varietyYield}
          onChangeText={setVarietyYield}
          keyboardType="number-pad"
          iconLeft="trending-up-outline"
        />

        <View style={{ height: spacing.sm }} />
        <Button label="Create cycle" loading={acting} onPress={submit} />
        <View style={{ height: spacing.xl }} />
      </KeyboardAwareScrollView>
    </Sheet>
  );
}

/* ─── Uproot sheet ─────────────────────────────────────────────────────── */

function UprootSheet({
  cycle,
  onClose,
  onDone,
}: {
  cycle: CropCycle;
  onClose: () => void;
  onDone: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { showSuccess, showError } = useToast();
  const acting = useCropCycleStore((st) => st.acting);
  const recordUproot = useCropCycleStore((st) => st.recordUproot);

  const [uprootDate, setUprootDate] = useState(todayIso());
  const [fromBed, setFromBed] = useState(String(cycle.startBed));
  const [toBed, setToBed] = useState(String(cycle.endBed));
  const [qty, setQty] = useState('');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');

  const submit = async () => {
    if (!uprootDate || !fromBed || !toBed || !qty || !reason) {
      showError('Fill all required fields.');
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
      showSuccess(outcome.message || 'Uproot recorded.');
      onDone();
    } else {
      showError(outcome.error);
    }
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[s.sheet, { paddingBottom: insets.bottom + spacing.md }]}>
          <KeyboardAwareScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} enableOnAndroid extraScrollHeight={40}>
            <SheetHeader
              title="Record uproot"
              subtitle={`${cycle.variety} · ${cycle.greenhouse}`}
              onClose={onClose}
            />

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

            <View style={{ height: spacing.md }} />
            <Button label="Submit uproot" loading={acting} onPress={submit} />
          </KeyboardAwareScrollView>
        </View>
      </View>
    </Modal>
  );
}

/* ─── Replant sheet ────────────────────────────────────────────────────── */

function ReplantSheet({
  cycle,
  onClose,
  onDone,
}: {
  cycle: CropCycle;
  onClose: () => void;
  onDone: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { showSuccess, showError } = useToast();
  const varieties = useCropCycleStore((st) => st.varieties);
  const acting = useCropCycleStore((st) => st.acting);
  const recordReplant = useCropCycleStore((st) => st.recordReplant);

  const [date, setDate] = useState(todayIso());
  const [fromBed, setFromBed] = useState(String(cycle.startBed));
  const [toBed, setToBed] = useState(String(cycle.endBed));
  const [newVariety, setNewVariety] = useState('');
  const [qtyUprooted, setQtyUprooted] = useState('');
  const [qtyReplanted, setQtyReplanted] = useState('');
  const [costPerPlant, setCostPerPlant] = useState('');
  const [sourceType, setSourceType] = useState<'Propagation Batch' | 'Purchase Order' | ''>('');
  const [reason, setReason] = useState('');
  const [remarks, setRemarks] = useState('');

  const submit = async () => {
    if (!date || !fromBed || !toBed || !newVariety || !qtyUprooted || !qtyReplanted || !reason) {
      showError('Fill all required fields.');
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
      showSuccess(outcome.message || 'Replant recorded.');
      onDone();
    } else {
      showError(outcome.error);
    }
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[s.sheet, { paddingBottom: insets.bottom + spacing.md }]}>
          <KeyboardAwareScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} enableOnAndroid extraScrollHeight={40}>
            <SheetHeader
              title="Record replant"
              subtitle={`Replacing ${cycle.variety} · ${cycle.greenhouse}`}
              onClose={onClose}
            />

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

            <View style={{ height: spacing.md }} />
            <Button label="Submit replant" loading={acting} onPress={submit} />
          </KeyboardAwareScrollView>
        </View>
      </View>
    </Modal>
  );
}

/* ─── Sheet header ─────────────────────────────────────────────────────── */

function SheetHeader({
  title,
  subtitle,
  onClose,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
}) {
  return (
    <View style={s.sheetHeader}>
      <View style={{ flex: 1 }}>
        <Text style={s.sheetTitle}>{title}</Text>
        {subtitle ? <Text style={s.sheetSub}>{subtitle}</Text> : null}
      </View>
      <TouchableOpacity onPress={onClose} style={s.closeBtn} activeOpacity={0.7}>
        <Ionicons name="close" size={20} color={colors.textSecondary} />
      </TouchableOpacity>
    </View>
  );
}

/* ─── Styles ───────────────────────────────────────────────────────────── */

const s = StyleSheet.create({
  scroll: { padding: spacing.lg, paddingBottom: 96 },
  filterFooter: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: spacing.sm },
  clearBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, padding: 4 },
  clearText: { fontFamily: fontFamily.medium, fontSize: fontSize.xs, color: colors.textMuted },
  headerTitle: { fontFamily: fontFamily.bold, fontSize: fontSize.lg, color: colors.text },
  headerHint: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
  empty: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.textMuted },

  row: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    marginBottom: spacing.sm,
  },
  rowHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowTitle: { fontFamily: fontFamily.semiBold, fontSize: fontSize.md, color: colors.text, flex: 1 },
  rowSub: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.textSecondary, marginTop: 2 },
  rowPills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: spacing.sm },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    maxHeight: '90%',
  },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md },
  sheetTitle: { fontFamily: fontFamily.bold, fontSize: fontSize.lg, color: colors.text },
  sheetSub: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.textSecondary, marginTop: 2 },
  closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.surfaceAlt, justifyContent: 'center', alignItems: 'center' },

  detailGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
  detailItem: { flexBasis: '48%', flexGrow: 0, paddingVertical: spacing.xs },
  detailLabel: { fontFamily: fontFamily.medium, fontSize: 10, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.3 },
  detailValue: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: colors.text, marginTop: 2 },

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
