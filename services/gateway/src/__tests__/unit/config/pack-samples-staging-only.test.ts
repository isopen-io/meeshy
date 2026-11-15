/**
 * LES PACKS D'EXEMPLE NE QUITTENT JAMAIS LE STAGING (#10157, demande porteur
 * 2026-10-11 ; « rien de fictif en production »).
 *
 * Le registre `packages/shared/design/packs/samples/` n'est lu que sous
 * `PACK_SAMPLES=1`, valeur exacte (`packSamplesEnabled`). Le staging la pose ;
 * aucune autre composition ne la transmet, et la production ne peut donc pas
 * la recevoir — le bloc `environment:` est une liste EXPLICITE, sans `env_file`.
 *
 * Lit les FICHIERS du dépôt, sans parseur YAML — même patron que
 * `world-seed-off-in-production.test.ts`.
 *
 * @jest-environment node
 */

import fs from 'fs';
import path from 'path';
import { describe, expect, it } from '@jest/globals';
import { packSamplesEnabled } from '../../../services/packs/PackIndex';

const COMPOSE_DIR = path.resolve(__dirname, '..', '..', '..', '..', '..', '..', 'infrastructure', 'docker', 'compose');

const uncommented = (compose: string): string =>
  fs
    .readFileSync(path.resolve(COMPOSE_DIR, compose), 'utf8')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('#'))
    .join('\n');

describe('PACK_SAMPLES dans les compositions', () => {
  it('le staging le pose à la valeur exacte qui arme les exemples', () => {
    const value = /^\s*-\s*PACK_SAMPLES=(.*)$/m.exec(uncommented('docker-compose.staging.yml'))?.[1]?.trim();
    expect(value).toBe('1');
    expect(packSamplesEnabled({ PACK_SAMPLES: value })).toBe(true);
  });

  it('aucune autre composition ne le transmet — la production en tête', () => {
    const others = fs.readdirSync(COMPOSE_DIR).filter((file) => /^docker-compose.*\.ya?ml$/.test(file) && file !== 'docker-compose.staging.yml');
    expect(others).toContain('docker-compose.prod.yml');
    expect(others.filter((file) => uncommented(file).includes('PACK_SAMPLES'))).toEqual([]);
  });

  it('fail-closed : toute valeur autre que « 1 » laisse les exemples éteints', () => {
    for (const value of [undefined, '', '0', 'true', 'yes', ' 1']) expect(packSamplesEnabled({ PACK_SAMPLES: value })).toBe(false);
  });
});
