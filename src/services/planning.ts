import { api } from './api';

// --- Weekly Production Plan Form (greenhouse x ISO week) ---
// One plan per greenhouse per week. Header: company, farm, week, supervisor,
// greenhouse. Each Greenhouse Operations Task row: day, assigned Task, variety,
// purpose, target, actual (achievement computed server-side), remarks.

export const TASK_STATUSES = ['Open', 'In Progress', 'Done', 'Skipped'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

/** Approval workflow states (Production Plan Approval). */
export const PENDING_STATES = ['Pending Approval', 'Pending Verification'];
export type PlanAction =
  | 'Submit for Approval'
  | 'Approve'
  | 'Reject'
  | 'Submit for Verification'
  | 'Verify';

export const DAYS_OF_WEEK = [
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
] as const;

export interface PlanSummary {
  name: string;
  greenhouse: string;
  farm: string;
  company: string;
  supervisor: string;
  /** 0 draft, 1 submitted (locked). */
  docstatus: number;
  planYear: number;
  planWeek: number;
  planPeriod: string;
  tasksTotal: number;
  tasksOpen: number;
  tasksDone: number;
  plannedStems: number;
  owner: string;
  isMine: boolean;
  /** Approval workflow state; empty when the workflow isn't on this site. */
  workflowState: string;
}

export interface PlanTask {
  name: string;
  taskName: string;
  assignedTask?: string;
  day?: string;
  purpose?: string;
  operation: string;
  variety?: string;
  target: number;
  actual: number;
  achievement: number;
  supervisorsRemarks?: string;
  beds?: string;
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
  company: string;
  supervisor: string;
  supervisorName: string;
  docstatus: number;
  greenhouse: string;
  farm: string;
  planYear: number;
  planWeek: number;
  planPeriod: string;
  tasks: PlanTask[];
  varieties: PlanVariety[];
  workflowState: string;
  /** Workflow actions this user can take right now. */
  actions: PlanAction[];
  canEditPlan: boolean;
  canEnterActuals: boolean;
  approvedBy: string;
  approvedOn: string;
  verifiedBy: string;
  verifiedOn: string;
  /** 0-5 stars. */
  qualityRating: number;
  managerComments: string;
}

export interface SavePlanPayload {
  name?: string;
  greenhouse?: string;
  company?: string;
  farm?: string;
  supervisor?: string;
  plan_year?: number;
  plan_week?: number;
  tasks?: Array<{
    name?: string;
    assigned_task?: string;
    day?: string;
    purpose?: string;
    variety?: string;
    target?: number;
    actual?: number;
    supervisors_remarks?: string;
  }>;
  varieties?: Array<{ name?: string; variety?: string; planned_stems?: number; notes?: string }>;
}

export interface UpdateTaskPayload {
  plan: string;
  task: string;
  status: TaskStatus;
  actual?: number;
  supervisors_remarks?: string;
}

interface RawPlan {
  name?: string; docstatus?: number; greenhouse?: string; farm?: string; company?: string; supervisor?: string; supervisor_name?: string;
  plan_year?: number; plan_week?: number; plan_period?: string;
  tasks_total?: number; tasks_open?: number; tasks_done?: number; planned_stems?: number;
  owner?: string; is_mine?: boolean; workflow_state?: string;
}
interface RawTask {
  name?: string; task_name?: string; assigned_task?: string; day?: string; purpose?: string;
  operation?: string; variety?: string; achievement?: number; supervisors_remarks?: string;
  target?: number; actual?: number; beds?: string; due_date?: string; assigned_to?: string;
  assigned_to_name?: string; status?: string; harvested?: number; completion_note?: string;
}
interface RawVariety {
  name?: string; variety?: string; planned_stems?: number;
  forecast_stems?: number; budget_stems?: number; notes?: string;
}
interface RawApproval {
  workflow_state?: string; actions?: string[]; can_edit_plan?: boolean; can_enter_actuals?: boolean;
  approved_by?: string; approved_on?: string; verified_by?: string; verified_on?: string;
  quality_rating?: number; manager_comments?: string;
}
interface RawDetail extends RawPlan, RawApproval {
  supervisor_name?: string; tasks?: RawTask[]; varieties?: RawVariety[]; error?: string;
}
interface ListResponse { data?: { plans?: RawPlan[]; count?: number; error?: string } }
interface DetailResponse { data?: RawDetail }
interface SubmitResponse { data?: { status?: string; name?: string; message?: string; error?: string } }

function toSummary(r: RawPlan): PlanSummary {
  return {
    name: String(r.name ?? ''),
    greenhouse: String(r.greenhouse ?? ''),
    farm: String(r.farm ?? ''),
    company: String(r.company ?? ''),
    supervisor: String(r.supervisor ?? ''),
    docstatus: Number(r.docstatus ?? 0),
    planYear: Number(r.plan_year ?? 0),
    planWeek: Number(r.plan_week ?? 0),
    planPeriod: String(r.plan_period ?? ''),
    tasksTotal: Number(r.tasks_total ?? 0),
    tasksOpen: Number(r.tasks_open ?? 0),
    tasksDone: Number(r.tasks_done ?? 0),
    plannedStems: Number(r.planned_stems ?? 0),
    owner: String(r.owner ?? ''),
    isMine: Boolean(r.is_mine),
    workflowState: String(r.workflow_state ?? ''),
  };
}

function toApproval(d: RawApproval) {
  return {
    workflowState: String(d.workflow_state ?? ''),
    actions: (d.actions ?? []).map((a) => String(a) as PlanAction),
    // A site without the workflow behaves as before: everything editable.
    canEditPlan: d.can_edit_plan ?? true,
    canEnterActuals: d.can_enter_actuals ?? true,
    approvedBy: String(d.approved_by ?? ''),
    approvedOn: String(d.approved_on ?? ''),
    verifiedBy: String(d.verified_by ?? ''),
    verifiedOn: String(d.verified_on ?? ''),
    qualityRating: Math.round(Number(d.quality_rating ?? 0) * 5),
    managerComments: String(d.manager_comments ?? ''),
  };
}

function toTask(r: RawTask): PlanTask {
  return {
    name: String(r.name ?? ''),
    taskName: String(r.task_name ?? ''),
    assignedTask: r.assigned_task ? String(r.assigned_task) : undefined,
    day: r.day ? String(r.day) : undefined,
    purpose: r.purpose ? String(r.purpose) : undefined,
    operation: String(r.operation ?? ''),
    variety: r.variety ? String(r.variety) : undefined,
    target: Number(r.target ?? 0),
    actual: Number(r.actual ?? 0),
    achievement: Number(r.achievement ?? 0),
    supervisorsRemarks: r.supervisors_remarks ? String(r.supervisors_remarks) : undefined,
    beds: r.beds ? String(r.beds) : undefined,
    dueDate: r.due_date ? String(r.due_date) : undefined,
    assignedTo: r.assigned_to ? String(r.assigned_to) : undefined,
    assignedToName: r.assigned_to_name ? String(r.assigned_to_name) : undefined,
    status: (r.status as TaskStatus) || 'Open',
    harvested: Number(r.harvested ?? 0),
    completionNote: r.completion_note ? String(r.completion_note) : undefined,
  };
}

export const planningApi = {
  async list(filters?: {
    farm?: string;
    greenhouses?: string[];
    plan_year?: number;
    plan_week?: number;
    limit?: number;
    scope?: 'mine' | 'all';
    workflow_states?: string[];
  }): Promise<PlanSummary[]> {
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
      company: String(d.company ?? ''),
      supervisor: String(d.supervisor ?? ''),
      supervisorName: String(d.supervisor_name ?? ''),
      docstatus: Number(d.docstatus ?? 0),
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
      ...toApproval(d),
    };
  },

  /** Moves the plan through the approval workflow. Reject needs a comment;
   *  rating is 0-5 stars for the quality of the work. */
  async action(payload: { name: string; action: PlanAction; comment?: string; rating?: number }): Promise<{ message: string }> {
    const body = await api<SubmitResponse>({
      method: 'POST',
      url: '/api/method/upande_agriculture.mobile.api.productionPlanAction',
      data: payload,
    });
    if (body.data?.error) throw new Error(body.data.error);
    return { message: String(body.data?.message ?? 'Plan updated.') };
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
