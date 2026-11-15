/**
 * UNE COMPOSITION QUI DÉPLOIE L'AGENT DIT À LA PASSERELLE OÙ IL EST.
 *
 * `server.ts` rend le service d'agent OPTIONNEL et le commande par une seule
 * variable : `AGENT_HOST` posée ⇒ le client ZMQ s'initialise ; absente ⇒
 * « ℹ️ AGENT_HOST not set — agent service disabled ». Une composition peut donc
 * lancer le conteneur de l'agent, lui passer le secret interne des DEUX côtés,
 * et la passerelle ne l'appellera jamais : rien ne rougit, rien ne journalise
 * d'erreur, le service tourne pour personne.
 *
 * Mesuré le 2026-10-12 : `docker-compose.staging.yml` déployait `agent-staging`
 * et transmettait `AGENT_INTERNAL_TOKEN` à `gateway-staging` sans lui dire
 * `AGENT_HOST`. `dev` et `prod` le posaient tous deux.
 *
 * Ce témoin ne juge QUE l'adresse. La seconde moitié de la loi de `server.ts`
 * — `AGENT_HOST` posé EXIGE `AGENT_INTERNAL_TOKEN` des deux côtés, sans quoi
 * « every HTTP call to the agent » échoue — est mesurée et SUIVIE à part
 * (#10270) : `docker-compose.dev.yml` pose l'adresse sans le secret, et ce
 * qu'il faut en faire est une décision, pas un correctif.
 *
 * Le bloc `environment:` des compositions est une liste EXPLICITE, sans
 * `env_file` : une variable absente de la liste n'atteint jamais le conteneur.
 * Ce témoin lit les FICHIERS du dépôt, sans parseur YAML — même patron que
 * `world-seed-off-in-production.test.ts`.
 *
 * @jest-environment node
 */

import fs from 'fs';
import path from 'path';
import { describe, expect, it } from '@jest/globals';

const COMPOSE_DIR = path.resolve(__dirname, '..', '..', '..', '..', '..', '..', 'infrastructure', 'docker', 'compose');

/** Les compositions à juger, et le couple de services qu'elles nomment. */
const COMPOSITIONS = [
  { compose: 'docker-compose.dev.yml', gateway: 'gateway', agent: 'agent' },
  { compose: 'docker-compose.staging.yml', gateway: 'gateway-staging', agent: 'agent-staging' },
  { compose: 'docker-compose.prod.yml', gateway: 'gateway', agent: 'agent' },
] as const;

function serviceBlock(source: string, serviceName: string, compose: string): string {
  const lines = source.split('\n');
  const startIdx = lines.findIndex((l) => l === `  ${serviceName}:`);
  if (startIdx === -1) throw new Error(`service "${serviceName}" introuvable dans ${compose}`);
  const rest = lines.slice(startIdx + 1);
  const endIdx = rest.findIndex((l) => /^ {2}\S/.test(l));
  return (endIdx === -1 ? rest : rest.slice(0, endIdx)).join('\n');
}

/** La valeur transmise au conteneur, que la liste s'écrive `- KEY=v` ou `KEY: v` ; `undefined` si absente. */
function envValue(block: string, key: string): string | undefined {
  for (const line of block.split('\n')) {
    const listed = line.match(new RegExp(`^\\s*-\\s*${key}=(.*)$`));
    if (listed) return (listed[1] ?? '').trim();
    const mapped = line.match(new RegExp(`^\\s*${key}:\\s*(.*)$`));
    if (mapped) return (mapped[1] ?? '').trim();
  }
  return undefined;
}

describe("AGENT_HOST est posé partout où l'agent tourne (#10269)", () => {
  it.each(COMPOSITIONS)('$compose : $gateway reçoit AGENT_HOST, et il désigne $agent', ({ compose, gateway, agent }) => {
    const source = fs.readFileSync(path.resolve(COMPOSE_DIR, compose), 'utf8');
    const block = serviceBlock(source, gateway, compose);
    expect({ compose, host: envValue(block, 'AGENT_HOST') }).toEqual({ compose, host: agent });
  });
});
