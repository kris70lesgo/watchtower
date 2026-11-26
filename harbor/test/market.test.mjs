import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import ganache from 'ganache';
import { BrowserProvider, ContractFactory, id, parseEther, verifyTypedData } from 'ethers';
import { compile } from '../scripts/compile.mjs';
import { readConfig, normalizeFixing, FIXING_DOMAIN, FIXING_TYPES, PUBLISHER } from '../shared.mjs';
import fs from 'node:fs';
import solc from 'solc';
import { deployCore } from '../scripts/deploy-core.mjs';
import { underwriting } from '../catalog.mjs';
import { createReferenceReceipt, verifyReferenceReceipt } from '../reference-provider.mjs';

let rpc, provider, seller, buyer, stranger, artifacts;
const price = parseEther('0.01');
before(async () => {
  artifacts = compile();
  rpc = ganache.provider({ logging: { quiet: true }, chain: { chainId: 31337, hardfork: 'shanghai' }, wallet: { totalAccounts: 4 } });
  provider = new BrowserProvider(rpc, undefined, { cacheTimeout: -1, pollingInterval: 10 });
  [seller, buyer, stranger] = await Promise.all([0, 1, 2].map(n => provider.getSigner(n)));
});
after(async () => { provider?.destroy(); await rpc?.disconnect(); });
async function setup() {
  const artifact = artifacts.MEComputeMarket;
  const market = await new ContractFactory(artifact.abi, artifact.bytecode, seller).deploy(); await market.waitForDeployment();
  await (await market.createOffer(id('one demo unit'), price, 60)).wait();
  return market;
}
async function buy(market, units = 2n, request = 'input manifest') {
  await (await market.connect(buyer).order(1, units, id(request), { value: price * units })).wait();
}
async function expire() { await rpc.request({ method: 'evm_increaseTime', params: [61] }); await rpc.request({ method: 'evm_mine', params: [] }); }
const rejects = action => assert.rejects(action);

test('complete order: MEC escrow → receipt → buyer acceptance → provider withdrawal', async () => {
  const market = await setup(); await buy(market);
  assert.equal(await market.totalEscrow(), price * 2n);
  assert.equal(await provider.getBalance(await market.getAddress()), price * 2n);
  await (await market.deliver(1, id('output manifest'))).wait();
  assert.equal((await market.orders(1)).state, 2n);
  assert.equal(await market.credits(seller.address), 0n);
  await (await market.connect(buyer).accept(1)).wait();
  assert.equal(await market.credits(seller.address), price * 2n);
  assert.equal(await market.totalEscrow(), 0n);
  await (await market.withdraw(stranger.address)).wait();
  assert.equal(await market.credits(seller.address), 0n);
  assert.equal(await provider.getBalance(await market.getAddress()), 0n);
});
test('local CPU reference receipt is bound to the request and settles through escrow', async () => {
  const market = await setup(), request = 'Compute SHA-256 reference for HARBOR demo input.';
  await buy(market, 1n, request);
  const generated = await createReferenceReceipt(request);
  const order = await market.orders(1);
  const verified = await verifyReferenceReceipt(request, generated.receiptText, order.requestHash);
  assert.equal(verified.receiptHash, generated.receiptHash);
  assert.equal(verified.outputSha256, generated.manifest.output.sha256);
  await (await market.deliver(1, generated.receiptHash)).wait();
  await (await market.connect(buyer).accept(1)).wait();
  await (await market.withdraw(seller.address)).wait();
  assert.equal((await market.orders(1)).state, 3n);
  assert.equal(await market.totalEscrow(), 0n);
  assert.equal(await provider.getBalance(await market.getAddress()), 0n);
});
test('CPU reference verification rejects a changed output or a different request', async () => {
  const request = 'sample compute request';
  const generated = await createReferenceReceipt(request);
  const tampered = JSON.parse(generated.receiptText);
  tampered.output.sha256 = `0x${'0'.repeat(64)}`;
  await rejects(() => verifyReferenceReceipt(request, JSON.stringify(tampered), id(request)));
  await rejects(() => verifyReferenceReceipt('different request', generated.receiptText, id(request)));
});
test('requires exact native MEC payment', async () => {
  const market = await setup();
  await rejects(() => market.connect(buyer).order(1, 1, id('x'), { value: 0 }));
  await rejects(() => market.connect(buyer).order(1, 1, id('x'), { value: price + 1n }));
});
test('rejects absent offer, zero units, excessive units and empty input hash', async () => {
  const market = await setup();
  await rejects(() => market.order(2, 1, id('x'), { value: price }));
  await rejects(() => market.order(1, 0, id('x')));
  await rejects(() => market.order(1, 10001, id('x'), { value: price * 10001n }));
  await rejects(() => market.order(1, 1, `0x${'0'.repeat(64)}`, { value: price }));
});
test('offer validation and access control', async () => {
  const market = await setup();
  await rejects(() => market.createOffer(id('x'), 0, 60));
  await rejects(() => market.createOffer(id('x'), 1, 59));
  await rejects(() => market.createOffer(id('x'), 1, 2592001));
  await rejects(() => market.connect(stranger).setOfferActive(1, false));
  await (await market.setOfferActive(1, false)).wait();
  await rejects(() => market.order(1, 1, id('x'), { value: price }));
  await (await market.setOfferActive(1, true)).wait();
  await buy(market);
});
test('pausing an offer does not block existing buyer settlement', async () => {
  const market = await setup(); await buy(market);
  await (await market.setOfferActive(1, false)).wait();
  await (await market.deliver(1, id('receipt'))).wait();
  await (await market.connect(buyer).accept(1)).wait();
  assert.equal((await market.orders(1)).state, 3n);
});
test('only the provider can record a receipt; receipts cannot be overwritten', async () => {
  const market = await setup(); await buy(market);
  await rejects(() => market.connect(stranger).deliver(1, id('receipt')));
  await rejects(() => market.deliver(1, `0x${'0'.repeat(64)}`));
  await (await market.deliver(1, id('receipt'))).wait();
  await rejects(() => market.deliver(1, id('replacement')));
});
test('only the buyer accepts, and a pending order cannot be accepted', async () => {
  const market = await setup(); await buy(market);
  await rejects(() => market.connect(buyer).accept(1));
  await (await market.deliver(1, id('receipt'))).wait();
  await rejects(() => market.accept(1));
  await rejects(() => market.connect(stranger).accept(1));
  await (await market.connect(buyer).accept(1)).wait();
  await rejects(() => market.connect(buyer).accept(1));
});
test('expired pending order refunds buyer credit exactly once', async () => {
  const market = await setup(); await buy(market);
  await rejects(() => market.connect(buyer).refund(1));
  await expire();
  await rejects(() => market.connect(stranger).refund(1));
  await (await market.connect(buyer).refund(1)).wait();
  assert.equal(await market.credits(buyer.address), price * 2n);
  assert.equal(await market.totalEscrow(), 0n);
  await rejects(() => market.connect(buyer).refund(1));
  await (await market.connect(buyer).withdraw(buyer.address)).wait();
  assert.equal(await provider.getBalance(await market.getAddress()), 0n);
});
test('delivered but unaccepted orders remain refundable at expiry', async () => {
  const market = await setup(); await buy(market);
  await (await market.deliver(1, id('receipt'))).wait(); await expire();
  await rejects(() => market.connect(buyer).accept(1));
  await (await market.connect(buyer).refund(1)).wait();
  assert.equal((await market.orders(1)).state, 4n);
  assert.equal(await market.credits(seller.address), 0n);
});
test('late delivery and post-refund delivery cannot steal funds', async () => {
  const market = await setup(); await buy(market); await expire();
  await rejects(() => market.deliver(1, id('receipt')));
  await (await market.connect(buyer).refund(1)).wait();
  await rejects(() => market.deliver(1, id('receipt')));
});
test('accepted orders cannot be refunded and a stranger cannot withdraw credit', async () => {
  const market = await setup(); await buy(market);
  await (await market.deliver(1, id('receipt'))).wait();
  await (await market.connect(buyer).accept(1)).wait(); await expire();
  await rejects(() => market.connect(buyer).refund(1));
  await rejects(() => market.connect(stranger).withdraw(stranger.address));
  assert.equal(await market.credits(seller.address), price * 2n);
});
test('accounting conserves escrow plus credits for multiple differently sized orders', async () => {
  const market = await setup(); let total = 0n;
  for (const units of [1n, 7n, 123n]) { await buy(market, units); total += price * units; }
  await (await market.deliver(2, id('receipt'))).wait();
  await (await market.connect(buyer).accept(2)).wait();
  await expire();
  await (await market.connect(buyer).refund(1)).wait();
  await (await market.connect(buyer).refund(3)).wait();
  assert.equal(await market.totalEscrow(), 0n);
  assert.equal(await market.credits(seller.address) + await market.credits(buyer.address), total);
  assert.equal(await provider.getBalance(await market.getAddress()), total);
});
test('failed withdrawal preserves credit and nested withdrawal cannot drain funds', async () => {
  const market = await setup();
  const source = fs.readFileSync(new URL('./WithdrawReceiver.sol', import.meta.url), 'utf8');
  const result = JSON.parse(solc.compile(JSON.stringify({ language: 'Solidity', sources: { 'Receiver.sol': { content: source } }, settings: { evmVersion: 'paris', outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } } } })));
  const artifact = result.contracts['Receiver.sol'].WithdrawReceiver;
  const receiver = await new ContractFactory(artifact.abi, `0x${artifact.evm.bytecode.object}`, buyer).deploy(); await receiver.waitForDeployment();
  await (await receiver.buy(await market.getAddress(), { value: price })).wait();
  await expire(); await (await receiver.reclaim()).wait();
  await (await receiver.setReject(true)).wait();
  await rejects(() => receiver.payout());
  assert.equal(await market.credits(await receiver.getAddress()), price);
  await (await receiver.setReject(false)).wait();
  await (await receiver.payout()).wait();
  assert.equal(await receiver.nestedWithdrawalBlocked(), true);
  assert.equal(await market.credits(await receiver.getAddress()), 0n);
  assert.equal(await provider.getBalance(await receiver.getAddress()), price);
  assert.equal(await provider.getBalance(await market.getAddress()), 0n);
});
test('historical corpus signature verifies and relays unchanged on a non-Monad chain', async () => {
  const fixture = JSON.parse(fs.readFileSync(new URL('../historical-fixing.json', import.meta.url)));
  const { message, signature } = normalizeFixing(fixture);
  assert.equal(verifyTypedData(FIXING_DOMAIN, FIXING_TYPES, message, signature), PUBLISHER);
  const artifact = artifacts.FixingOracle;
  const oracle = await new ContractFactory(artifact.abi, artifact.bytecode, seller).deploy(PUBLISHER); await oracle.waitForDeployment();
  assert.equal(await oracle.verify(message, signature), true);
  await (await oracle.connect(stranger).post(message, signature)).wait();
  assert.equal((await oracle.latest(message.ticker)).valueE18, message.valueE18);
  await (await oracle.post(message, signature)).wait();
  await rejects(() => oracle.post({ ...message, valueE18: message.valueE18 + 1n }, signature));
  assert.equal((await oracle.latest('missing')).postedAt, 0n);
});
test('configuration defaults to ME and never uses old Monad contract addresses', () => {
  const config = readConfig({}); assert.equal(config.chainId, 400); assert.equal(config.market, ''); assert.equal(config.oracle, '');
  assert.throws(() => readConfig({ ME_CHAIN_ID: 'not-a-number' }));
  assert.throws(() => readConfig({ VITE_ME_MARKET: 'not-an-address' }));
  assert.throws(() => readConfig({ ME_EVM_RPC: 'file:///tmp/rpc' }));
});
test('rejects malformed fixing JSON, impossible dates and nonpositive prices', () => {
  const fixture = JSON.parse(fs.readFileSync(new URL('../historical-fixing.json', import.meta.url)));
  assert.throws(() => normalizeFixing({}));
  assert.throws(() => normalizeFixing({ attestation: { ...fixture.attestation, message: { ...fixture.attestation.message, day: '2026-02-30' } } }));
  assert.throws(() => normalizeFixing({ attestation: { ...fixture.attestation, message: { ...fixture.attestation.message, valueE18: '0' } } }));
});
test('original corpus catalogue, USDC mint, transfer and redemption work on the added network', async () => {
  const core = await deployCore({ signer: seller, artifacts, chainId: 31337, fund: [buyer.address] });
  const token = core.token, usdc = core.usdc;
  assert.equal(await token.typeCount(), 10n);
  const quote = underwriting(570), type = await token.types(2);
  assert.equal(type.slug, 's1-1g');
  assert.equal(type.monthlyUsdc, quote.monthly);
  assert.equal(type.principalUsdc, quote.principal);
  assert.equal(type.priceUsdc, quote.price);
  await rejects(() => token.connect(buyer).mint(2, 1));
  const treasuryBefore = await usdc.balanceOf(seller.address);
  await (await usdc.connect(buyer).approve(await token.getAddress(), quote.price)).wait();
  await (await token.connect(buyer).mint(2, 1)).wait();
  assert.equal(await token.balanceOf(buyer.address, 2), 1n);
  assert.equal(await usdc.balanceOf(seller.address), treasuryBefore + quote.price);
  await (await token.connect(buyer).safeTransferFrom(buyer.address, stranger.address, 2, 1, '0x')).wait();
  assert.equal(await token.balanceOf(stranger.address, 2), 1n);
  const receipt = await (await token.connect(stranger).redeem(2, 1, id('corpus:test-account'))).wait();
  const event = receipt.logs.map(log => { try { return token.interface.parseLog(log); } catch { return null; } }).find(item => item?.name === 'Redeemed');
  assert.equal(event.args.accountRef, id('corpus:test-account'));
  assert.equal(await token['totalSupply(uint256)'](2), 0n);
  assert.equal(await token.balanceOf(stranger.address, 2), 0n);
});
