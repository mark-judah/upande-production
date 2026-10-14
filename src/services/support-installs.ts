import { api } from './api';

const BASE = '/api/method/upande_agriculture.mobile.support_api.';

export type BehindCardWire = {
  device_id: string; device: string; model: string | null; user: string | null; user_full_name: string | null;
  employee: string | null; farm: string; phone: string | null; designation: string | null;
  app_version: string | null; runtime: string | null; native_version: string | null;
  last_seen: string | null; days_since_seen: number | null; days_behind: number | null;
  storage_free: number | null; blocked_count: number; reason: string | null; blocked_recent: boolean;
};

export type NeverReported = {
  employee: string; name: string; user: string; farm: string; phone: string | null; designation: string | null;
};

export type SupportDashboard = {
  summary: {
    latest: string | null; published_at: string | null; min_supported: string | null; enforced: boolean;
    total_devices: number; on_latest: number; behind: number; pct_on_latest: number;
    blocked_24h: number; never_reported: number;
  };
  distribution: { version: string; count: number }[];
  behind: BehindCardWire[];
  blocked: BehindCardWire[];
  never_reported: NeverReported[];
};

export async function fetchSupportDashboard(): Promise<SupportDashboard> {
  const res = await api<{ message?: SupportDashboard & { status?: string } }>({
    method: 'POST', url: `${BASE}getSupportDashboard`, data: {},
  });
  if (!res?.message || res.message.status !== 'success') throw new Error('Could not load install stats.');
  return res.message;
}

export async function previewMinVersion(version: string): Promise<{ devices: number; users: number }> {
  const res = await api<{ message?: { status: string; would_lock_devices?: number; would_lock_users?: number; message?: string } }>({
    method: 'POST', url: `${BASE}setMinVersion`, data: { version, dry_run: 1 },
  });
  const m = res?.message;
  if (!m || m.status !== 'success') throw new Error(m?.message || 'Could not preview.');
  return { devices: m.would_lock_devices ?? 0, users: m.would_lock_users ?? 0 };
}

export async function applyMinVersion(version: string): Promise<void> {
  const res = await api<{ message?: { status: string; message?: string } }>({
    method: 'POST', url: `${BASE}setMinVersion`, data: { version, dry_run: 0 },
  });
  if (res?.message?.status !== 'success') throw new Error(res?.message?.message || 'Could not save.');
}
