import { CONFIG as MONAD } from '../web/config.js';
export function publicValue(env, name, fallback = '') {
  return env[`NEXT_PUBLIC_${name}`] || env[`VITE_${name}`] || fallback;
}
export function publicNetworks(env = {}) {
  const address = name => {
    const value = publicValue(env, name);
    if (value && !/^0x[0-9a-fA-F]{40}$/.test(value)) throw new Error(`Invalid public contract address: ${name}`);
    return value;
  };
  const chainId = Number(publicValue(env, 'ME_CHAIN_ID', '400'));
  if (!Number.isSafeInteger(chainId) || chainId <= 0) throw new Error('Invalid ME chain ID');
  const rpc = publicValue(env, 'ME_EVM_RPC', 'http://118.175.0.249:8545');
  if (!['http:', 'https:'].includes(new URL(rpc).protocol)) throw new Error('ME RPC must use HTTP(S)');
  return {
    monad: { ...MONAD, key: 'monad', nativeSymbol: 'MON', mockUsdc: true },
    me: {
      key: 'me', chainId, chainName: chainId === 31337 ? 'Local development' : 'Meta Earth Testnet',
      rpc, nativeSymbol: 'MEC',
      token: address('ME_TOKEN'), usdc: address('ME_USDC'), oracle: address('ME_ORACLE'),
      treasury: address('ME_TREASURY'), market: address('ME_MARKET'),
      providerRelay: publicValue(env, 'ME_PROVIDER_RELAY_URL'),
      explorer: publicValue(env, 'ME_EXPLORER'), rest: publicValue(env, 'ME_REST', 'https://beta-hub-1317.explorer-testnet.me'),
      publisher: publicValue(env, 'ME_PUBLISHER', MONAD.publisher),
      mockUsdc: publicValue(env, 'ME_MOCK_USDC', 'true') !== 'false',
      feed: MONAD.feed, repo: MONAD.repo, vault: '', mainnetExplorer: '', kuruMarket: '', txs: {},
    },
  };
}
export function settlementEnvironment(network) {
  return {
    VITE_ME_CHAIN_ID: String(network.chainId), VITE_ME_EVM_RPC: network.rpc, VITE_ME_WALLET_RPC: network.rpc,
    VITE_ME_MARKET: network.market, VITE_ME_ORACLE: network.oracle,
    VITE_ME_TOKEN: network.token, VITE_ME_USDC: network.usdc,
    VITE_ME_PUBLISHER: network.publisher, VITE_ME_REST: network.rest,
    VITE_ME_EXPLORER: network.explorer, VITE_ME_PROVIDER_RELAY_URL: network.providerRelay,
  };
}
