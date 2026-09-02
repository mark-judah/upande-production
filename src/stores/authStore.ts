import { create } from 'zustand';
import { storage, StorageKeys } from '@/src/services/storage';
import { fetchCurrentUserRoles, fetchFullName, loginToServer } from '@/src/services/auth-api';
import * as Biometric from '@/src/services/biometric';

type Status = 'idle' | 'loading' | 'success' | 'error';

export interface AuthState {
  hydrated: boolean;
  status: Status;
  error: string | null;

  hasSession: boolean;
  fullName: string | null;
  email: string | null;
  instanceUrl: string | null;
  roles: string[];

  /** Per-device flag — does this device want biometric login? */
  biometricEnabled: boolean;
  /** Runtime gate — true when app should show BiometricLockScreen instead of tabs. */
  biometricLocked: boolean;

  hydrate: () => Promise<void>;
  login: (email: string, password: string, bareUrl: string) => Promise<boolean>;
  setBiometricEnabled: (on: boolean) => Promise<void>;
  /** Prompt the OS biometric, then RE-AUTHENTICATE using the stored password
   *  (re-establishing a fresh session cookie) — not just clearing the gate. */
  biometricLogin: () => Promise<
    | { ok: true }
    | { ok: false; reason: 'cancelled' | 'no_credentials' | 'auth_failed' | 'unavailable'; message?: string }
  >;
  /** Biometric just succeeded — clear the lock gate. */
  unlock: () => void;
  /** Soft logout — clear session in memory, keep biometric flag and stored cookie. */
  logout: () => Promise<void>;
  /** Hard logout — wipe everything (cookie, biometric flag, metadata). Used on 401. */
  forgetDevice: () => Promise<void>;
  hasRole: (role: string) => boolean;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  hydrated: false,
  status: 'idle',
  error: null,

  hasSession: false,
  fullName: null,
  email: null,
  instanceUrl: null,
  roles: [],

  biometricEnabled: false,
  biometricLocked: false,

  hydrate: async () => {
    try {
      const [cookie, instanceUrl, email, fullName, rolesRaw, bioFlag] = await Promise.all([
        storage.get(StorageKeys.cookie),
        storage.get(StorageKeys.instanceUrl),
        storage.get(StorageKeys.emailBackup),
        storage.get(StorageKeys.fullName),
        storage.get(StorageKeys.userRoles),
        storage.get(StorageKeys.biometricEnabled),
      ]);

      let roles: string[] = [];
      if (rolesRaw) {
        try {
          const parsed = JSON.parse(rolesRaw);
          if (Array.isArray(parsed)) roles = parsed.filter((r) => typeof r === 'string');
        } catch {}
      }

      const hasSession = !!cookie && !!instanceUrl;
      const biometricEnabled = bioFlag === '1';
      const biometricLocked = hasSession && biometricEnabled && Biometric.isModuleAvailable();

      set({
        hydrated: true,
        hasSession,
        instanceUrl,
        email,
        fullName,
        roles,
        biometricEnabled,
        biometricLocked,
      });
    } catch (err) {
      set({ hydrated: true, error: err instanceof Error ? err.message : String(err) });
    }
  },

  login: async (email, password, bareUrl) => {
    set({ status: 'loading', error: null });
    try {
      const result = await loginToServer(bareUrl, email, password);
      // Fetch roles + full name in background, don't block
      const [roles, fullName] = await Promise.all([
        fetchCurrentUserRoles(),
        fetchFullName(result.email),
      ]);
      await storage.set(StorageKeys.userRoles, JSON.stringify(roles));
      if (fullName) await storage.set(StorageKeys.fullName, fullName);

      set({
        status: 'success',
        hasSession: true,
        instanceUrl: result.baseUrl,
        email: result.email,
        fullName: fullName ?? get().fullName,
        roles,
        biometricLocked: false, // post-fresh-login, never lock
      });
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Login failed.';
      set({ status: 'error', error: message });
      return false;
    }
  },

  biometricLogin: async () => {
    if (!Biometric.isModuleAvailable()) {
      return { ok: false, reason: 'unavailable' };
    }
    const auth = await Biometric.authenticate({
      promptMessage: 'Unlock Upande Production',
      fallbackLabel: 'Use password',
      cancelLabel: 'Cancel',
    });
    if (!auth.success) {
      if (auth.error === 'user_cancel' || auth.error === 'system_cancel') {
        return { ok: false, reason: 'cancelled' };
      }
      return { ok: false, reason: 'auth_failed', message: auth.error };
    }
    const [email, password, url] = await Promise.all([
      storage.get(StorageKeys.emailBackup),
      storage.get(StorageKeys.passwordBackup),
      storage.get(StorageKeys.instanceUrlBackup),
    ]);
    if (!email || !password || !url) {
      return { ok: false, reason: 'no_credentials' };
    }
    const ok = await get().login(email, password, url);
    if (!ok) {
      return { ok: false, reason: 'auth_failed', message: get().error ?? undefined };
    }
    return { ok: true };
  },

  setBiometricEnabled: async (on) => {
    await storage.set(StorageKeys.biometricEnabled, on ? '1' : '0');
    set({ biometricEnabled: on });
  },

  unlock: () => set({ biometricLocked: false }),

  logout: async () => {
    // Soft — clears session view in memory only. Biometric flag + cookie stay
    // so the user can sign back in via biometric on the same device.
    set({
      hasSession: false,
      biometricLocked: false,
      status: 'idle',
      error: null,
    });
  },

  forgetDevice: async () => {
    await storage.clearAll();
    set({
      hasSession: false,
      biometricEnabled: false,
      biometricLocked: false,
      fullName: null,
      email: null,
      instanceUrl: null,
      roles: [],
      status: 'idle',
      error: null,
    });
  },

  hasRole: (role) => {
    const { roles } = get();
    return roles.includes(role) || roles.includes('Administrator');
  },
}));
