/**
 * LE SCÉNARIO SANS TÊTE de la coquille « ami WhatsApp » contre le STAGING
 * (#17116). Le recetteur le lance depuis une session cloud :
 *
 *   COQUILLE_USERNAME=… COQUILLE_PASSWORD=… bun scripts/dma-coquille-scenario.ts
 *
 * - `COQUILLE_USERNAME` / `COQUILLE_PASSWORD` : un compte de RECETTE de l'équipe
 *   (MODERATOR et au-dessus, sans double authentification) sur le staging. Jamais
 *   dans le dépôt, jamais un compte réel.
 * - `COQUILLE_GATEWAY_URL` : la passerelle visée, `https://gate.staging.meeshy.me`
 *   par défaut. Un hôte qui n'est ni le staging en HTTPS ni local est REFUSÉ avant tout appel.
 * - `COQUILLE_HANDLE` : le numéro WhatsApp simulé, tiré dans la plage fictive de
 *   l'Ofcom (+44 7700 900xxx) par défaut.
 * - Réseau : la session doit joindre `gate.staging.meeshy.me` (hôte autorisé par
 *   l'environnement cloud) ; derrière le proxy des sessions, bun lit
 *   `HTTPS_PROXY` et `NODE_EXTRA_CA_CERTS`.
 *
 * Sortie : une ligne par étape (✓ / ✗ et la raison), puis SUCCÈS ou ÉCHEC ; code
 * de sortie 0 ou 1. Ni mot de passe, ni jeton, ni clair n'y paraissent.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { fictitiousHandle } from '../dma-coquille/coquille-page';
import { runCoquilleScenario } from '../dma-coquille/coquille-scenario';
import { openLibsignalBridge } from '../src/lib/e2ee/libsignal-bridge';

const WASM = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'lib', 'e2ee', 'libsignal', 'libsignal_wasm_bg.wasm');
const DEFAULT_GATEWAY = 'https://gate.staging.meeshy.me';

const LOCAL_HOSTS: ReadonlySet<string> = new Set(['localhost', '127.0.0.1']);
const isStagingHost = (hostname: string): boolean => hostname === 'staging.meeshy.me' || hostname.endsWith('.staging.meeshy.me');

/** Le scénario ne vise que le staging, en HTTPS (le mot de passe de l'équipe y transite), ou une passerelle locale : jamais la production. */
export const isRehearsalHost = (url: string): boolean => {
  const { hostname, protocol } = new URL(url);
  return LOCAL_HOSTS.has(hostname) || (protocol === 'https:' && isStagingHost(hostname));
};

const main = async (): Promise<number> => {
  const baseUrl = (process.env.COQUILLE_GATEWAY_URL ?? DEFAULT_GATEWAY).replace(/\/+$/, '');
  const username = process.env.COQUILLE_USERNAME ?? '';
  const password = process.env.COQUILLE_PASSWORD ?? '';
  if (!isRehearsalHost(baseUrl)) {
    console.error(`ÉCHEC — hôte refusé : ${new URL(baseUrl).hostname} n’est ni le staging en HTTPS ni une passerelle locale`);
    return 1;
  }
  if (!username || !password) {
    console.error('ÉCHEC — COQUILLE_USERNAME et COQUILLE_PASSWORD (compte de recette de l’équipe) sont requis');
    return 1;
  }
  const nonce = crypto.randomUUID().slice(0, 8);
  const report = await runCoquilleScenario({
    baseUrl,
    fetch: (input, init) => fetch(input, init),
    bridge: await openLibsignalBridge(readFileSync(WASM)),
    account: { username, password },
    handle: process.env.COQUILLE_HANDLE ?? fictitiousHandle(),
    message: `Recette coquille ${nonce} : bonjour depuis Meeshy`,
    reply: `Recette coquille ${nonce} : réponse de l’ami WhatsApp`,
    log: (line) => console.log(line),
  });
  return report.ok ? 0 : 1;
};

if ((import.meta as ImportMeta & { readonly main?: boolean }).main === true) process.exit(await main());
