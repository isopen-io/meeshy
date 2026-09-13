import { describe, expect, test } from 'bun:test';

import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';

import { DECORATIVE_EFFECTS, activeDecorativeEffects } from './effects';

describe('DECORATIVE_EFFECTS — les dix bits décoratifs, SITE UNIQUE (#6175)', () => {
  test('dix entrées, six d’entrée et quatre permanentes (EffectsPickerView.swift:65-96)', () => {
    expect(DECORATIVE_EFFECTS).toHaveLength(10);
    expect(DECORATIVE_EFFECTS.filter((e) => e.kind === 'entrance')).toHaveLength(6);
    expect(DECORATIVE_EFFECTS.filter((e) => e.kind === 'persistent')).toHaveLength(4);
  });

  test('aucun bit de cycle de vie (EPHEMERAL/BLURRED/VIEW_ONCE) parmi les dix', () => {
    const lifecycle = [MESSAGE_EFFECT_FLAGS.EPHEMERAL, MESSAGE_EFFECT_FLAGS.BLURRED, MESSAGE_EFFECT_FLAGS.VIEW_ONCE];
    for (const effect of DECORATIVE_EFFECTS) expect(lifecycle).not.toContain(effect.flag);
  });
});

describe('activeDecorativeEffects — filtre par bit, dans l’ordre iOS', () => {
  test('effectFlags absent ⇒ liste vide', () => {
    expect(activeDecorativeEffects(undefined)).toEqual([]);
  });

  test('0 ⇒ liste vide', () => {
    expect(activeDecorativeEffects(0)).toEqual([]);
  });

  test('un seul bit ⇒ une seule entrée', () => {
    expect(activeDecorativeEffects(MESSAGE_EFFECT_FLAGS.CONFETTI).map((e) => e.label)).toEqual(['Confettis']);
  });

  test('plusieurs bits ⇒ dans l’ordre DE LA LISTE, pas l’ordre de composition', () => {
    const flags = MESSAGE_EFFECT_FLAGS.SPARKLE | MESSAGE_EFFECT_FLAGS.SHAKE;
    expect(activeDecorativeEffects(flags).map((e) => e.label)).toEqual(['Secousse', 'Scintillant']);
  });

  test('un bit de cycle de vie mêlé (BLURRED) ne fait naître aucune entrée', () => {
    const flags = MESSAGE_EFFECT_FLAGS.BLURRED | MESSAGE_EFFECT_FLAGS.GLOW;
    expect(activeDecorativeEffects(flags).map((e) => e.label)).toEqual(['Lueur']);
  });
});
