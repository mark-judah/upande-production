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
import { parseScanned, isValidScan, gradingApi, type BucketContentRow } from '@/src/services/grading';

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
  // standard harvest form — keep them out of the variety picker here. Must
  // filter on isSprayRose (a real ancestor-chain check done server-side),
  // not itemGroup directly: real items always sit in a LEAF group like
  // "Spray Roses - Bombastics", never the bare "Spray Roses" parent, so
  // `v.itemGroup !== 'Spray Roses'` was always true and never filtered
  // anything out — confirmed live: 295 real Spray Roses harvests went
  // through this exact form on 2026-09-09 alone.
  const standardVarieties = useMemo(
    () => varieties.filter((v) => !v.isSprayRose),
    [varieties],
  );

  useEffect(() => {
    loadStemLengths();
  }, [loadStemLengths]);

  useEffect(() => {
    if (greenhouse) loadGreenhouseData(greenhouse);
    setVariety('');
    setHarvester('');
    setCutStage('');
  }, [greenhouse, loadGreenhouseData]);

  useEffect(() => {
    if (standardVarieties.length === 1 && !variety) setVariety(standardVarieties[0].name);
  }, [standardVarieties, variety]);

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
      // Force a deliberate re-pick every submit — don't silently carry over
      // (or auto-select) a cut stage for the next scan.
      setCutStage('');
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
        showSoftInputOnFocus={false}
        trailingIcon="scan-outline"
        onPressTrailing={() =>
          openScanner((raw) => {
            if (!isValidScan(raw, 'bucket')) {
              showError('Please scan a valid bucket QR code.');
              return;
            }
            setBucketId(parseScanned(raw, 'bucket'));
          })
        }
      />

      <LabeledInput
        label="Number of stems"
        value={quantity}
        // Strip anything but digits as it's typed -- a stray comma (e.g. from
        // a paste, or a keyboard that allows one despite number-pad) must
        // never reach state as text. This is a whole-stems count compared
        // against a per-bucket limit server-side; "100,200" left as a
        // string there throws instead of comparing, so block it here.
        onChangeText={(t) => setQuantity(t.replace(/[^0-9]/g, ''))}
        placeholder="e.g. 100"
        keyboardType="number-pad"
        iconLeft="leaf-outline"
      />

      <View style={{ height: spacing.sm }} />
      <Button label="Submit harvest" onPress={submit} loading={acting} />
    </Card>
  );
}

/* ─── Sprays: grading flow (bucket → harvester + length → bunch → auto-validate+submit) ──── */

function SpraysForm({ farm, greenhouse }: { farm: string; greenhouse: string }) {
  const { showSuccess, showError } = useToast();
  const acting = useGradingStore((s) => s.acting);
  const validateAndGrade = useGradingStore((s) => s.validateAndGrade);

  // Same greenhouse-scoped employees + global stem-length list the Harvest
  // (Standards) form uses — reused as-is, not a second copy. loadGreenhouseData
  // is cached per greenhouse (see harvestingStore), so this is a no-op if the
  // Standards tab already loaded this same greenhouse.
  const stemLengths = useHarvestingStore((s) => s.stemLengths);
  const stemLengthsLoading = useHarvestingStore((s) => s.stemLengthsLoading);
  const employees = useHarvestingStore((s) => s.employees);
  const ghDataLoading = useHarvestingStore((s) => s.ghDataLoading);
  const loadStemLengths = useHarvestingStore((s) => s.loadStemLengths);
  const loadGreenhouseData = useHarvestingStore((s) => s.loadGreenhouseData);

  const [bucketRaw, setBucketRaw] = useState('');
  const [harvester, setHarvester] = useState('');
  const [stemLength, setStemLength] = useState('');
  const [bunchRaw, setBunchRaw] = useState('');
  /** Number of bunches successfully graded against the current bucket. Resets
   *  whenever the bucket changes (manual clear or new scan). */
  const [gradedCount, setGradedCount] = useState(0);
  // Varieties + stems already scanned into the active bucket today.
  const [contents, setContents] = useState<BucketContentRow[]>([]);
  const [contentsTotal, setContentsTotal] = useState(0);

  const bucketId = parseScanned(bucketRaw, 'bucket');
  const bunchId = parseScanned(bunchRaw, 'bunch');

  const bunchRef = useRef<TextInput>(null);

  useEffect(() => {
    loadStemLengths();
  }, [loadStemLengths]);

  useEffect(() => {
    if (greenhouse) loadGreenhouseData(greenhouse);
    // employees is greenhouse-scoped and gets cleared while it reloads (see
    // harvestingStore) — a stale harvester name from the previous
    // greenhouse would silently point at someone not even working here.
    setHarvester('');
  }, [greenhouse, loadGreenhouseData]);

  // Guards against out-of-order responses: loadContents() is fired-and-
  // forgotten (not awaited) after every grade so scanning the next bunch
  // isn't blocked on it. Back-to-back scans over a slow/spotty greenhouse
  // connection can have an EARLIER call's response land AFTER a later one's
  // -- without this guard the stale (lower) tally silently overwrites the
  // fresh one, which is exactly "I scanned another bunch but the counter
  // didn't update" (it updated, then got rolled back a moment later).
  const contentsRequestId = useRef(0);

  // Fetch what's in the bucket (variety → stems). Called when a bucket is
  // scanned and again after every successful grade so the tally auto-updates.
  const loadContents = useCallback(async () => {
    if (!bucketId) {
      contentsRequestId.current += 1;
      setContents([]);
      setContentsTotal(0);
      return;
    }
    const requestId = ++contentsRequestId.current;
    try {
      const bc = await gradingApi.bucketContents(bucketId);
      if (requestId !== contentsRequestId.current) return; // superseded by a newer call
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
    if (!harvester) {
      showError('Pick the harvester before scanning bunches.');
      setBunchRaw('');
      return;
    }
    if (!stemLength) {
      showError('Pick a stem length before scanning bunches.');
      setBunchRaw('');
      return;
    }
    (async () => {
      const outcome = await validateAndGrade({
        farm,
        stock_entry_type: 'Grading',
        graded_by: harvester,
        stem_length: stemLength,
        bunch_id: bunchId,
        qty: 1,
        rose_type: 'Spray Roses',
        source_warehouse: greenhouse,
        bucket_id: bucketId,
      });
      if (outcome.ok) {
        // Bucket + harvester + length are retained — only clear the bunch
        // field so the next bunch QR scan in this same session goes
        // straight to submit.
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
    setHarvester('');
    setStemLength('');
    setBunchRaw('');
    setGradedCount(0);
  };

  const canScan = !!farm && !!greenhouse;
  const sessionActive = !!bucketId && !!harvester;
  const harvesterLabel = employees.find((e) => e.name === harvester)?.label || harvester;
  const stemLengthLabel = stemLengths.find((l) => l.name === stemLength)?.label || stemLength;

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
                Bucket {bucketId} · {harvesterLabel}
                {stemLengthLabel ? ` · ${stemLengthLabel}` : ''}
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
          onChange={setBucketRaw}
          placeholder="Scan or paste the bucket QR"
          disabled={!canScan}
          onScan={(raw) => {
            if (!isValidScan(raw, 'bucket')) {
              showError('Please scan a valid bucket QR code.');
              return;
            }
            setBucketRaw(raw);
          }}
        />

        <View style={{ marginBottom: spacing.md }}>
          <Dropdown
            label="Harvester"
            value={harvester}
            onChange={setHarvester}
            options={employees.map((e) => ({ value: e.name, label: e.label }))}
            placeholder={
              !canScan ? 'Pick a greenhouse first' : ghDataLoading ? 'Loading…' : 'Pick the harvester'
            }
            disabled={!canScan || ghDataLoading}
          />
        </View>

        <View style={{ marginBottom: spacing.md }}>
          <Dropdown
            label="Stem length"
            value={stemLength}
            onChange={setStemLength}
            options={stemLengths.map((l) => ({ value: l.name, label: l.label }))}
            placeholder={!canScan ? 'Pick a greenhouse first' : stemLengthsLoading ? 'Loading…' : '62cm'}
            disabled={!canScan || stemLengthsLoading}
          />
        </View>

        <ScanStep
          step={2}
          label="Bunch"
          icon="flower-outline"
          value={bunchId}
          rawValue={bunchRaw}
          onChange={setBunchRaw}
          placeholder="Scan or paste the bunch QR — auto-submits"
          disabled={!canScan || !bucketId || !harvester || !stemLength}
          inputRef={bunchRef}
          onScan={(raw) => {
            if (!isValidScan(raw, 'bunch')) {
              showError('Please scan a valid bunch QR code.');
              return;
            }
            setBunchRaw(raw);
          }}
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
          disabled={acting || (!bucketRaw && !harvester && !stemLength && !bunchRaw)}
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
        showSoftInputOnFocus={false}
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
