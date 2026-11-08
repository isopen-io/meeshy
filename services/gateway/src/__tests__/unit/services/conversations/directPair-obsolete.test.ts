/**
 * #14643 — recréer un tête-à-tête avec la même personne ne rouvre JAMAIS une
 * conversation rendue obsolète : son contenu est effacé et sa purge est
 * programmée. Chaque recherche de la paire l'écarte.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { directLookupWheres } from '../../../../services/conversations/directPair';

const NOT_OBSOLETE = { OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] };
const PAIR = { userId: '507f1f77bcf86cd799439022', peerId: '507f1f77bcf86cd799439033' };

describe('#14643 — la paire ne retrouve pas une conversation obsolète', () => {
  it.each([
    ['sans précision', { plaintext: false }],
    ['lisible', { plaintext: true }],
    ['chiffrée de bout en bout', { plaintext: false, endToEnd: true }],
  ])('%s', (_label, request) => {
    const wheres = directLookupWheres(PAIR, request);
    expect(wheres.length).toBeGreaterThan(0);
    for (const where of wheres) {
      expect((where as { AND: unknown[] }).AND).toContainEqual(NOT_OBSOLETE);
    }
  });
});
