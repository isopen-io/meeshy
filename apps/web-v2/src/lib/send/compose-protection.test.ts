import { describe, expect, test } from 'bun:test';

import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';

import {
  EPHEMERAL_DURATIONS,
  characterCounterOf,
  composerAccentOf,
  ephemeralDurationLabelOf,
  protectionFieldsOf,
  type ComposeProtection,
} from './compose-protection';

const NOW = 1_757_600_000_000;

describe('protectionFieldsOf — la composition des bits (miroir messages-send.ts:240-245)', () => {
  test('aucune protection ⇒ effectFlags à 0, aucune date, tout à false', () => {
    expect(protectionFieldsOf({}, NOW)).toEqual({ isBlurred: false, isViewOnce: false, effectFlags: 0 });
  });

  test('éphémère 60s ⇒ expiresAt = now + 60s, bit EPHEMERAL posé', () => {
    const fields = protectionFieldsOf({ ephemeralSeconds: 60 }, NOW);
    expect(fields.expiresAt).toEqual(new Date(NOW + 60_000));
    expect(fields.effectFlags & MESSAGE_EFFECT_FLAGS.EPHEMERAL).toBe(MESSAGE_EFFECT_FLAGS.EPHEMERAL);
    expect(fields.isBlurred).toBe(false);
  });

  test('flou ⇒ isBlurred true, bit BLURRED posé, pas de date', () => {
    const fields = protectionFieldsOf({ blurred: true }, NOW);
    expect(fields.isBlurred).toBe(true);
    expect(fields.effectFlags & MESSAGE_EFFECT_FLAGS.BLURRED).toBe(MESSAGE_EFFECT_FLAGS.BLURRED);
    expect(fields.expiresAt).toBeUndefined();
  });

  test('vue unique (loi seule, aucun contrôle ne l’arme en conversation) ⇒ isViewOnce true, bit VIEW_ONCE posé', () => {
    const fields = protectionFieldsOf({ viewOnce: true }, NOW);
    expect(fields.isViewOnce).toBe(true);
    expect(fields.effectFlags & MESSAGE_EFFECT_FLAGS.VIEW_ONCE).toBe(MESSAGE_EFFECT_FLAGS.VIEW_ONCE);
  });

  test('effets décoratifs (SHAKE|GLOW) ⇒ envoyés tels quels, combinés au cycle de vie', () => {
    const protection: ComposeProtection = {
      effectFlags: MESSAGE_EFFECT_FLAGS.SHAKE | MESSAGE_EFFECT_FLAGS.GLOW,
      blurred: true,
    };
    const fields = protectionFieldsOf(protection, NOW);
    expect(fields.effectFlags).toBe(MESSAGE_EFFECT_FLAGS.SHAKE | MESSAGE_EFFECT_FLAGS.GLOW | MESSAGE_EFFECT_FLAGS.BLURRED);
  });
});

describe('composerAccentOf — éphémère > flou > effets > null (ConversationView+Composer.swift:49-59)', () => {
  test('rien de choisi ⇒ null (l’appelant garde l’accent de la conversation)', () => {
    expect(composerAccentOf({})).toBeNull();
  });

  test('éphémère seul ⇒ ephemeral', () => {
    expect(composerAccentOf({ ephemeralSeconds: 60 })).toBe('ephemeral');
  });

  test('flou seul ⇒ blur', () => {
    expect(composerAccentOf({ blurred: true })).toBe('blur');
  });

  test('effets seuls ⇒ effects', () => {
    expect(composerAccentOf({ effectFlags: MESSAGE_EFFECT_FLAGS.SHAKE })).toBe('effects');
  });

  test('éphémère ET flou ⇒ ephemeral gagne (l’ordre iOS)', () => {
    expect(composerAccentOf({ ephemeralSeconds: 60, blurred: true })).toBe('ephemeral');
  });

  test('flou ET effets ⇒ blur gagne', () => {
    expect(composerAccentOf({ blurred: true, effectFlags: MESSAGE_EFFECT_FLAGS.GLOW })).toBe('blur');
  });
});

describe('EPHEMERAL_DURATIONS — les cinq durées et leurs deux libellés (CoreModels.swift:947-977)', () => {
  test('cinq durées, dans l’ordre croissant', () => {
    expect(EPHEMERAL_DURATIONS.map((d) => d.seconds)).toEqual([30, 60, 300, 3600, 86400]);
  });

  test('libellés courts et longs', () => {
    expect(ephemeralDurationLabelOf(60)).toEqual({ seconds: 60, label: '1min', displayLabel: '1 minute' });
    expect(ephemeralDurationLabelOf(86400)).toEqual({ seconds: 86400, label: '24h', displayLabel: '24 heures' });
  });

  test('durée inconnue ⇒ undefined', () => {
    expect(ephemeralDurationLabelOf(120)).toBeUndefined();
  });
});

describe('characterCounterOf — les deux moitiés du seuil (UniversalComposerBar+Toolbar.swift:71-79)', () => {
  test('pas de limite ⇒ jamais de compteur', () => {
    expect(characterCounterOf({ text: 'x'.repeat(500) })).toBeNull();
  });

  test('sous 80 % ⇒ rien', () => {
    expect(characterCounterOf({ text: 'x'.repeat(80), maxLength: 100 })).toBeNull();
  });

  test('juste au-dessus de 80 % ⇒ affiché, pas en surcharge', () => {
    expect(characterCounterOf({ text: 'x'.repeat(81), maxLength: 100 })).toEqual({ text: '81/100', overflow: false });
  });

  test('à la limite ⇒ en surcharge', () => {
    expect(characterCounterOf({ text: 'x'.repeat(100), maxLength: 100 })).toEqual({ text: '100/100', overflow: true });
  });

  test('au-delà de la limite ⇒ toujours en surcharge', () => {
    expect(characterCounterOf({ text: 'x'.repeat(101), maxLength: 100 })).toEqual({ text: '101/100', overflow: true });
  });
});
