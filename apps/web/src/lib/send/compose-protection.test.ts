import { describe, expect, test } from 'bun:test';

import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';

import {
  EPHEMERAL_AFTER_READ_SECONDS,
  EPHEMERAL_DURATIONS,
  isAfterReadChoice,
  characterCounterOf,
  composerAccentOf,
  ephemeralDurationLabelOf,
  protectionFieldsOf,
  toggledVeil,
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

/**
 * LA BARRE PREND LA COULEUR DE LA PROTECTION LA PLUS FORTE (#7667) —
 * éphémère > vue unique > flou, miroir `ComposerProtection.dominant`
 * (`apps/ios/.../ComposerProtection.swift`). Les HUIT combinaisons des trois
 * bascules : une priorité éprouvée sur trois cas laisse passer l'ordre
 * inverse dès que deux bascules sont allumées ensemble.
 */
describe('composerAccentOf — éphémère > vue unique > flou, sur les huit combinaisons (#7667)', () => {
  const cas: ReadonlyArray<readonly [ComposeProtection, ReturnType<typeof composerAccentOf>]> = [
    [{}, null],
    [{ blurred: true }, 'blur'],
    [{ viewOnce: true }, 'viewOnce'],
    [{ viewOnce: true, blurred: true }, 'viewOnce'],
    [{ ephemeralSeconds: 60 }, 'ephemeral'],
    [{ ephemeralSeconds: 60, blurred: true }, 'ephemeral'],
    [{ ephemeralSeconds: 60, viewOnce: true }, 'ephemeral'],
    [{ ephemeralSeconds: 60, viewOnce: true, blurred: true }, 'ephemeral'],
  ];
  for (const [protection, attendu] of cas) {
    test(`${JSON.stringify(protection)} ⇒ ${String(attendu)}`, () => {
      expect(composerAccentOf(protection)).toBe(attendu);
    });
  }

  test('vue unique ET effets ⇒ viewOnce gagne (une protection prime sur un effet)', () => {
    expect(composerAccentOf({ viewOnce: true, effectFlags: MESSAGE_EFFECT_FLAGS.GLOW })).toBe('viewOnce');
  });
});

/**
 * « LE MESSAGE NE PEUT PAS ÊTRE FLOU ET VUE UNIQUE ! » (directive porteur
 * 2026-09-24, #7667) — le composeur éteint l'un quand on allume l'autre
 * (`toggledVeil`), et la loi d'envoi est le SECOND verrou : un brouillon
 * restauré avec les deux n'émet jamais les deux drapeaux. La vue unique, plus
 * forte, gagne — miroir `MessageProtectionIntent.init`.
 */
describe('flou et vue unique sont exclusifs (#7667)', () => {
  test('armer le flou éteint la vue unique', () => {
    expect(toggledVeil('blurred', { blurred: false, viewOnce: true })).toEqual({ blurred: true, viewOnce: false });
  });

  test('armer la vue unique éteint le flou', () => {
    expect(toggledVeil('viewOnce', { blurred: true, viewOnce: false })).toEqual({ blurred: false, viewOnce: true });
  });

  test('désarmer le flou ne touche pas à la vue unique', () => {
    expect(toggledVeil('blurred', { blurred: true, viewOnce: false })).toEqual({ blurred: false, viewOnce: false });
  });

  test('désarmer la vue unique ne touche pas au flou', () => {
    expect(toggledVeil('viewOnce', { blurred: false, viewOnce: true })).toEqual({ blurred: false, viewOnce: false });
  });

  test('flou ET vue unique armés ensemble ⇒ seule la vue unique part', () => {
    const fields = protectionFieldsOf({ blurred: true, viewOnce: true, ephemeralSeconds: 60 }, NOW);
    expect(fields.isBlurred).toBe(false);
    expect(fields.isViewOnce).toBe(true);
    expect(fields.effectFlags & MESSAGE_EFFECT_FLAGS.BLURRED).toBe(0);
    expect(fields.effectFlags & MESSAGE_EFFECT_FLAGS.VIEW_ONCE).toBe(MESSAGE_EFFECT_FLAGS.VIEW_ONCE);
    expect(fields.effectFlags & MESSAGE_EFFECT_FLAGS.EPHEMERAL).toBe(MESSAGE_EFFECT_FLAGS.EPHEMERAL);
  });
});

describe('EPHEMERAL_DURATIONS — la flamme-œil, 15 s, puis les durées (#8304, CoreModels.swift:947-977)', () => {
  test('la flamme-œil EN TÊTE, puis 15 s, puis les durées existantes dans l’ordre croissant', () => {
    expect(EPHEMERAL_DURATIONS.map((d) => d.seconds)).toEqual([EPHEMERAL_AFTER_READ_SECONDS, 15, 30, 60, 300, 3600, 86400]);
    expect(EPHEMERAL_DURATIONS[0]?.afterRead).toBe(true);
    expect(EPHEMERAL_DURATIONS.slice(1).every((d) => d.afterRead !== true)).toBe(true);
  });

  test('libellés courts et clés de catalogue des libellés longs', () => {
    expect(ephemeralDurationLabelOf(15)).toEqual({ seconds: 15, label: '15s', displayKey: 'composer.ephemeral.duration.15' });
    expect(ephemeralDurationLabelOf(60)).toEqual({ seconds: 60, label: '1min', displayKey: 'composer.ephemeral.duration.60' });
    expect(ephemeralDurationLabelOf(86400)).toEqual({ seconds: 86400, label: '24h', displayKey: 'composer.ephemeral.duration.86400' });
  });

  test('la flamme-œil n’a pas de libellé court : son pictogramme le porte', () => {
    expect(ephemeralDurationLabelOf(EPHEMERAL_AFTER_READ_SECONDS)).toEqual({
      seconds: EPHEMERAL_AFTER_READ_SECONDS,
      label: '',
      displayKey: 'composer.ephemeral.afterRead',
      afterRead: true,
    });
  });

  test('durée inconnue ⇒ undefined', () => {
    expect(ephemeralDurationLabelOf(120)).toBeUndefined();
  });
});

describe('protectionFieldsOf — la flamme-œil (#8304, contrat #8302)', () => {
  test('bits EPHEMERAL | EPHEMERAL_AFTER_READ, SANS aucune échéance', () => {
    const fields = protectionFieldsOf({ ephemeralSeconds: EPHEMERAL_AFTER_READ_SECONDS }, NOW);
    expect(fields.effectFlags).toBe(MESSAGE_EFFECT_FLAGS.EPHEMERAL | MESSAGE_EFFECT_FLAGS.EPHEMERAL_AFTER_READ);
    expect(fields.expiresAt).toBeUndefined();
    expect('expiresAt' in fields).toBe(false);
  });

  test('se combine au flou sans rien perdre', () => {
    const fields = protectionFieldsOf({ ephemeralSeconds: EPHEMERAL_AFTER_READ_SECONDS, blurred: true }, NOW);
    expect(fields.effectFlags).toBe(
      MESSAGE_EFFECT_FLAGS.EPHEMERAL | MESSAGE_EFFECT_FLAGS.EPHEMERAL_AFTER_READ | MESSAGE_EFFECT_FLAGS.BLURRED,
    );
    expect(fields.isBlurred).toBe(true);
  });

  test('une durée ordinaire ne pose JAMAIS le bit après lecture', () => {
    const fields = protectionFieldsOf({ ephemeralSeconds: 15 }, NOW);
    expect(fields.effectFlags & MESSAGE_EFFECT_FLAGS.EPHEMERAL_AFTER_READ).toBe(0);
    expect(fields.expiresAt).toEqual(new Date(NOW + 15_000));
  });

  test('la flamme-œil colore la barre comme tout éphémère', () => {
    expect(composerAccentOf({ ephemeralSeconds: EPHEMERAL_AFTER_READ_SECONDS })).toBe('ephemeral');
  });

  test('isAfterReadChoice ne reconnaît que la flamme-œil', () => {
    expect(isAfterReadChoice(EPHEMERAL_AFTER_READ_SECONDS)).toBe(true);
    expect(isAfterReadChoice(15)).toBe(false);
    expect(isAfterReadChoice(undefined)).toBe(false);
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
