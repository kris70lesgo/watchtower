# Watchtower single-GPU provider demo

This is a self-hosted, single-provider demo. It does not provision machines or allow buyers to submit code. A buyer first creates a real order on ME testnet; the relay verifies that confirmed order and its request hash before queueing one fixed GPU matrix workload. The provider reviews the returned receipt and signs the existing `deliver` transaction from their own wallet. The buyer still accepts or refunds on-chain.

The worker never receives wallet keys and never signs chain transactions. Its receipt records claimed GPU metadata and an output hash; it is not proof of computation. Use only public, non-sensitive sample requests.

## Relay host setup

Use the friend's machine as the relay and GPU worker host. Node.js 22.12 or newer is required. Copy `provider/provider.env.example` to the project root as `.env.provider`. Fill in the existing ME market address, the documented ME RPC, the provider wallet's public address, and the exact website origin. The relay connects to the RPC server-side, so HTTP is acceptable there. Generate a random `PROVIDER_WORKER_TOKEN` locally; do not put it in the website's public environment or send it in chat.

Start the relay from the project root:

```sh
npm run provider:relay
```

It binds to loopback by default. To let a separate public website reach it, expose port 8787 through an HTTPS tunnel. Do not open a router port. Set `NEXT_PUBLIC_ME_PROVIDER_RELAY_URL` on the website to the tunnel's HTTPS URL, and add the website's exact origin to `PROVIDER_ALLOWED_ORIGINS`. Keep this one-machine relay running during the demo; its JSON job store is local to the host and intended for a single relay process.

## GPU worker setup

The baseline worker uses NVIDIA CUDA and PyTorch. First inspect the GPU and OS, then install the NVIDIA driver and a CUDA-enabled PyTorch build compatible with that machine. Do not install the CPU-only PyTorch build. The workload is fixed at 12 multiplications of 384×384 float32 matrices and does not execute buyer-provided code.

Load the local provider environment and check that CUDA is available:

```sh
set -a
. ./.env.provider
set +a
python3 provider/worker.py --check
```

Start the worker in a second terminal on the same machine:

```sh
set -a
. ./.env.provider
set +a
python3 provider/worker.py
```

The worker polls the relay over loopback; only the relay needs an HTTPS tunnel. If the friend has an AMD GPU or Apple Silicon, this NVIDIA worker needs a different backend and should not be run as-is.

## Demo sequence

1. The provider connects their wallet on chain 400 and publishes a fixed-workload offer.
2. The buyer connects a separate wallet, writes a public sample request, and pays MEC into escrow.
3. The browser submits the confirmed order and request text to the relay. The relay verifies the transaction sender, order state, provider address, and request hash against ME before queueing it.
4. The worker runs the fixed workload. The browser polls the public job ID and shows queued, running, and completed status plus the output and receipt.
5. The provider loads the receipt and signs **Record delivery** in their wallet. The buyer checks the result and accepts; if delivery misses the deadline, the buyer can refund.

The order is already on-chain if relay submission fails; the app reports that and leaves the existing manual handoff available. Do not use confidential prompts, credentials, or arbitrary code in this demo.

## Limits

This is a demonstrator for one friend-hosted GPU. It has a local JSON store, no redundant queue, no SLA, no multi-provider routing, no proof that a GPU executed the task, and no dispute resolution. Move to a durable hosted queue and add provider authentication/monitoring before allowing general public workloads.
