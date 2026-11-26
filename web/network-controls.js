import { CONFIG } from './networks.js';
const badge = document.querySelector('.landing-network');
if (badge) badge.textContent = CONFIG.chainName;
const settlement = document.getElementById('me-root');
if (settlement) settlement.hidden = CONFIG.key !== 'me';
window.dispatchEvent(new Event('corpus-network-ready'));
