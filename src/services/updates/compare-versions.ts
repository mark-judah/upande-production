/** 1 when `a` is newer, -1 when older, 0 when equal. Ignores a leading `v`
 *  and any pre-release suffix; pads so `1.1` equals `1.1.0`. */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string) =>
    String(v ?? '').trim().replace(/^v/i, '').split('-')[0].split('.').map((n) => parseInt(n, 10) || 0);
  const left = parse(a);
  const right = parse(b);
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    const l = left[i] ?? 0;
    const r = right[i] ?? 0;
    if (l !== r) return l > r ? 1 : -1;
  }
  return 0;
}
