import { CONFIG as MONAD } from './config.js';
import { ME } from './network-config.js';
export const NETWORKS = { monad: { ...MONAD, key: 'monad', nativeSymbol: 'MON', mockUsdc: true }, me: { ...ME, key: 'me', feed: MONAD.feed, repo: MONAD.repo } };
export function activeNetwork() {
  const query = new URLSearchParams(globalThis.location?.search || '').get('network');
  const key = query && NETWORKS[query] ? query : 'me';
  if (query && NETWORKS[query]) { try { globalThis.localStorage?.setItem('corpus-network', key); } catch {} }
  return NETWORKS[key];
}
export const CONFIG = activeNetwork();
export function selectNetwork(key) {
  if (!NETWORKS[key]) throw new Error('Unsupported network');
  try { localStorage.setItem('corpus-network', key); } catch {}
  const url = new URL(location.href); url.searchParams.set('network', key);
  // A URL-supplied token belongs to the old network and must never cross chains.
  url.searchParams.delete('token'); location.assign(url);
}
