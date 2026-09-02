import React, { useState } from 'react';
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
import { getISOWeek } from 'date-fns';
import { Card, Alert } from '@/src/components/Card';
import { Button } from '@/src/components/Button';
import { LabeledInput } from '@/src/components/LabeledInput';
import { Dropdown } from '@/src/components/Dropdown';
import { Pill } from '@/src/components/Pill';
import { FAB } from '@/src/components/FAB';
import { Spinner } from '@/src/components/Spinner';
import { useToast } from '@/src/components/Toast';
import { borderRadius, colors, fontFamily, fontSize, spacing } from '@/src/theme';
import { useRefreshOnFocus } from '@/src/hooks/useRefreshOnFocus';
import { usePlanningStore } from '@/src/stores/planningStore';
import { useCropCycleStore } from '@/src/stores/cropCycleStore';
import {
  TASK_OPERATIONS,
  type PlanTask,
  type TaskStatus,
} from '@/src/services/planning';

function todayIso(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

const STATUS_TONE: Record<string, string> = {
  Open: colors.textMuted,
  'In Progress': colors.warning,
  Done: colors.success,
  Skipped: colors.danger,
};

export default function PlanningScreen() {
  const plans = usePlanningStore((st) => st.plans);
  const loading = usePlanningStore((st) => st.loading);
  const error = usePlanningStore((st) => st.error);
  const load = usePlanningStore((st) => st.load);
  const open = usePlanningStore((st) => st.open);
  const detail = usePlanningStore((st) => st.detail);
  const closeDetail = usePlanningStore((st) => st.closeDetail);
  const loadPickers = useCropCycleStore((st) => st.loadPickers);
  const [refreshing, setRefreshing] = useState(false);
  const [creating, setCreating] = useState(false);

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

        {loading && plans.length === 0 ? (
          <Card>
            <Spinner label="Loading plans…" />
          </Card>
        ) : plans.length === 0 ? (
          <Card>
            <Alert tone="info">No weekly plans yet. Create one with the + button.</Alert>
          </Card>
        ) : (
          plans.map((p) => (
            <Pressable
              key={p.name}
              onPress={() => open(p.name)}
              style={({ pressed }) => [s.row, pressed && { opacity: 0.7 }]}
            >
              <View style={s.rowHeader}>
                <Text style={s.rowTitle} numberOfLines={1}>
                  {`W${p.planWeek} ${p.planYear} — ${p.greenhouse}`}
                </Text>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </View>
              <Text style={s.rowSub} numberOfLines={1}>{p.farm || '—'}</Text>
              <View style={s.rowPills}>
                <Pill label="Tasks" value={`${p.tasksDone}/${p.tasksTotal} done`} />
                <Pill label="Open" value={String(p.tasksOpen)} />
                <Pill label="Planned" value={`${p.plannedStems.toLocaleString()} stems`} />
              </View>
            </Pressable>
          ))
        )}
      </ScrollView>

      <FAB icon="add" onPress={() => setCreating(true)} visible={!detail && !creating} />

      {detail ? <PlanDetailSheet onClose={closeDetail} /> : null}
      {creating ? <NewPlanSheet onClose={() => setCreating(false)} /> : null}
    </View>
  );
}

function FiltersCard() {
  const filters = usePlanningStore((st) => st.filters);
  const setFilters = usePlanningStore((st) => st.setFilters);
  const clearFilters = usePlanningStore((st) => st.clearFilters);
  const greenhouses = useCropCycleStore((st) => st.greenhouses);

  return (
    <Card>
      <Dropdown
        label="Greenhouse"
        value={filters.greenhouse ?? ''}
        onChange={(v) => setFilters({ ...filters, greenhouse: v || undefined })}
        options={greenhouses.map((g) => ({ value: g.name, label: g.label }))}
        placeholder="All greenhouses"
      />
      {filters.greenhouse ? (
        <View style={s.filterFooter}>
          <TouchableOpacity style={s.clearBtn} onPress={() => clearFilters()}>
            <Ionicons name="close-circle-outline" size={14} color={colors.textMuted} />
            <Text style={s.clearText}>Clear filter</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </Card>
  );
}

function PlanDetailSheet({ onClose }: { onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const detail = usePlanningStore((st) => st.detail);
  const detailLoading = usePlanningStore((st) => st.detailLoading);
  const [task, setTask] = useState<PlanTask | null>(null);
  const [addingTask, setAddingTask] = useState(false);
  if (!detail) return null;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[s.sheet, { paddingBottom: insets.bottom + spacing.md }]}>
          <SheetHeader
            title={`W${detail.planWeek} ${detail.planYear} — ${detail.greenhouse}`}
            subtitle={detail.farm || '—'}
            onClose={onClose}
          />
          {detailLoading ? <Spinner label="Refreshing…" /> : null}
          <ScrollView showsVerticalScrollIndicator={false}>
            {detail.varieties.length ? (
              <>
                <Text style={s.sectionTitle}>Variety targets</Text>
                {detail.varieties.map((v) => (
                  <View key={v.name} style={s.taskRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.taskName}>{v.variety}</Text>
                      <Text style={s.taskMeta}>
                        {`Planned ${v.plannedStems.toLocaleString()}`}
                        {v.forecastStems ? ` · Forecast ${v.forecastStems.toLocaleString()}` : ''}
                        {v.budgetStems ? ` · Budget ${v.budgetStems.toLocaleString()}` : ''}
                      </Text>
                    </View>
                  </View>
                ))}
              </>
            ) : null}

            <Text style={s.sectionTitle}>Tasks</Text>
            {detail.tasks.length === 0 ? (
              <Text style={s.taskMeta}>No tasks on this plan yet.</Text>
            ) : (
              detail.tasks.map((t) => (
                <Pressable
                  key={t.name}
                  onPress={() => setTask(t)}
                  style={({ pressed }) => [s.taskRow, pressed && { opacity: 0.7 }]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={s.taskName} numberOfLines={1}>{t.taskName}</Text>
                    <Text style={s.taskMeta} numberOfLines={1}>
                      {t.operation}
                      {t.variety ? ` · ${t.variety}` : ''}
                      {t.beds ? ` · beds ${t.beds}` : ''}
                      {t.dueDate ? ` · due ${t.dueDate}` : ''}
                      {t.assignedToName ? ` · ${t.assignedToName}` : ''}
                    </Text>
                  </View>
                  <View style={[s.statusChip, { borderColor: STATUS_TONE[t.status] ?? colors.border }]}>
                    <Text style={[s.statusChipText, { color: STATUS_TONE[t.status] ?? colors.textMuted }]}>
                      {t.status}
                    </Text>
                  </View>
                </Pressable>
              ))
            )}

            <View style={{ marginTop: spacing.md }}>
              <Button label="Add task" iconLeft="add" variant="outline" onPress={() => setAddingTask(true)} />
            </View>
          </ScrollView>
        </View>
      </View>
      {task ? <TaskStatusSheet plan={detail.name} task={task} onClose={() => setTask(null)} /> : null}
      {addingTask ? <AddTaskSheet plan={detail.name} onClose={() => setAddingTask(false)} /> : null}
    </Modal>
  );
}

function TaskStatusSheet({ plan, task, onClose }: { plan: string; task: PlanTask; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { showSuccess, showError } = useToast();
  const acting = usePlanningStore((st) => st.acting);
  const updateTask = usePlanningStore((st) => st.updateTask);
  const [note, setNote] = useState(task.completionNote ?? '');

  const setStatus = async (status: TaskStatus) => {
    const outcome = await updateTask({
      plan,
      task: task.name,
      status,
      completion_note: note || undefined,
    });
    if (outcome.ok) {
      showSuccess(outcome.message);
      onClose();
    } else {
      showError(outcome.error);
    }
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[s.sheet, { paddingBottom: insets.bottom + spacing.md }]}>
          <SheetHeader title={task.taskName} subtitle={`${task.operation} · now ${task.status}`} onClose={onClose} />

          <Text style={s.fieldLabel}>Note (optional)</Text>
          <TextInput
            value={note}
            onChangeText={setNote}
            multiline
            numberOfLines={2}
            placeholder="How did it go?"
            placeholderTextColor={colors.textMuted}
            style={s.textarea}
          />
          <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
            {task.status === 'Open' || task.status === 'Skipped' ? (
              <Button label="Start task" iconLeft="play" onPress={() => setStatus('In Progress')} disabled={acting} />
            ) : null}
            {task.status !== 'Done' ? (
              <Button label="Mark done" iconLeft="checkmark" onPress={() => setStatus('Done')} disabled={acting} />
            ) : null}
            {task.status === 'Open' || task.status === 'In Progress' ? (
              <Button label="Skip" iconLeft="play-skip-forward" variant="outline" onPress={() => setStatus('Skipped')} disabled={acting} />
            ) : null}
            {task.status === 'Done' || task.status === 'Skipped' ? (
              <Button label="Reopen" iconLeft="refresh" variant="outline" onPress={() => setStatus('Open')} disabled={acting} />
            ) : null}
          </View>
        </View>
      </View>
    </Modal>
  );
}

function AddTaskSheet({ plan, onClose }: { plan: string; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { showSuccess, showError } = useToast();
  const acting = usePlanningStore((st) => st.acting);
  const save = usePlanningStore((st) => st.save);
  const open = usePlanningStore((st) => st.open);
  const varieties = useCropCycleStore((st) => st.varieties);

  const [taskName, setTaskName] = useState('');
  const [operation, setOperation] = useState('');
  const [variety, setVariety] = useState('');
  const [beds, setBeds] = useState('');
  const [dueDate, setDueDate] = useState(todayIso());

  const submit = async () => {
    if (!taskName || !operation) {
      showError('Task name and operation are required.');
      return;
    }
    const outcome = await save({
      name: plan,
      tasks: [{
        task_name: taskName,
        operation,
        variety: variety || undefined,
        beds: beds || undefined,
        due_date: dueDate || undefined,
      }],
    });
    if (outcome.ok) {
      showSuccess('Task added.');
      await open(plan);
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
            <SheetHeader title="Add task" subtitle={plan} onClose={onClose} />
            <LabeledInput label="Task name" value={taskName} onChangeText={setTaskName} iconLeft="clipboard-outline" />
            <Dropdown
              label="Operation"
              value={operation}
              onChange={setOperation}
              options={TASK_OPERATIONS.map((o) => ({ value: o, label: o }))}
              searchable={false}
              placeholder="Pick an operation"
            />
            <Dropdown
              label="Variety (optional)"
              value={variety}
              onChange={setVariety}
              options={varieties.map((v) => ({ value: v.name, label: v.label }))}
              placeholder="Any variety"
            />
            <LabeledInput label="Beds (optional)" value={beds} onChangeText={setBeds} placeholder="e.g. 1-20" iconLeft="git-commit-outline" autoCapitalize="none" />
            <LabeledInput label="Due date" value={dueDate} onChangeText={setDueDate} placeholder="YYYY-MM-DD" iconLeft="calendar-outline" autoCapitalize="none" />
            <View style={{ marginTop: spacing.md }}>
              <Button label="Add task" iconLeft="add" onPress={submit} disabled={acting} />
            </View>
          </KeyboardAwareScrollView>
        </View>
      </View>
    </Modal>
  );
}

function NewPlanSheet({ onClose }: { onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { showSuccess, showError } = useToast();
  const acting = usePlanningStore((st) => st.acting);
  const save = usePlanningStore((st) => st.save);
  const open = usePlanningStore((st) => st.open);
  const greenhouses = useCropCycleStore((st) => st.greenhouses);
  const varieties = useCropCycleStore((st) => st.varieties);

  const now = new Date();
  const [greenhouse, setGreenhouse] = useState('');
  const [year, setYear] = useState(String(now.getFullYear()));
  const [week, setWeek] = useState(String(getISOWeek(now)));
  const [variety, setVariety] = useState('');
  const [plannedStems, setPlannedStems] = useState('');

  const submit = async () => {
    if (!greenhouse || !year || !week) {
      showError('Greenhouse, year and week are required.');
      return;
    }
    const outcome = await save({
      greenhouse,
      plan_year: Number(year),
      plan_week: Number(week),
      varieties: variety && plannedStems
        ? [{ variety, planned_stems: Number(plannedStems) }]
        : undefined,
    });
    if (outcome.ok) {
      showSuccess(outcome.message);
      onClose();
      await open(outcome.name);
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
              title="New weekly plan"
              subtitle="Milestone tasks for the week are added automatically"
              onClose={onClose}
            />
            <Dropdown
              label="Greenhouse"
              value={greenhouse}
              onChange={setGreenhouse}
              options={greenhouses.map((g) => ({ value: g.name, label: g.label }))}
              placeholder="Pick a greenhouse"
            />
            <View style={s.row2}>
              <View style={{ flex: 1 }}>
                <LabeledInput label="Year" value={year} onChangeText={setYear} keyboardType="number-pad" iconLeft="calendar-outline" />
              </View>
              <View style={{ flex: 1 }}>
                <LabeledInput label="ISO week" value={week} onChangeText={setWeek} keyboardType="number-pad" iconLeft="calendar-number-outline" />
              </View>
            </View>
            <Dropdown
              label="Variety target (optional)"
              value={variety}
              onChange={setVariety}
              options={varieties.map((v) => ({ value: v.name, label: v.label }))}
              placeholder="Pick a variety"
            />
            {variety ? (
              <LabeledInput label="Planned stems" value={plannedStems} onChangeText={setPlannedStems} keyboardType="number-pad" iconLeft="flower-outline" />
            ) : null}
            <View style={{ marginTop: spacing.md }}>
              <Button label="Create plan" iconLeft="add" onPress={submit} disabled={acting} />
            </View>
          </KeyboardAwareScrollView>
        </View>
      </View>
    </Modal>
  );
}

function SheetHeader({ title, subtitle, onClose }: { title: string; subtitle?: string; onClose: () => void }) {
  return (
    <View style={s.sheetHeader}>
      <View style={{ flex: 1 }}>
        <Text style={s.sheetTitle} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={s.sheetSub} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      <TouchableOpacity style={s.closeBtn} onPress={onClose}>
        <Ionicons name="close" size={18} color={colors.text} />
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  scroll: { padding: spacing.lg, paddingBottom: 96 },
  filterFooter: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: spacing.sm },
  clearBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, padding: 4 },
  clearText: { fontFamily: fontFamily.medium, fontSize: fontSize.xs, color: colors.textMuted },

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

  sectionTitle: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.sm,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  taskName: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: colors.text },
  taskMeta: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 2 },
  statusChip: {
    borderWidth: 1,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  statusChipText: { fontFamily: fontFamily.medium, fontSize: fontSize.xs },

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
    minHeight: 60,
    textAlignVertical: 'top',
  },
});
