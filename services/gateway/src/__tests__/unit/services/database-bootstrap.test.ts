/**
 * #6581 — la SÉQUENCE de boot de la base, exécutée.
 *
 * La question que ce fichier pose n'est pas « la méthode fait-elle son
 * travail ? » mais « est-elle APPELÉE, et du bon côté de la porte ? ».
 * `shouldInitialize()` ne s'ouvre que sur une base VIDE : tout invariant placé
 * derrière elle est du code MORT sur une base de production — `/posts/nearby`
 * l'a payé d'un 500 le 2026-08-25, et la vérification d'e-mail des comptes
 * semés le rejouait au premier jet de ce lot.
 *
 * Les doubles ici n'implémentent rien : ils ENREGISTRENT l'ordre des appels.
 * C'est la seule façon d'observer une séquence sans lire son texte source.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { bootstrapDatabase, type DatabaseBootstrapSteps } from '../../../services/database-bootstrap';

const STEP_NAMES = [
  'ensurePostGeoIndex',
  'ensureFriendRequestIndexes',
  'ensureContactDeltaIndex',
  'initializeDatabase',
  'ensureSeedAccountsVerified',
] as const;

function makeSteps(shouldInitialize: boolean) {
  const order: string[] = [];
  const step = (name: string) => jest.fn(async () => { order.push(name); });
  const steps = {
    ...Object.fromEntries(STEP_NAMES.map((name) => [name, step(name)])),
    shouldInitialize: jest.fn(async () => { order.push('shouldInitialize'); return shouldInitialize; }),
  } as unknown as DatabaseBootstrapSteps;
  return { steps, order };
}

describe('bootstrapDatabase — ce qui vit hors de la porte du seed (#6581)', () => {
  it('vérifie les comptes semés même quand la porte est FERMÉE — c’est le cas d’une base de production saine', async () => {
    const { steps, order } = makeSteps(false);

    await bootstrapDatabase(steps);

    expect(order).toContain('ensureSeedAccountsVerified');
    expect(order).not.toContain('initializeDatabase');
  });

  it('les invariants de schéma passent AVANT la porte — une base peuplée les reçoit aussi', async () => {
    const { steps, order } = makeSteps(false);

    await bootstrapDatabase(steps);

    expect(order.slice(0, 4)).toEqual([
      'ensurePostGeoIndex',
      'ensureFriendRequestIndexes',
      'ensureContactDeltaIndex',
      'shouldInitialize',
    ]);
  });

  it('vérifie les comptes semés APRÈS l’ensemencement — la base fraîche passe par le même site que la base héritée', async () => {
    const { steps, order } = makeSteps(true);

    await bootstrapDatabase(steps);

    expect(order.indexOf('ensureSeedAccountsVerified')).toBeGreaterThan(order.indexOf('initializeDatabase'));
  });

  it('propage l’échec d’un invariant — un boot ne continue pas sur un index manquant en silence', async () => {
    const { steps } = makeSteps(false);
    (steps.ensurePostGeoIndex as jest.Mock<any>).mockRejectedValue(new Error('not authorized on meeshy'));

    await expect(bootstrapDatabase(steps)).rejects.toThrow('not authorized on meeshy');
  });
});
