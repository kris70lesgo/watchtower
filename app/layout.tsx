import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { NetworkProvider } from '@/components/network-provider';
import { publicNetworks } from '@/lib/public-config.mjs';
import type { Networks } from '@/lib/types';
import './globals.css';
export const metadata: Metadata = {
  title: { default: 'Watchtower · Compute, in your terms', template: '%s · Watchtower' },
  description: 'Watchtower brings signed compute pricing, machine ownership, and native-MEC order escrow together across Monad and Meta Earth.',
  icons: { icon: [{ url: '/favicon.svg', type: 'image/svg+xml' }], apple: '/apple-touch-icon.png' },
};
export const viewport: Viewport = { themeColor: '#0b0d10' };
export default function Layout({ children }: { children: ReactNode }) {
  const networks = publicNetworks(process.env) as Networks;
  return <html lang="en"><head>
    <link rel="preconnect" href="https://fonts.googleapis.com"/>
    <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous"/>
    <link href="https://fonts.googleapis.com/css2?family=Geist+Mono:wght@400;500&family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600;700&family=Inter:wght@400;500;600;700&family=Newsreader:ital,opsz,wght@0,6..72,400;1,6..72,400&family=Space+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet"/>
  </head><body><NetworkProvider networks={networks}>{children}</NetworkProvider></body></html>;
}
