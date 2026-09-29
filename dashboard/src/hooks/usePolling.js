// Calls fetchFn every intervalMs and keeps the latest result, the last error,
// and when data last arrived. A failed poll keeps showing the previous data.
// Owner: Swayum Bansal (Member 5)

import { useEffect, useRef, useState } from "react";

export async function getJson(url, options) {
  const res = await fetch(url, options);
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (!res.ok) {
    const message = (body && body.errors && body.errors.join("; ")) || `${res.status} ${res.statusText}`;
    throw new Error(message);
  }
  if (body === null && text) throw new Error(`Expected JSON from ${url}`);
  return body;
}

export default function usePolling(url, intervalMs) {
  const [state, setState] = useState({ data: null, error: null, updatedAt: null });
  const [tick, setTick] = useState(0);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    let timer;
    const poll = async () => {
      try {
        const data = await getJson(url);
        if (alive.current) setState({ data, error: null, updatedAt: new Date() });
      } catch (err) {
        if (alive.current) setState((s) => ({ ...s, error: err.message }));
      }
      if (alive.current) timer = setTimeout(poll, intervalMs);
    };
    poll();
    return () => {
      alive.current = false;
      clearTimeout(timer);
    };
  }, [url, intervalMs, tick]);

  // Forces an immediate re-poll (e.g. right after sending a command).
  const refresh = () => setTick((t) => t + 1);
  return { ...state, refresh };
}
