import type { ReleaseInfo } from '@/src/services/release-info';
import { compareVersions } from './compare-versions';

/** How often a locked phone may ask GitHub (60 requests/hour/IP, one NAT per farm). */
export const APK_CHECK_MIN_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Should the update-required screen release the app? Yes when the running version has
 * reached the floor, and also when the gate was switched off or the floor cleared on the
 * server (emergency off) -- otherwise already-locked phones stay locked until force-killed.
 * An unreachable server never unlocks.
 */
export function shouldUnlock(info: ReleaseInfo | null, appVersion: string): boolean {
  if (!info) return false;
  if (!info.enforced || !info.minSupported) return true;
  return compareVersions(appVersion, info.minSupported) >= 0;
}

/** `lastAt` is 0 until the first check; later checks (even failed ones) are throttled. */
export function shouldRefreshApk(lastAt: number, now: number): boolean {
  return lastAt === 0 || now - lastAt >= APK_CHECK_MIN_INTERVAL_MS;
}
