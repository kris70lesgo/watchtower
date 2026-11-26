import { Contract } from 'ethers';
import { readConfig, connectRpc, json } from '../shared.mjs';
import { compile } from './compile.mjs';
const config = readConfig(process.env);
let provider;
try {
  provider = await connectRpc(config);
  const artifacts = compile();
  const report = { chainId: config.chainId, block: await provider.getBlockNumber(), contracts: {} };
  for (const [name, address] of [['MEComputeMarket', config.market], ['FixingOracle', config.oracle]]) {
    if (!address) throw new Error(`${name} address missing; deploy first`);
    if (await provider.getCode(address) === '0x') throw new Error(`${name} has no bytecode on this chain`);
    const contract = new Contract(address, artifacts[name].abi, provider);
    report.contracts[name] = name === 'MEComputeMarket' ? { address, offers: await contract.offerCount(), orders: await contract.orderCount() } : { address, publisher: await contract.publisher() };
  }
  if (report.contracts.FixingOracle.publisher.toLowerCase() !== config.publisher.toLowerCase()) throw new Error('Oracle publisher does not match configuration');
  if (!config.token || !config.usdc) throw new Error('Core compute token/payment addresses are missing');
  if (await provider.getCode(config.token) === '0x') throw new Error('Core compute token has no bytecode');
  const token = new Contract(config.token, artifacts.ComputeToken.abi, provider);
  if ((await token.usdc()).toLowerCase() !== config.usdc.toLowerCase()) throw new Error('Compute token payment asset does not match configuration');
  report.contracts.ComputeToken = { address: config.token, types: await token.typeCount(), treasury: await token.treasury() };
  console.log(json(report));
} catch (error) { console.error(`Preflight failed: ${error.message}`); process.exitCode = 1; }
finally { provider?.destroy(); }
