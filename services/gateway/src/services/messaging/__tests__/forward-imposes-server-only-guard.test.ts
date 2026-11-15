/**
 * `forwardImposes` est le VERDICT de la garde de transfert (#9572) : aucun
 * client ne le fournit. Deux gardes disjointes le tiennent :
 *
 * - à l'exécution, `handleMessage` l'écrase après le spread de la requête
 *   (`MessagingService.test.ts` § « écrase un `forwardImposes` glissé ») ;
 * - à la source, ce balayage : le champ n'est NOMMÉ que par les quatre unités
 *   serveur qui le produisent ou le lisent, et par aucun contrat partagé —
 *   schéma REST, événement socket, type de requête.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const GATEWAY_SRC = join(__dirname, '..', '..', '..');
const SHARED = join(GATEWAY_SRC, '..', '..', '..', 'packages', 'shared');

const SERVER_ONLY = [
  'services/messaging/MessageProcessor.ts',
  'services/messaging/MessagingService.ts',
  'services/messaging/copyExitProtection.ts',
  'services/messaging/forwardAdmission.ts',
];

const sourcesUnder = (root: string): string[] =>
  readdirSync(root).flatMap((name) => {
    if (name === 'node_modules' || name === 'dist' || name === '__tests__' || name === 'client') return [];
    const path = join(root, name);
    if (statSync(path).isDirectory()) return sourcesUnder(path);
    return /\.ts$/.test(name) && !/\.test\.ts$/.test(name) && !/\.d\.ts$/.test(name) ? [path] : [];
  });

const naming = (root: string): string[] =>
  sourcesUnder(root)
    .filter((path) => readFileSync(path, 'utf8').includes('forwardImposes'))
    .map((path) => relative(root, path))
    .sort();

describe('forwardImposes — un verdict serveur, jamais une entrée client', () => {
  it('balaie bien les deux racines', () => {
    expect(sourcesUnder(GATEWAY_SRC).length).toBeGreaterThan(500);
    expect(sourcesUnder(join(SHARED, 'types')).length).toBeGreaterThan(30);
  });

  it('n’est nommé que par les unités serveur qui le produisent ou le lisent', () => {
    expect(naming(GATEWAY_SRC)).toEqual(SERVER_ONLY);
  });

  it('n’apparaît dans aucun contrat partagé', () => {
    expect(naming(join(SHARED, 'types'))).toEqual([]);
    expect(naming(join(SHARED, 'utils'))).toEqual([]);
  });
});
