import { useEffect, useState } from 'react';
import { useMsal } from '@azure/msal-react';
import { getApiClient, initializeApiClient } from '../api/client';

/**
 * Hook to initialize API client and get access token
 */
export function useApiClient() {
  const { instance, accounts } = useMsal();
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    // Check for manual auth token first (bypasses MSAL entirely)
    const manualToken = localStorage.getItem('auth_token');
    if (manualToken) {
      initializeApiClient(async () => manualToken);
      setIsReady(true);
      return;
    }

    if (accounts.length === 0) return;

    const getMsalToken = async (): Promise<string> => {
      try {
        const response = await instance.acquireTokenSilent({
          scopes: ['https://graph.microsoft.com/.default'],
          account: accounts[0],
        });
        return response.accessToken;
      } catch (error) {
        console.error('Token acquisition failed:', error);
        throw error;
      }
    };

    initializeApiClient(getMsalToken);
    setIsReady(true);
  }, [instance, accounts]);

  return { apiClient: isReady ? getApiClient() : null, isReady };
}

/**
 * Hook for fetching data from API
 */
export function useFetch<T>(fetchFn: () => Promise<{ data: T }>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const fetch = async () => {
      try {
        setLoading(true);
        const response = await fetchFn();
        if (mounted) {
          setData(response.data);
          setError(null);
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : 'Unknown error');
          setData(null);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    fetch();

    return () => {
      mounted = false;
    };
  }, deps);

  return { data, loading, error };
}
