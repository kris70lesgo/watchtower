# Watchtower on Meta Earth

Watchtower supports ME inside the existing Next.js compute app at `/mint?network=me`. It uses the original ten-size catalogue, principal/buffer pricing, ERC-1155 ComputeToken and redemption events. Native MEC job settlement, provider receipt hashes, buyer acceptance, expiry refunds and signed-price verification appear on that same compute page. There is no separate ME application; old `/me` links redirect to `/mint?network=me`.

The original MIT-licensed corpus-monad project credits Julian Traversa and Alexandra. Their contract code, publisher identity, service infrastructure and historical Monad deployments are not claimed as newly authored HARBOR work. See `BASELINE.json` and `../docs/harbor-submission.md`.

## Run

```sh
npm ci
npm run dev
npm test
npm run typecheck
npm run build
npm start
```

Next.js reads the root `.env`; production output is `.next/`. See `../docs/next-migration.md` for source layout and migration details. The original corpus design, media, clients and contract source are retained.

## ME testnet deployment

1. Obtain a testnet-only wallet and test MEC from the Meta Earth team.
2. Configure the root `.env` using `.env.example`. Keep `ME_DEPLOYER_KEY` local/server-side. Do not send it in chat.
3. Run `npm run deploy:me`. It verifies documented ME testnet chain 400, compiles Paris-compatible bytecode, deploys the oracle, native MEC settlement contract, and original ComputeToken, then registers the unchanged ten-size catalogue.
4. By default, deployment creates a clearly labeled mock six-decimal USDC for testing and funds the deployer. Alternatively, set `ME_PAYMENT_TOKEN` to an existing six-decimal payment token on this testnet. Mock USDC is not real or bridged USDC.
5. Fill `NEXT_PUBLIC_ME_TOKEN`, `NEXT_PUBLIC_ME_USDC`, `NEXT_PUBLIC_ME_TREASURY`, `NEXT_PUBLIC_ME_MOCK_USDC`, `NEXT_PUBLIC_ME_ORACLE` and `NEXT_PUBLIC_ME_MARKET` from the deployment output.
6. Run `npm run preflight`, then rebuild/restart the app and test the full flow on ME.

Deployment transactions and addresses are saved incrementally under `harbor/deployments/`, including confirmed deployments if a later transaction fails. The deployment helper intentionally supports ME testnet only. It never reuses Monad addresses as ME deployments.

The official SDK documents testnet EVM defaults of chain ID 400 and `http://118.175.0.249:8545`. Confirm current availability with the organizers; configure an HTTPS EVM RPC for an HTTPS-hosted app. Do not disable browser mixed-content protections. The optional identity lookup uses the documented ME Hub REST host and path, but its live response remains to be verified.

## Configuration

| Variable | Purpose | Secret? |
| --- | --- | --- |
| `NEXT_PUBLIC_ME_CHAIN_ID` | Testnet EVM chain ID, default 400 | No |
| `NEXT_PUBLIC_ME_EVM_RPC` | Working EVM RPC; HTTPS when hosted | Public/browser-visible |
| `NEXT_PUBLIC_ME_TOKEN`, `NEXT_PUBLIC_ME_USDC`, `NEXT_PUBLIC_ME_TREASURY` | Core ME compute deployment | No |
| `NEXT_PUBLIC_ME_MARKET`, `NEXT_PUBLIC_ME_ORACLE` | Settlement and price oracle | No |
| `NEXT_PUBLIC_ME_MOCK_USDC` | `true` for the test mock | No |
| `NEXT_PUBLIC_ME_PUBLISHER` | Expected corpus signing address | No |
| `NEXT_PUBLIC_ME_REST` | Optional official ME Hub REST endpoint | No |
| `NEXT_PUBLIC_ME_EXPLORER` | Optional confirmed EVM explorer base URL | No |
| `NEXT_PUBLIC_PRIVY_APP_ID` | Optional override for preserved Privy email login | No |
| `ME_DEPLOYER_KEY` | Testnet deployment signer | Yes |
| `ME_PAYMENT_TOKEN` | Optional existing six-decimal testnet payment token | No |

Legacy `VITE_ME_*` values remain accepted during transition. No paid API key is required for token, wallet or signed-JSON verification. Fresh paid corpus feed data may require separate corpus access. There are no wired RunPod, DigitalOcean, Supabase, CoinGecko or LLM adapters yet; do not treat their keys as sufficient to enable provisioning.

## Settlement behavior and limits

- Providers publish finite-unit offers with immutable MEC price, specification hash and delivery window; they may pause new orders.
- Buyers escrow exact native MEC and an input hash. Only the provider records a nonzero receipt hash, once, before expiry.
- Only the buyer may accept before expiry. After expiry, any unaccepted order, including a delivered one, can be refunded by the buyer.
- Acceptance/refund credits are withdrawn separately with reentrancy protection. Buyer acceptance in the UI checks the original receipt against the recorded hash.
- The optional **Run local CPU reference job** button computes 4,096 sequential SHA-256 rounds over the buyer's request and creates a receipt bound to its on-chain request hash. The buyer can recompute the output before accepting. This demonstrates the receipt flow only; it is local CPU work and does not run an AI model, GPU job, or remote provider.
- Receipts are provider claims, not proof of computation. The actual output and original receipt must be exchanged off-chain. Providers risk nonpayment if a buyer refuses acceptance; dispute resolution is not implemented.
- The independent corpus oracle verifies its existing publisher domain/signatures. The included 1 October 2026 fixture is historical. Its USD price is not a MEC exchange rate and does not set MEC order prices.
- ME ID is a public lookup, not wallet-control proof, advanced-KYC attestation, or an escrow access gate.
- Export contains confirmed transactions from the browser session; local-chain evidence is labeled as local and does not prove ME execution.

Moving the original ownership token to ME does not migrate the external corpus provisioner or Morpho/Aave yield adapters. Automatic provisioning, job revenue, yield execution and commercial dispute handling remain unfinished. Existing Privy email minting remains Monad-only; ME currently uses an injected wallet.

## References

- [HARBOR event](https://www.mec.me/en-US/hackathon/harbor)
- [Official HARBOR requirements](https://www.mec.me/en-US/developer-blog/harbor-2026-a-total-prize-pool-of-100-000-usdt-build-the-nex)
- [Official ME SDK](https://github.com/openmetaearth/meta-earth-js-sdk)
- [ME developer network details](https://github.com/openmetaearth/me-docs/blob/main/docs/getting-started-for-developers/network-details.md)
- [ME developer guide and REST endpoint](https://github.com/openmetaearth/me-docs/blob/main/docs/development-guides/for-developers.md)

Actual checks and outstanding live verification are recorded in `VALIDATION.md`.
