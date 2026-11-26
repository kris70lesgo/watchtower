import nextEnv from '@next/env';
const { loadEnvConfig } = nextEnv;
import { fileURLToPath } from 'node:url';
import { publicNetworks } from '../../lib/public-config.mjs';
export const projectRoot = fileURLToPath(new URL('../../', import.meta.url));
export function publicEnvironment(mode = 'production') {
  const { combinedEnv } = loadEnvConfig(projectRoot, mode !== 'production');
  return Object.fromEntries(Object.entries(combinedEnv).filter(([key]) => key.startsWith('NEXT_PUBLIC_') || key.startsWith('VITE_')));
}
// Retained for configuration regression tests and old static integrations.
export function networkModule(env) { return `export const ME = ${JSON.stringify(publicNetworks(env).me)};\n`; }
