'use client';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { NetworkConfig, NetworkKey, Networks } from '@/lib/types';
type State = { network: NetworkConfig; networks: Networks; ready: boolean; busy: boolean; setBusy: (busy: boolean) => void; select: (key: NetworkKey) => void };
const Context = createContext<State | null>(null);
export function NetworkProvider({ networks, children }: { networks: Networks; children: ReactNode }) {
  const [key, setKey] = useState<NetworkKey>('monad'), [ready, setReady] = useState(false), [busy, setBusy] = useState(false);
  useEffect(() => {
    const query = new URLSearchParams(location.search).get('network');
    let saved: string | null = null;
    try { saved = localStorage.getItem('corpus-network'); } catch {}
    const next = query === 'me' || query === 'monad' ? query : saved === 'me' ? 'me' : 'monad';
    setKey(next); setReady(true);
    try { localStorage.setItem('corpus-network', next); } catch {}
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
