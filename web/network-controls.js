import { CONFIG, NETWORKS, selectNetwork } from './networks.js';
const nav = document.querySelector('.nav-in');
if (nav) {
  const label = document.createElement('label'); label.className = 'network-select'; label.textContent = 'Network ';
  const select = document.createElement('select'); select.setAttribute('aria-label', 'Compute network');
  for (const [key, network] of Object.entries(NETWORKS)) { const option = document.createElement('option'); option.value = key; option.textContent = network.chainName; select.append(option); }
  select.value = CONFIG.key; select.onchange = () => selectNetwork(select.value); label.append(select); nav.append(label);
}
const badge = document.querySelector('.brand .on, .brand small');
if (badge && CONFIG.key === 'me') badge.textContent = 'on Meta Earth';
const settlement = document.getElementById('me-root');
if (settlement) settlement.hidden = CONFIG.key !== 'me';
window.dispatchEvent(new Event('corpus-network-ready'));
