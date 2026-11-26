// Same catalog and underwriting as script/Deploy.s.sol. No change to corpus's
// claim model: the original ERC-1155 still records principal, buffer and redemption.
export const CATALOG = [
  ['s1-256','shared-cpu-1x 256 MB',319], ['s1-512','shared-cpu-1x 512 MB',434],
  ['s1-1g','shared-cpu-1x 1 GB',570], ['s1-2g','shared-cpu-1x 2 GB',842],
  ['s2-2g','shared-cpu-2x 2 GB',1272], ['s4-4g','shared-cpu-4x 4 GB',2543],
  ['s8-8g','shared-cpu-8x 8 GB',5086], ['p1-2g','performance-1x 2 GB',3100],
  ['p2-4g','performance-2x 4 GB',6200], ['p4-8g','performance-4x 8 GB',12400],
];
export function underwriting(cents) {
  const annual = BigInt(cents) * 12n, round = (a, b) => (a + b / 2n) / b;
  return { monthly: BigInt(cents) * 10000n, principal: round(annual * 10000n, 724n) * 10000n, price: round(annual * 11500n, 724n) * 10000n };
}
export async function registerCatalog(token) {
  for (const [slug, label, cents] of CATALOG) {
    const { monthly, principal, price } = underwriting(cents);
    await (await token.registerType(slug, label, monthly, principal, price)).wait();
  }
}
