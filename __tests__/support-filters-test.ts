import {
  buildCopyText, filterByVersion, groupByFarm, reasonLabel, whatsappUrl, type BehindCard,
} from '@/src/stores/supportInstallsStore';

const c = (o: Partial<BehindCard>): BehindCard => ({
  device_id: 'd', device: 'Pixel', model: null, user: 'u', user_full_name: 'U', employee: null,
  farm: 'A', phone: null, designation: null, app_version: '1.0.0', runtime: '101.0', native_version: null,
  last_seen: null, days_since_seen: 0, days_behind: 1, storage_free: null, blocked_count: 0,
  reason: 'missed_ota', blocked_recent: false, ...o,
});

describe('support filters', () => {
  it('filters by version, null keeps all', () => {
    const cards = [c({ app_version: '1.0.0' }), c({ app_version: '1.1.0' })];
    expect(filterByVersion(cards, '1.1.0')).toHaveLength(1);
    expect(filterByVersion(cards, null)).toHaveLength(2);
  });
  it('groups by farm, biggest group first, Unknown farm last', () => {
    const cards = [c({ farm: 'Unknown farm' }), c({ farm: 'B' }), c({ farm: 'B' }), c({ farm: 'A' })];
    expect(groupByFarm(cards).map((g) => [g.farm, g.cards.length])).toEqual([['B', 2], ['A', 1], ['Unknown farm', 1]]);
  });
  it('ties between farms are alphabetical', () => {
    const cards = [c({ farm: 'Z' }), c({ farm: 'M' })];
    expect(groupByFarm(cards).map((g) => g.farm)).toEqual(['M', 'Z']);
  });
  it('empty list groups to nothing', () => expect(groupByFarm([])).toEqual([]));
  it('labels every reason and tolerates unknown', () => {
    expect(reasonLabel('needs_apk')).toBe('Needs new APK');
    expect(reasonLabel('missed_ota')).toBe('Missed update');
    expect(reasonLabel('offline', 4)).toBe('Offline 4d');
    expect(reasonLabel('offline')).toBe('Offline');
    expect(reasonLabel('low_storage')).toBe('Low storage');
    expect(reasonLabel(null)).toBe('');
    expect(reasonLabel('weird')).toBe('');
  });
});

describe('whatsappUrl', () => {
  it('keeps digits only', () => expect(whatsappUrl('+254 712-345 678')).toBe('https://wa.me/254712345678'));
  it('turns a leading 0 into the Kenya code', () => expect(whatsappUrl('0712345678')).toBe('https://wa.me/254712345678'));
  it('is null for empty or digitless input', () => {
    expect(whatsappUrl(null)).toBeNull();
    expect(whatsappUrl('')).toBeNull();
    expect(whatsappUrl('n/a')).toBeNull();
  });
});

describe('buildCopyText', () => {
  it('one line per device with farm, name, phone, versions and reason', () => {
    const text = buildCopyText([c({ farm: 'Karen', user_full_name: 'Jane', phone: '0712345678' })], '1.2.0');
    expect(text).toBe('Karen — Jane — 0712345678 — v1.0.0 → v1.2.0 — Missed update');
  });
  it('blank phone and unknown version do not print "null"', () => {
    const text = buildCopyText([c({ phone: null, app_version: null, user_full_name: null, user: 'x@y.z' })], null);
    expect(text).not.toMatch(/null|undefined/);
  });
  it('empty list is an empty string', () => expect(buildCopyText([], '1.2.0')).toBe(''));
});
