'use client';
import { useNetwork } from './network-provider';
import Link from 'next/link';
import type { NetworkKey } from '@/lib/types';
export function Header({ landing = false }: { landing?: boolean }) {
  const { network, networks, select, busy, ready } = useNetwork();
  const home = `/?network=${network.key}`, mint = `/mint?network=${network.key}`;
  return <nav className="nav" id={landing ? 'nav' : undefined}>
    <div className="wrap nav-in"><Link className="brand" href={home}>
      {landing ? <img className="watchtower-lockup" src="/watchtower-logo.svg" alt="Watchtower" width="220" height="48"/> : <>
        <img className="watchtower-mark" src="/watchtower-mark.svg" alt="" width="40" height="40"/>
        <span className="watchtower-name">Watchtower</span>
        <small>on {network.key === 'me' ? 'Meta Earth' : 'Monad'}</small>
      </>}
    </Link><div className={`nav-links${landing ? ' nav-links--landing' : ''}`}>
      <Link href={landing ? '#owning' : home}>{landing ? 'Protocol' : 'Overview'}</Link>
      <Link href={`${home}#how`}>{landing ? 'How it works' : 'Protocol'}</Link>
      <Link href={`${home}#live`}>{landing ? 'What’s live' : 'What’s live'}</Link>
      <a href="/privy" className="keep">Email sign in</a><Link href={mint} className="nav-cta">{landing ? 'Open app' : 'Open compute'}</Link>
    </div><label className={`network-select${landing ? ' network-select--landing' : ''}`}><span>Network</span><select aria-label="Compute network" value={network.key} disabled={!ready || busy} onChange={event => select(event.target.value as NetworkKey)}>
      {Object.entries(networks).map(([key, value]) => <option key={key} value={key}>{value.chainName}</option>)}
    </select></label></div>
  </nav>;
}
