import { api } from './api';

export type ReleaseInfo = {
  latest: string | null;
  runtime: string | null;
  apkUrl: string | null;
  publishedAt: string | null;
  minSupported: string | null;
  enforced: boolean;
};

/** Never throws: the lock screen and dashboard degrade without it. */
export async function getReleaseInfo(): Promise<ReleaseInfo | null> {
  try {
    const res = await api<{ message?: ReleaseInfo }>({
      method: 'POST',
      url: '/api/method/upande_agriculture.mobile.release_api.getReleaseInfo',
      data: {},
    });
    return res?.message ?? null;
  } catch {
    return null;
  }
}
