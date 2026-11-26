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
      if (active && root.current) cleanup = mountComputeTools(root.current, settlementEnvironment(network), setBusy);
    }).catch(() => { if (active && root.current) root.current.textContent = 'Unable to initialize compute payment tools. Reload to retry.'; });
    return () => { active = false; cleanup?.(); };
  }, [network, setBusy]);
  return <div ref={root} dangerouslySetInnerHTML={{ __html: computeToolsMarkup }}/>;
}
