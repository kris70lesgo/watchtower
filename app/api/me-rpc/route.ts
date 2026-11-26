export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const allowedMethods = new Set([
  'eth_chainId', 'net_version', 'eth_blockNumber', 'eth_syncing',
  'eth_getBalance', 'eth_getCode', 'eth_call', 'eth_getLogs',
  'eth_getBlockByNumber', 'eth_getBlockByHash', 'eth_getTransactionByHash',
  'eth_getTransactionReceipt', 'eth_getTransactionCount', 'eth_estimateGas',
  'eth_gasPrice', 'eth_maxPriorityFeePerGas', 'eth_feeHistory',
]);

export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  if (origin) {
    try {
      if (new URL(origin).origin !== new URL(request.url).origin) return Response.json({ error: 'Cross-origin RPC requests are not allowed.' }, { status: 403 });
    } catch { return Response.json({ error: 'Invalid request origin.' }, { status: 403 }); }
  }

  const target = process.env.NEXT_PUBLIC_ME_EVM_RPC || process.env.VITE_ME_EVM_RPC || process.env.ME_EVM_RPC;
  if (!target) return Response.json({ error: 'ME EVM RPC is not configured on the server.' }, { status: 503 });
  try {
    const endpoint = new URL(target);
    if (!['http:', 'https:'].includes(endpoint.protocol)) return Response.json({ error: 'Configured ME RPC must use HTTP(S).' }, { status: 503 });
  } catch { return Response.json({ error: 'Configured ME RPC URL is invalid.' }, { status: 503 }); }

  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > 32_000) return Response.json({ error: 'RPC request is too large.' }, { status: 413 });
  let rpcRequest: unknown;
  try { rpcRequest = JSON.parse(text); } catch { return Response.json({ error: 'Expected a JSON-RPC request.' }, { status: 400 }); }
  if (!rpcRequest || Array.isArray(rpcRequest) || typeof rpcRequest !== 'object') return Response.json({ error: 'Expected one JSON-RPC request.' }, { status: 400 });
  const method = (rpcRequest as { method?: unknown }).method;
  if (typeof method !== 'string' || !allowedMethods.has(method)) return Response.json({ error: 'JSON-RPC method is not allowed.' }, { status: 403 });

  try {
    const upstream = await fetch(target, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: text, cache: 'no-store', signal: AbortSignal.timeout(12_000),
    });
    const responseText = await upstream.text();
    if (responseText.length > 128_000) return Response.json({ error: 'ME RPC response is too large.' }, { status: 502 });
    return new Response(responseText, {
      status: upstream.ok ? 200 : 502,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
    });
  } catch {
    return Response.json({ error: 'ME RPC is unavailable through this app.' }, { status: 502 });
  }
}
