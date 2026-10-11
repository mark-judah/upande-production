import { api } from './api';

// --- Weekly Production Plan Form (greenhouse x ISO week) ---
// One plan per greenhouse per week: variety stem targets + a task list.
// Milestone tasks (bending/uproot due that week) are auto-seeded server-side.

export const TASK_STATUSES = ['Open', 'In Progress', 'Done', 'Skipped'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_OPERATIONS = [
  'Harvest', 'Spray', 'Irrigate', 'Scout', 'Bend', 'Prune',
  'De-leaf', 'Weed', 'Feed', 'Plant', 'Uproot', 'Maintenance', 'Other',
] as const;

export const DAYS_OF_WEEK = [
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
] as const;

export interface PlanSummary {
  name: string;
  greenhouse: string;
  farm: string;
  planYear: number;
  planWeek: number;
  planPeriod: string;
  tasksTotal: number;
  tasksOpen: number;
  tasksDone: number;
  plannedStems: number;
  owner: string;
  isMine: boolean;
}

export interface PlanTask {
  name: string;
  taskName: string;
  operation: string;
  variety?: string;
  target: number;
  actual: number;
  beds?: string;
  dayOfWeek?: string;
  dueDate?: string;
  assignedTo?: string;
  assignedToName?: string;
  status: TaskStatus;
  harvested: number;
  completionNote?: string;
}

export interface PlanVariety {
  name: string;
  variety: string;
  plannedStems: number;
  forecastStems: number;
  budgetStems: number;
  notes?: string;
}

export interface PlanDetail {
  name: string;
  greenhouse: string;
  farm: string;
  planYear: number;
  planWeek: number;
  planPeriod: string;
  tasks: PlanTask[];
  varieties: PlanVariety[];
}

export interface SavePlanPayload {
  name?: string;
  greenhouse?: string;
  company?: string;
  plan_year?: number;
  plan_week?: number;
  tasks?: Array<{
    name?: string;
    task_name?: string;
    operation?: string;
    variety?: string;
    target?: number;
    actual?: number;
    beds?: string;
    day_of_week?: string;
    due_date?: string;
    assigned_to?: string;
    status?: string;
  }>;
  varieties?: Array<{ name?: string; variety?: string; planned_stems?: number; notes?: string }>;
}

export interface UpdateTaskPayload {
  plan: string;
  task: string;
  status: TaskStatus;
  completion_note?: string;
  actual?: number;
}

interface RawPlan {
  name?: string; greenhouse?: string; farm?: string;
  plan_year?: number; plan_week?: number; plan_period?: string;
  tasks_total?: number; tasks_open?: number; tasks_done?: number; planned_stems?: number;
  owner?: string; is_mine?: boolean;
}
interface RawTask {
  name?: string; task_name?: string; operation?: string; variety?: string;
  target?: number; actual?: number; beds?: string; day_of_week?: string; due_date?: string; assigned_to?: string;
  assigned_to_name?: string; status?: string; harvested?: number; completion_note?: string;
}
interface RawVariety {
  name?: string; variety?: string; planned_stems?: number;
  forecast_stems?: number; budget_stems?: number; notes?: string;
}
interface RawDetail extends RawPlan { tasks?: RawTask[]; varieties?: RawVariety[]; error?: string }
interface ListResponse { data?: { plans?: RawPlan[]; count?: number; error?: string } }
interface DetailResponse { data?: RawDetail }
interface SubmitResponse { data?: { status?: string; name?: string; message?: string; error?: string } }

function toSummary(r: RawPlan): PlanSummary {
  return {
    name: String(r.name ?? ''),
    greenhouse: String(r.greenhouse ?? ''),
    farm: String(r.farm ?? ''),
    planYear: Number(r.plan_year ?? 0),
    planWeek: Number(r.plan_week ?? 0),
    planPeriod: String(r.plan_period ?? ''),
    tasksTotal: Number(r.tasks_total ?? 0),
    tasksOpen: Number(r.tasks_open ?? 0),
    tasksDone: Number(r.tasks_done ?? 0),
    plannedStems: Number(r.planned_stems ?? 0),
    owner: String(r.owner ?? ''),
    isMine: Boolean(r.is_mine),
  };
}

function toTask(r: RawTask): PlanTask {
  return {
    name: String(r.name ?? ''),
    taskName: String(r.task_name ?? ''),
    operation: String(r.operation ?? ''),
    variety: r.variety ? String(r.variety) : undefined,
    target: Number(r.target ?? 0),
    actual: Number(r.actual ?? 0),
    beds: r.beds ? String(r.beds) : undefined,
    dayOfWeek: r.day_of_week ? String(r.day_of_week) : undefined,
    dueDate: r.due_date ? String(r.due_date) : undefined,
    assignedTo: r.assigned_to ? String(r.assigned_to) : undefined,
    assignedToName: r.assigned_to_name ? String(r.assigned_to_name) : undefined,
    status: (r.status as TaskStatus) || 'Open',
    harvested: Number(r.harvested ?? 0),
    completionNote: r.completion_note ? String(r.completion_note) : undefined,
  };
}

export const planningApi = {
  async list(filters?: { greenhouse?: string; plan_year?: number; plan_week?: number; limit?: number; scope?: 'mine' | 'all' }): Promise<PlanSummary[]> {
    const body = await api<ListResponse>({
      method: 'POST',
      url: '/api/method/upande_agriculture.mobile.api.productionListPlanForms',
      data: filters ?? {},
    });
    return (body.data?.plans ?? []).map(toSummary);
  },

  async get(name: string): Promise<PlanDetail> {
    const body = await api<DetailResponse>({
      method: 'POST',
      url: '/api/method/upande_agriculture.mobile.api.productionGetPlanForm',
      data: { name },
    });
    const d = body.data ?? {};
    return {
      name: String(d.name ?? ''),
      greenhouse: String(d.greenhouse ?? ''),
      farm: String(d.farm ?? ''),
      planYear: Number(d.plan_year ?? 0),
      planWeek: Number(d.plan_week ?? 0),
      planPeriod: String(d.plan_period ?? ''),
      tasks: (d.tasks ?? []).map(toTask),
      varieties: (d.varieties ?? []).map((v) => ({
        name: String(v.name ?? ''),
        variety: String(v.variety ?? ''),
        plannedStems: Number(v.planned_stems ?? 0),
        forecastStems: Number(v.forecast_stems ?? 0),
        budgetStems: Number(v.budget_stems ?? 0),
        notes: v.notes ? String(v.notes) : undefined,
      })),
    };
  },

  async save(payload: SavePlanPayload): Promise<{ name: string; message: string }> {
    const body = await api<SubmitResponse>({
      method: 'POST',
      url: '/api/method/upande_agriculture.mobile.api.productionSavePlanForm',
      data: payload,
    });
    return {
      name: String(body.data?.name ?? ''),
      message: String(body.data?.message ?? 'Plan saved.'),
    };
  },

  async updateTask(payload: UpdateTaskPayload): Promise<{ message: string }> {
    const body = await api<SubmitResponse>({
      method: 'POST',
      url: '/api/method/upande_agriculture.mobile.api.productionUpdatePlanTask',
      data: payload,
    });
    return { message: String(body.data?.message ?? 'Task updated.') };
  },
};
