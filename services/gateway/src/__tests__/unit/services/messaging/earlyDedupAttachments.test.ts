/**
 * @jest-environment node
 *
 * #19917 — le dédoublonnage précoce de `MessagingService.handleMessage` rend
 * « succès » sans jamais associer les pièces jointes qu'il vient d'ADMETTRE.
 * Squelette rouge du cycle 187 ; relevé par l'audit adversarial du cycle 186.
 */
import { describe, it, expect } from '@jest/globals';

describe('MessagingService — le rejeu qui apporte des pièces NEUVES (#19917)', () => {
  it('les associe au message existant, au lieu de rendre « succès » sans elles', () => {
    expect(true).toBe(false);
  });
});
