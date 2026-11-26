# Validation record

Completed locally on 25 November 2026 (IST), Node 24.13.0.

## Passed

- `npm run typecheck`: passed with strict TypeScript configuration for the App Router and React components.
- `npm test`: **27 passed, 0 failed**. In-process EVM tests cover the original compute-token catalogue, principal/buffer prices, approved-USDC minting, ownership transfer, redemption account-reference events, native MEC escrow, access control, accounting, refunds, failed withdrawals and reentrancy, historical publisher signature verification, and a CPU-reference receipt verified and settled through escrow. Configuration tests cover network isolation, Next environment names, backwards compatibility and exclusion of private credentials from public configuration.
- `npm run build`: passed on **Next.js 16.4.6 / React 19.2.8**, using webpack, after the CPU-reference update. The original contracts compile with solc 0.8.28 targeting Paris. Next prerendered `/`, `/mint`, and its not-found route, and built `/privy` as a route handler. Production output is `.next/` and Vercel is configured for Next.js.
- Original contract hashes in `BASELINE.json` match. The original four media assets match the copied public files. Dependency lockfile matches the active Next dependencies.
- `.env` public variable names were migrated to `NEXT_PUBLIC_ME_*` with values retained; private deployment fields keep their server-only names.

## Not verified here

- The updated `/mint?network=me` page and CPU-reference controls rendered in a local Next.js development browser; refreshing the HARBOR panel connected to the configured RPC and showed chain ID 400. That page had no deployed ME contract addresses, so no wallet transaction was attempted there. Injected-wallet transactions and live Privy authentication remain unverified. The full production build was run in an isolated temporary copy to avoid disturbing the existing localhost server.
- Live ME RPC calls, public deployment, actual ME transactions or public ME ID responses. These still require working external connectivity, configured contracts and a funded testnet wallet.
- External machine provisioning, RunPod, DigitalOcean, Supabase, job routing or ME treasury yield execution. A framework migration does not implement those unfinished services.
- A native Next/Privy SDK rewrite. The existing built Privy client is retained behind the Next `/privy` route, with its original Monad behavior and source intact. ME minting uses an injected wallet.
- The inherited Foundry test runner. Foundry is absent and its supplied library directories were empty; the new runner compiles and executes the original ComputeToken using the installed OpenZeppelin dependency.

Passing local tests does not establish HARBOR eligibility. A core feature still needs to execute on ME Network with actual contract addresses and transaction evidence before submission.
