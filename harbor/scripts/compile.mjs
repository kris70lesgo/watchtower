import fs from 'node:fs';
import path from 'node:path';
import solc from 'solc';
import { fileURLToPath } from 'node:url';
export const root = fileURLToPath(new URL('../../', import.meta.url));
export function compile() {
  const paths = { FixingOracle: 'src/FixingOracle.sol', MEComputeMarket: 'src/MEComputeMarket.sol', ComputeToken: 'src/ComputeToken.sol', MockUSDC: 'test/MockUSDC.sol' };
  const sources = Object.fromEntries(Object.values(paths).map(file => [file, { content: fs.readFileSync(path.join(root, file), 'utf8') }]));
  // ME's official SDK example uses Paris bytecode. Avoid PUSH0 on older EVMs.
  const output = JSON.parse(solc.compile(JSON.stringify({ language: 'Solidity', sources, settings: {
    optimizer: { enabled: true, runs: 200 }, evmVersion: 'paris',
    outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } }
  } }), { import: name => {
    if (!name.startsWith('@openzeppelin/contracts/')) return { error: `Unsupported import ${name}` };
    try { return { contents: fs.readFileSync(path.join(root, 'node_modules', name), 'utf8') }; }
    catch { return { error: `Missing dependency ${name}; run npm ci` }; }
  } }));
  const errors = (output.errors || []).filter(error => error.severity === 'error');
  if (errors.length) throw new Error(errors.map(error => error.formattedMessage).join('\n'));
  const artifacts = Object.fromEntries(Object.entries(paths).map(([name, file]) => [name, { contractName: name, abi: output.contracts[file][name].abi, bytecode: `0x${output.contracts[file][name].evm.bytecode.object}` }]));
  fs.mkdirSync(path.join(root, 'harbor/generated'), { recursive: true });
  for (const [name, artifact] of Object.entries(artifacts)) fs.writeFileSync(path.join(root, `harbor/generated/${name}.json`), `${JSON.stringify(artifact, null, 2)}\n`);
  return artifacts;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  compile(); console.log('Compiled original ComputeToken, test payment token, oracle and settlement (Paris EVM).');
}
