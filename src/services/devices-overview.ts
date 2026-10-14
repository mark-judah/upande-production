import { api } from './api';

export type OverviewDeviceWire = {
  device_id: string;
  model: string | null;
  device_name: string | null;
  user_name: string | null;
  farm: string | null;
  version: string | null;
  is_latest: boolean;
  seen_seconds_ago: number | null;
  ip: string | null;
};

export type OverviewPersonWire = {
  user: string;
  name: string;
  model: string | null;
  device_count: number;
  sign_ins: number;
  version: string | null;
  is_latest: boolean;
  seen_seconds_ago: number | null;
};

export type DevicesOverview = {
  summary: { devices: number; users: number; active_7d: number; active_30d: number; latest: string | null };
  versions: { version: string; count: number; latest: boolean }[];
  people: OverviewPersonWire[];
  devices: OverviewDeviceWire[];
};

export async function fetchDevicesOverview(): Promise<DevicesOverview> {
  const res = await api<{ message?: DevicesOverview & { status?: string } }>({
    method: 'POST',
    url: '/api/method/upande_agriculture.mobile.support_api.getDeviceOverview',
    data: {},
  });
  if (!res?.message || res.message.status !== 'success') throw new Error('Could not load the devices list.');
  return res.message;
}
