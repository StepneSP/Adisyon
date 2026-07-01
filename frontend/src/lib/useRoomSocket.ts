import { useEffect, useRef, useState } from "react";
import { wsUrl } from "./api";

type Msg = { event: string; order?: any; code?: string };

export function useRoomSocket(code: string | null, onMessage: (m: Msg) => void) {
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const delayRef = useRef(1000);
  const cbRef = useRef(onMessage);
  cbRef.current = onMessage;

  useEffect(() => {
    if (!code) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      if (!alive) return;
      const ws = new WebSocket(wsUrl(code));
      wsRef.current = ws;
      ws.onopen = () => {
        if (!alive) return;
        setConnected(true);
        delayRef.current = 1000;
      };
      ws.onmessage = (e) => {
        try {
          const m = JSON.parse(e.data);
          cbRef.current(m);
        } catch {}
      };
      ws.onerror = () => {
        // handled by onclose
      };
      ws.onclose = () => {
        if (!alive) return;
        setConnected(false);
        const d = Math.min(delayRef.current * 2, 15000);
        delayRef.current = d;
        timer = setTimeout(connect, d);
      };
    };

    connect();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
      wsRef.current?.close();
    };
  }, [code]);

  return { connected };
}
