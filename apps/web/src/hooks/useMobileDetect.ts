"use client";

import { useCallback } from "react";
import { useSyncExternalStore } from "react";

const MOBILE_QUERY = "(max-width: 1024px)";

/**
 * Returns true when the viewport matches the mobile breakpoint.
 *
 * Uses useSyncExternalStore so the value is correct on the very first client
 * render — no useState+useEffect correction, no double render.
 *
 * During SSR the server snapshot is `false` (desktop markup), which is the
 * same behaviour as before but without the client-side layout swap.
 */
export function useMobileDetect(): boolean {
  return useMediaQuery(MOBILE_QUERY);
}

/**
 * Generic hook that tracks a CSS media query using useSyncExternalStore.
 *
 * @param query - A valid CSS media query string, e.g. "(max-width: 768px)".
 * @returns      Whether the query currently matches.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (callback: () => void) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", callback);
      return () => mql.removeEventListener("change", callback);
    },
    [query],
  );

  return useSyncExternalStore(
    subscribe,
    /* client snapshot */ () => window.matchMedia(query).matches,
    /* server snapshot */ () => false,
  );
}
