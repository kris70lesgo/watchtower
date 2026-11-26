import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
export function computeToolsHtml(script = '/compute-assets/compute-settlement.js') {
  const source = fs.readFileSync(fileURLToPath(new URL('../index.html', import.meta.url)), 'utf8');
  let content = source.slice(source.indexOf('<div class="notice"'), source.indexOf('</main>'));
  content = content.replace(/id="([^"]+)"/g, 'id="me-$1"').replace(/for="([^"]+)"/g, 'for="me-$1"').replace(/href="#([^"]+)"/g, 'href="#me-$1"');
  return `<section id="me-root" class="wrap compute-tools" hidden aria-label="Compute payment and verification tools">
    <link rel="stylesheet" href="/compute-tools.css">
    <div class="sec-head"><p class="eyebrow">Compute payment & verification</p><h2>Settle jobs. Verify prices.</h2><p class="lead">Additional payment options for corpus compute on the network selected above. Machine ownership and redemption remain in the catalogue.</p></div>
    <div class="strip-card"><div class="strip-bar"><span id="me-network">RPC not connected</span><span id="me-wallet">Wallet disconnected</span><button id="me-connect" class="btn sm">Connect for job payments</button></div></div>
    ${content}
  </section><script type="module" src="${script}"></script>`;
}
