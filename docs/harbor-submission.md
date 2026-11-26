# Watchtower HARBOR submission preparation

## Project description

Watchtower adds ME as a supported network alongside the inherited corpus compute product at `/mint?network=me`, with the same machine catalogue, ComputeToken contract, principal/buffer pricing, transferability and redemption flow. The existing corpus homepage, compute-token mint, Privy sign-in, price-feed clients, and treasury integration remain in place. In the ME module, a buyer escrows native MEC against an agreed workload. The provider records a delivery receipt hash. The buyer confirms delivery to release payment, or reclaims unaccepted funds after the deadline. A separate signed-price oracle lets users verify and relay corpusAI compute index fixings onto ME, preserving the publisher signature and the date of each record.

Intended primary track: AI and Trust Infrastructure. Native MEC is used directly for compute-order settlement and refunds, not only gas. The proof is the deployed `MEComputeMarket` and its `Ordered`, `Delivered`, `Accepted`, `Refunded`, and `Withdrawn` events on ME Network. This proof must be supplied after an actual ME deployment; local tests alone are insufficient.

## Inherited foundation and new work

The supplied folder contains the MIT-licensed corpus-monad project, credited by its README to Julian Traversa and Alexandra, with historical Monad contracts, UI, pricing integrations, USDC payments, and treasury scripts. Those materials predate this HARBOR work. The inherited README also describes external corpus production services that are not implemented in this folder. The HARBOR submission must not claim original authorship of inherited code or ownership/operation of those services.

`harbor/BASELINE.json` records SHA-256 hashes of inherited source and documentation before modification. The provided folder had no Git metadata, so there are no verifiable historical commits here. Use an actual repository and new commit history for the submission; do not fabricate dates or authorship. Confirm the organizers' restriction on duplicate regional entries if the project was entered in another concurrent Meta Earth competition.

New work:

- `src/MEComputeMarket.sol`: native MEC order escrow, provider receipts, buyer acceptance, timeout refunds, pull withdrawals, independent-provider offers.
- `harbor/`: new HARBOR UI, ME chain validation, wallet flow, oracle relay, optional ME ID REST lookup, session evidence export.
- `harbor/scripts/`: Paris EVM compilation, ME testnet deployment with saved transaction evidence, RPC preflight, and keyless local demonstration.
- `harbor/test/`: contract lifecycle, authorization, accounting, refund, and signed-price integration tests on an in-process EVM.
- Root package/lock/config and this submission guide: reproducible development and static deployment.

The existing `FixingOracle.sol` is compiled and reused, with its attribution retained. It is not claimed as new work. The historical example signature is reused as a public test vector.

## Demo script (3–5 minutes)

1. Explain the problem: compute buyers need payment held until they can check delivery. Show the configured ME network, contract addresses, and provider/buyer roles.
2. As a provider, publish an offer with a specification, finite units, MEC price, and a delivery window.
3. Switch to a separate buyer wallet. Inspect the offer, agree to its specification, and place an order. Show the confirmed ME transaction and escrow balance.
4. As the provider, use **Run local CPU reference job** to compute 4,096 sequential SHA-256 rounds over the agreed request and create a receipt bound to the order hash. Explain that this is a local reference workload, not GPU provisioning or proof of GPU execution. Record the receipt hash on ME and exchange the receipt off-chain.
5. As the buyer, check the receipt hash and independently recompute the reference output, then accept it. As the provider, withdraw the MEC credit. Show settlement transactions and balances.
6. Demonstrate a second order with a short delivery window: after expiry, the buyer refunds and withdraws. Do not speed up or fake ME time; pre-stage this order if needed.
7. Load the clearly labeled historical price fixture, verify its signature, relay it to the ME oracle, and read back its date and value. Tamper with the value to show signature rejection.
8. If the official REST endpoint is configured, inspect a public ME sub-account record. Explain the lookup's limitations.
9. Export session evidence; show actual ME transaction records. End with the boundaries: no live GPU provisioner, no yield, manual fulfillment, and provider exposure to buyer refusal.

Use English narration or English subtitles. Screen capture is sufficient for this draft script; verify the current event portal's final video rules before recording.

## Required before submission

- Team of 2–5 members; all members complete advanced ME ID verification.
- Registration due **27 November 2026, 15:59 UTC / 21:29 IST**.
- Project submission due **21 December 2026, 15:59 UTC / 21:29 IST**.
- Confirm a working official ME EVM endpoint and use a funded testnet-only account.
- Run `npm test`, `npm run build`, actual ME deployment, and `npm run preflight`.
- Complete the purchase → deliver → accept → withdraw and expired-order refund flows on ME.
- Provide a repository URL, final commit, dependencies and startup steps, plus attribution and a clear statement of incremental work.
- Provide deployed ME contract addresses and actual transaction hashes. Include `harbor/deployments/me-*.json` and exported browser-session evidence.
- Provide an accessible demo URL and 3–5 minute video.
- A private repository is allowed if the judges receive access.

The event's official article states that at least one core feature must actually run on ME Network and only incremental work on existing projects is evaluated. Read the current event page before submitting.

## Deployment and access fields

Fill these after live verification; blank values are intentional:

| Item | Value |
| --- | --- |
| Team name and members | Pending |
| Repository URL and final commit | Pending |
| Demo URL | Pending |
| ME chain ID and RPC verification | Pending |
| MEComputeMarket address and deployment transaction | Pending |
| FixingOracle address and deployment transaction | Pending |
| ME purchase, delivery, acceptance and withdrawal transactions | Pending |
| ME refund and refund withdrawal transactions | Pending |
| ME oracle relay transaction | Pending |
| Video URL | Pending |

Sources: [official HARBOR requirements](https://www.mec.me/en-US/developer-blog/harbor-2026-a-total-prize-pool-of-100-000-usdt-build-the-nex), [event portal](https://www.mec.me/en-US/hackathon/harbor), [official SDK](https://github.com/openmetaearth/meta-earth-js-sdk).

## Core integration revision

The separate `/me/` application is no longer deployed. A shared network selector connects the existing core compute catalogue and mint/redeem controls to ME deployments, and job payments, receipts and price verification are embedded in the same compute page with corpus styling. The ME deployment now also deploys the original ComputeToken and registers all ten existing catalogue sizes. A six-decimal mock payment token is clearly labeled for testnet, or an explicit existing testnet payment token may be configured. ME minting and redemption do not, by themselves, migrate external provisioning or treasury yield adapters. Existing Privy email minting remains Monad-only.

## Next.js migration

The core application now uses Next.js App Router with React and TypeScript. The catalogue/mint/redeem page is a React component, the shared network selector preserves Monad and ME configuration, and payment/verification tools stay inside `/mint`. The original contract source and media are retained. Next serves the existing Privy login document at `/privy` during the framework migration; no SDK upgrade or ME email-wallet support is claimed. Deployment uses Next.js's normal Vercel integration, not a static `dist/` output. Public configuration is named `NEXT_PUBLIC_ME_*`; deployment keys remain server-side. See `next-migration.md` and `../harbor/VALIDATION.md` for the architecture and actual checks.
