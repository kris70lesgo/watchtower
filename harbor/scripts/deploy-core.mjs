import { Contract, ContractFactory } from 'ethers';
import { registerCatalog } from '../catalog.mjs';
export async function deployCore({ signer, artifacts, chainId, paymentToken = '', fund = [], onDeployment = () => {} }) {
  if (![400, 31337].includes(chainId)) throw new Error('Core deployment supports ME testnet and local testing only');
  let usdc;
  const treasury = await signer.getAddress();
  if (paymentToken) {
    usdc = new Contract(paymentToken, artifacts.MockUSDC.abi, signer);
    if (await usdc.decimals() !== 6n || await signer.provider.getCode(paymentToken) === '0x') throw new Error('Payment token must be a deployed six-decimal ERC-20');
  } else {
    usdc = await new ContractFactory(artifacts.MockUSDC.abi, artifacts.MockUSDC.bytecode, signer).deploy();
    await usdc.waitForDeployment();
    await onDeployment('MockUSDC', usdc);
    for (const address of new Set([treasury, ...fund])) await (await usdc.mint(address, 100000000000n)).wait();
  }
  const token = await new ContractFactory(artifacts.ComputeToken.abi, artifacts.ComputeToken.bytecode, signer).deploy(await usdc.getAddress(), treasury, 'https://cloud.trycorpus.ai/token/{id}.json');
  await token.waitForDeployment(); await onDeployment('ComputeToken', token);
  await registerCatalog(token);
  return { token, usdc, treasury, mockUsdc: !paymentToken };
}
