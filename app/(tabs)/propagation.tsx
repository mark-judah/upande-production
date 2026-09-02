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
import { Card, Alert } from '@/src/components/Card';
import { Button } from '@/src/components/Button';
import { LabeledInput } from '@/src/components/LabeledInput';
import { Dropdown } from '@/src/components/Dropdown';
import { Pill } from '@/src/components/Pill';
import { Segmented } from '@/src/components/Segmented';
import { FAB } from '@/src/components/FAB';
import { Sheet } from '@/src/components/Sheet';
import { Spinner } from '@/src/components/Spinner';
import { useToast } from '@/src/components/Toast';
import { borderRadius, colors, fontFamily, fontSize, spacing } from '@/src/theme';
import { useRefreshOnFocus } from '@/src/hooks/useRefreshOnFocus';
import { usePropagationStore } from '@/src/stores/propagationStore';
import { useCropCycleStore } from '@/src/stores/cropCycleStore';
import {
  LOG_ACTIVITIES,
  PROPAGATION_STAGES,
  SR_PRIORITIES,
  WEATHER_OPTIONS,
  type PropagationBatch,
  type SeedlingRequest,
  type SeedlingRequestItem,
} from '@/src/services/propagation';

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

type Section = 'batches' | 'requests';

export default function PropagationScreen() {
  const [view, setView] = useState<Section>('batches');
  const batches = usePropagationStore((s) => s.batches);
  const batchesLoading = usePropagationStore((s) => s.batchesLoading);
  const batchesError = usePropagationStore((s) => s.batchesError);
  const loadBatches = usePropagationStore((s) => s.loadBatches);
  const requests = usePropagationStore((s) => s.requests);
  const requestsLoading = usePropagationStore((s) => s.requestsLoading);
  const requestsError = usePropagationStore((s) => s.requestsError);
  const loadRequests = usePropagationStore((s) => s.loadRequests);
  const loadPickers = useCropCycleStore((s) => s.loadPickers);

  const [refreshing, setRefreshing] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState<PropagationBatch | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [reqOpen, setReqOpen] = useState(false);

  useRefreshOnFocus(() => {
    loadBatches();
    loadRequests();
    loadPickers(); // shared varieties picker (from crop cycle store)
  });

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadBatches(), loadRequests()]);
    setRefreshing(false);
  };

  const loading = view === 'batches' ? batchesLoading : requestsLoading;
  const error = view === 'batches' ? batchesError : requestsError;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        contentContainerStyle={s.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <Segmented
          value={view}
          onChange={setView}
          options={[
            { value: 'batches', label: 'Batches' },
            { value: 'requests', label: 'Seedling requests' },
          ]}
        />

        {error ? <Alert tone="danger">{error}</Alert> : null}

        {view === 'batches' ? (
          <>
            {loading && batches.length === 0 ? (
              <Card><Spinner label="Loading batches…" /></Card>
            ) : batches.length === 0 ? (
              <Card><Alert tone="info">No active batches.</Alert></Card>
            ) : (
              batches.map((b) => (
                <Pressable
                  key={b.name}
                  onPress={() => { setSelectedBatch(b); setLogOpen(true); }}
                  style={({ pressed }) => [s.row, pressed && { opacity: 0.7 }]}
                >
                  <View style={s.rowHeader}>
                    <Text style={s.rowTitle} numberOfLines={1}>{b.varietyName || b.variety}</Text>
                    <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                  </View>
                  <Text style={s.rowSub} numberOfLines={1}>
                    {b.name} · Wk{b.isoWeek}/{b.isoYear}
                  </Text>
                  <View style={s.rowPills}>
                    <Pill label="Stage" value={b.currentStage || '—'} />
                    <Pill label="Planned" value={String(b.totalCuttingsPlanned)} />
                    <Pill
                      label="Survived"
                      value={String(b.totalSurvived)}
                      tone={b.totalSurvived > 0 ? 'success' : 'neutral'}
                    />
                    {b.totalMortality > 0 ? (
                      <Pill label="Mortality" value={String(b.totalMortality)} tone="warn" />
                    ) : null}
                  </View>
                </Pressable>
              ))
            )}
          </>
        ) : (
          <>
            {loading && requests.length === 0 ? (
              <Card><Spinner label="Loading requests…" /></Card>
            ) : requests.length === 0 ? (
              <Card><Alert tone="info">No seedling requests.</Alert></Card>
            ) : (
              requests.map((r) => <SeedlingRequestRow key={r.name} req={r} />)
            )}
          </>
        )}
      </ScrollView>

      {/* FAB morphs into the close-X for the New Request flow. */}
      <FAB
        icon="add"
        expanded={reqOpen}
        onPress={() => setReqOpen((p) => !p)}
        visible={view === 'requests' && !logOpen}
      />

      {logOpen && selectedBatch ? (
        <LogActivitySheet
          batch={selectedBatch}
          onClose={() => { setLogOpen(false); setSelectedBatch(null); }}
        />
      ) : null}

      <NewRequestSheet visible={reqOpen} onClose={() => setReqOpen(false)} />
    </View>
  );
}

/* ─── Seedling-request row ─────────────────────────────────────────────── */

function SeedlingRequestRow({ req }: { req: SeedlingRequest }) {
  const tone =
    req.status === 'Fulfilled' ? 'success' :
    req.status === 'Cancelled' ? 'danger' :
    req.status === 'Partially Fulfilled' ? 'warn' :
    'neutral';
  const priorityTone =
    req.priority === 'Urgent' ? 'danger' :
    req.priority === 'High' ? 'warn' :
    'neutral';

  return (
    <View style={s.row}>
      <View style={s.rowHeader}>
        <Text style={s.rowTitle} numberOfLines={1}>{req.name}</Text>
        <Pill value={req.status || '—'} tone={tone} />
      </View>
      {req.farm ? <Text style={s.rowSub} numberOfLines={1}>{req.farm}</Text> : null}
      <View style={s.rowPills}>
        <Pill label="Priority" value={req.priority || 'Medium'} tone={priorityTone} />
        <Pill label="Requested" value={String(req.totalQtyRequested)} />
        <Pill label="Dispatched" value={String(req.totalQtyDispatched)} />
        {req.requiredByDate ? <Pill label="Needed" value={req.requiredByDate} /> : null}
      </View>
    </View>
  );
}

/* ─── Log activity sheet ───────────────────────────────────────────────── */

function LogActivitySheet({
  batch,
  onClose,
}: {
  batch: PropagationBatch;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { showSuccess, showError } = useToast();
  const acting = usePropagationStore((st) => st.acting);
  const recordLog = usePropagationStore((st) => st.recordLog);

  const [logDate, setLogDate] = useState(todayIso());
  const [activity, setActivity] = useState('');
  const [qty, setQty] = useState('');
  const [mortality, setMortality] = useState('');
  const [surviving, setSurviving] = useState('');
  const [weather, setWeather] = useState('');
  const [observations, setObservations] = useState('');

  const submit = async () => {
    if (!logDate || !activity || !qty) {
      showError('Date, activity, and qty are required.');
      return;
    }
    const outcome = await recordLog({
      propagation_batch: batch.name,
      log_date: logDate,
      activity_type: activity as any,
      qty_done_today: Number(qty),
      mortality_today: mortality ? Number(mortality) : undefined,
      surviving_qty: surviving ? Number(surviving) : undefined,
      weather_conditions: weather || undefined,
      observations: observations || undefined,
    });
    if (outcome.ok) {
      showSuccess(outcome.message || 'Activity logged.');
      onClose();
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
              title="Log activity"
              subtitle={`${batch.varietyName || batch.variety} · ${batch.name}`}
              onClose={onClose}
            />

            <LabeledInput
              label="Log date"
              value={logDate}
              onChangeText={setLogDate}
              placeholder="YYYY-MM-DD"
              iconLeft="calendar-outline"
              autoCapitalize="none"
            />

            <Dropdown
              label="Activity"
              value={activity}
              onChange={setActivity}
              options={LOG_ACTIVITIES.map((a) => ({ value: a, label: a }))}
              searchable={false}
              placeholder="What was done today?"
            />
            <View style={{ height: spacing.md }} />

            <LabeledInput
              label="Qty done today"
              value={qty}
              onChangeText={setQty}
              keyboardType="number-pad"
              iconLeft="checkmark-circle-outline"
            />

            <View style={s.row2}>
              <View style={{ flex: 1 }}>
                <LabeledInput
                  label="Mortality (optional)"
                  value={mortality}
                  onChangeText={setMortality}
                  keyboardType="number-pad"
                  iconLeft="trash-outline"
                />
              </View>
              <View style={{ flex: 1 }}>
                <LabeledInput
                  label="Surviving (optional)"
                  value={surviving}
                  onChangeText={setSurviving}
                  keyboardType="number-pad"
                  iconLeft="leaf-outline"
                />
              </View>
            </View>

            <Dropdown
              label="Weather (optional)"
              value={weather}
              onChange={setWeather}
              options={WEATHER_OPTIONS.map((w) => ({ value: w, label: w }))}
              searchable={false}
              placeholder="Pick weather"
            />

            <View style={{ height: spacing.md }} />
            <Text style={s.fieldLabel}>Observations (optional)</Text>
            <TextInput
              value={observations}
              onChangeText={setObservations}
              multiline
              numberOfLines={3}
              placeholder="Pests / diseases / general health"
              placeholderTextColor={colors.textMuted}
              style={s.textarea}
            />

            <View style={{ height: spacing.md }} />
            <Button label="Submit log" loading={acting} onPress={submit} />
          </KeyboardAwareScrollView>
        </View>
      </View>
    </Modal>
  );
}

/* ─── New seedling request sheet ───────────────────────────────────────── */

function NewRequestSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { showSuccess, showError } = useToast();
  const varieties = useCropCycleStore((st) => st.varieties);
  const acting = usePropagationStore((st) => st.acting);
  const createRequest = usePropagationStore((st) => st.createRequest);

  const [requiredBy, setRequiredBy] = useState('');
  const [priority, setPriority] = useState<string>('Medium');
  const [farm, setFarm] = useState('');
  const [reason, setReason] = useState('');
  const [items, setItems] = useState<SeedlingRequestItem[]>([{ variety: '', qty: 0 }]);

  const updateItem = (i: number, patch: Partial<SeedlingRequestItem>) => {
    setItems((arr) => arr.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  };

  const submit = async () => {
    const cleaned = items.filter((it) => it.variety && it.qty > 0);
    if (!requiredBy) { showError('Required-by date is required.'); return; }
    if (cleaned.length === 0) { showError('Add at least one variety + qty.'); return; }
    const outcome = await createRequest({
      required_by_date: requiredBy,
      priority: priority as any,
      farm: farm || undefined,
      reason: reason || undefined,
      items: cleaned,
    });
    if (outcome.ok) {
      showSuccess(outcome.message || 'Request created.');
      onClose();
    } else {
      showError(outcome.error);
    }
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="New seedling request" hideCloseButton>
      <KeyboardAwareScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} enableOnAndroid extraScrollHeight={40}>
        <LabeledInput
          label="Required by"
          value={requiredBy}
          onChangeText={setRequiredBy}
          placeholder="YYYY-MM-DD"
          iconLeft="calendar-outline"
          autoCapitalize="none"
        />

        <Dropdown
          label="Priority"
          value={priority}
          onChange={setPriority}
          options={SR_PRIORITIES.map((p) => ({ value: p, label: p }))}
          searchable={false}
        />
        <View style={{ height: spacing.md }} />

        <LabeledInput
          label="Farm (optional)"
          value={farm}
          onChangeText={setFarm}
          iconLeft="home-outline"
        />

        <Text style={[s.fieldLabel, { marginTop: spacing.sm }]}>Items</Text>
        {items.map((it, i) => (
          <View key={i} style={s.itemRow}>
            <View style={{ flex: 2 }}>
              <Dropdown
                value={it.variety}
                onChange={(v) => updateItem(i, { variety: v })}
                options={varieties.map((v) => ({ value: v.name, label: v.label }))}
                placeholder="Variety"
              />
            </View>
            <View style={{ width: 100 }}>
              <TextInput
                value={it.qty ? String(it.qty) : ''}
                onChangeText={(t) => updateItem(i, { qty: Number(t) || 0 })}
                keyboardType="number-pad"
                placeholder="Qty"
                placeholderTextColor={colors.textMuted}
                style={s.qtyInput}
              />
            </View>
            {items.length > 1 ? (
              <TouchableOpacity
                onPress={() => setItems((arr) => arr.filter((_, idx) => idx !== i))}
                hitSlop={8}
                style={{ padding: 4 }}
              >
                <Ionicons name="close-circle" size={20} color={colors.textMuted} />
              </TouchableOpacity>
            ) : null}
          </View>
        ))}
        <TouchableOpacity
          onPress={() => setItems((arr) => [...arr, { variety: '', qty: 0 }])}
          style={s.addItemBtn}
          activeOpacity={0.7}
        >
          <Ionicons name="add" size={16} color={colors.text} />
          <Text style={s.addItemText}>Add row</Text>
        </TouchableOpacity>

        <View style={{ height: spacing.md }} />
        <Text style={s.fieldLabel}>Reason (optional)</Text>
        <TextInput
          value={reason}
          onChangeText={setReason}
          multiline
          numberOfLines={3}
          placeholder="Why are these seedlings needed?"
          placeholderTextColor={colors.textMuted}
          style={s.textarea}
        />

        <View style={{ height: spacing.md }} />
        <Button label="Submit request" loading={acting} onPress={submit} />
        <View style={{ height: spacing.xl }} />
      </KeyboardAwareScrollView>
    </Sheet>
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
  rowHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
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

  itemRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  qtyInput: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.md,
    color: colors.text,
    backgroundColor: colors.background,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    textAlign: 'right',
  },
  addItemBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  addItemText: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: colors.text },
});
