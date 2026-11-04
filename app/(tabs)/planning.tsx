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
import { getISOWeek, getISOWeekYear } from 'date-fns';
import { Card, Alert } from '@/src/components/Card';
import { Button } from '@/src/components/Button';
import { LabeledInput } from '@/src/components/LabeledInput';
import { Dropdown } from '@/src/components/Dropdown';
import { Pill } from '@/src/components/Pill';
import { MultiSelectField } from '@/src/components/MultiSelectField';
import { FAB } from '@/src/components/FAB';
import { Spinner } from '@/src/components/Spinner';
import { useToast } from '@/src/components/Toast';
import { showDialog } from '@/src/components/DialogHost';
import { borderRadius, colors, fontFamily, fontSize, spacing } from '@/src/theme';
import { useRefreshOnFocus } from '@/src/hooks/useRefreshOnFocus';
import { usePlanningStore } from '@/src/stores/planningStore';
import { useCropCycleStore } from '@/src/stores/cropCycleStore';
import {
  DAYS_OF_WEEK,
  type PlanTask,
  type SavePlanPayload,
  type TaskStatus,
} from '@/src/services/planning';

const STATUS_TONE: Record<string, string> = {
  Open: colors.textMuted,
  'In Progress': colors.warning,
  Done: colors.success,
  Skipped: colors.danger,
};

/** One Greenhouse Operations Task row as typed into the app. */
interface TaskRow { day: string; assignedTask: string; variety: string; purpose: string; target: string; }
const emptyTaskRow = (): TaskRow => ({ day: 'Monday', assignedTask: '', variety: '', purpose: '', target: '' });
type TaskEntry = NonNullable<SavePlanPayload['tasks']>[number];

function toTaskEntry(t: TaskRow): TaskEntry {
  return {
    day: t.day,
    assigned_task: t.assignedTask,
    variety: t.variety || undefined,
    purpose: t.purpose || undefined,
    target: t.target ? Number(t.target) : undefined,
  };
}

function taskMeta(t: PlanTask): string {
  return [
    t.day,
    t.variety,
    t.purpose,
    t.target ? `target ${t.target}` : '',
    t.actual ? `actual ${t.actual}` : '',
    t.target && t.actual ? `${t.achievement}%` : '',
  ].filter(Boolean).join(' · ');
}

export default function PlanningScreen() {
  const plans = usePlanningStore((st) => st.plans);
  const loading = usePlanningStore((st) => st.loading);
  const error = usePlanningStore((st) => st.error);
  const load = usePlanningStore((st) => st.load);
  const open = usePlanningStore((st) => st.open);
  const detail = usePlanningStore((st) => st.detail);
  const closeDetail = usePlanningStore((st) => st.closeDetail);
  const loadPickers = useCropCycleStore((st) => st.loadPickers);
  const loadPeople = useCropCycleStore((st) => st.loadPeople);
  const [refreshing, setRefreshing] = useState(false);
  const [creating, setCreating] = useState(false);

  useRefreshOnFocus(() => {
    load();
    loadPickers();
    loadPeople();
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
              <Text style={s.rowSub} numberOfLines={1}>
                {[p.farm, p.company].filter(Boolean).join(' · ') || '—'}
              </Text>
              <View style={s.rowPills}>
                {p.docstatus === 1 ? <Pill value="Submitted" tone="success" /> : null}
                <Pill label="Tasks" value={`${p.tasksDone}/${p.tasksTotal} done`} />
                <Pill label="Open" value={String(p.tasksOpen)} />
                {p.plannedStems ? <Pill label="Planned" value={`${p.plannedStems.toLocaleString()} stems`} /> : null}
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
  const farms = useCropCycleStore((st) => st.farms);
  const scope = filters.scope ?? 'mine';
  const selected = filters.greenhouses ?? [];
  const farmOf = (gh: string) => greenhouses.find((g) => g.name === gh)?.farm ?? '';

  // Changing the farm drops picked greenhouses that belong to some other farm.
  const onFarm = (farm: string) =>
    setFilters({
      ...filters,
      farm: farm || undefined,
      greenhouses: farm ? selected.filter((gh) => farmOf(gh) === farm) : selected,
    });

  return (
    <Card>
      <View style={s.scopeSegmented}>
        {(['mine', 'all'] as const).map((sc) => (
          <TouchableOpacity
            key={sc}
            style={[s.scopeSegItem, scope === sc && s.scopeSegItemActive]}
            onPress={() => setFilters({ ...filters, scope: sc })}
          >
            <Text style={[s.scopeSegText, scope === sc && s.scopeSegTextActive]}>
              {sc === 'mine' ? 'My plans' : 'All plans'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={{ gap: spacing.xs }}>
        <Dropdown
          label="Farm"
          value={filters.farm ?? ''}
          onChange={onFarm}
          options={farms.map((f) => ({ value: f.name, label: f.label }))}
          placeholder="All farms"
        />
        <MultiSelectField
          label="Greenhouse"
          value={selected}
          onChange={(next) => setFilters({ ...filters, greenhouses: next })}
          options={greenhouses
            .filter((g) => !filters.farm || g.farm === filters.farm)
            .map((g) => ({ value: g.name, label: g.label }))}
          placeholder="All greenhouses"
        />
      </View>
      {filters.farm || selected.length ? (
        <View style={s.filterFooter}>
          <TouchableOpacity style={s.clearBtn} onPress={() => clearFilters()}>
            <Ionicons name="close-circle-outline" size={14} color={colors.textMuted} />
            <Text style={s.clearText}>Clear filters</Text>
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
  const locked = detail.docstatus !== 0;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[s.sheet, { paddingBottom: insets.bottom + spacing.md }]}>
          <SheetHeader
            title={`W${detail.planWeek} ${detail.planYear} — ${detail.greenhouse}`}
            subtitle={[detail.farm, detail.company, detail.supervisorName].filter(Boolean).join(' · ') || '—'}
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

            {locked ? (
              <View style={s.rowPills}>
                <Pill value="Submitted" tone="success" />
              </View>
            ) : null}
            <Text style={s.sectionTitle}>Greenhouse Operations Task</Text>
            {detail.tasks.length === 0 ? (
              <Text style={s.taskMeta}>No tasks on this plan yet.</Text>
            ) : (
              detail.tasks.map((t) => (
                <Pressable
                  key={t.name}
                  disabled={locked}
                  onPress={() => setTask(t)}
                  style={({ pressed }) => [s.taskRow, pressed && { opacity: 0.7 }]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={s.taskName} numberOfLines={1}>{t.taskName}</Text>
                    <Text style={s.taskMeta} numberOfLines={2}>{taskMeta(t)}</Text>
                    {t.supervisorsRemarks ? (
                      <Text style={s.taskMeta} numberOfLines={2}>{t.supervisorsRemarks}</Text>
                    ) : null}
                  </View>
                  <View style={[s.statusChip, { borderColor: STATUS_TONE[t.status] ?? colors.border }]}>
                    <Text style={[s.statusChipText, { color: STATUS_TONE[t.status] ?? colors.textMuted }]}>
                      {t.status}
                    </Text>
                  </View>
                </Pressable>
              ))
            )}

            {locked ? null : (
              <View style={{ marginTop: spacing.md }}>
                <Button label="Add task" iconLeft="add" variant="outline" onPress={() => setAddingTask(true)} />
              </View>
            )}
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
  const [remarks, setRemarks] = useState(task.supervisorsRemarks ?? '');
  const [actual, setActual] = useState(task.actual ? String(task.actual) : '');

  const setStatus = async (status: TaskStatus, submit = false) => {
    const outcome = await updateTask({
      plan,
      task: task.name,
      status,
      supervisors_remarks: remarks,
      actual: actual ? Number(actual) : undefined,
      submit,
    });
    if (outcome.ok) {
      showSuccess(outcome.message);
      onClose();
    } else {
      showError(outcome.error);
    }
  };

  const confirmDone = () =>
    showDialog(
      'Mark as done',
      'Marking as done will submit this Production Plan.',
      [
        { text: 'No', style: 'cancel' },
        { text: 'Yes', onPress: () => setStatus('Done', true) },
      ],
      { name: 'checkmark-done-outline', tone: 'success' },
    );

  const achievement = task.target && actual ? Math.round((Number(actual) * 10000) / task.target) / 100 : 0;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[s.sheet, { paddingBottom: insets.bottom + spacing.md }]}>
          <SheetHeader
            title={task.taskName}
            subtitle={[task.day, task.variety, `now ${task.status}`].filter(Boolean).join(' · ')}
            onClose={onClose}
          />

          <LabeledInput
            label={`Actual (target: ${task.target || '—'})`}
            value={actual}
            onChangeText={setActual}
            keyboardType="number-pad"
            iconLeft="checkmark-done-outline"
          />
          {achievement ? <Text style={s.taskMeta}>{`Achievement ${achievement}%`}</Text> : null}

          <Text style={[s.fieldLabel, { marginTop: spacing.md }]}>{"Supervisor's Remarks"}</Text>
          <TextInput
            value={remarks}
            onChangeText={setRemarks}
            multiline
            numberOfLines={2}
            placeholderTextColor={colors.textMuted}
            style={s.textarea}
          />
          <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
            {task.status !== 'Done' ? (
              <Button label="Mark done" iconLeft="checkmark" onPress={confirmDone} disabled={acting} />
            ) : (
              <Button label="Save" iconLeft="save-outline" onPress={() => setStatus('Done')} disabled={acting} />
            )}
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

/** Day / Assigned Task / Variety / Purpose / Target for one task row. */
function TaskRowFields({ row, onChange }: { row: TaskRow; onChange: (patch: Partial<TaskRow>) => void }) {
  const tasks = useCropCycleStore((st) => st.tasks);
  const varieties = useCropCycleStore((st) => st.varieties);
  return (
    <>
      <Dropdown
        label="Day"
        value={row.day}
        onChange={(v) => onChange({ day: v })}
        options={DAYS_OF_WEEK.map((d) => ({ value: d, label: d }))}
        searchable={false}
      />
      <Dropdown
        label="Assigned Task"
        value={row.assignedTask}
        onChange={(v) => onChange({ assignedTask: v })}
        options={tasks.map((t) => ({ value: t.name, label: t.label }))}
        placeholder="Pick a task"
      />
      <Dropdown
        label="Variety"
        value={row.variety}
        onChange={(v) => onChange({ variety: v })}
        options={varieties.map((v) => ({ value: v.name, label: v.label }))}
        placeholder="Pick a variety"
      />
      <LabeledInput label="Purpose" value={row.purpose} onChangeText={(v) => onChange({ purpose: v })} iconLeft="information-circle-outline" />
      <LabeledInput label="Target" value={row.target} onChangeText={(v) => onChange({ target: v })} keyboardType="number-pad" iconLeft="flag-outline" />
    </>
  );
}

function AddTaskSheet({ plan, onClose }: { plan: string; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { showSuccess, showError } = useToast();
  const acting = usePlanningStore((st) => st.acting);
  const save = usePlanningStore((st) => st.save);
  const open = usePlanningStore((st) => st.open);
  const [row, setRow] = useState<TaskRow>(emptyTaskRow());

  const submit = async () => {
    if (!row.assignedTask) {
      showError('Pick the Assigned Task.');
      return;
    }
    const outcome = await save({ name: plan, tasks: [toTaskEntry(row)] });
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
            <View style={{ gap: spacing.xs }}>
              <TaskRowFields row={row} onChange={(patch) => setRow((r) => ({ ...r, ...patch }))} />
            </View>
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
  const farms = useCropCycleStore((st) => st.farms);
  const companies = useCropCycleStore((st) => st.companies);
  const employees = useCropCycleStore((st) => st.employees);
  const myEmployee = useCropCycleStore((st) => st.myEmployee);
  const myCompany = useCropCycleStore((st) => st.myCompany);
  const filters = usePlanningStore((st) => st.filters);
  // The last plan made in this session, else the newest plan on the list.
  const sessionPlan = usePlanningStore((st) => st.lastPlan);
  const newestPlan = usePlanningStore((st) => st.plans[0]);
  const lastPlan = sessionPlan.greenhouse || !newestPlan ? sessionPlan : newestPlan;
  const setLastPlan = usePlanningStore((st) => st.setLastPlan);

  const farmOf = (gh: string) => greenhouses.find((g) => g.name === gh)?.farm ?? '';
  const companyOf = (f: string) => farms.find((x) => x.name === f)?.company ?? '';

  const now = new Date();
  const [greenhouse, setGreenhouse] = useState(
    filters.greenhouses?.length === 1 ? filters.greenhouses[0] : lastPlan.greenhouse,
  );
  const [farm, setFarm] = useState(filters.farm || lastPlan.farm);
  const [company, setCompany] = useState(lastPlan.company);
  const [week, setWeek] = useState(String(getISOWeek(now)));
  const [supervisor, setSupervisor] = useState(myEmployee);
  const [tasks, setTasks] = useState<TaskRow[]>([emptyTaskRow()]);

  // Prefill what's still empty as the pickers arrive: farm from the
  // greenhouse, company from the farm (else the user's own company), and the
  // supervisor as the logged-in user's employee.
  useEffect(() => {
    const f = farm || farmOf(greenhouse);
    if (f && f !== farm) setFarm(f);
    const c = company || companyOf(f) || myCompany;
    if (c && c !== company) setCompany(c);
    if (!supervisor && myEmployee) setSupervisor(myEmployee);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [greenhouses, farms, myCompany, myEmployee]);

  const onCompany = (c: string) => {
    setCompany(c);
    if (farm && companyOf(farm) && companyOf(farm) !== c) {
      setFarm('');
      setGreenhouse('');
    }
  };
  // Changing the farm clears a greenhouse that belongs to some other farm.
  const onFarm = (f: string) => {
    setFarm(f);
    if (!company && companyOf(f)) setCompany(companyOf(f));
    if (greenhouse && farmOf(greenhouse) !== f) setGreenhouse('');
  };
  const onGreenhouse = (gh: string) => {
    setGreenhouse(gh);
    if (!farm && farmOf(gh)) onFarm(farmOf(gh));
  };

  const updateTaskRow = (i: number, patch: Partial<TaskRow>) =>
    setTasks((prev) => prev.map((t, idx) => (idx === i ? { ...t, ...patch } : t)));

  const submit = async () => {
    if (!company || !farm || !week || !supervisor || !greenhouse) {
      showError('Company, farm, week, supervisor and greenhouse are required.');
      return;
    }
    const picked = tasks.filter((t) => t.assignedTask);
    if (picked.length === 0) {
      showError('Add at least one task with an Assigned Task.');
      return;
    }
    const outcome = await save({
      company,
      farm,
      supervisor,
      greenhouse,
      plan_year: getISOWeekYear(now),
      plan_week: Number(week),
      tasks: picked.map(toTaskEntry),
    });
    if (outcome.ok) {
      setLastPlan({ company, farm, greenhouse });
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
            <SheetHeader title="New weekly plan" onClose={onClose} />
            <View style={{ gap: spacing.xs }}>
              <Dropdown
                label="Company"
                value={company}
                onChange={onCompany}
                options={companies.map((c) => ({ value: c.name, label: c.label }))}
                placeholder="Pick a company"
              />
              <Dropdown
                label="Farm"
                value={farm}
                onChange={onFarm}
                options={farms
                  .filter((f) => !company || !f.company || f.company === company)
                  .map((f) => ({ value: f.name, label: f.label }))}
                placeholder="Pick a farm"
              />
              <LabeledInput label="Week No." value={week} onChangeText={setWeek} keyboardType="number-pad" iconLeft="calendar-number-outline" />
              <Dropdown
                label="Supervisor"
                value={supervisor}
                onChange={setSupervisor}
                options={employees.map((e) => ({ value: e.name, label: e.label, sublabel: e.name }))}
                placeholder="Pick the supervisor"
              />
              <Dropdown
                label="Greenhouse"
                value={greenhouse}
                onChange={onGreenhouse}
                options={greenhouses
                  .filter((g) => !farm || g.farm === farm)
                  .map((g) => ({ value: g.name, label: g.label }))}
                placeholder="Pick a greenhouse"
              />
            </View>

            <Text style={s.sectionTitle}>Greenhouse Operations Task</Text>
            {tasks.map((t, i) => (
              <View key={i} style={s.repeatRow}>
                <View style={s.repeatRowHead}>
                  <Text style={s.repeatRowTitle}>{`No. ${i + 1}`}</Text>
                  {tasks.length > 1 ? (
                    <TouchableOpacity onPress={() => setTasks((p) => p.filter((_, idx) => idx !== i))} hitSlop={8}>
                      <Ionicons name="trash-outline" size={18} color={colors.danger} />
                    </TouchableOpacity>
                  ) : null}
                </View>
                <TaskRowFields row={t} onChange={(patch) => updateTaskRow(i, patch)} />
              </View>
            ))}
            <Button label="Add row" variant="outline" iconLeft="add" onPress={() => setTasks((p) => [...p, emptyTaskRow()])} />

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
  scopeSegmented: { flexDirection: 'row', backgroundColor: colors.surfaceAlt, borderRadius: borderRadius.full, padding: 2, marginBottom: spacing.md },
  scopeSegItem: { flex: 1, alignItems: 'center', paddingVertical: spacing.sm, borderRadius: borderRadius.full },
  scopeSegItemActive: { backgroundColor: colors.primary },
  scopeSegText: { fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: colors.textSecondary },
  scopeSegTextActive: { color: colors.textOnPrimary },
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

  repeatRow: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.xs,
  },
  repeatRowHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs },
  repeatRowTitle: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: colors.text },
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
