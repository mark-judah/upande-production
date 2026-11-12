import { api } from './api';

// --- Greenhouse 5S / DMS audits ---
// Each audit type is its own doctype with one checklist table per section,
// loaded from the type's Greenhouse Audit Template. Every row is scored 0-4.

export type AuditType = '5S' | 'DMS';

export const AUDIT_TYPES: readonly { value: AuditType; label: string }[] = [
  { value: '5S', label: '5S Audit' },
  { value: 'DMS', label: 'DMS Audit' },
];

export interface AuditSummary {
  name: string;
  auditDate: string;
  farm: string;
  greenhouse: string;
  zone: string;
  auditorName: string;
  totalScore: number;
  maxScore: number;
  percentage: number;
  docstatus: number;
}

export interface AuditRow {
  name: string;
  lookAt: string;
  lookFor: string;
  observation: string;
  maxScore: number;
  score: string;
  comments: string;
}

export interface AuditSection {
  section: string;
  table: string;
  rows: AuditRow[];
}

export interface AuditDetail {
  name: string;
  docstatus: number;
  auditDate: string;
  farm: string;
  greenhouse: string;
  zone: string;
  zoneLeader: string;
  auditor: string;
  auditee: string;
  totalScore: number;
  maxScore: number;
  percentage: number;
  sections: AuditSection[];
  scores: string[];
  message?: string;
}

export interface SaveAuditPayload {
  audit_type: AuditType;
  name?: string;
  audit_date: string;
  farm: string;
  greenhouse: string;
  zone: string;
  zone_leader: string;
  auditor: string;
  auditee: string;
  sections: Record<string, { score: string; comments: string }[]>;
  submit?: boolean;
}

interface RawRow {
  name?: string; look_at?: string; look_for?: string; observation?: string;
  max_score?: number; score?: string; comments?: string;
}
interface RawDetail {
  name?: string; docstatus?: number; audit_date?: string; farm?: string; greenhouse?: string;
  zone?: string; zone_leader?: string; auditor?: string; auditee?: string;
  total_score?: number; max_score?: number; percentage?: number;
  sections?: { section?: string; table?: string; rows?: RawRow[] }[];
  scores?: string[]; message?: string; error?: string;
}
interface RawSummary {
  name?: string; audit_date?: string; farm?: string; greenhouse?: string; zone?: string;
  auditor_name?: string; total_score?: number; max_score?: number; percentage?: number; docstatus?: number;
}

function toDetail(d: RawDetail): AuditDetail {
  return {
    name: String(d.name ?? ''),
    docstatus: Number(d.docstatus ?? 0),
    auditDate: String(d.audit_date ?? ''),
    farm: String(d.farm ?? ''),
    greenhouse: String(d.greenhouse ?? ''),
    zone: String(d.zone ?? ''),
    zoneLeader: String(d.zone_leader ?? ''),
    auditor: String(d.auditor ?? ''),
    auditee: String(d.auditee ?? ''),
    totalScore: Number(d.total_score ?? 0),
    maxScore: Number(d.max_score ?? 0),
    percentage: Number(d.percentage ?? 0),
    sections: (d.sections ?? []).map((sec) => ({
      section: String(sec.section ?? ''),
      table: String(sec.table ?? ''),
      rows: (sec.rows ?? []).map((r) => ({
        name: String(r.name ?? ''),
        lookAt: String(r.look_at ?? ''),
        lookFor: String(r.look_for ?? ''),
        observation: String(r.observation ?? ''),
        maxScore: Number(r.max_score ?? 0),
        score: String(r.score ?? ''),
        comments: String(r.comments ?? ''),
      })),
    })),
    scores: d.scores ?? ['0', '1', '2', '3', '4'],
    message: d.message,
  };
}

export const auditsApi = {
  async list(audit_type: AuditType, filters?: { greenhouse?: string; limit?: number }): Promise<AuditSummary[]> {
    const body = await api<{ data?: { audits?: RawSummary[] } }>({
      method: 'POST',
      url: '/api/method/upande_agriculture.mobile.api.productionListAudits',
      data: { audit_type, limit: 100, ...filters },
    });
    return (body.data?.audits ?? []).map((r) => ({
      name: String(r.name ?? ''),
      auditDate: String(r.audit_date ?? ''),
      farm: String(r.farm ?? ''),
      greenhouse: String(r.greenhouse ?? ''),
      zone: String(r.zone ?? ''),
      auditorName: String(r.auditor_name ?? ''),
      totalScore: Number(r.total_score ?? 0),
      maxScore: Number(r.max_score ?? 0),
      percentage: Number(r.percentage ?? 0),
      docstatus: Number(r.docstatus ?? 0),
    }));
  },

  /** Without a name: a blank audit with the checklist already loaded. */
  async get(audit_type: AuditType, name?: string): Promise<AuditDetail> {
    const body = await api<{ data?: RawDetail }>({
      method: 'POST',
      url: '/api/method/upande_agriculture.mobile.api.productionGetAudit',
      data: { audit_type, name: name ?? '' },
    });
    return toDetail(body.data ?? {});
  },

  async save(payload: SaveAuditPayload): Promise<AuditDetail> {
    const body = await api<{ data?: RawDetail }>({
      method: 'POST',
      url: '/api/method/upande_agriculture.mobile.api.productionSaveAudit',
      data: payload,
    });
    return toDetail(body.data ?? {});
  },
};
