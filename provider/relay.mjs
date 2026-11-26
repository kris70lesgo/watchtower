import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Contract, getAddress, id, isHexString } from 'ethers';
import { readConfig, connectRpc } from '../harbor/shared.mjs';
import artifact from '../harbor/generated/MEComputeMarket.json' with { type: 'json' };

const root = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(root, 'data');
const dataFile = path.join(dataDir, 'jobs.json');
const PORT = Number(process.env.PROVIDER_RELAY_PORT || 8787);
const HOST = process.env.PROVIDER_RELAY_HOST || '127.0.0.1';
if (!process.env.PROVIDER_ADDRESS) throw new Error('Set PROVIDER_ADDRESS in the provider environment.');
const providerAddress = getAddress(process.env.PROVIDER_ADDRESS);
const workerToken = process.env.PROVIDER_WORKER_TOKEN || '';
const allowedOrigins = new Set((process.env.PROVIDER_ALLOWED_ORIGINS || 'http://localhost:3000').split(',').map(value => value.trim()).filter(Boolean));
const config = readConfig(process.env);

if (!config.market) throw new Error('Set VITE_ME_MARKET in the provider environment.');
if (!workerToken || workerToken.length < 32) throw new Error('Set PROVIDER_WORKER_TOKEN to a random value of at least 32 characters.');
if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) throw new Error('Invalid PROVIDER_RELAY_PORT.');

const rpc = await connectRpc(config);
const market = new Contract(config.market, artifact.abi, rpc);
let jobs = [];
let writeQueue = Promise.resolve();
let lastWorkerSeen = 0;
const requestsByIp = new Map();

try {
  jobs = JSON.parse(await readFile(dataFile, 'utf8'));
  if (!Array.isArray(jobs)) throw new Error('invalid store');
  // A process restart makes an interrupted job eligible for a clean retry.
  jobs = jobs.map(job => job.state === 'running' ? { ...job, state: 'queued', updatedAt: new Date().toISOString() } : job);
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

async function persist() {
  writeQueue = writeQueue.then(async () => {
    await mkdir(dataDir, { recursive: true, mode: 0o700 });
    const temporary = `${dataFile}.${process.pid}.tmp`;
    await writeFile(temporary, `${JSON.stringify(jobs, null, 2)}\n`, { mode: 0o600 });
    await rename(temporary, dataFile);
  });
  return writeQueue;
}

function json(response, statusCode, value) {
  response.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  response.end(JSON.stringify(value));
}

function cors(request, response) {
  const origin = request.headers.origin;
  if (!origin) return true;
  if (!allowedOrigins.has(origin)) return false;
  response.setHeader('Access-Control-Allow-Origin', origin);
  response.setHeader('Vary', 'Origin');
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  response.setHeader('Access-Control-Max-Age', '600');
  return true;
}

function limited(request) {
  const ip = request.socket.remoteAddress || 'unknown';
  const now = Date.now();
  let entry = requestsByIp.get(ip);
  if (!entry || now - entry.start > 60_000) entry = { start: now, count: 0 };
  entry.count++;
  requestsByIp.set(ip, entry);
  return entry.count > 60;
}

async function body(request, maxBytes = 12_000) {
  let text = '', bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > maxBytes) throw Object.assign(new Error('Request body is too large.'), { statusCode: 413 });
    text += chunk;
  }
  try { return JSON.parse(text); }
  catch { throw Object.assign(new Error('Expected a JSON request body.'), { statusCode: 400 }); }
}

function publicJob(job) {
  return {
    id: job.id, orderId: job.orderId, state: job.state,
    createdAt: job.createdAt, updatedAt: job.updatedAt,
    result: job.result || null, receiptText: job.receiptText || null,
    receiptHash: job.receiptHash || null, error: job.publicError || null,
  };
}

async function orderFromTransaction(orderId, orderTxHash, requestText) {
  if (!Number.isSafeInteger(orderId) || orderId < 1) throw Object.assign(new Error('Invalid order ID.'), { statusCode: 400 });
  if (!isHexString(orderTxHash, 32)) throw Object.assign(new Error('Invalid order transaction hash.'), { statusCode: 400 });
  if (typeof requestText !== 'string' || requestText.trim() !== requestText || requestText.length < 1 || requestText.length > 2048) {
    throw Object.assign(new Error('Request text must be trimmed and no longer than 2,048 characters.'), { statusCode: 400 });
  }
  const receipt = await rpc.getTransactionReceipt(orderTxHash);
  const tx = await rpc.getTransaction(orderTxHash);
  if (!receipt || receipt.status !== 1 || !tx) throw Object.assign(new Error('Order transaction is not confirmed.'), { statusCode: 409 });
  if (tx.to?.toLowerCase() !== config.market.toLowerCase()) throw Object.assign(new Error('Order transaction targets a different market.'), { statusCode: 409 });
  const iface = market.interface;
  const event = receipt.logs.filter(log => log.address.toLowerCase() === config.market.toLowerCase()).map(log => {
    try { return iface.parseLog(log); } catch { return null; }
  }).find(parsed => parsed?.name === 'Ordered' && parsed.args.orderId === BigInt(orderId));
  if (!event) throw Object.assign(new Error('The transaction does not contain this market order.'), { statusCode: 409 });
  const item = await market.orders(orderId);
  if (item.state !== 1n) throw Object.assign(new Error('Only a pending order can be sent to the provider.'), { statusCode: 409 });
  if (getAddress(item.provider) !== providerAddress) throw Object.assign(new Error('This order belongs to a different provider.'), { statusCode: 403 });
  if (getAddress(tx.from) !== getAddress(item.buyer)) throw Object.assign(new Error('Order buyer does not match the transaction sender.'), { statusCode: 409 });
  if (id(requestText).toLowerCase() !== item.requestHash.toLowerCase() || event.args.requestHash.toLowerCase() !== item.requestHash.toLowerCase()) {
    throw Object.assign(new Error('Request text does not match the on-chain request hash.'), { statusCode: 409 });
  }
  const block = await rpc.getBlock('latest');
  if (!block || block.timestamp >= Number(item.deadline)) throw Object.assign(new Error('Order delivery deadline has passed.'), { statusCode: 409 });
  return { item, event };
}

function authorizedWorker(request) {
  return request.headers.authorization === `Bearer ${workerToken}`;
}

const server = createServer(async (request, response) => {
  try {
    if (!cors(request, response)) return json(response, 403, { error: 'Origin is not allowed.' });
    if (request.method === 'OPTIONS') { response.writeHead(204); return response.end(); }
    if (limited(request)) return json(response, 429, { error: 'Rate limit exceeded.' });
    const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);

    if (request.method === 'GET' && url.pathname === '/health') {
      return json(response, 200, { status: 'ready', chainId: config.chainId, provider: providerAddress, workerOnline: Date.now() - lastWorkerSeen < 15_000 });
    }

    if (url.pathname === '/internal/next' && request.method === 'GET') {
      if (!authorizedWorker(request)) return json(response, 401, { error: 'Worker authentication failed.' });
      lastWorkerSeen = Date.now();
      const job = jobs.find(candidate => candidate.state === 'queued');
      if (!job) return json(response, 200, { job: null });
      try {
        const chainOrder = await market.orders(job.orderId);
        const block = await rpc.getBlock('latest');
        if (chainOrder.state !== 1n || !block || block.timestamp >= Number(chainOrder.deadline)) {
          job.state = 'expired'; job.updatedAt = new Date().toISOString(); await persist();
          return json(response, 200, { job: null });
        }
      } catch { return json(response, 503, { error: 'Unable to confirm the order on Meta Earth.' }); }
      job.state = 'running'; job.startedAt = new Date().toISOString(); job.updatedAt = job.startedAt;
      await persist();
      return json(response, 200, { job: { id: job.id, orderId: job.orderId, requestText: job.requestText, requestHash: job.requestHash, deadline: job.deadline } });
    }

    const resultPath = url.pathname.match(/^\/internal\/jobs\/([0-9a-f-]{36})\/result$/i);
    if (resultPath && request.method === 'POST') {
      if (!authorizedWorker(request)) return json(response, 401, { error: 'Worker authentication failed.' });
      lastWorkerSeen = Date.now();
      const job = jobs.find(candidate => candidate.id === resultPath[1]);
      if (!job || job.state !== 'running') return json(response, 404, { error: 'Active job not found.' });
      const payload = await body(request, 24_000);
      if (typeof payload.receiptText !== 'string' || payload.receiptText.length > 20_000 || typeof payload.result !== 'object' || !payload.result) {
        return json(response, 400, { error: 'Invalid worker result.' });
      }
      let manifest;
      try { manifest = JSON.parse(payload.receiptText); } catch { return json(response, 400, { error: 'Receipt must be JSON.' }); }
      if (manifest?.schema !== 'watchtower-gpu-reference/v1' || Number(manifest.orderId) !== job.orderId || manifest.requestHash?.toLowerCase() !== job.requestHash.toLowerCase() || !/^[0-9a-f]{64}$/i.test(manifest.output?.sha256 || '') || String(payload.result.outputSha256 || '').toLowerCase() !== manifest.output.sha256.toLowerCase()) {
        return json(response, 400, { error: 'Receipt does not match this job.' });
      }
      const chainOrder = await market.orders(job.orderId), block = await rpc.getBlock('latest');
      if (chainOrder.state !== 1n || !block || block.timestamp >= Number(chainOrder.deadline)) {
        job.state = 'expired'; job.updatedAt = new Date().toISOString(); await persist();
        return json(response, 409, { error: 'Order expired before the GPU result arrived.' });
      }
      job.result = payload.result; job.receiptText = payload.receiptText; job.receiptHash = id(payload.receiptText);
      job.state = 'completed'; job.updatedAt = new Date().toISOString();
      await persist();
      return json(response, 200, publicJob(job));
    }

    const failurePath = url.pathname.match(/^\/internal\/jobs\/([0-9a-f-]{36})\/failure$/i);
    if (failurePath && request.method === 'POST') {
      if (!authorizedWorker(request)) return json(response, 401, { error: 'Worker authentication failed.' });
      lastWorkerSeen = Date.now();
      const job = jobs.find(candidate => candidate.id === failurePath[1]);
      if (!job || job.state !== 'running') return json(response, 404, { error: 'Active job not found.' });
      const payload = await body(request, 1_000);
      job.state = 'failed'; job.publicError = String(payload.error || 'GPU worker failed.').slice(0, 240);
      job.updatedAt = new Date().toISOString(); await persist();
      return json(response, 200, publicJob(job));
    }

    const jobPath = url.pathname.match(/^\/v1\/jobs\/([0-9a-f-]{36})$/i);
    if (jobPath && request.method === 'GET') {
      const job = jobs.find(candidate => candidate.id === jobPath[1]);
      return job ? json(response, 200, publicJob(job)) : json(response, 404, { error: 'Job not found.' });
    }

    if (request.method === 'POST' && url.pathname === '/v1/jobs') {
      const payload = await body(request);
      const orderId = Number(payload.orderId);
      const { item } = await orderFromTransaction(orderId, payload.orderTxHash, payload.requestText);
      const previous = jobs.find(job => job.orderId === orderId);
      if (previous) return json(response, 200, publicJob(previous));
      if (jobs.filter(job => ['queued', 'running'].includes(job.state)).length >= 20) return json(response, 429, { error: 'Provider queue is full. Try again later.' });
      const now = new Date().toISOString();
      const job = {
        id: randomUUID(),
        orderId, buyer: getAddress(item.buyer), provider: providerAddress,
        requestText: payload.requestText, requestHash: item.requestHash,
        deadline: Number(item.deadline), state: 'queued', createdAt: now, updatedAt: now,
      };
      jobs.push(job); await persist();
      return json(response, 201, publicJob(job));
    }

    return json(response, 404, { error: 'Not found.' });
  } catch (error) {
    const statusCode = Number.isInteger(error.statusCode) ? error.statusCode : 500;
    if (statusCode >= 500) console.error('Provider relay error:', error.message);
    return json(response, statusCode, { error: statusCode >= 500 ? 'Provider relay could not complete the request.' : error.message });
  }
});

server.listen(PORT, HOST, () => console.log(`Watchtower provider relay listening on http://${HOST}:${PORT}; provider ${providerAddress}; ME chain ${config.chainId}`));

for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
  server.close(() => { rpc.destroy(); process.exit(0); });
});
