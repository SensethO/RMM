import { useEffect, useState } from 'react';

export interface SystemInfo {
  app_version: string;
  agent_version: string;
  build_date: string;
}

const BASE_URL = import.meta.env.VITE_API_URL || 'https://backend-xi-one-36.vercel.app';

let cached: SystemInfo | null = null;

export function useSystemInfo() {
  const [info, setInfo] = useState<SystemInfo | null>(cached);
  const [loading, setLoading] = useState(!cached);

  useEffect(() => {
    if (cached) return;
    fetch(`${BASE_URL}/api/system/info`)
      .then(r => r.json())
      .then((data: SystemInfo) => {
        cached = data;
        setInfo(data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return { info, loading };
}

export function isAgentOutdated(deviceVersion: string | undefined, expected: string | undefined): boolean {
  if (!deviceVersion || !expected) return false;
  return deviceVersion !== expected;
}
