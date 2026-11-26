import { privyHtml } from '@/lib/generated/templates';
export const runtime = 'nodejs';
// Preserve the already-built, working Privy client during the framework migration.
// It runs as a complete document on this origin, so no second React root is leaked
// during App Router navigation. The source remains in privy/src/ for a later SDK upgrade.
export async function GET() {
  return new Response(privyHtml, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}
