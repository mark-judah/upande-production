import { updateStatusLine } from '@/src/services/updates/status-line';

const base = { installed: '1.1.11', latest: '1.1.11', apkVersion: null, apkAvailable: false, apkDownloaded: false };

describe('updateStatusLine', () => {
  it('says so when on the latest version', () => expect(updateStatusLine(base)).toBe("You're on the latest version."));
  it('newer than latest also counts as on the latest', () => {
    expect(updateStatusLine({ ...base, installed: '1.2.0' })).toBe("You're on the latest version.");
  });
  it('says nothing when the latest version is not known yet', () => {
    expect(updateStatusLine({ ...base, latest: null })).toBeNull();
  });
  it('a downloaded APK is ready to install', () => {
    expect(updateStatusLine({ ...base, installed: '1.0.0', apkVersion: '1.1.0', apkAvailable: true, apkDownloaded: true }))
      .toBe('v1.1.0 is downloaded and ready to install.');
  });
  it('an available APK is announced', () => {
    expect(updateStatusLine({ ...base, installed: '1.0.0', apkVersion: '1.1.0', apkAvailable: true }))
      .toBe('v1.1.0 is available as a new APK.');
  });
  it('a newer release without an APK points at the update button', () => {
    expect(updateStatusLine({ ...base, installed: '1.1.10' })).toBe('v1.1.11 is available. Tap Check for updates to get it.');
  });
});
