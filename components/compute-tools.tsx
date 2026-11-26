'use client';
import { useEffect, useRef } from 'react';
import type { NetworkConfig } from '@/lib/types';
import { computeToolsMarkup } from '@/lib/generated/templates';
import { settlementEnvironment } from '@/lib/public-config.mjs';
import { useNetwork } from './network-provider';
export function ComputeTools({ network }: { network: NetworkConfig }) {
  const root = useRef<HTMLDivElement>(null);
  const { setBusy } = useNetwork();
  useEffect(() => {
    let active = true, cleanup: (() => void) | undefined;
    void import('@/harbor/main.mjs').then(({ mountComputeTools }) => {
      const environment = settlementEnvironment(network);
      if (environment.VITE_ME_EVM_RPC && window.location.protocol === 'https:' && new URL(environment.VITE_ME_EVM_RPC).protocol === 'http:') {
        environment.VITE_ME_WALLET_RPC = environment.VITE_ME_EVM_RPC;
        environment.VITE_ME_EVM_RPC = new URL('/api/me-rpc', window.location.origin).toString();
      }
      if (active && root.current) cleanup = mountComputeTools(root.current, environment, setBusy);
    }).catch(() => { if (active && root.current) root.current.textContent = 'Unable to initialize compute payment tools. Reload to retry.'; });
    return () => { active = false; cleanup?.(); };
  }, [network, setBusy]);
  return <div ref={root} dangerouslySetInnerHTML={{ __html: computeToolsMarkup }}/>;
}
