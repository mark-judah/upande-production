import axios from 'axios';
import { api } from './api';
import { storage, StorageKeys } from './storage';
import { probeBaseUrl } from './url';

function parseCookie(setCookie: string | null, name: string): string | null {
  if (!setCookie) return null;
  const re = new RegExp(`(?:^|;|,\\s*)${name}=([^;]+)`, 'i');
  const m = setCookie.match(re);
  return m ? m[1] : null;
}

function extractError(data: any): string | null {
  if (data && typeof data === 'object') {
    const m = data.message ?? data.exception;
    if (typeof m === 'string') return m;
  }
  return null;
}

export interface LoginResult {
  baseUrl: string;
  sid: string;
  userId: string;
  email: string;
}

/**
 * Logs in and persists the sid + instance URL + email to AsyncStorage.
 *
 * Prefers `mobileLogin`, which returns the sid in the JSON body — reliable on
 * mobile, where the login Set-Cookie header is absorbed by the native cookie
 * store and never exposed to JS (the "login succeeded but no session cookie
 * returned" symptom). Falls back to the stock `/api/method/login` + Set-Cookie
 * parse for instances that don't yet ship the endpoint.
 */
export async function loginToServer(
  bareUrl: string,
  email: string,
  password: string,
): Promise<LoginResult> {
  const baseUrl = await probeBaseUrl(bareUrl);

  let sid: string | null = null;
  let userId = email;

  // ── Preferred: mobileLogin → sid in the body ──
  const mres = await axios.post(
    `${baseUrl}/api/method/upande_packhouse.mobile.api.mobileLogin`,
    { usr: email, pwd: password },
    { headers: { 'Content-Type': 'application/json' }, timeout: 15000, validateStatus: () => true },
  );
  if (mres.status >= 200 && mres.status < 300) {
    const msg: any = (mres.data && ((mres.data as any).message ?? mres.data)) || {};
    sid = (msg.sid as string) ?? null;
    userId = (msg.user_id as string) ?? email;
  } else if (mres.status === 401 || mres.status === 403) {
    // Genuine bad credentials — surface it, don't fall through.
    throw new Error(extractError(mres.data) || 'Invalid email or password.');
  }
  // Any other status (e.g. 404 — endpoint not deployed on this instance) → fall back.

  // ── Fallback: stock /api/method/login + Set-Cookie parse ──
  if (!sid) {
    const body = new URLSearchParams({ usr: email, pwd: password }).toString();
    const res = await axios.post(`${baseUrl}/api/method/login`, body, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 15000,
      validateStatus: () => true,
    });
    if (res.status < 200 || res.status >= 300) {
      throw new Error(extractError(res.data) || `Login failed (${res.status}).`);
    }
    const setCookieHeader =
      (res.headers && (res.headers as any)['set-cookie']) || (res.headers as any)?.['Set-Cookie'];
    const cookieStr = Array.isArray(setCookieHeader) ? setCookieHeader.join(',') : setCookieHeader;
    sid = parseCookie(cookieStr ?? null, 'sid');
    userId = parseCookie(cookieStr ?? null, 'user_id') ?? email;
  }

  if (!sid) throw new Error('Login succeeded but no session cookie returned.');

  await storage.set(StorageKeys.instanceUrl, baseUrl);
  await storage.set(StorageKeys.instanceUrlBackup, baseUrl);
  await storage.set(StorageKeys.cookie, `sid=${sid}; user_id=${userId}`);
  await storage.set(StorageKeys.emailBackup, email);
  // Kept in the secure enclave so an expired session can be silently recovered.
  await storage.set(StorageKeys.passwordBackup, password);

  return { baseUrl, sid, userId, email };
}

/**
 * Silently recover an expired session: re-login with the stored password (which
 * re-establishes the session cookie via loginToServer), so the in-flight
 * request can retry. Returns false when credentials are missing or login fails.
 */
export async function reauthenticate(): Promise<boolean> {
  const [email, password, url] = await Promise.all([
    storage.get(StorageKeys.emailBackup),
    storage.get(StorageKeys.passwordBackup),
    storage.get(StorageKeys.instanceUrlBackup),
  ]);
  if (!email || !password || !url) return false;
  try {
    await loginToServer(url, email, password);
    return true;
  } catch {
    return false;
  }
}

export async function fetchCurrentUserRoles(): Promise<string[]> {
  try {
    const body = await api<{ data?: { roles?: string[]; user?: string }; message?: { roles?: string[] } }>({
      method: 'POST',
      url: '/api/method/upande_packhouse.mobile.api.getCurrentUserRoles',
      data: {},
    });
    const roles = body?.data?.roles ?? body?.message?.roles ?? [];
    return Array.isArray(roles) ? roles : [];
  } catch {
    return [];
  }
}

export async function fetchFullName(email: string): Promise<string | null> {
  try {
    const body = await api<{ message?: any; data?: any }>({
      method: 'GET',
      url: `/api/method/frappe.client.get_value?doctype=User&filters={"name":"${email}"}&fieldname=["full_name"]`,
    });
    const m = body?.message ?? body?.data;
    return (m && (m.full_name as string)) || null;
  } catch {
    return null;
  }
}
