import { Platform } from 'react-native';
import * as Application from 'expo-application';

let cached: string | null = null;

/** Android SSAID / iOS idForVendor; '' when unavailable. Cached. */
export async function getDeviceId(): Promise<string> {
  if (cached !== null) return cached;
  try {
    cached =
      Platform.OS === 'android'
        ? Application.getAndroidId() ?? ''
        : (await Application.getIosIdForVendorAsync()) ?? '';
  } catch {
    cached = '';
  }
  return cached;
}
