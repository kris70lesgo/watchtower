'use client';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { NetworkConfig, NetworkKey, Networks } from '@/lib/types';
type State = { network: NetworkConfig; networks: Networks; ready: boolean; busy: boolean; setBusy: (busy: boolean) => void; select: (key: NetworkKey) => void };
const Context = createContext<State | null>(null);
export function NetworkProvider({ networks, children }: { networks: Networks; children: ReactNode }) {
  const [key, setKey] = useState<NetworkKey>('me'), [ready, setReady] = useState(false), [busy, setBusy] = useState(false);
  useEffect(() => {
    const query = new URLSearchParams(location.search).get('network');
    const next: NetworkKey = location.pathname === '/' ? 'me' : query === 'monad' ? 'monad' : 'me';
    setKey(next); setReady(true);
    try { localStorage.setItem('corpus-network', next); } catch {}
    if (location.pathname === '/' && query !== 'me') {
      const url = new URL(location.href); url.searchParams.set('network', 'me'); history.replaceState(null, '', url);
    }
  }, []);
  function select(next: NetworkKey) {
    if (busy || !networks[next]) return;
    setKey(next);
    try { localStorage.setItem('corpus-network', next); } catch {}
    const url = new URL(location.href); url.searchParams.set('network', next); url.searchParams.delete('token');
    history.replaceState(null, '', url);
  }
  return <Context.Provider value={{ network: networks[key], networks, ready, busy, setBusy, select }}>{children}</Context.Provider>;
}
export function useNetwork() { const context = useContext(Context); if (!context) throw new Error('NetworkProvider missing'); return context; }
