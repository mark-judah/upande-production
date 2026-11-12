/**
 * Describes this app to @upande/mobile-kit. Imported once, first thing, by
 * app/_layout.tsx. Written by `npx upande-mobile-kit init`.
 *
 * `useAuth`, `api` and `storage` should be the app's OWN (init wires them when it
 * can find them): on the kit's stand-ins the Settings page looks fine, but
 * sign-out, the biometric switch and the device register are not connected to
 * the real session.
 */
import { configureMobileKit } from '@upande/mobile-kit';
import { useAuthStore } from './stores/authStore';
import { api as hostApi } from './services/api';
import { storage as hostStorage } from './services/storage';

configureMobileKit({
  appName: 'Upande Production', // the "Mobile App" record on the server
  githubRepo: 'mark-judah/upande-production', // owner/repo that publishes the GitHub Releases (APKs)
  site: 'https://kaitet-group.upande.com',
  // Add a local one with  site: { production: 'https://your.site', development: 'http://localhost:8000' }
  biometric: 'host', // your app already locks itself with expo-local-authentication; the kit adds no lock of its own
  // apk: { autoDownload: 'wifi' }, // 'wifi' (default) | 'always' | 'never'
  // fab: true, // the floating Settings button: true (default) | false | 'dev' | { initialSide: 'left', bottom: 96 }
  //
  // Crash & API monitoring is ON by default. The person can turn it off in Settings. Defaults shown:
  // monitor: {
  //   enabled: true,            // false installs nothing
  //   captureConsoleErrors: true, // console.error(err) calls that carry an Error
  //   captureBodies: true,      // request/response bodies of FAILED calls (secrets redacted, capped)
  //   maxBodyBytes: 8192,
  //   redactKeys: [],           // extra key names to hide, on top of password/token/authorization/cookie/...
  //   ignoreUrls: [],           // strings or RegExps never recorded
  //   sampleSuccess: 0,         // 0-1: share of successful calls recorded (metadata only)
  //   breadcrumbs: 30,
  //   consoleBreadcrumbs: false,
  //   errorBoundary: false,     // true wraps the app in <MonitorErrorBoundary>
  //   showToggle: true,         // the "Send crash reports" row in Settings
  // },
  //
  // Wired to this app's own modules (found by `npx upande-mobile-kit init`):
  useAuth: () => {
    const roles = useAuthStore((s) => s.roles);
    const fullName = useAuthStore((s) => s.fullName);
    const email = useAuthStore((s) => s.email);
    const instanceUrl = useAuthStore((s) => s.instanceUrl);
    const biometricEnabled = useAuthStore((s) => s.biometricEnabled);
    const setBiometricEnabled = useAuthStore((s) => s.setBiometricEnabled);
    const logout = useAuthStore((s) => s.logout);
    const forgetDevice = useAuthStore((s) => s.forgetDevice);
    return {
      isSystemManager: (roles ?? []).includes('System Manager'),
      roles: roles ?? undefined,
      fullName,
      email,
      instanceUrl,
      user: email ?? null,
      biometricEnabled: !!biometricEnabled,
      setBiometricEnabled: async (enabled: boolean) => {
        await setBiometricEnabled(enabled);
      },
      logout: async () => {
        await logout();
      },
      forgetDevice: async () => {
        await forgetDevice();
      },
    };
  },
  api: hostApi, // must resolve to the response BODY ({ message } for whitelisted methods)
  storage: hostStorage,
  //
  // Still on the kit's stand-ins (uncomment to wire them):
  // theme: { primary: '#...' },
});
