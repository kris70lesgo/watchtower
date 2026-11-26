import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { computeToolsHtml } from '../harbor/scripts/compute-tools.mjs';
import nextEnv from '@next/env';
const { loadEnvConfig } = nextEnv;
const root = fileURLToPath(new URL('../', import.meta.url)), web = path.join(root, 'web');
const landing = fs.readFileSync(path.join(web, 'index.html'), 'utf8');
const mint = fs.readFileSync(path.join(web, 'mint.html'), 'utf8');
loadEnvConfig(root, !process.argv.includes('--production'));
const privy = fs.readFileSync(path.join(web, 'privy/index.html'), 'utf8');
let body = landing.match(/<body>([\s\S]*?)<script type="module">/)?.[1];
assert.ok(body, 'Landing body missing');
body = body.replace(/<nav[\s\S]*?<\/nav>/, '');
const footer = mint.match(/<footer>[\s\S]*?<\/footer>/)?.[0];
assert.ok(footer, 'Original footer missing');
const css = landing.match(/<style>([\s\S]*?)<\/style>/)?.[1] || '';
let tools = computeToolsHtml().replace(/<script[\s\S]*?<\/script>/g, '').replace(/<link[^>]+>/g, '').replace(' hidden aria-label=', ' aria-label=');
fs.mkdirSync(path.join(root, 'lib/generated'), { recursive: true });
fs.writeFileSync(path.join(root, 'lib/generated/templates.ts'), `// Trusted local templates retained from the original corpus design. Never use for user HTML.\nexport const landingHtml = ${JSON.stringify(body)};\nexport const landingCss = ${JSON.stringify(css)};\nexport const footerHtml = ${JSON.stringify(footer)};\nexport const computeToolsMarkup = ${JSON.stringify(tools)};\nexport const privyHtml = ${JSON.stringify(privy)};\n`);
fs.mkdirSync(path.join(root, 'app'), { recursive: true });
const stylesheet = path.join(root, 'app/globals.css');
if (!fs.existsSync(stylesheet)) fs.writeFileSync(stylesheet, fs.readFileSync(path.join(web, 'site.css'), 'utf8') + '\n' + fs.readFileSync(path.join(web, 'compute-tools.css'), 'utf8') + '\n.mint-row-selected{background:var(--bg)}.mint-error{color:var(--red-text)}.catalogue-select{border:0;background:none;padding:0;color:inherit;text-align:left;font:inherit;cursor:pointer}.catalogue-select:focus-visible{outline:2px solid var(--green)}\n');
const publicDir = path.join(root, 'public'); fs.mkdirSync(publicDir, { recursive: true });
const files = ['favicon.ico', 'favicon.svg', 'watchtower-logo.svg', 'watchtower-mark.svg', 'apple-touch-icon.png', 'og.jpg', 'monad-mark.svg', 'media', 'brand', 'privy', 'site.css'];
for (const file of files) {
  const destination = path.join(publicDir, file);
  // Public assets and global styles become normal editable Next sources. Only
  // the preserved Privy bundle is regenerated to apply its optional public ID.
  if (file === 'privy' || ['favicon.svg', 'watchtower-logo.svg', 'watchtower-mark.svg'].includes(file) || !fs.existsSync(destination)) fs.cpSync(path.join(web, file), destination, { recursive: true });
}
// The old /privy/index.html would conflict with the Next route; keep its content
// as a private route-handler input and serve only its existing bundled assets.
fs.rmSync(path.join(publicDir, 'privy/index.html'), { force: true });
fs.rmSync(path.join(publicDir, 'privy-client.html'), { force: true });
const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
if (appId) {
  if (!/^[a-zA-Z0-9_-]+$/.test(appId)) throw new Error('Invalid public Privy app ID');
  const entry = privy.match(/src="(\/privy\/assets\/[^"]+\.js)"/)?.[1];
  if (!entry) throw new Error('Could not identify existing Privy entry bundle');
  const file = path.join(publicDir, entry);
  const bundle = fs.readFileSync(file, 'utf8');
  if (!bundle.includes('cmv7kjt1c02os0fjq04y06phx')) throw new Error('Privy app ID location changed; review client configuration');
  fs.writeFileSync(file, bundle.replaceAll('cmv7kjt1c02os0fjq04y06phx', appId));
}
console.log('Prepared original styling, media, trusted templates, and Privy client for Next.js.');
