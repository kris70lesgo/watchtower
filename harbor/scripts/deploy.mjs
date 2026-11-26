import fs from 'node:fs';
import path from 'node:path';
import { Wallet, NonceManager, ContractFactory, parseEther, id } from 'ethers';
import { readConfig, connectRpc, json } from '../shared.mjs';
import { compile, root } from './compile.mjs';
import { deployCore } from './deploy-core.mjs';
const config = readConfig(process.env);
let provider;
try {
  if (config.chainId !== 400) throw new Error('Deployment is restricted to documented ME testnet chain 400');
  if (!process.env.ME_DEPLOYER_KEY) throw new Error('Set ME_DEPLOYER_KEY locally in .env');
  provider = await connectRpc(config);
  const wallet = new Wallet(process.env.ME_DEPLOYER_KEY, provider);
  const signer = new NonceManager(wallet);
  if (await provider.getBalance(wallet.address) === 0n) throw new Error('Deployer needs testnet MEC for gas');
  const artifacts = compile();
  const evidence = { network: 'Meta Earth testnet', chainId: config.chainId, deployer: wallet.address, createdAt: new Date().toISOString(), contracts: {} };
  const destination = path.join(root, `harbor/deployments/me-${Date.now()}.json`);
  const save = () => { fs.mkdirSync(path.dirname(destination), { recursive: true }); fs.writeFileSync(destination, `${json(evidence)}\n`); };
  for (const [name, args] of [['FixingOracle', [config.publisher]], ['MEComputeMarket', []]]) {
    const contract = await new ContractFactory(artifacts[name].abi, artifacts[name].bytecode, signer).deploy(...args);
    await contract.waitForDeployment();
    evidence.contracts[name] = { address: await contract.getAddress(), transactionHash: contract.deploymentTransaction().hash };
    save(); // Retain already-confirmed deployments if a subsequent transaction fails.
    console.log(`${name}: ${evidence.contracts[name].address}`);
    if (name === 'MEComputeMarket') {
      const tx = await contract.createOffer(id('corpus-harbor/demo-compute-unit/v1'), parseEther('0.01'), 3600);
      const receipt = await tx.wait();
      evidence.offer = { id: '1', transactionHash: receipt.hash, label: 'Demo compute unit; manual fulfillment; no GPU provisioning', unitPriceMec: '0.01' };
      save();
    }
  }
  const core = await deployCore({ signer, artifacts, chainId: config.chainId, paymentToken: process.env.ME_PAYMENT_TOKEN || '', onDeployment: (name, contract) => {
    evidence.contracts[name] = { address: contract.target, transactionHash: contract.deploymentTransaction().hash }; save();
  } });
  evidence.core = { token: await core.token.getAddress(), usdc: await core.usdc.getAddress(), treasury: core.treasury, mockUsdc: core.mockUsdc, catalogTypes: String(await core.token.typeCount()) }; save();
  console.log(`Core ComputeToken: ${evidence.core.token}\nPayment token: ${evidence.core.usdc}\nTreasury: ${core.treasury}\nEvidence saved to ${destination}\nSet NEXT_PUBLIC_ME_TOKEN, NEXT_PUBLIC_ME_USDC, NEXT_PUBLIC_ME_TREASURY, NEXT_PUBLIC_ME_MOCK_USDC, NEXT_PUBLIC_ME_ORACLE and NEXT_PUBLIC_ME_MARKET in .env, then rebuild. Use /mint?network=me.`);
} catch (error) { console.error(`Deployment failed: ${error.message}`); process.exitCode = 1; }
finally { provider?.destroy(); }
