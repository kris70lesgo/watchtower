import { id } from 'ethers';

export const REFERENCE_RECEIPT_SCHEMA = 'corpus-harbor-cpu-reference/v1';
const ROUNDS = 4096;
const encoder = new TextEncoder();

function toHex(bytes) {
  return `0x${Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')}`;
}

async function referenceDigests(request, subtle) {
  if (typeof request !== 'string' || !request.trim()) throw new Error('Enter the buyer request before running the CPU reference job.');
  if (!subtle?.digest) throw new Error('Web Crypto SHA-256 is unavailable in this browser.');

  let digest = new Uint8Array(await subtle.digest('SHA-256', encoder.encode(request)));
  const requestSha256 = toHex(digest);
  for (let round = 1; round < ROUNDS; round++) {
    digest = new Uint8Array(await subtle.digest('SHA-256', digest));
  }
  return { requestSha256, outputSha256: toHex(digest) };
}

/** Execute a small deterministic browser-CPU workload and create its portable receipt. */
export async function createReferenceReceipt(request, { subtle = globalThis.crypto?.subtle, now = () => new Date().toISOString() } = {}) {
  const { requestSha256, outputSha256 } = await referenceDigests(request, subtle);
  const manifest = {
    schema: REFERENCE_RECEIPT_SCHEMA,
    execution: {
      mode: 'local-cpu-reference',
      algorithm: '4,096 sequential SHA-256 rounds over the request digest',
      rounds: ROUNDS,
      completedAt: now(),
    },
    input: {
      requestKeccak256: id(request),
      requestSha256,
    },
    output: { sha256: outputSha256 },
    note: 'Computed in this browser as a reference workload. No GPU or remote provider was used.',
  };
  const receiptText = JSON.stringify(manifest, null, 2);
  return { manifest, receiptText, receiptHash: id(receiptText) };
}

/** Verify a reference receipt locally before accepting the matching on-chain receipt hash. */
export async function verifyReferenceReceipt(request, receiptText, onChainRequestHash, { subtle = globalThis.crypto?.subtle } = {}) {
  let manifest;
  try { manifest = JSON.parse(receiptText); }
  catch { throw new Error('Reference receipt is not valid JSON.'); }
  if (manifest?.schema !== REFERENCE_RECEIPT_SCHEMA) throw new Error('This is not a CPU reference receipt.');
  if (manifest.execution?.mode !== 'local-cpu-reference' || manifest.execution?.rounds !== ROUNDS) throw new Error('Reference receipt has an unexpected execution mode.');
  const requestHash = id(request);
  if (requestHash.toLowerCase() !== String(onChainRequestHash).toLowerCase() || requestHash.toLowerCase() !== String(manifest.input?.requestKeccak256).toLowerCase()) {
    throw new Error('Reference receipt is not bound to this on-chain request.');
  }
  const expected = await referenceDigests(request, subtle);
  if (String(manifest.input?.requestSha256).toLowerCase() !== expected.requestSha256.toLowerCase()) throw new Error('Reference receipt input digest does not match the request.');
  if (String(manifest.output?.sha256).toLowerCase() !== expected.outputSha256.toLowerCase()) throw new Error('Reference receipt output does not match the CPU workload.');
  return { manifest, receiptHash: id(receiptText), outputSha256: expected.outputSha256 };
}
