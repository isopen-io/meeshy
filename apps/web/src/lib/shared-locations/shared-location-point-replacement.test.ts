import { describe, expect, test } from 'bun:test';

import { pointReplacementOps } from './shared-location-point-replacement';

/**
 * **LA CONFIRMATION VAUT POUR LE PARTAGE MONTRÉ** (#20248, iso `SharedLocationPointReplacement`, #20127) : la question
 * « Montrer votre position réelle ? » porte le démarrage servi et ceux qui voient le point choisi ; la réponse ne vaut
 * que devant ce partage-là, et le message nomme au plus trois personnes.
 */

const A = 'a'.repeat(24);
const B = 'b'.repeat(24);
const C = 'c'.repeat(24);
const D = 'd'.repeat(24);
const asked = pointReplacementOps.of({ startedAt: 'T1', recipientIds: [A, B] });

describe('une réponse ne vaut que pour le partage qu’elle décrivait', () => {
  test('le même partage : couverte', () => {
    expect(pointReplacementOps.isCovered(pointReplacementOps.of({ startedAt: 'T1', recipientIds: [B, A] }), asked)).toBe(true);
  });

  test('un autre démarrage depuis : caduque', () => {
    expect(pointReplacementOps.isCovered(pointReplacementOps.of({ startedAt: 'T2', recipientIds: [A, B] }), asked)).toBe(false);
  });

  test('quelqu’un ajouté depuis : caduque', () => {
    expect(pointReplacementOps.isCovered(pointReplacementOps.of({ startedAt: 'T1', recipientIds: [A, B, C] }), asked)).toBe(false);
  });

  test('quelqu’un sorti depuis : elle vaut encore, la personne sortie ne verra rien', () => {
    expect(pointReplacementOps.isCovered(pointReplacementOps.of({ startedAt: 'T1', recipientIds: [A] }), asked)).toBe(true);
  });

  test('les identifiants se comparent sans la casse', () => {
    expect(pointReplacementOps.isCovered(pointReplacementOps.of({ startedAt: 'T1', recipientIds: [A.toUpperCase()] }), asked)).toBe(true);
  });

  test('une passerelle qui ne date pas le démarrage : la liste seule tranche', () => {
    const undated = pointReplacementOps.of({ startedAt: null, recipientIds: [A] });
    expect(pointReplacementOps.isCovered(undated, undated)).toBe(true);
    expect(pointReplacementOps.isCovered(undated, asked)).toBe(false);
  });
});

describe('le message nomme ceux qui verront la position réelle', () => {
  test('trois noms au plus, dans l’ordre connu, les autres comptés — inconnus d’ici compris', () => {
    const all = pointReplacementOps.of({ startedAt: 'T1', recipientIds: [A, B, C, D, 'e'.repeat(24)] });
    const known = [
      { userId: D, name: 'Dana' },
      { userId: A, name: 'Ali' },
      { userId: 'f'.repeat(24), name: 'Hors partage' },
      { userId: B, name: 'Bea' },
      { userId: C, name: 'Cyd' },
    ];
    expect(pointReplacementOps.audience(all, known)).toEqual({ named: ['Dana', 'Ali', 'Bea'], others: 2 });
  });

  test('un nom connu deux fois ne se nomme qu’une fois', () => {
    expect(pointReplacementOps.audience(asked, [{ userId: A, name: 'Ali' }, { userId: A.toUpperCase(), name: 'Ali bis' }])).toEqual({ named: ['Ali'], others: 1 });
  });
});
