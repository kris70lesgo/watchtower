import fs from 'node:fs';
import path from 'node:path';
import ganache from 'ganache';
import { BrowserProvider, ContractFactory, id, parseEther } from 'ethers';
import { compile, root } from './compile.mjs';
import { PUBLISHER } from '../shared.mjs';
import { deployCore } from './deploy-core.mjs';
// Ephemeral development wallets only. Never import these accounts on a public network.
const server = ganache.server({ logging: { quiet: true }, chain: { chainId: 31337 }, wallet: { totalAccounts: 3 } });
try {
  const port = Number(process.env.LOCAL_RPC_PORT || 18545);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('LOCAL_RPC_PORT must be between 1024 and 65535');
  await server.listen(port, '127.0.0.1');
  const provider = new BrowserProvider(server.provider, undefined, { pollingInterval: 100 });
  const signer = await provider.getSigner(0), artifacts = compile();
  const contracts = {};
  for (const [name, args] of [['FixingOracle', [PUBLISHER]], ['MEComputeMarket', []]]) {
    const contract = await new ContractFactory(artifacts[name].abi, artifacts[name].bytecode, signer).deploy(...args); await contract.waitForDeployment(); contracts[name] = contract;
  }
  await (await contracts.MEComputeMarket.createOffer(id('Local demo compute unit; manual delivery'), parseEther('0.01'), 3600)).wait();
  const core = await deployCore({ signer, artifacts, chainId: 31337, fund: Object.keys(server.provider.getInitialAccounts()) });
  // A mode-specific environment file so a local demo cannot overwrite ME settings.
  const content = `NEXT_PUBLIC_ME_CHAIN_ID=31337\nNEXT_PUBLIC_ME_EVM_RPC=http://127.0.0.1:${port}\nNEXT_PUBLIC_ME_MARKET=${await contracts.MEComputeMarket.getAddress()}\nNEXT_PUBLIC_ME_ORACLE=${await contracts.FixingOracle.getAddress()}\nNEXT_PUBLIC_ME_PUBLISHER=${PUBLISHER}\n`;
  fs.writeFileSync(path.join(root, '.env.demo.local'), content + `NEXT_PUBLIC_ME_TOKEN=${await core.token.getAddress()}\nNEXT_PUBLIC_ME_USDC=${await core.usdc.getAddress()}\nNEXT_PUBLIC_ME_TREASURY=${core.treasury}\nNEXT_PUBLIC_ME_MOCK_USDC=true\n`);
  console.log('Local chain ready. Run npm run dev:demo and open /mint?network=me. The original machine catalogue is funded with mock USDC for each development account.');
  console.log('Ephemeral LOCAL wallets (never use on any public network):');
  for (const [address, entry] of Object.entries(server.provider.getInitialAccounts())) console.log(`${address} ${entry.secretKey}`);
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { provider.destroy(); await server.close(); process.exit(0); });
} catch (error) { console.error(`Local chain failed: ${error.message}`); await server.close().catch(() => {}); process.exitCode = 1; }
