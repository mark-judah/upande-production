import Constants from 'expo-constants';
import * as Updates from 'expo-updates';

type OtaExtra = { expoClient?: { version?: string }; appVersion?: string };
const otaExtra = (Updates.manifest as { extra?: OtaExtra } | null)?.extra;

/** The running JS version: under an OTA bundle, the bundle's own (from its manifest). */
export const APP_VERSION: string =
  otaExtra?.expoClient?.version ?? otaExtra?.appVersion ?? Constants.expoConfig?.version ?? '1.0.0';
/** Version of the installed APK (native build); OTA never changes it. */
export const INSTALLED_APK_VERSION: string = Constants.nativeAppVersion ?? APP_VERSION;
export const RUNTIME_VERSION: string = Updates.runtimeVersion ?? '';
