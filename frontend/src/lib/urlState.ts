import { useCallback, useEffect, useState } from "react";

/** Read/write a flat set of query-string params, so any view can be shared as a link. */
export function useUrlState<T extends Record<string, string | undefined>>(
  defaults: T,
): [T, (patch: Partial<T>) => void] {
  const read = useCallback((): T => {
    const params = new URLSearchParams(window.location.search);
    const out = { ...defaults };
    for (const key of Object.keys(defaults)) {
      const v = params.get(key);
      if (v !== null) (out as Record<string, string>)[key] = v;
    }
    return out;
    // defaults is a constant object literal at the call site
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [state, setState] = useState<T>(read);

  useEffect(() => {
    const onPop = () => setState(read());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [read]);

  const update = useCallback((patch: Partial<T>) => {
    setState((prev) => {
      const next = { ...prev, ...patch };
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(next)) if (v) params.set(k, v);
      window.history.replaceState(null, "", `${window.location.pathname}?${params}`);
      return next;
    });
  }, []);

  return [state, update];
}
