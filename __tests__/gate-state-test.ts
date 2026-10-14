import { shouldRefreshApk, shouldUnlock } from '@/src/services/updates/gate-state';

const info = (o: object) => ({ latest: '1.2.0', runtime: '101.2', apkUrl: null, publishedAt: null, minSupported: '1.2.0', enforced: true, ...o });

describe('shouldUnlock', () => {
  it('unlocks once the running version reaches the floor', () => {
    expect(shouldUnlock(info({}), '1.2.0')).toBe(true);
    expect(shouldUnlock(info({}), '1.10.0')).toBe(true);
  });
  it('stays locked while below an enforced floor', () => {
    expect(shouldUnlock(info({}), '1.1.9')).toBe(false);
  });
  it('unlocks when the gate has been switched off (emergency off)', () => {
    expect(shouldUnlock(info({ enforced: false }), '0.0.1')).toBe(true);
  });
  it('unlocks when the floor has been cleared', () => {
    expect(shouldUnlock(info({ minSupported: null }), '0.0.1')).toBe(true);
  });
  it('stays locked when the server could not be reached', () => {
    expect(shouldUnlock(null, '1.0.0')).toBe(false);
  });
});

describe('shouldRefreshApk', () => {
  const MIN = 5 * 60 * 1000;
  it("never checked: checks now", () => expect(shouldRefreshApk(0, 1000)).toBe(true));
  it('does not re-check within the throttle window', () => {
    expect(shouldRefreshApk(1000, 1000 + MIN - 1)).toBe(false);
  });
  it('checks again after the window', () => expect(shouldRefreshApk(1000, 1000 + MIN)).toBe(true));
  it("a check that failed is still throttled, not hammered", () => {
    expect(shouldRefreshApk(1000, 2000)).toBe(false);
  });
});
