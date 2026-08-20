import { describe, it, expect } from 'vitest';
import {
  MAX_REACTIONS_PER_OBJECT,
  REACTION_LIMIT_REACHED_MESSAGE,
  isReactionAllowed,
} from '../../utils/reaction-limit.js';

describe('MAX_REACTIONS_PER_OBJECT', () => {
  it('déclare le plafond produit — cinq réactions différentes par personne et par objet', () => {
    expect(MAX_REACTIONS_PER_OBJECT).toBe(5);
  });
});

describe('isReactionAllowed', () => {
  it('autorise sous le plafond', () => {
    expect(isReactionAllowed(0)).toBe(true);
    expect(isReactionAllowed(MAX_REACTIONS_PER_OBJECT - 1)).toBe(true);
  });

  it('refuse au plafond — la personne a déjà posé cinq réactions distinctes', () => {
    expect(isReactionAllowed(MAX_REACTIONS_PER_OBJECT)).toBe(false);
  });

  it('refuse proprement au-dessus du plafond — état incohérent déjà en base (la contrainte n\'a jamais existé), pas d\'exception', () => {
    expect(() => isReactionAllowed(MAX_REACTIONS_PER_OBJECT + 1)).not.toThrow();
    expect(isReactionAllowed(MAX_REACTIONS_PER_OBJECT + 1)).toBe(false);
    expect(isReactionAllowed(1_000)).toBe(false);
  });
});

describe('REACTION_LIMIT_REACHED_MESSAGE', () => {
  it('dit ce qui se passe — la personne a atteint son maximum sur cet objet', () => {
    expect(REACTION_LIMIT_REACHED_MESSAGE).toContain(String(MAX_REACTIONS_PER_OBJECT));
    expect(REACTION_LIMIT_REACHED_MESSAGE.length).toBeGreaterThan(0);
  });
});
