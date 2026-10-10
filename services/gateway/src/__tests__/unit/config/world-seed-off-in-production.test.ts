/**
 * PROMOUVOIR LE CODE N'ÉCRIT PAS LA BASE DE PRODUCTION (audit adversarial #10000).
 *
 * Le seed World Wide écrit (conversation, lien, participations). En
 * production, il attend le feu vert du porteur (CLAUDE.md racine, #9223) : la
 * composition de production le transmet donc à la passerelle FAUX par défaut,
 * quand l'hôte ne pose rien. Le staging, autonome, le sème.
 *
 * Le bloc `environment:` des compositions est une liste EXPLICITE, sans
 * `env_file` : une variable absente de la liste n'atteint jamais le conteneur.
 * Ce témoin rejoue ce que Docker Compose remet quand l'hôte ne pose rien, puis
 * ce que la passerelle en fait.
 *
 * Lit le FICHIER du dépôt, sans parseur YAML — même patron que
 * `exact-read-tracking-armed-on-deploy.test.ts`.
 *
 * @jest-environment node
 */

import fs from 'fs';
import path from 'path';
import { describe, expect, it } from '@jest/globals';
import { isWorldSeedEnabled } from '../../../services/world/worldReservedMembers';

const COMPOSE_DIR = path.resolve(__dirname, '..', '..', '..', '..', '..', '..', 'infrastructure', 'docker', 'compose');

function serviceBlock(source: string, serviceName: string, compose: string): string {
  const lines = source.split('\n');
  const startIdx = lines.findIndex((l) => l === `  ${serviceName}:`);
  if (startIdx === -1) throw new Error(`service "${serviceName}" introuvable dans ${compose}`);
  const rest = lines.slice(startIdx + 1);
  const endIdx = rest.findIndex((l) => /^ {2}\S/.test(l));
  return (endIdx === -1 ? rest : rest.slice(0, endIdx)).join('\n');
}

/** La valeur que le conteneur reçoit quand l'hôte ne pose PAS la variable ; `undefined` si elle n'est pas transmise. */
function valueWithoutHostEnv(compose: string, gateway: string, key: string): string | undefined {
  const source = fs.readFileSync(path.resolve(COMPOSE_DIR, compose), 'utf8');
  const raw = serviceBlock(source, gateway, compose)
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('#'))
    .map((l) => new RegExp(`^\\s*-\\s*${key}=(.*)$`).exec(l)?.[1])
    .find((value) => value !== undefined);
  if (raw === undefined) return undefined;
  const interpolated = /^\$\{[A-Z_]+(?::-([^}]*))?\}$/.exec(raw.trim());
  return interpolated ? (interpolated[1] ?? '') : raw.trim();
}

describe('WORLD_SEED_ENABLED dans les compositions qui déploient', () => {
  it('la production le transmet, FAUX quand l’hôte ne pose rien : promouvoir le code n’écrit pas', () => {
    const value = valueWithoutHostEnv('docker-compose.prod.yml', 'gateway', 'WORLD_SEED_ENABLED');

    expect(value).toBeDefined();
    expect(isWorldSeedEnabled({ WORLD_SEED_ENABLED: value })).toBe(false);
  });

  it('le staging le sème par défaut', () => {
    const value = valueWithoutHostEnv('docker-compose.staging.yml', 'gateway-staging', 'WORLD_SEED_ENABLED');

    expect(isWorldSeedEnabled({ WORLD_SEED_ENABLED: value })).toBe(true);
  });

  it.each([
    ['docker-compose.prod.yml', 'gateway'],
    ['docker-compose.staging.yml', 'gateway-staging'],
  ])('%s transmet WORLD_ADMIN_EMAILS, seule façon de désigner un administrateur de World Wide', (compose, gateway) => {
    expect(valueWithoutHostEnv(compose, gateway, 'WORLD_ADMIN_EMAILS')).toBeDefined();
  });
});
