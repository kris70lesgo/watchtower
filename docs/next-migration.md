# Watchtower app migration

The root application uses Next.js 16.4.6 App Router, React 19.2.8, TypeScript and ethers. Vite is no longer the root development or build framework. Contract source and existing deployed addresses are unchanged.

## Commands

Node 22.12+; Node 24 was used for verification.

```sh
npm ci
npm run dev
# Production:
npm run build
npm start
# Checks:
npm run typecheck
npm test
```

`predev` and `build` compile contract artifacts and prepare the preserved design templates/assets. `npm run prepare:app` runs that preparation explicitly if needed before a standalone type check. A normal Next build emits `.next/`; there is no static `dist/` deployment override. Vercel uses its Next.js framework integration.

## Application structure

| Location | Responsibility |
| --- | --- |
| `app/layout.tsx` | Metadata, global styles, server-side allowlist of public network settings |
| `app/page.tsx`, `components/landing.tsx` | Original landing design and video intro, with cleaned-up animation listeners |
| `app/mint/page.tsx`, `components/mint.tsx` | React catalogue, wallet connection, exact USDC approval, mint and redeem |
| `components/network-provider.tsx` | Shared Monad/ME selection and transaction-busy state |
| `components/compute-tools.tsx` | ME settlement/price/identity tools in the existing compute page |
| `harbor/main.mjs` | Preserved settlement behavior, now explicitly mounted/disposed by React |
| `app/privy/route.ts` | Serves the preserved complete Privy login document through the Next server |
| `public/` | Original media, icons, brand assets and Privy client bundles |
| `lib/public-config.mjs` | Explicit public configuration; deployment/provider credentials are not serialized |
| `app/globals.css` | Editable global styles, initialized from the original corpus design |
| `web/`, `privy/src/` | Retained original sources and design reference |

The catalogue and mint/redeem page are React components, not embedded HTML documents or iframes. The landing's static content and the settlement form markup are trusted local templates retained to preserve design and behavior; they are not user-supplied HTML. `lib/generated/templates.ts` is regenerated from the retained source templates by preparation. Global CSS and existing public assets are not overwritten on each build.

The existing Privy bundle is deliberately retained without combining a framework migration with an authentication SDK upgrade. It is served as a complete document at `/privy` on the same Next origin, with its bundled assets under `/privy/assets/`. Existing Privy email minting remains Monad-only. Native App Router integration of a newer Privy SDK is separate future work, not claimed as completed here. `NEXT_PUBLIC_PRIVY_APP_ID` can override the original public app ID at build time; no Privy app secret is required by this browser client.

## Environment

The root `.env` was migrated without printing its contents. Existing values were retained, with an ignored `.env.pre-next.backup` made before renaming.

- Public ME variables now use `NEXT_PUBLIC_ME_*` instead of `VITE_ME_*`: chain ID, EVM RPC, token, USDC, treasury, market, oracle, publisher, REST, explorer and mock-USDC flag.
- Existing legacy `VITE_ME_*` configuration is still accepted by the deployment helpers and public-config allowlist during transition. The new names take precedence.
- `ME_DEPLOYER_KEY`, `ME_PAYMENT_TOKEN` and existing server/CLI credentials keep their names. Never give a private key, cloud provider key or service-role key a `NEXT_PUBLIC_` prefix.
- Contract addresses are filled after an actual ME deployment; no old Monad contract address is substituted for an undeployed ME contract.
- Browser RPC URLs are public configuration and require HTTPS on an HTTPS deployment.

## Local EVM demonstration

```sh
npm run demo:local
# Second terminal, after the first prints its deployment:
npm run dev:demo
```

Open `/mint?network=me`. `dev:demo` explicitly loads `.env.demo.local` before launching Next; it does not use Vite's old `--mode` option. The local chain funds ephemeral development accounts with mock USDC. Never use its printed development keys on a public chain. If the host blocks listening ports, the in-process contract tests can still run.

## Product boundaries and validation

This migration adds no RunPod, DigitalOcean, Supabase, live machine provisioner, job router or ME treasury yield adapter. The existing wallet, catalogue, ownership and payment flows are preserved; missing backend services remain missing. See `harbor/VALIDATION.md` for the actual verification record and live-test limitations.
