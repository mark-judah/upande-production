import * as Application from 'expo-application';
import Constants from 'expo-constants';

/** The app version this build was made with. */
export const APP_VERSION: string = Constants.expoConfig?.version ?? '1.0.0';
/** Version of the installed APK (native build). */
export const INSTALLED_APK_VERSION: string = Application.nativeApplicationVersion ?? APP_VERSION;
