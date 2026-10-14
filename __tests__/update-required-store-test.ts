import { parseGateBody, useUpdateRequiredStore } from '@/src/stores/updateRequiredStore';

describe('updateRequiredStore', () => {
  beforeEach(() => useUpdateRequiredStore.getState().clear());
  it('parses a flat gate body', () => {
    expect(parseGateBody({ error_code: 'APP_UPDATE_REQUIRED', min_version: '1.2.0', latest_version: '1.3.0' }))
      .toEqual({ minVersion: '1.2.0', latestVersion: '1.3.0' });
  });
  it('parses a body nested under message', () => {
    expect(parseGateBody({ message: { min_version: '1.2.0' } })).toEqual({ minVersion: '1.2.0', latestVersion: null });
  });
  it('tolerates garbage', () => {
    expect(parseGateBody(null)).toEqual({ minVersion: null, latestVersion: null });
    expect(parseGateBody('x')).toEqual({ minVersion: null, latestVersion: null });
  });
  it('trigger sets and clear resets', () => {
    useUpdateRequiredStore.getState().trigger({ min_version: '1.2.0' });
    expect(useUpdateRequiredStore.getState().required).toBe(true);
    expect(useUpdateRequiredStore.getState().minVersion).toBe('1.2.0');
    useUpdateRequiredStore.getState().clear();
    expect(useUpdateRequiredStore.getState().required).toBe(false);
  });
  it('trigger with no body still locks the app', () => {
    useUpdateRequiredStore.getState().trigger();
    expect(useUpdateRequiredStore.getState().required).toBe(true);
    expect(useUpdateRequiredStore.getState().minVersion).toBeNull();
  });
});
