import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { router } from 'expo-router';
import { Card, Alert } from '@/src/components/Card';
import { Button } from '@/src/components/Button';
import { Dropdown } from '@/src/components/Dropdown';
import { LabeledInput } from '@/src/components/LabeledInput';
import { Pill } from '@/src/components/Pill';
import { Sheet } from '@/src/components/Sheet';
import { Spinner } from '@/src/components/Spinner';
import { useToast } from '@/src/components/Toast';
import { showDialog } from '@/src/components/DialogHost';
import { setCameraResultCallback } from '@/src/components/CameraScannerScreen';
import { borderRadius, colors, fontFamily, fontSize, spacing } from '@/src/theme';
import { useRefreshOnFocus } from '@/src/hooks/useRefreshOnFocus';
import { useCropCycleStore } from '@/src/stores/cropCycleStore';
import { useHarvestingStore } from '@/src/stores/harvestingStore';
import { isValidScan, parseScanned } from '@/src/services/grading';
import { mapAxiosError } from '@/src/services/api';
import { seaFreightApi, type SeaFreightLine, type SeaFreightOrder } from '@/src/services/seaFreight';
import { storage, StorageKeys } from '@/src/services/storage';

function openScanner(onScan: (code: string) => void) {
  setCameraResultCallback(onScan);
  router.push('/camera-scanner' as never);
}

const fmt = (n: number) => Math.round(n).toLocaleString();

/** Open sea freight orders (Mode Of Transport = Sea Freight) and their varieties; each line is harvested against
 *  the order, so the packhouse knows which stems are for which order. */
export default function SeaFreightScreen() {
  const [orders, setOrders] = useState<SeaFreightOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [harvesting, setHarvesting] = useState<{ order: SeaFreightOrder; line: SeaFreightLine } | null>(null);
  const [markingDone, setMarkingDone] = useState<string | null>(null);
  const { showSuccess, showError } = useToast();
  const loadPickers = useCropCycleStore((s) => s.loadPickers);
  const farms = useCropCycleStore((s) => s.farms);
  const [farmFilter, setFarmFilter] = useState('');
  const [greenhouseFilter, setGreenhouseFilter] = useState('');

  // The last farm / greenhouse picked on this phone.
  useEffect(() => {
    storage
      .get(StorageKeys.seaFreightFilter)
      .then((raw) => {
        if (!raw) return;
        const saved = JSON.parse(raw) as { farm?: string; greenhouse?: string };
        setFarmFilter(saved.farm ?? '');
        setGreenhouseFilter(saved.greenhouse ?? '');
      })
      .catch(() => {});
  }, []);
  const saveFilter = (farm: string, greenhouse: string) => {
    setFarmFilter(farm);
    setGreenhouseFilter(greenhouse);
    storage.set(StorageKeys.seaFreightFilter, JSON.stringify({ farm, greenhouse })).catch(() => {});
  };

  // Every greenhouse growing an ordered variety, for the greenhouse filter.
  const allGreenhouses = useMemo(() => {
    const seen = new Map<string, { name: string; label: string; farm: string }>();
    for (const o of orders) for (const l of o.items) for (const g of l.greenhouses) if (!seen.has(g.name)) seen.set(g.name, g);
    return [...seen.values()].sort((a, b) => a.label.localeCompare(b.label));
  }, [orders]);
  const farmOptions = useMemo(() => {
    const names = [...new Set(allGreenhouses.map((g) => g.farm).filter(Boolean))].sort();
    return names.map((n) => ({ value: n, label: farms.find((f) => f.name === n)?.label ?? n }));
  }, [allGreenhouses, farms]);

  // A line belongs to the filter when its variety is grown in the picked farm / greenhouse.
  const lineMatches = useCallback(
    (l: SeaFreightLine) =>
      (!farmFilter && !greenhouseFilter) ||
      l.greenhouses.some((g) => (!farmFilter || g.farm === farmFilter) && (!greenhouseFilter || g.name === greenhouseFilter)),
    [farmFilter, greenhouseFilter],
  );
  const visibleOrders = useMemo(
    () =>
      orders
        .map((o) => ({ ...o, items: o.items.filter(lineMatches) }))
        .filter((o) => o.items.length > 0),
    [orders, lineMatches],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setOrders(await seaFreightApi.listOrders());
    } catch (err) {
      setError(mapAxiosError(err).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useRefreshOnFocus(() => {
    load();
    loadPickers();
  });

  const markDone = (o: SeaFreightOrder) =>
    showDialog(
      'Mark harvest done',
      `${o.orderName || o.customer} goes to the packhouse to be received.`,
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes',
          onPress: async () => {
            setMarkingDone(o.name);
            try {
              showSuccess(await seaFreightApi.markDone(o.name));
              await load();
            } catch (err) {
              showError(mapAxiosError(err).message);
            } finally {
              setMarkingDone(null);
            }
          },
        },
      ],
      { name: 'checkmark-done-outline', tone: 'success' },
    );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <KeyboardAwareScrollView
        contentContainerStyle={s.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        bottomOffset={20}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={s.filters}>
          <View style={{ flex: 1 }}>
            <Dropdown
              label="Farm"
              value={farmFilter}
              onChange={(v) => {
                const keep = allGreenhouses.find((g) => g.name === greenhouseFilter && (!v || g.farm === v));
                saveFilter(v, keep ? greenhouseFilter : '');
              }}
              options={[{ value: '', label: 'All farms' }, ...farmOptions]}
              placeholder="All farms"
            />
          </View>
          <View style={{ flex: 1 }}>
            <Dropdown
              label="Greenhouse"
              value={greenhouseFilter}
              onChange={(v) => saveFilter(farmFilter || allGreenhouses.find((g) => g.name === v)?.farm || '', v)}
              options={[
                { value: '', label: 'All greenhouses' },
                ...allGreenhouses
                  .filter((g) => !farmFilter || g.farm === farmFilter)
                  .map((g) => ({ value: g.name, label: g.label })),
              ]}
              placeholder="All greenhouses"
            />
          </View>
        </View>

        {error ? <Alert tone="danger">{error}</Alert> : null}
        {loading && orders.length === 0 ? (
          <Card>
            <Spinner label="Loading sea freight orders…" />
          </Card>
        ) : visibleOrders.length === 0 && !error ? (
          <Card>
            <Alert tone="info">
              {orders.length === 0 ? 'No open sea freight orders.' : 'No sea freight orders for this farm or greenhouse.'}
            </Alert>
          </Card>
        ) : (
          visibleOrders.map((o) => (
            <View key={o.name} style={s.order}>
              <View style={s.orderHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={s.orderTitle} numberOfLines={1}>{o.orderName || o.customer}</Text>
                  <Text style={s.orderSub}>
                    {[o.orderName ? o.customer : '', o.name, `Delivery ${o.deliveryDate}`].filter(Boolean).join(' · ')}
                  </Text>
                </View>
                <Pill
                  value={`${fmt(o.harvestedStems)}/${fmt(o.orderedStems)}`}
                  tone={o.orderedStems > 0 && o.harvestedStems >= o.orderedStems ? 'success' : 'neutral'}
                />
              </View>
              {o.items.map((l) => {
                const pct = l.orderedStems > 0 ? Math.min(l.harvestedStems / l.orderedStems, 1) : 0;
                return (
                  <Pressable
                    key={l.name}
                    onPress={() => setHarvesting({ order: o, line: l })}
                    style={({ pressed }) => [s.line, pressed && { opacity: 0.7 }]}
                  >
                    <View style={s.lineHeader}>
                      <Text style={s.lineTitle} numberOfLines={1}>
                        {[l.itemName, l.stemLength].filter(Boolean).join(' · ')}
                      </Text>
                      <Text style={s.lineQty}>{`${fmt(l.harvestedStems)} / ${fmt(l.orderedStems)}`}</Text>
                    </View>
                    <View style={s.bar}>
                      <View style={[s.barFill, { width: `${pct * 100}%` }, pct >= 1 && s.barDone]} />
                    </View>
                    {l.cutStage || l.headSize || l.spec ? (
                      <Text style={s.lineSpec} numberOfLines={2}>
                        {[
                          l.stemLength ? `Length ${l.stemLength}` : '',
                          l.cutStage ? `Cut stage ${l.cutStage}` : '',
                          l.headSize ? `Head ${l.headSize}` : '',
                          l.spec ? `Spec ${l.spec}` : '',
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </Text>
                    ) : null}
                    <Text style={s.lineMeta}>
                      {l.remainingStems > 0 ? `${fmt(l.remainingStems)} stems to harvest` : 'Fully harvested'}
                      {l.boxes ? ` · ${l.boxes} boxes` : ''}
                      {` · ${l.greenhouses.length ? `in ${l.greenhouses.length} greenhouse${l.greenhouses.length === 1 ? '' : 's'}` : 'no crop cycle'}`}
                    </Text>
                  </Pressable>
                );
              })}
              {o.items.length > 0 && o.items.every((l) => l.harvestedStems >= l.orderedStems) ? (
                <Button
                  label="Mark harvest done"
                  iconLeft="checkmark-done-outline"
                  onPress={() => markDone(o)}
                  loading={markingDone === o.name}
                />
              ) : null}
            </View>
          ))
        )}
      </KeyboardAwareScrollView>

      <Sheet
        aboveTabBar
        visible={!!harvesting}
        onClose={() => setHarvesting(null)}
        title={harvesting ? `Harvest ${harvesting.line.itemName}` : 'Harvest'}
        subtitle={
          harvesting
            ? [harvesting.order.orderName, harvesting.order.customer, harvesting.order.name].filter(Boolean).join(' · ')
            : undefined
        }
      >
        {harvesting ? (
          <KeyboardAwareScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            bottomOffset={40}
            contentContainerStyle={{ paddingBottom: spacing.sm }}
          >
          <SeaFreightHarvestForm
            key={harvesting.line.name}
            order={harvesting.order}
            line={harvesting.line}
            initialFarm={farmFilter}
            initialGreenhouse={greenhouseFilter}
            onDone={() => {
              setHarvesting(null);
              load();
            }}
          />
          </KeyboardAwareScrollView>
        ) : null}
      </Sheet>
    </View>
  );
}

function SeaFreightHarvestForm({
  order,
  line,
  initialFarm,
  initialGreenhouse,
  onDone,
}: {
  order: SeaFreightOrder;
  line: SeaFreightLine;
  /** The page's filter: start the form on that farm / greenhouse when the variety grows there. */
  initialFarm: string;
  initialGreenhouse: string;
  onDone: () => void;
}) {
  const { showSuccess, showError } = useToast();
  const farms = useCropCycleStore((s) => s.farms);
  const loadGreenhouseData = useHarvestingStore((s) => s.loadGreenhouseData);
  const varieties = useHarvestingStore((s) => s.varieties);
  const employees = useHarvestingStore((s) => s.employees);
  const cutStages = useHarvestingStore((s) => s.cutStages);
  const headSizes = useHarvestingStore((s) => s.headSizes);
  const headSizeMandatory = useHarvestingStore((s) => s.headSizeMandatory);
  const ghDataLoading = useHarvestingStore((s) => s.ghDataLoading);
  const stemLengths = useHarvestingStore((s) => s.stemLengths);
  const loadStemLengths = useHarvestingStore((s) => s.loadStemLengths);
  const createHarvest = useHarvestingStore((s) => s.createHarvest);
  const acting = useHarvestingStore((s) => s.acting);

  // Only farms and greenhouses with a running crop cycle of this variety.
  const growingFarms = useMemo(() => {
    const names = new Set(line.greenhouses.map((g) => g.farm).filter(Boolean));
    return [...names].map((name) => ({ value: name, label: farms.find((f) => f.name === name)?.label ?? name }));
  }, [line.greenhouses, farms]);
  const startHouse = line.greenhouses.find((g) => g.name === initialGreenhouse);
  const [farm, setFarm] = useState(
    startHouse?.farm ??
      (growingFarms.some((f) => f.value === initialFarm)
        ? initialFarm
        : growingFarms.length === 1
          ? growingFarms[0].value
          : ''),
  );
  const farmGreenhouses = useMemo(
    () => line.greenhouses.filter((g) => !farm || g.farm === farm),
    [line.greenhouses, farm],
  );
  const [greenhouse, setGreenhouse] = useState(
    startHouse?.name ?? (farmGreenhouses.length === 1 ? farmGreenhouses[0].name : ''),
  );
  const [harvester, setHarvester] = useState('');
  // Prefilled from what the order asks for (its line or Specification).
  const [cutStage, setCutStage] = useState(line.cutStage);
  const [headSize, setHeadSize] = useState(line.headSize);
  const [stemLength, setStemLength] = useState(line.stemLength);
  const [bucketId, setBucketId] = useState('');
  const [quantity, setQuantity] = useState('');

  useEffect(() => {
    loadStemLengths();
  }, [loadStemLengths]);

  const pickFarm = (next: string) => {
    setFarm(next);
    const houses = line.greenhouses.filter((g) => g.farm === next);
    setGreenhouse(houses.length === 1 ? houses[0].name : '');
  };

  useEffect(() => {
    if (!greenhouse) return;
    loadGreenhouseData(greenhouse);
    setHarvester('');
    setCutStage(line.cutStage);
  }, [greenhouse, loadGreenhouseData, line.cutStage]);

  // The order's variety as the greenhouse knows it: its own head size rule and default.
  // (A greenhouse only lists varieties from its ledger; the crop cycle is what made it pickable.)
  const variety = useMemo(() => varieties.find((v) => v.name === line.itemCode), [varieties, line.itemCode]);
  const needsHeadSize = headSizeMandatory || !!variety?.headSizeMandatory;
  useEffect(() => {
    setHeadSize(line.headSize || variety?.defaultHeadSize || '');
  }, [variety, line.headSize]);

  const submit = async () => {
    if (!farm || !greenhouse || !harvester || !stemLength || !bucketId || !quantity || !cutStage || (needsHeadSize && !headSize)) {
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
      item_code: line.itemCode,
      quantity: qty,
      cut_stage: cutStage,
      head_size: headSize,
      sales_order: order.name,
      sales_order_item: line.name,
    });
    if (outcome.ok) {
      showSuccess(outcome.message);
      onDone();
    } else {
      showError(outcome.error);
    }
  };

  return (
    <View style={{ gap: spacing.sm }}>
      <Text style={s.lineMeta}>
        {`${fmt(line.harvestedStems)} of ${fmt(line.orderedStems)} stems harvested · ${fmt(line.remainingStems)} to go`}
      </Text>
      {line.greenhouses.length === 0 ? (
        <Alert tone="warn">{`No greenhouse has a running crop cycle of ${line.itemName}.`}</Alert>
      ) : null}
      <View style={s.row2}>
        <View style={{ flex: 1 }}>
          <Dropdown
            label="Farm"
            value={farm}
            onChange={pickFarm}
            options={growingFarms}
            placeholder="Select farm"
          />
        </View>
        <View style={{ flex: 1 }}>
          <Dropdown
            label="Greenhouse"
            value={greenhouse}
            onChange={setGreenhouse}
            options={farmGreenhouses.map((g) => ({
              value: g.name,
              label: g.label,
              sublabel: g.area ? `${Math.round(g.area)} m²` : undefined,
            }))}
            placeholder={!farm ? 'Pick a farm first' : 'Select greenhouse'}
            disabled={!farm}
          />
        </View>
      </View>
      <Dropdown
        label="Harvester"
        value={harvester}
        onChange={setHarvester}
        options={employees.map((e) => ({ value: e.name, label: e.label }))}
        placeholder={greenhouse ? 'Pick the harvester' : 'Pick a greenhouse first'}
        disabled={!greenhouse || ghDataLoading}
      />
      <View style={s.row2}>
        <View style={{ flex: 1 }}>
          <Dropdown
            label="Stem length"
            value={stemLength}
            onChange={setStemLength}
            options={stemLengths.map((l) => ({ value: l.name, label: l.label }))}
            placeholder="62cm"
            disabled={!!line.stemLength}
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
      <Dropdown
        label={needsHeadSize ? 'Head size' : 'Head size (optional)'}
        value={headSize}
        onChange={setHeadSize}
        options={headSizes.map((h) => ({ value: h, label: h }))}
        placeholder={greenhouse ? 'Select head size' : 'Pick a greenhouse first'}
        searchable={false}
      />
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
        onChangeText={(t) => setQuantity(t.replace(/[^0-9]/g, ''))}
        placeholder={line.remainingStems ? String(line.remainingStems) : 'e.g. 100'}
        keyboardType="number-pad"
        iconLeft="leaf-outline"
      />
      <Button label="Submit harvest" onPress={submit} loading={acting} />
    </View>
  );
}

const s = StyleSheet.create({
  scroll: { padding: spacing.lg, paddingBottom: 96, gap: spacing.md },
  order: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  orderHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  orderTitle: { fontFamily: fontFamily.semiBold, fontSize: fontSize.md, color: colors.text },
  orderSub: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.textSecondary, marginTop: 2 },
  line: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
    gap: 4,
  },
  lineHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  lineTitle: { flex: 1, fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: colors.text },
  lineQty: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: colors.text },
  lineSpec: { fontFamily: fontFamily.medium, fontSize: fontSize.xs, color: colors.text },
  lineMeta: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textMuted },
  bar: { height: 6, borderRadius: 3, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  barFill: { height: 6, borderRadius: 3, backgroundColor: colors.primary },
  barDone: { backgroundColor: colors.success },
  row2: { flexDirection: 'row', gap: spacing.sm },
  filters: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.md,
  },
});
