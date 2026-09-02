import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { Ionicons } from '@expo/vector-icons';
import { router, useNavigation } from 'expo-router';
import { Card, Alert } from '@/src/components/Card';
import { Button } from '@/src/components/Button';
import { LabeledInput } from '@/src/components/LabeledInput';
import { Dropdown } from '@/src/components/Dropdown';
import { Segmented } from '@/src/components/Segmented';
import { Spinner } from '@/src/components/Spinner';
import { useToast } from '@/src/components/Toast';
import { setCameraResultCallback } from '@/src/components/CameraScannerScreen';
import { borderRadius, colors, fontFamily, fontSize, spacing } from '@/src/theme';
import { useRefreshOnFocus } from '@/src/hooks/useRefreshOnFocus';
import { useCropCycleStore } from '@/src/stores/cropCycleStore';
import { useHarvestingStore } from '@/src/stores/harvestingStore';
import { useGradingStore } from '@/src/stores/gradingStore';
import { parseScanned, gradingApi, type BucketContentRow } from '@/src/services/grading';

function openScanner(onScan: (code: string) => void) {
  setCameraResultCallback(onScan);
  router.push('/camera-scanner' as never);
}

type Mode = 'standards' | 'sprays';

export default function HarvestingScreen() {
  const [mode, setMode] = useState<Mode>('standards');

  // Shared pickers + farm/greenhouse selection persists across the two modes
  // and across submits, until the user changes them explicitly.
  const farms = useCropCycleStore((s) => s.farms);
  const loadPickers = useCropCycleStore((s) => s.loadPickers);
  const pickersLoading = useCropCycleStore((s) => s.pickersLoading);

  const farmGreenhouses = useHarvestingStore((s) => s.farmGreenhouses);
  const farmGreenhousesLoading = useHarvestingStore((s) => s.farmGreenhousesLoading);
  const loadGreenhousesForFarm = useHarvestingStore((s) => s.loadGreenhousesForFarm);

  const [farm, setFarm] = useState('');
  const [greenhouse, setGreenhouse] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  // Bumped on pull-to-refresh to remount (and thus reset) the child form.
  const [formKey, setFormKey] = useState(0);

  // Production report shortcut: a single icon on the right of the navbar.
  const navigation = useNavigation();
  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable
          onPress={() => router.push('/reports/production')}
          hitSlop={8}
          style={{ paddingRight: spacing.lg }}
        >
          <Ionicons name="bar-chart-outline" size={22} color={colors.text} />
        </Pressable>
      ),
    });
  }, [navigation]);

  useRefreshOnFocus(loadPickers);

  // Pull-to-refresh clears the whole form (farm/greenhouse + the child form's
  // inputs, via the remount key) and refetches the pickers from scratch.
  const onRefresh = async () => {
    setRefreshing(true);
    try {
      setFarm('');
      setGreenhouse('');
      setFormKey((k) => k + 1);
      await loadPickers();
    } finally {
      setRefreshing(false);
    }
  };

  // Cascade: pick farm → fetch greenhouses scoped to that farm + auto-select
  // if only one exists; otherwise clear the GH so the user re-picks.
  useEffect(() => {
    if (!farm) return;
    loadGreenhousesForFarm(farm);
    setGreenhouse('');
  }, [farm, loadGreenhousesForFarm]);

  useEffect(() => {
    if (farmGreenhouses.length === 1 && !greenhouse) {
      setGreenhouse(farmGreenhouses[0].name);
    }
  }, [farmGreenhouses, greenhouse]);

  return (
    <KeyboardAwareScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={s.scroll}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      enableOnAndroid
      extraScrollHeight={20}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <Segmented
        value={mode}
        onChange={setMode}
        options={[
          { value: 'standards', label: 'Harvest' },
          { value: 'sprays', label: 'Sprays' },
        ]}
      />

      <Card>
        <Dropdown
          label="Farm"
          value={farm}
          onChange={setFarm}
          options={farms.map((f) => ({ value: f.name, label: f.label }))}
          placeholder={pickersLoading ? 'Loading farms…' : 'Select farm'}
          disabled={pickersLoading}
        />
        <View style={{ height: spacing.md }} />

        <Dropdown
          label="Greenhouse"
          value={greenhouse}
          onChange={setGreenhouse}
          options={farmGreenhouses.map((g) => ({ value: g.name, label: g.label }))}
          placeholder={
            !farm
              ? 'Pick a farm first'
              : farmGreenhousesLoading
                ? 'Loading greenhouses…'
                : 'Select greenhouse'
          }
          disabled={!farm || farmGreenhousesLoading}
        />
        {farmGreenhousesLoading ? (
          <View style={{ marginTop: spacing.sm }}>
            <Spinner inline label="Loading greenhouses…" />
          </View>
        ) : null}
      </Card>

      {mode === 'standards' ? (
        <StandardsForm key={`std-${formKey}`} farm={farm} greenhouse={greenhouse} />
      ) : (
        <SpraysForm key={`spray-${formKey}`} farm={farm} greenhouse={greenhouse} />
      )}
    </KeyboardAwareScrollView>
  );
}

/* ─── Standards: regular harvest stock entry ───────────────────────────── */

function StandardsForm({ farm, greenhouse }: { farm: string; greenhouse: string }) {
  const { showSuccess, showError } = useToast();
  const stemLengths = useHarvestingStore((s) => s.stemLengths);
  const stemLengthsLoading = useHarvestingStore((s) => s.stemLengthsLoading);
  const varieties = useHarvestingStore((s) => s.varieties);
  const employees = useHarvestingStore((s) => s.employees);
  const ghDataLoading = useHarvestingStore((s) => s.ghDataLoading);
  const ghDataError = useHarvestingStore((s) => s.ghDataError);
  const ghDataNotice = useHarvestingStore((s) => s.ghDataNotice);
  const cutStages = useHarvestingStore((s) => s.cutStages);
  const acting = useHarvestingStore((s) => s.acting);
  const loadStemLengths = useHarvestingStore((s) => s.loadStemLengths);
  const loadGreenhouseData = useHarvestingStore((s) => s.loadGreenhouseData);
  const createHarvest = useHarvestingStore((s) => s.createHarvest);

  const [variety, setVariety] = useState('');
  const [harvester, setHarvester] = useState('');
  const [stemLength, setStemLength] = useState('');
  const [cutStage, setCutStage] = useState<string>('');
  const [bucketId, setBucketId] = useState('');
  const [quantity, setQuantity] = useState('');

  // Spray roses are harvested via the grading flow (Sprays tab), not the
  // standard harvest form — keep them out of the variety picker here.
  const standardVarieties = useMemo(
    () => varieties.filter((v) => v.itemGroup !== 'Spray Roses'),
    [varieties],
  );

  useEffect(() => {
    loadStemLengths();
  }, [loadStemLengths]);

  useEffect(() => {
    if (greenhouse) loadGreenhouseData(greenhouse);
    setVariety('');
    setHarvester('');
  }, [greenhouse, loadGreenhouseData]);

  useEffect(() => {
    if (standardVarieties.length === 1 && !variety) setVariety(standardVarieties[0].name);
  }, [standardVarieties, variety]);

  // Cut stages come from the Cut Stage master (fetched with greenhouse data);
  // select the first once loaded if nothing valid is chosen yet.
  useEffect(() => {
    if (cutStages.length && !cutStages.includes(cutStage)) setCutStage(cutStages[0]);
  }, [cutStages, cutStage]);

  const submit = async () => {
    if (!farm || !greenhouse || !variety || !harvester || !stemLength || !bucketId || !quantity || !cutStage) {
      showError('Fill all fields.');
      return;
    }
    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty <= 0) {
      showError('Quantity must be a positive number.');
      return;
    }
    const outcome = await createHarvest({
      farm,
      greenhouse,
      harvester,
      bucket_id: bucketId.trim(),
      stem_length: stemLength,
      item_code: variety,
      quantity: qty,
      cut_stage: cutStage,
    });
    if (outcome.ok) {
      showSuccess(outcome.message);
      // Retain farm + greenhouse + variety + harvester; clear scan-specific fields.
      setBucketId('');
      setStemLength('');
      setQuantity('');
      setCutStage(cutStages[0] ?? '');
    } else {
      showError(outcome.error);
    }
  };

  return (
    <Card>
      {ghDataError ? <Alert tone="danger">{ghDataError}</Alert> : null}
      {ghDataNotice ? (
        <View style={{ marginBottom: spacing.md }}>
          <Alert tone="info">{ghDataNotice}</Alert>
          <View style={{ height: spacing.sm }} />
          <Button
            label="Add crop cycle"
            variant="outline"
            iconLeft="add"
            onPress={() =>
              router.push({
                pathname: '/crop-cycle/new',
                params: {
                  ...(greenhouse ? { greenhouse } : {}),
                  ...(farm ? { farm } : {}),
                },
              } as never)
            }
          />
        </View>
      ) : null}
      {ghDataLoading || stemLengthsLoading ? (
        <Spinner inline label="Loading pickers…" />
      ) : null}

      <Dropdown
        label="Variety"
        value={variety}
        onChange={setVariety}
        options={standardVarieties.map((v) => ({
          value: v.name,
          label: v.label,
          sublabel: v.area ? `${Math.round(v.area)} m²` : undefined,
        }))}
        placeholder={greenhouse ? 'Pick the variety' : 'Pick a greenhouse first'}
        disabled={!greenhouse || ghDataLoading}
      />
      <View style={{ height: spacing.md }} />

      <Dropdown
        label="Harvester"
        value={harvester}
        onChange={setHarvester}
        options={employees.map((e) => ({ value: e.name, label: e.label }))}
        placeholder={greenhouse ? 'Pick the harvester' : 'Pick a greenhouse first'}
        disabled={!greenhouse || ghDataLoading}
      />
      <View style={{ height: spacing.md }} />

      <View style={s.row2}>
        <View style={{ flex: 1 }}>
          <Dropdown
            label="Stem length"
            value={stemLength}
            onChange={setStemLength}
            options={stemLengths.map((l) => ({ value: l.name, label: l.label }))}
            placeholder={stemLengthsLoading ? 'Loading…' : '62cm'}
            disabled={stemLengthsLoading}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Dropdown
            label="Cut stage"
            value={cutStage}
            onChange={setCutStage}
            options={cutStages.map((c) => ({ value: c, label: c }))}
            placeholder={greenhouse ? 'Select cut stage' : 'Pick a greenhouse first'}
            searchable={false}
          />
        </View>
      </View>

      <LabeledInput
        label="Bucket ID"
        value={bucketId}
        onChangeText={setBucketId}
        placeholder="Scan or type the bucket QR"
        iconLeft="qr-code-outline"
        autoCapitalize="none"
        trailingIcon="scan-outline"
        onPressTrailing={() =>
          openScanner((raw) => setBucketId(parseScanned(raw, 'bucket') || raw))
        }
      />

      <LabeledInput
        label="Number of stems"
        value={quantity}
        onChangeText={setQuantity}
        placeholder="e.g. 100"
        keyboardType="number-pad"
        iconLeft="leaf-outline"
      />

      <View style={{ height: spacing.sm }} />
      <Button label="Submit harvest" onPress={submit} loading={acting} />
    </Card>
  );
}

/* ─── Sprays: grading flow (bucket → grader → bunch → auto-validate+submit) ──── */

function SpraysForm({ farm, greenhouse }: { farm: string; greenhouse: string }) {
  const { showSuccess, showError } = useToast();
  const acting = useGradingStore((s) => s.acting);
  const validateAndGrade = useGradingStore((s) => s.validateAndGrade);

  const [bucketRaw, setBucketRaw] = useState('');
  const [graderRaw, setGraderRaw] = useState('');
  const [bunchRaw, setBunchRaw] = useState('');
  /** Number of bunches successfully graded against the current bucket. Resets
   *  whenever the bucket changes (manual clear or new scan). */
  const [gradedCount, setGradedCount] = useState(0);
  // Varieties + stems already scanned into the active bucket today.
  const [contents, setContents] = useState<BucketContentRow[]>([]);
  const [contentsTotal, setContentsTotal] = useState(0);

  const bucketId = parseScanned(bucketRaw, 'bucket');
  const graderId = parseScanned(graderRaw, 'grader');
  const bunchId = parseScanned(bunchRaw, 'bunch');

  const graderRef = useRef<TextInput>(null);
  const bunchRef = useRef<TextInput>(null);

  // Fetch what's in the bucket (variety → stems). Called when a bucket is
  // scanned and again after every successful grade so the tally auto-updates.
  const loadContents = useCallback(async () => {
    if (!bucketId) {
      setContents([]);
      setContentsTotal(0);
      return;
    }
    try {
      const bc = await gradingApi.bucketContents(bucketId);
      setContents(bc.contents);
      setContentsTotal(bc.totalStems);
    } catch {
      // non-critical display; leave the last known tally
    }
  }, [bucketId]);

  // Reset the counter whenever the bucket changes — a new bucket means a new
  // session, the count from the previous bucket is no longer meaningful.
  useEffect(() => {
    setGradedCount(0);
    loadContents();
  }, [bucketId, loadContents]);

  // Whenever the bunch field is filled, kick off validate-and-submit.
  useEffect(() => {
    if (!bunchId || acting) return;
    if (!farm) {
      showError('Pick a farm before scanning bunches.');
      setBunchRaw('');
      return;
    }
    if (!greenhouse) {
      showError('Pick a greenhouse before scanning bunches.');
      setBunchRaw('');
      return;
    }
    if (!bucketId) {
      showError('Scan the bucket first.');
      setBunchRaw('');
      return;
    }
    if (!graderId) {
      showError('Scan the grader before the bunch.');
      setBunchRaw('');
      return;
    }
    (async () => {
      const outcome = await validateAndGrade({
        farm,
        stock_entry_type: 'Grading',
        graded_by: graderId,
        bunch_id: bunchId,
        qty: 1,
        rose_type: 'Spray Roses',
        source_warehouse: greenhouse,
        bucket_id: bucketId,
      });
      if (outcome.ok) {
        // Bucket + grader are retained — only clear the bunch field so the
        // next bunch QR scan in this same session goes straight to submit.
        setGradedCount((c) => c + 1);
        showSuccess(`Bunch graded. Scan the next bunch for ${bucketId}.`);
        setBunchRaw('');
        bunchRef.current?.focus();
        loadContents();
      } else {
        showError(outcome.error);
        setBunchRaw('');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bunchId]);

  const clearForm = () => {
    setBucketRaw('');
    setGraderRaw('');
    setBunchRaw('');
    setGradedCount(0);
  };

  const canScan = !!farm && !!greenhouse;
  const sessionActive = !!bucketId && !!graderId;

  return (
    <>
      <Card>
        {!canScan ? (
          <Alert tone="warn">Pick a farm and greenhouse before scanning.</Alert>
        ) : null}

        {sessionActive ? (
          <View style={s.session}>
            <View style={{ flex: 1 }}>
              <Text style={s.sessionLabel}>Active session</Text>
              <Text style={s.sessionValue} numberOfLines={1}>
                Bucket {bucketId} · Grader {graderId}
              </Text>
            </View>
            <View style={s.sessionBadge}>
              <Text style={s.sessionBadgeText}>{gradedCount}</Text>
              <Text style={s.sessionBadgeHint}>graded</Text>
            </View>
          </View>
        ) : null}

        {bucketId ? (
          <View style={s.bucketContents}>
            <Text style={s.bucketContentsLabel}>
              In bucket {bucketId}
              {contentsTotal ? ` · ${contentsTotal} stems` : ''}
            </Text>
            {contents.length ? (
              contents.map((c) => (
                <View key={c.variety} style={s.bucketRow}>
                  <Text style={s.bucketVariety} numberOfLines={1}>
                    {c.variety}
                  </Text>
                  <Text style={s.bucketStems}>{c.stems}</Text>
                </View>
              ))
            ) : (
              <Text style={s.bucketEmpty}>No stems scanned in yet.</Text>
            )}
          </View>
        ) : null}

        <ScanStep
          step={1}
          label="Bucket"
          icon="cube-outline"
          value={bucketId}
          rawValue={bucketRaw}
          onChange={(t) => {
            setBucketRaw(t);
            const parsed = parseScanned(t, 'bucket');
            if (parsed && parsed !== t) graderRef.current?.focus();
          }}
          placeholder="Scan or paste the bucket QR"
          disabled={!canScan}
          onSubmitEditing={() => graderRef.current?.focus()}
          onScan={(raw) => {
            setBucketRaw(raw);
            const parsed = parseScanned(raw, 'bucket');
            if (parsed) graderRef.current?.focus();
          }}
        />

        <ScanStep
          step={2}
          label="Grader"
          icon="person-outline"
          value={graderId}
          rawValue={graderRaw}
          onChange={(t) => {
            setGraderRaw(t);
            const parsed = parseScanned(t, 'grader');
            if (parsed && parsed !== t) bunchRef.current?.focus();
          }}
          placeholder="Scan or type the grader QR"
          disabled={!canScan || !bucketId}
          inputRef={graderRef}
          onSubmitEditing={() => bunchRef.current?.focus()}
          onScan={(raw) => {
            setGraderRaw(raw);
            const parsed = parseScanned(raw, 'grader');
            if (parsed) bunchRef.current?.focus();
          }}
        />

        <ScanStep
          step={3}
          label="Bunch"
          icon="flower-outline"
          value={bunchId}
          rawValue={bunchRaw}
          onChange={setBunchRaw}
          placeholder="Scan or paste the bunch QR — auto-submits"
          disabled={!canScan || !bucketId || !graderId}
          inputRef={bunchRef}
          onScan={(raw) => setBunchRaw(raw)}
        />

        {acting ? (
          <View style={{ marginTop: spacing.sm }}>
            <Spinner inline label="Validating + grading…" />
          </View>
        ) : null}

        <View style={{ height: spacing.md }} />
        <Button
          label="Clear scans"
          variant="outline"
          iconLeft="refresh"
          onPress={clearForm}
          disabled={acting || (!bucketRaw && !graderRaw && !bunchRaw)}
        />
      </Card>
    </>
  );
}

function ScanStep({
  step,
  label,
  icon,
  value,
  rawValue,
  onChange,
  placeholder,
  disabled,
  inputRef,
  onSubmitEditing,
  onScan,
}: {
  step: number;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  /** Parsed (canonical) value — used for the "done" check. */
  value: string;
  /** The raw text from the input — what the user actually typed. */
  rawValue: string;
  onChange: (t: string) => void;
  placeholder: string;
  disabled?: boolean;
  inputRef?: React.RefObject<TextInput | null>;
  onSubmitEditing?: () => void;
  /** Called with the raw scanned payload (JSON or plain text). */
  onScan?: (raw: string) => void;
}) {
  const filled = !!value;
  return (
    <View style={{ marginBottom: spacing.md }}>
      <View style={s.stepHeader}>
        <View style={[s.stepBadge, filled && s.stepBadgeDone]}>
          {filled ? (
            <Ionicons name="checkmark" size={14} color={colors.textOnPrimary} />
          ) : (
            <Text style={s.stepNum}>{step}</Text>
          )}
        </View>
        <Text style={s.stepLabel}>{label}</Text>
        {filled ? (
          <Text style={s.stepValue} numberOfLines={1}>{value}</Text>
        ) : null}
      </View>
      <LabeledInput
        label=""
        value={rawValue}
        onChangeText={onChange}
        placeholder={placeholder}
        iconLeft={icon}
        autoCapitalize="none"
        autoCorrect={false}
        editable={!disabled}
        ref={inputRef}
        onSubmitEditing={onSubmitEditing}
        returnKeyType="next"
        trailingIcon={onScan && !disabled ? 'scan-outline' : undefined}
        onPressTrailing={onScan ? () => openScanner(onScan) : undefined}
      />
    </View>
  );
}

const s = StyleSheet.create({
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl },
  row2: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md },

  session: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surfaceAlt,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  sessionLabel: {
    fontFamily: fontFamily.medium,
    fontSize: 10,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  bucketContents: {
    padding: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surfaceAlt,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    marginBottom: spacing.md,
    gap: 4,
  },
  bucketContentsLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.sm,
    color: colors.text,
    marginBottom: 2,
  },
  bucketRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  bucketVariety: {
    flex: 1,
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  bucketStems: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.sm,
    color: colors.text,
  },
  bucketEmpty: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  sessionValue: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.sm,
    color: colors.text,
    marginTop: 2,
  },
  sessionBadge: {
    minWidth: 56,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sessionBadgeText: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.md,
    color: colors.textOnPrimary,
    lineHeight: fontSize.md + 2,
  },
  sessionBadgeHint: {
    fontFamily: fontFamily.medium,
    fontSize: 9,
    color: colors.textOnPrimary,
    opacity: 0.85,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },

  stepHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs },
  stepBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.surfaceAlt,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBadgeDone: { backgroundColor: colors.success, borderColor: colors.success },
  stepNum: { fontFamily: fontFamily.semiBold, fontSize: 11, color: colors.textMuted },
  stepLabel: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: colors.text },
  stepValue: {
    flex: 1,
    fontFamily: 'monospace',
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    textAlign: 'right',
  },
});
