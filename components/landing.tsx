'use client';
import { useEffect, useRef } from 'react';
import { Header } from './header';
import { useNetwork } from './network-provider';
import { landingHtml, landingCss } from '@/lib/generated/templates';
import { setupLandingInteractions } from './landing-interactions';
export function Landing() {
  const container = useRef<HTMLDivElement>(null);
  const { network } = useNetwork();
  useEffect(() => {
    const element = container.current; if (!element) return;
    const nav = document.getElementById('nav'), page = element.querySelector<HTMLElement>('#pageRoot'), video = element.querySelector<HTMLVideoElement>('#heroVideo');
    if (!nav || !page || !video) return;
    const scroll = () => nav.classList.toggle('scrolled', scrollY > 80);
    addEventListener('scroll', scroll, { passive: true });
    video.src = matchMedia('(max-width:768px)').matches ? '/media/corpus_ink_loop_540.mp4' : '/media/corpus_ink_loop.mp4';
    const settle = () => document.documentElement.classList.remove('lock');
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      page.style.transform = ''; nav.style.transform = '';
      page.classList.remove('offset'); nav.classList.remove('offset-up');
      video.classList.add('settled'); settle();
    } else {
      let started = false;
      const begin = () => {
        if (started) return;
        started = true;
        setTimeout(() => {
          page.classList.add('entering'); nav.classList.add('entering'); void nav.offsetHeight;
          page.style.transform = ''; nav.style.transform = '';
          page.classList.remove('offset'); nav.classList.remove('offset-up');
          video.classList.add('settled');
          setTimeout(settle, 1550);
        }, 1000);
      };
      if (video.readyState >= 2) begin(); else video.addEventListener('loadeddata', begin, { once: true });
      setTimeout(begin, 4000);
    }
    const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) void video.play().catch(() => {}); else video.pause(); }); observer.observe(video);
    return () => { observer.disconnect(); video.pause(); removeEventListener('scroll', scroll); };
  }, []);
  useEffect(() => {
    const root = container.current; if (!root) return;
    root.querySelectorAll<HTMLAnchorElement>('a[href^="/"]').forEach(link => {
      const url = new URL(link.getAttribute('href')!, location.origin);
      if (['/', '/mint'].includes(url.pathname)) { url.searchParams.set('network', network.key); link.href = `${url.pathname}${url.search}${url.hash}`; }
    });
    // This trusted static landing markup retains the original design; live
    // addresses are inserted as text/DOM nodes rather than interpolated HTML.
    const set = (selector: string, parts: (string | { address: string; explorer?: string })[]) => {
      const target = root.querySelector(selector); if (!target) return;
      target.replaceChildren(...parts.map(part => {
        if (typeof part === 'string') return document.createTextNode(part);
        if (!part.explorer) return document.createTextNode(part.address);
        const link = document.createElement('a'); link.href = `${part.explorer}/address/${part.address}`; link.textContent = `${part.address.slice(0, 6)}…${part.address.slice(-4)}`; return link;
      }));
    };
    set('#row-token td.addr', network.token ? [{ address: network.token, explorer: network.explorer }, ` (${network.chainName})`] : [`Compute token not deployed on ${network.chainName}.`]);
    set('#row-oracle td.addr', network.oracle ? [{ address: network.oracle, explorer: network.explorer }, ` (${network.chainName})`] : [`Oracle not deployed on ${network.chainName}.`]);
    set('#row-treasury td.addr', network.treasury ? [{ address: network.treasury, explorer: network.mainnetExplorer || network.explorer }, ...(network.vault ? [' · vault ', { address: network.vault, explorer: network.mainnetExplorer || network.explorer }] : [' · treasury yield adapter not configured on this network'])] : ['Treasury deployment pending.']);
    root.querySelector('#kuru-market-row')?.remove();
    if (network.kuruMarket) {
      const row = document.createElement('tr'); row.id = 'kuru-market-row';
      for (const text of ['cS1-256 / USDC on Kuru', network.kuruMarket, 'existing deployment']) { const cell = document.createElement('td'); cell.textContent = text; row.append(cell); }
      root.querySelector('#row-token')?.after(row);
    }
    for (const [selector, address] of [['#row-token .pill', network.token], ['#row-oracle .pill', network.oracle]]) { const pill = root.querySelector(selector); if (pill) { pill.textContent = address ? 'configured' : 'pending'; pill.className = `pill ${address ? 'ok' : 'soon'}`; } }
  }, [network]);
  useEffect(() => {
    const root = container.current;
    return root ? setupLandingInteractions(root) : undefined;
  }, []);
  return <div className="landing-page"><style>{landingCss}</style><Header landing/><div ref={container} dangerouslySetInnerHTML={{ __html: landingHtml }}/></div>;
}
