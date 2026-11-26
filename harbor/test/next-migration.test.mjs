import test from 'node:test';
import assert from 'node:assert/strict';
import { publicNetworks, settlementEnvironment } from '../../lib/public-config.mjs';
import { readConfig } from '../shared.mjs';
test('Next public configuration serializes only browser-safe values', () => {
  const secret = 'server-only-sentinel-not-a-real-credential';
  const networks = publicNetworks({ ME_DEPLOYER_KEY: secret, RUNPOD_API_KEY: secret, SUPABASE_SERVICE_ROLE_KEY: secret, NEXT_PUBLIC_ME_TOKEN: '0x1111111111111111111111111111111111111111' });
  assert.ok(!JSON.stringify(networks).includes(secret));
  assert.equal(networks.me.token, '0x1111111111111111111111111111111111111111');
  assert.equal(networks.monad.chainId, 10143);
  assert.equal(networks.me.chainId, 400);
});
test('Next environment names work for the existing deployment and preflight clients', () => {
  const config = readConfig({ NEXT_PUBLIC_ME_CHAIN_ID: '31337', NEXT_PUBLIC_ME_EVM_RPC: 'http://127.0.0.1:18545', NEXT_PUBLIC_ME_TOKEN: '0x1111111111111111111111111111111111111111' });
  assert.equal(config.chainId, 31337); assert.equal(config.token, '0x1111111111111111111111111111111111111111');
  const publicConfig = publicNetworks({ NEXT_PUBLIC_ME_CHAIN_ID: '31337' });
  assert.equal(readConfig(settlementEnvironment(publicConfig.me)).chainId, 31337);
});
test('old Vite environment values remain compatible during migration; Next values take precedence', () => {
  const networks = publicNetworks({ VITE_ME_CHAIN_ID: '31337', VITE_ME_TOKEN: '0x1111111111111111111111111111111111111111', NEXT_PUBLIC_ME_CHAIN_ID: '400' });
  assert.equal(networks.me.chainId, 400); assert.equal(networks.me.token, '0x1111111111111111111111111111111111111111');
});
test('invalid configuration fails before exposing incorrect chain addresses to the app', () => {
  assert.throws(() => publicNetworks({ NEXT_PUBLIC_ME_CHAIN_ID: 'invalid' }));
  assert.throws(() => publicNetworks({ NEXT_PUBLIC_ME_TOKEN: 'not-a-contract-address' }));
  assert.throws(() => publicNetworks({ NEXT_PUBLIC_ME_EVM_RPC: 'file:///tmp/rpc' }));
});
