import { getAddress, JsonRpcProvider } from 'ethers';
export const PUBLISHER = '0x1b77aE05cd23C514A1De304b6b771513f6eFa780';
export const FIXING_DOMAIN = { name: 'corpusAI Cloud Pricing', version: '1' };
export const FIXING_TYPES = { Fixing: [
  { name: 'ticker', type: 'string' }, { name: 'day', type: 'string' },
  { name: 'valueE18', type: 'uint256' }, { name: 'n', type: 'uint32' },
  { name: 'methodology', type: 'string' },
] };
export function readConfig(env = {}) {
  // Accept the Next.js public names while keeping existing CLI deployments compatible.
  env = { ...env, ...Object.fromEntries(Object.entries(env).filter(([key]) => key.startsWith('NEXT_PUBLIC_ME_')).map(([key, value]) => [key.replace('NEXT_PUBLIC_', 'VITE_'), value])) };
  const chainId = Number(env.VITE_ME_CHAIN_ID || env.ME_CHAIN_ID || 400);
  if (!Number.isSafeInteger(chainId) || chainId < 1) throw new Error('Invalid ME chain ID');
  const rpc = env.VITE_ME_EVM_RPC || env.ME_EVM_RPC || 'http://118.175.0.249:8545';
  const url = new URL(rpc);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('RPC must use HTTP(S)');
  const address = value => value ? getAddress(value) : '';
  return {
    chainId, rpc, market: address(env.VITE_ME_MARKET || env.ME_MARKET), oracle: address(env.VITE_ME_ORACLE || env.ME_ORACLE),
    token: address(env.VITE_ME_TOKEN || env.ME_TOKEN), usdc: address(env.VITE_ME_USDC || env.ME_USDC),
    publisher: address(env.VITE_ME_PUBLISHER || env.ME_PUBLISHER || PUBLISHER),
    rest: env.VITE_ME_REST || env.ME_REST || '',
    explorer: env.VITE_ME_EXPLORER || env.ME_EXPLORER || '',
    name: chainId === 31337 ? 'Local development' : 'Meta Earth testnet',
  };
}
export async function connectRpc(config) {
  const provider = new JsonRpcProvider(config.rpc, undefined, { batchMaxCount: 1 });
  const network = await provider.getNetwork();
  if (network.chainId !== BigInt(config.chainId)) { provider.destroy(); throw new Error(`RPC chain ${network.chainId} does not match configured chain ${config.chainId}`); }
  return provider;
}
export function normalizeFixing(input) {
  const { message, signature } = input.attestation || input;
  if (!message || !/^0x[0-9a-f]{130}$/i.test(signature || '')) throw new Error('Expected signed fixing: { attestation: { message, signature } }');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(message.day)) throw new Error('Invalid fixing day');
  const date = new Date(`${message.day}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== message.day) throw new Error('Invalid fixing day');
  if (typeof message.ticker !== 'string' || !message.ticker.length || message.ticker.length > 128 || typeof message.methodology !== 'string' || !message.methodology.length) throw new Error('Missing ticker or methodology');
  const valueE18 = BigInt(message.valueE18);
  if (valueE18 <= 0n || valueE18 >= 2n ** 256n || !Number.isInteger(message.n) || message.n <= 0 || message.n > 4294967295) throw new Error('Invalid price or quote count');
  return { message: { ticker: message.ticker, day: message.day, valueE18, n: message.n, methodology: message.methodology }, signature };
}
export const json = value => JSON.stringify(value, (_, item) => typeof item === 'bigint' ? item.toString() : item, 2);
