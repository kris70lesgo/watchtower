import { BrowserProvider, Contract, formatEther, id, verifyTypedData, parseEther, getAddress } from 'ethers';
import { readConfig, connectRpc, normalizeFixing, FIXING_DOMAIN, FIXING_TYPES, json } from './shared.mjs';
import marketArtifact from './generated/MEComputeMarket.json';
import oracleArtifact from './generated/FixingOracle.json';
import historical from './historical-fixing.json';
import { createReferenceReceipt, REFERENCE_RECEIPT_SCHEMA, verifyReferenceReceipt } from './reference-provider.mjs';

// Mounted and disposed by the Next.js compute page. No global startup side effects.
/** @param {HTMLElement} embedded @param {Record<string,string|undefined>} environment @param {(busy: boolean) => void} onBusy */
export function mountComputeTools(embedded, environment, onBusy = (_busy) => {}) {

const $ = selector => embedded.querySelector(`#me-${selector}`);
const config = readConfig(environment);
let disposed = false; const listeners = [];
function listen(target, event, callback) { target.addEventListener(event, callback); listeners.push(() => target.removeEventListener(event, callback)); }
let provider, wallet, signer, account, busy = false, loadedOffer;
const transactions = [], log = [];
const relayPollers = new Map();
let latestProviderJob;
const states = ['Missing', 'Pending', 'Delivered', 'Accepted', 'Refunded'];
const short = value => `${value.slice(0, 6)}…${value.slice(-4)}`;
function status(message) { if (disposed) return; log.unshift(`${new Date().toLocaleTimeString()} · ${message}`); $('activity').textContent = log.slice(0, 30).join('\n'); }
function integer(field, max = Number.MAX_SAFE_INTEGER) { const value = Number($(field).value); if (!Number.isSafeInteger(value) || value < 1 || value > max) throw new Error(`${field}: enter a positive whole number (maximum ${max})`); return value; }
function nonempty(field) { const text = $(field).value.trim(); if (!text) throw new Error(`${field} is required`); return text; }
function market(runner = provider) { if (!config.market || !runner) throw new Error('Configure and connect the ME market first'); return new Contract(config.market, marketArtifact.abi, runner); }
function oracle(runner = provider) { if (!config.oracle || !runner) throw new Error('Configure and connect the ME oracle first'); return new Contract(config.oracle, oracleArtifact.abi, runner); }
async function relayRequest(path, payload) {
  if (!config.providerRelay) throw new Error('No GPU provider relay is configured.');
  const response = await fetch(`${config.providerRelay.replace(/\/$/, '')}${path}`, {
    method: payload ? 'POST' : 'GET', headers: payload ? { 'Content-Type': 'application/json' } : {},
    body: payload ? JSON.stringify(payload) : undefined, signal: AbortSignal.timeout(12000),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || `Provider relay returned HTTP ${response.status}.`);
  return result;
}
function showProviderJob(job) {
  latestProviderJob = job;
  $('job-status').textContent = `Order #${job.orderId} · ${job.state}${job.updatedAt ? ` · updated ${new Date(job.updatedAt).toLocaleTimeString()}` : ''}`;
  $('job-result').textContent = job.result ? json({ result: job.result, receiptHash: job.receiptHash, receiptText: job.receiptText }) : (job.error || 'Waiting for the provider worker.');
  if (job.state === 'completed') status(`GPU reference result ready for order #${job.orderId}. Provider must record delivery from the provider wallet.`);
}
async function loadProviderJob(jobId) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(jobId)) throw new Error('Enter the provider job ID shown when the order was queued.');
  const job = await relayRequest(`/v1/jobs/${jobId}`);
  showProviderJob(job);
  return job;
}
function pollProviderJob(jobId) {
  if (relayPollers.has(jobId)) return;
  const timer = setInterval(async () => {
    if (disposed) return;
    try {
      const job = await loadProviderJob(jobId);
      if (['completed', 'failed', 'expired'].includes(job.state)) {
        clearInterval(timer); relayPollers.delete(jobId);
      }
    } catch (error) {
      $('job-status').textContent = `Relay check failed: ${error.message}`;
      clearInterval(timer); relayPollers.delete(jobId);
    }
  }, 3000);
  relayPollers.set(jobId, timer);
}
async function queueProviderJob(orderId, orderTxHash, requestText) {
  if (!config.providerRelay) {
    $('job-status').textContent = 'No provider relay configured. Continue with the manual provider handoff.';
    return;
  }
  try {
    const job = await relayRequest('/v1/jobs', { orderId, orderTxHash, requestText });
    $('job-id').value = job.id;
    try { sessionStorage.setItem(`watchtower-me-job-${orderId}`, job.id); } catch {}
    showProviderJob(job); pollProviderJob(job.id);
    status(`Order #${orderId} queued for the provider GPU worker. Share job ID ${job.id} with the provider.`);
  } catch (error) {
    $('job-status').textContent = `Order is confirmed on Meta Earth, but the provider relay could not queue it: ${error.message}`;
    status('Order is already on-chain. Provider relay unavailable; manual fulfillment remains possible.');
  }
}
async function requireSigner() {
  if (!signer) throw new Error('Connect your wallet first');
  const chain = await window.ethereum.request({ method: 'eth_chainId' });
  if (BigInt(chain) !== BigInt(config.chainId)) throw new Error('Wallet network changed. Reconnect to the configured network.');
  return signer;
}
async function transact(label, send) {
  await requireSigner();
  status(`${label}: awaiting wallet approval`);
  const tx = await send(); status(`${label}: submitted ${tx.hash}`);
  const receipt = await tx.wait();
  if (receipt.status !== 1) throw new Error('Transaction reverted');
  transactions.push({ label, transactionHash: receipt.hash, blockNumber: receipt.blockNumber, chainId: config.chainId });
  status(`${label}: confirmed ${receipt.hash}`);
  try { await refresh(); } catch (error) { status(`Transaction confirmed; refresh failed: ${error.message}`); }
  return receipt;
}
function bind(button, action) {
  listen($(button), 'click', async () => {
    if (busy || disposed) return; busy = true; onBusy(true);
    const buttons = [...(embedded || document).querySelectorAll('button')]; buttons.forEach(button => button.disabled = true);
    try { await action(); } catch (error) { status(error.shortMessage || error.message || String(error)); }
    finally { busy = false; onBusy(false); buttons.forEach(button => button.disabled = false); }
  });
}
async function boot() {
  $('chain').textContent = config.name;
  if (location.protocol === 'https:' && new URL(config.rpc).protocol !== 'https:') throw new Error('HTTPS deployment requires VITE_ME_EVM_RPC to use HTTPS.');
  if (config.providerRelay && location.protocol === 'https:' && new URL(config.providerRelay).protocol !== 'https:') throw new Error('HTTPS deployment requires VITE_ME_PROVIDER_RELAY_URL to use HTTPS.');
  if (!config.market || !config.oracle) $('setup').textContent = 'Setup required: deploy the ME contracts, then configure VITE_ME_MARKET and VITE_ME_ORACLE. Signature verification works without a wallet. No ME deployment is claimed yet.';
  provider?.destroy(); provider = undefined;
  provider = await connectRpc(config);
  for (const address of [config.market, config.oracle].filter(Boolean)) if (await provider.getCode(address) === '0x') throw new Error(`No contract bytecode at ${address} on chain ${config.chainId}`);
  $('network').textContent = `${config.name} · chain ${config.chainId} · connected`;
  if (config.market && config.oracle) {
    const publisher = await oracle().publisher();
    if (publisher.toLowerCase() !== config.publisher.toLowerCase()) throw new Error('Configured publisher does not match the on-chain oracle');
    $('setup').textContent = `${config.name}. Market ${config.market}. Oracle ${config.oracle}. ${config.chainId === 31337 ? 'Local development only; not ME evidence.' : 'Testnet MEC has no real monetary value.'}`;
    await refresh();
  }
  if (config.providerRelay) {
    try {
      const health = await relayRequest('/health');
      if (Number(health.chainId) !== config.chainId) throw new Error('Provider relay is configured for a different chain.');
      $('provider-health').textContent = `Relay ${health.workerOnline ? '· GPU worker online' : '· waiting for worker'}`;
    } catch (error) {
      $('provider-health').textContent = 'Relay offline';
      $('job-status').textContent = `Remote provider unavailable: ${error.message}`;
    }
  } else {
    $('provider-health').textContent = 'Relay not configured';
  }
}
async function refresh() {
  if (!provider) return boot();
  if (!config.market) return;
  const contract = market();
  const [offerCount, orderCount, escrow, credit] = await Promise.all([contract.offerCount(), contract.orderCount(), contract.totalEscrow(), account ? contract.credits(account) : 0n]);
  $('offers-count').textContent = String(offerCount); $('escrow').textContent = formatEther(escrow); $('credit').textContent = formatEther(credit);
  const rows = [];
  for (let n = orderCount; n > 0n && n > orderCount - 25n; n--) {
    const order = await contract.orders(n);
    const row = document.createElement('tr');
    for (const text of [`#${n}`, `${short(order.buyer)} / ${short(order.provider)}`, `${order.units} · ${formatEther(order.paid)}`, states[Number(order.state)], new Date(Number(order.deadline) * 1000).toLocaleString()]) {
      const cell = document.createElement('td'); cell.textContent = text; row.append(cell);
    }
    row.title = `Request hash: ${order.requestHash}\nReceipt hash: ${order.receiptHash}`; rows.push(row);
  }
  $('orders').replaceChildren(...rows);
  if (!rows.length) { const row = document.createElement('tr'), cell = document.createElement('td'); cell.colSpan = 5; cell.textContent = 'No orders yet. Inspect an offer to get started.'; row.append(cell); $('orders').append(row); }
}
bind('connect', async () => {
  if (!window.ethereum) throw new Error('An injected EVM wallet is required. Install or open MetaMask to continue.');
  const chainId = `0x${config.chainId.toString(16)}`;
  await window.ethereum.request({ method: 'eth_requestAccounts' });
  try { await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId }] }); }
  catch (error) {
    if (Number(error.code) !== 4902) throw error;
    await window.ethereum.request({ method: 'wallet_addEthereumChain', params: [{ chainId, chainName: config.name, nativeCurrency: { name: 'MEC', symbol: 'MEC', decimals: 18 }, rpcUrls: [config.walletRpc] }] });
    await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId }] });
  }
  wallet = new BrowserProvider(window.ethereum); signer = await wallet.getSigner(); account = getAddress(await signer.getAddress());
  $('wallet').textContent = account; $('connect').textContent = short(account); status('Wallet connected'); await refresh();
});
const accountChanged = () => { signer = undefined; account = undefined; $('wallet').textContent = 'Account changed; reconnect wallet'; $('connect').textContent = 'Connect wallet'; };
window.ethereum?.on?.('accountsChanged', accountChanged);
const chainChanged = () => { signer = undefined; account = undefined; $('wallet').textContent = 'Network changed; reconnect wallet'; $('connect').textContent = 'Connect wallet'; };
window.ethereum?.on?.('chainChanged', chainChanged);
bind('refresh', refresh);
async function inspectOffer() {
  const offerId = integer('offer-id'), offer = await market().offers(offerId);
  if (offer.provider === '0x0000000000000000000000000000000000000000') throw new Error('Offer does not exist');
  loadedOffer = { offerId, offer };
  $('offer-detail').textContent = json({ offerId, provider: offer.provider, specificationHash: offer.specHash, priceMecPerUnit: formatEther(offer.unitPrice), deliverySeconds: Number(offer.deliverySeconds), active: offer.active });
  $('order-total').textContent = `${formatEther(offer.unitPrice * BigInt(integer('units', 10000)))} MEC total. Provider specification hash must match your agreed terms.`;
  return loadedOffer;
}
bind('load-offer', inspectOffer);
listen($('offer-id'), 'input', () => { loadedOffer = undefined; $('order-total').textContent = 'Inspect this offer before ordering.'; });
listen($('units'), 'input', () => { if (loadedOffer) { try { $('order-total').textContent = `${formatEther(loadedOffer.offer.unitPrice * BigInt(integer('units', 10000)))} MEC total.`; } catch { $('order-total').textContent = 'Enter 1–10000 whole units.'; } } });
bind('publish', async () => {
  const spec = nonempty('spec'), price = parseEther(nonempty('price')), duration = integer('duration', 2592000);
  if (price <= 0n || duration < 60) throw new Error('Use a positive price and a delivery window of at least 60 seconds');
  const receipt = await transact('Create offer', () => market(signer).createOffer(id(spec), price, duration));
  const event = receipt.logs.map(log => { try { return market().interface.parseLog(log); } catch { return null; } }).find(event => event?.name === 'OfferCreated');
  if (event) { $('offer-id').value = String(event.args.offerId); status(`Published offer #${event.args.offerId}; keep your original specification.`); await inspectOffer(); }
});
bind('order', async () => {
  const request = nonempty('request');
  const { offerId, offer } = await inspectOffer();
  if (!offer.active) throw new Error('Offer is inactive');
  const receipt = await transact('Place order', () => market(signer).order(offerId, integer('units', 10000), id(request), { value: offer.unitPrice * BigInt(integer('units', 10000)) }));
  const event = receipt.logs.map(log => { try { return market().interface.parseLog(log); } catch { return null; } }).find(parsed => parsed?.name === 'Ordered');
  if (!event) throw new Error('Order confirmed, but its event could not be read. Refresh the order list and inspect the order.');
  const orderId = Number(event.args.orderId); $('order-id').value = String(orderId);
  await queueProviderJob(orderId, receipt.hash, request);
});
bind('pause-offer', () => transact('Pause offer', () => market(signer).setOfferActive(integer('toggle-offer-id'), false)));
bind('resume-offer', () => transact('Resume offer', () => market(signer).setOfferActive(integer('toggle-offer-id'), true)));
bind('generate-reference', async () => {
  const request = nonempty('request'), order = await inspectOrder();
  if (id(request).toLowerCase() !== order.requestHash.toLowerCase()) throw new Error('The request text does not match the order. Use the original agreed request.');
  status(`Running 4,096 local SHA-256 rounds for order #${integer('order-id')}…`);
  const result = await createReferenceReceipt(request);
  $('receipt').value = result.receiptText;
  $('reference-result').textContent = `Completed locally on this browser. Output SHA-256: ${result.manifest.output.sha256}. No GPU or remote provider was used.`;
  status(`Local CPU reference job completed for order #${integer('order-id')}. Receipt ready to record.`);
});
async function inspectOrder() {
  const order = await market().orders(integer('order-id'));
  if (order.state === 0n) throw new Error('Order does not exist');
  $('order-detail').textContent = json({ buyer: order.buyer, provider: order.provider, offerId: order.offerId, units: order.units, paidMec: formatEther(order.paid), state: states[Number(order.state)], deadline: new Date(Number(order.deadline) * 1000).toISOString(), requestHash: order.requestHash, receiptHash: order.receiptHash });
  return order;
}
async function checkReceipt() {
  const original = nonempty('receipt'), order = await inspectOrder();
  if (id(original) !== order.receiptHash) throw new Error('Receipt text does not match the provider’s on-chain hash');
  let manifest;
  try { manifest = JSON.parse(original); } catch {}
  if (manifest?.schema === REFERENCE_RECEIPT_SCHEMA) {
    const verified = await verifyReferenceReceipt(nonempty('request'), original, order.requestHash);
    $('reference-result').textContent = `CPU reference receipt verified. Output SHA-256: ${verified.outputSha256}. This does not prove GPU execution.`;
    status(`Receipt hash and local CPU result verified for order #${integer('order-id')}.`);
  } else {
    status('Receipt hash matches the on-chain record. Inspect the actual output before releasing payment.');
  }
  return order;
}
bind('inspect-order', inspectOrder);
bind('check-receipt', checkReceipt);
bind('load-job', async () => {
  const jobId = nonempty('job-id'), job = await loadProviderJob(jobId);
  if (!['completed', 'failed', 'expired'].includes(job.state)) pollProviderJob(jobId);
});
bind('use-job-receipt', () => {
  if (!latestProviderJob?.receiptText) throw new Error('The provider has not completed this GPU job yet.');
  $('order-id').value = String(latestProviderJob.orderId);
  $('receipt').value = latestProviderJob.receiptText;
  status(`Loaded the provider receipt for order #${latestProviderJob.orderId}. The provider must record it on-chain before buyer acceptance.`);
});
bind('deliver', () => { const receipt = nonempty('receipt'); return transact('Record delivery', () => market(signer).deliver(integer('order-id'), id(receipt))); });
bind('accept', async () => { await checkReceipt(); return transact('Accept delivery', () => market(signer).accept(integer('order-id'))); });
bind('refund', () => transact('Refund order', () => market(signer).refund(integer('order-id'))));
bind('withdraw', () => transact('Withdraw MEC credit', () => market(signer).withdraw(account)));
bind('sample', () => { $('fixing').value = json(historical); $('verify-result').textContent = 'Historical example: 1 October 2026. This is not a current price.'; });
function verifyFixing() {
  const fixing = normalizeFixing(JSON.parse(nonempty('fixing')));
  const recovered = verifyTypedData(FIXING_DOMAIN, FIXING_TYPES, fixing.message, fixing.signature);
  if (recovered.toLowerCase() !== config.publisher.toLowerCase()) throw new Error('Signature does not match the configured publisher');
  $('verify-result').textContent = `Valid signature by ${recovered}. Fixing day: ${fixing.message.day}; compare this date before using the price. Value: $${formatEther(fixing.message.valueE18)} per index unit.`;
  return fixing;
}
bind('verify', verifyFixing);
bind('relay', async () => { const fixing = verifyFixing(); await transact('Relay fixing', () => oracle(signer).post(fixing.message, fixing.signature)); });
bind('read-price', async () => {
  const record = await oracle().latest(nonempty('ticker'));
  $('price-record').textContent = record.postedAt === 0n ? 'No fixing posted for this ticker.' : json({ day: record.day, usdPerUnit: formatEther(record.valueE18), quotes: record.n, methodology: record.methodology, postedAt: new Date(Number(record.postedAt) * 1000).toISOString(), note: 'Published fixing for this day, not a live spot price.' });
});
bind('lookup', async () => {
  if (!config.rest) throw new Error('Set VITE_ME_REST to the official ME Hub REST endpoint');
  const address = nonempty('me-address');
  if (!/^me1[023456789acdefghjklmnpqrstuvwxyz]{20,90}$/.test(address)) throw new Error('Enter a valid me1 sub-account address');
  const url = new URL(`${config.rest.replace(/\/$/, '')}/metaearth/kyc/QuerySubAccountDidResponse`);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('REST endpoint must use HTTP(S)');
  url.searchParams.set('sub_account', address);
  const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`ME ID lookup failed: HTTP ${response.status}; no identity conclusion can be drawn`);
  $('identity-result').textContent = json({ source: url.origin, queriedAddress: address, response: await response.json(), note: 'Public query only. This does not verify control of the address or advanced verification status.' });
});
bind('export', async () => {
  const report = { generatedAt: new Date().toISOString(), network: config.name, isLocalDevelopment: config.chainId === 31337, chainId: config.chainId, market: config.market, oracle: config.oracle, publisher: config.publisher, connectedAccount: account || null, transactions };
  const blob = new Blob([json(report)], { type: 'application/json' });
  const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = `harbor-evidence-${Date.now()}.json`; link.click(); URL.revokeObjectURL(url);
  status('Session evidence exported; this includes confirmed transactions from this session only.');
});
let started = false;
function start() {
  if (started || disposed || embedded.hidden) return;
  started = true;
  boot().catch(error => { $('setup').textContent = `Connection not ready: ${error.shortMessage || error.message}. Check .env and run npm run preflight. Signature verification is available offline.`; status(`RPC unavailable: ${error.shortMessage || error.message}`); provider?.destroy(); provider = undefined; });
}
listen(window, 'corpus-network-ready', start);
start();

return () => { disposed = true; listeners.forEach(remove => remove()); for (const timer of relayPollers.values()) clearInterval(timer); relayPollers.clear(); window.ethereum?.removeListener?.('accountsChanged', accountChanged); window.ethereum?.removeListener?.('chainChanged', chainChanged); provider?.destroy(); wallet?.destroy(); onBusy(false); };

}
