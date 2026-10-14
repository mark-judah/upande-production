import { compareVersions } from '@/src/services/updates/compare-versions';

describe('compareVersions', () => {
  it('orders numerically, not lexically', () => expect(compareVersions('1.0.10', '1.0.9')).toBe(1));
  it('ignores a leading v and pre-release suffix', () => expect(compareVersions('v1.2.0-beta', '1.2.0')).toBe(0));
  it('pads short versions', () => expect(compareVersions('1.1', '1.1.0')).toBe(0));
  it('older is -1', () => expect(compareVersions('1.0.0', '1.0.1')).toBe(-1));
  it('garbage compares as 0.0.0 and never throws', () => {
    expect(compareVersions('', '0.0.0')).toBe(0);
    expect(compareVersions('abc', '1.0.0')).toBe(-1);
    expect(compareVersions(undefined as unknown as string, '1.0.0')).toBe(-1);
  });
});
