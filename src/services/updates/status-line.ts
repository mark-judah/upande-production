import { compareVersions } from './compare-versions';

export type StatusInput = {
  installed: string;
  latest: string | null;
  apkVersion: string | null;
  apkAvailable: boolean;
  apkDownloaded: boolean;
};

/** The one sentence under the Installed/Latest rows; null while the latest version is unknown. */
export function updateStatusLine(i: StatusInput): string | null {
  if (i.apkAvailable && i.apkVersion) {
    return i.apkDownloaded
      ? `v${i.apkVersion} is downloaded and ready to install.`
      : `v${i.apkVersion} is available as a new APK.`;
  }
  if (!i.latest) return null;
  if (compareVersions(i.installed, i.latest) >= 0) return "You're on the latest version.";
  return `v${i.latest} is available. Tap Check for updates to get it.`;
}
