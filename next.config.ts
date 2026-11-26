import type { NextConfig } from 'next';
const config: NextConfig = {
  poweredByHeader: false,
  experimental: { cpus: 2 },
  async redirects() {
    return [
      { source: '/me', destination: '/mint?network=me', permanent: false },
      { source: '/me/:path*', destination: '/mint?network=me', permanent: false },
      { source: '/mint.html', destination: '/mint', permanent: true },
      { source: '/index.html', destination: '/', permanent: true },
    ];
  },
  async headers() { return [{ source: '/:path*', headers: [
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  ] }]; },
};
export default config;
