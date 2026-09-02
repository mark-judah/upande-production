import { useCallback, useRef } from 'react';
import { useFocusEffect } from 'expo-router';

/**
 * Centralised screen-refresh: runs `load` every time the screen gains focus —
 * the first time it opens AND every time the user navigates back to it.
 *
 * Expo Router keeps tab/stack screens mounted, so a plain
 * `useEffect(() => { load(); }, [])` only ever fires once and leaves the page
 * showing stale data on return. Use this instead so every page (present and
 * future) refetches on reopen:
 *
 *   useRefreshOnFocus(load);            // single loader
 *   useRefreshOnFocus(() => { a(); b(); });  // several loaders
 *
 * `load` may be an inline closure — the latest one is always used, so it does
 * not need to be memoised by the caller.
 */
export function useRefreshOnFocus(load: () => void | Promise<unknown>) {
  const ref = useRef(load);
  ref.current = load;

  useFocusEffect(
    useCallback(() => {
      Promise.resolve(ref.current()).catch(() => {
        // errors are surfaced by the loaders themselves (store error state / toast)
      });
    }, []),
  );
}
