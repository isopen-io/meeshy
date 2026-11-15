import { describe, expect, test } from 'bun:test';

import { createStoryReturn } from './story-return';

describe('la preuve de retour du studio (#7729)', () => {
  test('seule la story que le studio vient de publier est créditée, une fois', () => {
    const proof = createStoryReturn();
    proof.note('story-1');
    expect(proof.take('story-1')).toBe(true);
    expect(proof.take('story-1')).toBe(false);
  });

  test('une adresse tapée à la main n’a pas de preuve', () => {
    const proof = createStoryReturn();
    expect(proof.take('published')).toBe(false);
  });

  test('un autre id que celui publié ne prouve rien, et consomme la preuve', () => {
    const proof = createStoryReturn();
    proof.note('story-1');
    expect(proof.take('story-2')).toBe(false);
    expect(proof.take('story-1')).toBe(false);
  });
});
