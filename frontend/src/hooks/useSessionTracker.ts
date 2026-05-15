import { useEffect, useRef, useCallback } from 'react';
import { useLocation } from 'react-router-dom';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

function getHeaders(): HeadersInit {
  const token = localStorage.getItem('auth_token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export function useSessionTracker() {
  const location = useLocation();
  const sessionIdRef  = useRef<string | null>(localStorage.getItem('rmm_session_id'));
  const pageEnterRef  = useRef<number>(Date.now());
  const prevPathRef   = useRef<string>(location.pathname);
  const locationRef   = useRef<string>(location.pathname);

  // Keep location ref fresh
  useEffect(() => { locationRef.current = location.pathname; }, [location.pathname]);

  // Fire-and-forget POST
  const post = useCallback((path: string, body: Record<string, unknown>) => {
    fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(body),
    }).catch(() => {});
  }, []);

  // Start session on mount (once per login)
  useEffect(() => {
    if (sessionIdRef.current) return;
    const start = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/sessions/start`, {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({
            user_agent: navigator.userAgent,
            screen_resolution: `${screen.width}x${screen.height}`,
          }),
        });
        const json = await res.json();
        if (json.session_id) {
          sessionIdRef.current = json.session_id;
          localStorage.setItem('rmm_session_id', json.session_id);
          pageEnterRef.current = Date.now();
          // Log initial page
          post('/api/sessions/event', {
            session_id: json.session_id,
            event_type: 'page_view',
            page: locationRef.current,
            previous_page: null,
            time_on_previous_page: 0,
          });
        }
      } catch {}
    };
    start();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Track page changes
  useEffect(() => {
    const sid = sessionIdRef.current;
    if (!sid) return;
    const timeOnPrev = Math.round((Date.now() - pageEnterRef.current) / 1000);
    const prev = prevPathRef.current;

    if (prev !== location.pathname) {
      post('/api/sessions/event', {
        session_id: sid,
        event_type: 'page_view',
        page: location.pathname,
        previous_page: prev,
        time_on_previous_page: timeOnPrev,
      });
    }

    prevPathRef.current = location.pathname;
    pageEnterRef.current = Date.now();
  }, [location.pathname, post]);

  // Heartbeat every 30 s
  useEffect(() => {
    const t = setInterval(() => {
      const sid = sessionIdRef.current;
      if (!sid) return;
      post('/api/sessions/event', {
        session_id: sid,
        event_type: 'heartbeat',
        page: locationRef.current,
      });
    }, 30_000);
    return () => clearInterval(t);
  }, [post]);

  // End session (call on logout)
  const endSession = useCallback(async () => {
    const sid = sessionIdRef.current;
    if (!sid) return;
    const timeOnLast = Math.round((Date.now() - pageEnterRef.current) / 1000);
    try {
      await fetch(`${API_BASE}/api/sessions/end`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          session_id: sid,
          last_page: prevPathRef.current,
          time_on_last_page: timeOnLast,
        }),
      });
    } catch {}
    localStorage.removeItem('rmm_session_id');
    sessionIdRef.current = null;
  }, []);

  return { endSession };
}
