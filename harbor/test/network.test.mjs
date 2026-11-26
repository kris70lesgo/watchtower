import test from 'node:test';
import assert from 'node:assert/strict';
import { activeNetwork, selectNetwork } from '../../web/networks.js';
import { computeToolsHtml } from '../scripts/compute-tools.mjs';
import { networkModule } from '../scripts/network-config.mjs';
test('core network selection preserves Monad addresses and keeps undeployed ME addresses empty', () => {
  const before = globalThis.location;
  try {
    globalThis.location = { search: '?network=monad' };
    assert.equal(activeNetwork().chainId, 10143);
    assert.equal(activeNetwork().token, '0xc6B96de257d3E1285080Fdb43BeF60DcbeDcd70c');
    globalThis.location.search = '?network=me';
    assert.equal(activeNetwork().chainId, 400);
    assert.equal(activeNetwork().token, '');
    assert.equal(activeNetwork().usdc, '');
  } finally { globalThis.location = before; }
});
test('switching networks discards a URL token override to avoid crossing contract addresses', () => {
  const before = globalThis.location; let destination;
  try {
    globalThis.location = { href: 'https://corpus.example/mint?token=0x123&acct=corpus%3A1', assign: url => { destination = String(url); } };
    selectNetwork('me');
    const url = new URL(destination);
    assert.equal(url.pathname, '/mint'); assert.equal(url.searchParams.get('network'), 'me');
    assert.equal(url.searchParams.has('token'), false); assert.equal(url.searchParams.get('acct'), 'corpus:1');
    assert.throws(() => selectNetwork('unsupported'));
  } finally { globalThis.location = before; }
});
test('inline compute tools have unique IDs and cannot collide with core mint controls', () => {
  const fragment = computeToolsHtml();
  const ids = [...fragment.matchAll(/id="([^"]+)"/g)].map(match => match[1]);
  assert.equal(ids.length, new Set(ids).size);
  assert.ok(ids.every(id => id.startsWith('me-')));
  assert.ok(!fragment.includes('<iframe'));
  assert.ok(fragment.includes('/compute-assets/compute-settlement.js'));
});
test('public core configuration omits deployment credentials', () => {
  const output = networkModule({ NEXT_PUBLIC_ME_TOKEN: '0x1111111111111111111111111111111111111111', ME_DEPLOYER_KEY: 'never-publish-this' });
  assert.ok(output.includes('0x1111111111111111111111111111111111111111')); assert.ok(!output.includes('never-publish-this'));
});
