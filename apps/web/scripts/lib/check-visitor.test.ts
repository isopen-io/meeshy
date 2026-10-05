import { describe, expect, test } from 'bun:test';

import { FORMER_CUTOFF_MS, SLOW_MS, slowAnswerVerdict } from './check-visitor.mjs';

/**
 * LA PREUVE DU RÉSEAU LENT NE PARIE PAS SUR L'HORLOGE (#9370) — le bouchon
 * retient la story `SLOW_MS` ; un minuteur Node peut rendre la main quand
 * `Date.now()` n'a compté qu'une milliseconde de moins. Le verdict compare à
 * la coupure d'autrefois, que le délai du bouchon dépasse largement.
 */
describe('slowAnswerVerdict', () => {
  test("le bouchon retient la story bien au-delà de la coupure d'autrefois", () => {
    expect(SLOW_MS - FORMER_CUTOFF_MS).toBeGreaterThanOrEqual(1_000);
  });

  test('une réponse mesurée une milliseconde sous le délai du bouchon passe', () => {
    expect(slowAnswerVerdict(SLOW_MS - 1).ok).toBe(true);
    expect(slowAnswerVerdict(3_999).ok).toBe(true);
  });

  test('une réponse rapide échoue toujours — le gate reste capable de rougir', () => {
    expect(slowAnswerVerdict(100).ok).toBe(false);
    expect(slowAnswerVerdict(0).ok).toBe(false);
    expect(slowAnswerVerdict(FORMER_CUTOFF_MS).ok).toBe(false);
  });

  test('le libellé annonce le seuil que le verdict compare', () => {
    expect(slowAnswerVerdict(3_999).label).toBe('la lecture de la story a bien duré plus de 2,5 s (3999 ms)');
  });
});
