import {
  deviceModelLabel, filterDevices, peopleSubtitle, pillTone, relativeTime, shortInstallId, type OverviewDevice,
} from '@/src/stores/devicesStore';

const dev = (o: Partial<OverviewDevice> = {}): OverviewDevice => ({
  device_id: 'd1', model: 'realme Note 50', device_name: 'RMX3834', user_name: 'Tambuzi Tur Production',
  farm: null, version: '1.1.11', is_latest: true, seen_seconds_ago: 300, ip: '41.80.1.2', ...o,
});

describe('relativeTime', () => {
  it.each([
    [null, 'never'], [0, 'just now'], [59, 'just now'], [60, '1m ago'], [3599, '59m ago'],
    [3600, '1h ago'], [86399, '23h ago'], [86400, '1d ago'], [86400 * 12, '12d ago'],
  ])('%s -> %s', (secs, text) => expect(relativeTime(secs as number | null)).toBe(text));
});

describe('filterDevices', () => {
  const list = [
    dev({ device_id: 'a', seen_seconds_ago: 60 }),
    dev({ device_id: 'b', model: 'Infinix NOTE 30 Pro', user_name: 'Carol Wangeci', seen_seconds_ago: 86400 * 10, ip: '10.1.1.1' }),
    dev({ device_id: 'c', model: 'ED A5 2ND', user_name: 'Tambuzi TUR Packhouse', seen_seconds_ago: 86400 * 40, farm: 'Karen' }),
    dev({ device_id: 'd', seen_seconds_ago: null }),
  ];
  const ids = (xs: OverviewDevice[]) => xs.map((x) => x.device_id);
  it('all keeps everyone, including never-seen', () => expect(ids(filterDevices(list, '', 'all'))).toEqual(['a', 'b', 'c', 'd']));
  it('7 days keeps only recent devices', () => expect(ids(filterDevices(list, '', '7d'))).toEqual(['a']));
  it('30 days includes the 7 day ones', () => expect(ids(filterDevices(list, '', '30d'))).toEqual(['a', 'b']));
  it('search matches model, user, ip and farm, case-insensitively', () => {
    expect(ids(filterDevices(list, 'infinix', 'all'))).toEqual(['b']);
    expect(ids(filterDevices(list, 'carol', 'all'))).toEqual(['b']);
    expect(ids(filterDevices(list, '10.1.1', 'all'))).toEqual(['b']);
    expect(ids(filterDevices(list, 'karen', 'all'))).toEqual(['c']);
  });
  it('search and range combine', () => expect(ids(filterDevices(list, 'tambuzi', '7d'))).toEqual(['a']));
  it('whitespace-only search is no search', () => expect(filterDevices(list, '   ', 'all')).toHaveLength(4));
  it('tolerates devices with missing fields', () => {
    const sparse = dev({ model: null, device_name: null, user_name: null, ip: null });
    expect(filterDevices([sparse], 'x', 'all')).toEqual([]);
  });
});

describe('labels', () => {
  it('pill is green for the latest and amber otherwise', () => {
    expect(pillTone(true)).toBe('success');
    expect(pillTone(false)).toBe('warn');
  });
  it('people subtitle pluralises', () => {
    expect(peopleSubtitle({ model: 'Infinix X678B', device_count: 1, sign_ins: 1 })).toBe('Infinix X678B · 1 device · 1 sign-in');
    expect(peopleSubtitle({ model: 'RMX3834', device_count: 3, sign_ins: 0 })).toBe('RMX3834 · 3 devices · 0 sign-ins');
    expect(peopleSubtitle({ model: null, device_count: 2, sign_ins: 5 })).toBe('2 devices · 5 sign-ins');
  });
  it('install id is the first 8 characters', () => {
    expect(shortInstallId('d9b9c69a1234567')).toBe('d9b9c69a');
    expect(shortInstallId('')).toBe('—');
  });
  it('model label joins brand and model, capitalising the brand', () => {
    expect(deviceModelLabel('itel', 'itel P671L')).toBe('Itel itel P671L');
    expect(deviceModelLabel(null, 'Pixel 7')).toBe('Pixel 7');
    expect(deviceModelLabel('Google', null)).toBe('Google');
    expect(deviceModelLabel(null, null)).toBe('—');
  });
});
