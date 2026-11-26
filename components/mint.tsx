'use client';
import { useEffect, useRef, useState } from 'react';
import { BrowserProvider, Contract, JsonRpcProvider, formatUnits, getAddress, id, type JsonRpcSigner } from 'ethers';
import { useNetwork } from './network-provider';
import { ComputeTools } from './compute-tools';
import artifact from '@/harbor/generated/ComputeToken.json';
import { CATALOG, underwriting } from '@/harbor/catalog.mjs';
type Size = { id: number; slug: string; label: string; monthly: bigint; principal: bigint; price: bigint; active: boolean; supply: bigint; held: bigint };
const catalogue = (): Size[] => CATALOG.map(([slug, label, cents], index) => ({ id: index, slug: String(slug), label: String(label), ...underwriting(cents), active: false, supply: 0n, held: 0n }));
const erc20 = ['function allowance(address,address) view returns(uint256)', 'function approve(address,uint256) returns(bool)', 'function balanceOf(address) view returns(uint256)'];
const money = (value: bigint) => '$' + Number(formatUnits(value, 6)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function quantity(text: string) { const value = Number(text); if (!Number.isSafeInteger(value) || value < 1 || value > 10000) throw new Error('Enter a whole quantity from 1 to 10,000.'); return BigInt(value); }
function message(error: unknown) { return error instanceof Error ? ('shortMessage' in error ? String(error.shortMessage) : error.message) : String(error); }
export function Mint() {
  const { network, ready, busy, setBusy } = useNetwork();
  const [sizes, setSizes] = useState<Size[]>(catalogue), [selected, setSelected] = useState(2), [redeemId, setRedeemId] = useState(2);
  const [qty, setQty] = useState('1'), [redeemQty, setRedeemQty] = useState('1'), [accountRef, setAccountRef] = useState('');
  const [account, setAccount] = useState(''), [status, setStatus] = useState('Connect a wallet to mint compute.'), [revision, refresh] = useState(0), [txHash, setTxHash] = useState('');
  const wallet = useRef<BrowserProvider | null>(null), signer = useRef<JsonRpcSigner | null>(null);
  const tokenAddress = ready ? new URLSearchParams(window.location.search).get('token') || network.token : network.token;
  useEffect(() => {
    signer.current = null; wallet.current?.destroy(); wallet.current = null; setAccount(''); setTxHash('');
    setStatus(`Connect a wallet on ${network.chainName} to mint compute.`);
  }, [network]);
  useEffect(() => {
    const reset = () => { signer.current = null; wallet.current?.destroy(); wallet.current = null; setAccount(''); setStatus('Wallet account or network changed. Reconnect before continuing.'); refresh(n => n + 1); };
    window.ethereum?.on?.('accountsChanged', reset); window.ethereum?.on?.('chainChanged', reset);
    return () => { window.ethereum?.removeListener?.('accountsChanged', reset); window.ethereum?.removeListener?.('chainChanged', reset); wallet.current?.destroy(); };
  }, []);
  useEffect(() => { if (ready) { const value = new URLSearchParams(location.search).get('acct'); if (value) setAccountRef(value); } }, [ready]);
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    setSizes(catalogue());
    if (!tokenAddress) { setStatus(`ComputeToken is not deployed on ${network.chainName}. Catalogue prices are shown; purchases are disabled.`); return; }
    const provider = new JsonRpcProvider(network.rpc, undefined, { batchMaxCount: 1 });
    async function load() {
      if (location.protocol === 'https:' && !network.rpc.startsWith('https:')) throw new Error('An HTTPS RPC is required for this hosted page.');
      getAddress(tokenAddress);
      if ((await provider.getNetwork()).chainId !== BigInt(network.chainId)) throw new Error('RPC chain ID does not match the selected network.');
      if (await provider.getCode(tokenAddress) === '0x') throw new Error('No ComputeToken contract at the configured address.');
      const token = new Contract(tokenAddress, artifact.abi, provider);
      const count = Number(await token.typeCount());
      if (count > 1000) throw new Error('Unexpected catalogue size.');
      const result: Size[] = [];
      for (let index = 0; index < count; index++) {
        if (cancelled) return;
        const type = await token.types(index);
        await new Promise(resolve => setTimeout(resolve, 75));
        const supply = await token['totalSupply(uint256)'](index);
        await new Promise(resolve => setTimeout(resolve, 75));
        const held = account ? await token.balanceOf(account, index) : 0n;
        if (account) await new Promise(resolve => setTimeout(resolve, 75));
        result.push({ id: index, slug: type[0], label: type[1], monthly: type[2], principal: type[3], price: type[4], active: type[5], supply, held });
      }
      if (!cancelled) setSizes(result);
    }
    void load().catch(error => { if (!cancelled) setStatus(`Unable to load compute: ${message(error)}`); });
    return () => { cancelled = true; provider.destroy(); };
  }, [network, ready, tokenAddress, account, revision]);
  async function connect() {
    try {
      if (!window.ethereum) throw new Error('Install an EVM wallet or use the email sign-in page.');
      await window.ethereum.request({ method: 'eth_requestAccounts' });
      const chainId = `0x${network.chainId.toString(16)}`;
      try { await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId }] }); }
      catch (error) {
        if (Number((error as { code?: number }).code) !== 4902) throw error;
        await window.ethereum.request({ method: 'wallet_addEthereumChain', params: [{ chainId, chainName: network.chainName, nativeCurrency: { name: network.nativeSymbol, symbol: network.nativeSymbol, decimals: 18 }, rpcUrls: [network.rpc], ...(network.explorer ? { blockExplorerUrls: [network.explorer] } : {}) }] });
        await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId }] });
      }
      wallet.current?.destroy(); wallet.current = new BrowserProvider(window.ethereum);
      signer.current = await wallet.current.getSigner(); setAccount(await signer.current.getAddress()); setStatus(`Connected on ${network.chainName}.`);
    } catch (error) { setStatus(message(error)); }
  }
  async function currentSigner() {
    if (!signer.current || !window.ethereum) throw new Error('Connect your wallet first.');
    const chain = await window.ethereum.request({ method: 'eth_chainId' });
    if (BigInt(String(chain)) !== BigInt(network.chainId)) throw new Error('Reconnect to the selected network.');
    return signer.current;
  }
  async function run(action: () => Promise<void>) {
    if (busy) return; setBusy(true); setTxHash('');
    try { await action(); refresh(n => n + 1); } catch (error) { setStatus(message(error)); }
    finally { setBusy(false); }
  }
  async function mint() {
    const selectedType = sizes.find(type => type.id === selected);
    if (!selectedType?.active) throw new Error('This machine size is not available for minting.');
    const count = quantity(qty), cost = selectedType.price * count, sender = await currentSigner();
    const token = new Contract(tokenAddress, artifact.abi, sender);
    const usdc = new Contract(await token.usdc(), erc20, sender);
    if (await usdc.balanceOf(account) < cost) throw new Error(`Insufficient USDC. This mint costs ${money(cost)} on ${network.chainName}.`);
    if (await usdc.allowance(account, tokenAddress) < cost) { setStatus('Approve the exact USDC payment in your wallet.'); const approval = await usdc.approve(tokenAddress, cost); await approval.wait(); }
    setStatus('Confirm the compute-token mint in your wallet.');
    const tx = await token.mint(selected, count); setTxHash(tx.hash); setStatus('Mint submitted; waiting for confirmation.'); const receipt = await tx.wait();
    if (receipt.status !== 1) throw new Error('Mint reverted.');
    setStatus(`Minted ${count} × ${selectedType.label} for ${money(cost)}. The token is in your wallet; principal and buffer were paid to the treasury.`);
  }
  async function redeem() {
    const selectedType = sizes.find(type => type.id === redeemId), count = quantity(redeemQty);
    if (!accountRef.trim()) throw new Error('Enter the corpus account reference.');
    if (!selectedType || selectedType.held < count) throw new Error('You do not hold enough tokens of this size.');
    const sender = await currentSigner(), token = new Contract(tokenAddress, artifact.abi, sender);
    setStatus('Confirm redemption in your wallet.');
    const tx = await token.redeem(redeemId, count, id(accountRef.trim())); setTxHash(tx.hash); const receipt = await tx.wait();
    if (receipt.status !== 1) throw new Error('Redemption reverted.');
    setStatus(`Redeemed ${count} × ${selectedType.label}. The account-reference event is recorded. Provisioning still depends on the corpus backend.`);
  }
  let total = '—'; try { const selectedType = sizes.find(type => type.id === selected); if (selectedType) total = money(selectedType.price * quantity(qty)); } catch {}
  return <>
    <section className="hero mint-hero"><div className="wrap mint-hero-grid"><div className="mint-hero-copy"><p className="eyebrow">Watchtower market <span>·</span> {network.key === 'me' ? 'Meta Earth' : 'Monad'}</p><h1>A machine,<br/><em>as a token.</em></h1><p className="hero-lead">{network.key === 'me' ? network.market ? 'The native-MEC escrow market is deployed on Meta Earth testnet. The compute catalogue uses test-only mock USDC; it is separate from MEC settlement.' : 'Preview the native-MEC escrow path and compute catalogue. Meta Earth contracts are prepared for testnet but not yet deployed.' : 'Own a transferable corpus compute claim. Mint with USDC, hold or transfer the ERC-1155 position, then redeem to a corpus account reference.'}</p></div><aside className="mint-network-card" aria-label="Selected network status"><span className="app-label">Selected network</span><strong>{network.chainName}</strong><span className="network-chain">CHAIN {network.chainId} <i aria-hidden="true"/> TESTNET</span><div className="network-divider"/><span className={`network-state${tokenAddress ? ' is-ready' : ''}`}><i aria-hidden="true"/>{tokenAddress ? 'Token contract configured' : 'Deployment pending'}</span><small>{tokenAddress ? 'Read-only catalogue and wallet actions available where enabled.' : 'Catalogue quotes are visible. On-chain purchases remain disabled.'}</small></aside></div></section>
    <section className="wrap mint-content" style={{ paddingBottom: 'clamp(64px,9vw,120px)' }}>
      <div className="strip-card account-strip" style={{ marginBottom: 20 }}><div className="strip-bar"><span className="wallet"><span className={`dot${account ? ' on' : ''}`}/><span>{account ? `${account.slice(0, 6)}…${account.slice(-4)}` : 'Wallet disconnected'}</span></span><span className="row"><span>{network.chainName} · chain {network.chainId}</span><button className="btn sm" disabled={!ready || busy} onClick={() => void connect()}>{account ? 'Reconnect wallet' : 'Connect wallet'}</button></span></div></div>
      <div className="mint-grid"><div className="panel catalogue-panel"><div className="panel-heading"><div><span className="app-label">01 / Catalogue</span><h3>Choose a machine size</h3></div><span className="catalogue-count">{sizes.length} sizes</span></div><p>Catalogue pricing records principal plus buffer. Assumed annual yield: 7.24%; buffer factor: 1.15. Actual yield is not guaranteed.</p>
        <div className="tbl-wrap" style={{ marginTop: 16, borderRadius: 12 }}><table><thead><tr><th>Size</th><th className="num">Monthly bill</th><th className="num">Price, once</th><th className="num">Outstanding</th><th className="num">You hold</th></tr></thead><tbody>{sizes.map(type => <tr key={type.id} className={selected === type.id ? 'mint-row-selected' : ''}><td><button className="catalogue-select" onClick={() => { setSelected(type.id); setRedeemId(type.id); }}>{type.label}</button><div className="addr">{type.slug} · permanent</div></td><td className="num">{money(type.monthly)}</td><td className="num">{money(type.price)}<div className="addr">principal {money(type.principal)}</div></td><td className="num">{type.active ? String(type.supply) : '—'}</td><td className="num">{String(type.held)}</td></tr>)}</tbody></table></div>
        <p className="note">{tokenAddress ? <>ComputeToken: <span className="mono">{tokenAddress}</span>. {network.mockUsdc ? 'Test-only mock USDC; no real monetary value.' : 'Uses the configured six-decimal payment token.'}</> : 'Deployment pending. These are catalogue quotes; minting is disabled.'}</p>
      </div><div className="mint-forms"><div className="panel mint-form-panel"><div className="panel-heading"><div><span className="app-label">02 / Mint</span><h3>Acquire a position</h3></div><span className="form-index">01</span></div><p>Approve USDC, then mint the original corpus compute token.</p><div className="field"><label htmlFor="mint-size">Size</label><select id="mint-size" value={selected} onChange={event => setSelected(Number(event.target.value))}>{sizes.map(type => <option key={type.id} value={type.id}>{type.label} · {money(type.price)}</option>)}</select></div><div className="field"><label htmlFor="mint-qty">Quantity</label><input id="mint-qty" type="number" min="1" step="1" value={qty} onChange={event => setQty(event.target.value)}/></div><div className="total"><span>Total in USDC</span><b>{total}</b></div><div className="actions"><button className="btn" disabled={!account || busy || !sizes.find(type => type.id === selected)?.active} onClick={() => void run(mint)}>Mint position <span aria-hidden="true">↗</span></button></div></div>
        <div className="panel redeem-panel"><div className="panel-heading"><div><span className="app-label">03 / Redeem</span><h3>Close a position</h3></div><span className="form-index">02</span></div><p>Burn your compute claim with the corpus account reference from your machine’s funding tab.</p><div className="field"><label htmlFor="redeem-size">Size</label><select id="redeem-size" value={redeemId} onChange={event => setRedeemId(Number(event.target.value))}>{sizes.map(type => <option key={type.id} value={type.id}>{type.label}</option>)}</select></div><div className="field"><label htmlFor="redeem-qty">Quantity</label><input id="redeem-qty" type="number" min="1" step="1" value={redeemQty} onChange={event => setRedeemQty(event.target.value)}/></div><div className="field"><label htmlFor="corpus-account">corpus account reference</label><input id="corpus-account" value={accountRef} onChange={event => setAccountRef(event.target.value)} placeholder="corpus:<account id>"/></div><div className="actions"><button className="btn ghost" disabled={!account || busy || !tokenAddress} onClick={() => void run(redeem)}>Redeem compute <span aria-hidden="true">↗</span></button></div></div>
      </div></div><div className="log mint-log" role="status" aria-live="polite">{status}{txHash && <p>{network.explorer ? <a href={`${network.explorer}/tx/${txHash}`} target="_blank" rel="noreferrer">Transaction {txHash}</a> : <span className="mono">{txHash}</span>}</p>}</div>
      <div className="steps mint-steps" style={{ marginTop: 40 }}>{[['Pay once', 'Principal and buffer go to the configured treasury.'], ['Hold or transfer', 'The original ERC-1155 ownership token stays transferable.'], ['Redeem when ready', 'Burn the claim and record the corpus account reference on-chain.'], ['Backend integration', 'Automatic provisioning, job revenue and an ME yield adapter still require backend integration.']].map(([title, text], index) => <div className="step" key={title}><div className="step-n">[ 0{index + 1} ]</div><h3>{title}</h3><p>{text}</p></div>)}</div>
    </section>{ready && network.key === 'me' && <ComputeTools network={network}/>}
  </>;
}
