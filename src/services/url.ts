import { loggedAxios } from './api';

/**
 * Resolve a bare hostname (e.g. "kaitet-group.upande.com") to a full base URL.
 * Tries HTTPS first via a HEAD probe; falls back to HTTP if HTTPS is unreachable.
 * If the input already has a scheme, returns it trimmed.
 */
export async function probeBaseUrl(rawUrl: string): Promise<string> {
  const trimmed = rawUrl.trim().replace(/\/$/, '');
  if (!trimmed) throw new Error('Instance URL is required.');
  if (/^https?:\/\//i.test(trimmed)) return trimmed;

  const httpsUrl = `https://${trimmed}`;
  try {
    await loggedAxios().head(httpsUrl, { timeout: 5000 });
    return httpsUrl;
  } catch {
    return `http://${trimmed}`;
  }
}
