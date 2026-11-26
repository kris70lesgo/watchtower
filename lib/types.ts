import type { Eip1193Provider } from 'ethers';
export type NetworkKey = 'monad' | 'me';
export type NetworkConfig = {
  key: NetworkKey; chainId: number; chainName: string; rpc: string;
  nativeSymbol: string; mockUsdc: boolean; token: string; usdc: string;
  oracle: string; treasury: string; explorer: string; publisher: string;
  feed: string; repo: string; vault?: string; mainnetExplorer?: string;
  kuruMarket?: string; market?: string; rest?: string; txs: Record<string, string>;
};
export type Networks = Record<NetworkKey, NetworkConfig>;
export type InjectedWallet = Eip1193Provider & {
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, listener: (...args: unknown[]) => void) => void;
};
declare global { interface Window { ethereum?: InjectedWallet } }
