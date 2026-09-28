import { describe, expect, it } from 'vitest';

import { MESSAGE_EFFECT_FLAGS } from '../types/message-effect-flags.js';
import { contaminateReplyProtection, imposedReplyProtection } from './reply-protection-contagion.js';

const { EPHEMERAL, BLURRED, VIEW_ONCE, EPHEMERAL_AFTER_READ, GLOW } = MESSAGE_EFFECT_FLAGS;
const AFTER_READ = EPHEMERAL | EPHEMERAL_AFTER_READ;

describe('contaminateReplyProtection — la contagion additive (#8557)', () => {
  it('une réponse à un message ordinaire garde exactement ce qu’elle demande', () => {
    expect(
      contaminateReplyProtection({
        requested: { effectFlags: GLOW, isBlurred: false, ephemeralDuration: 60 },
        quoted: { effectFlags: 0, isBlurred: false, ephemeralDuration: null },
      }),
    ).toEqual({ effectFlags: GLOW | EPHEMERAL, isBlurred: false, ephemeralDuration: 60 });
  });

  it('sans message cité, rien ne change', () => {
    expect(contaminateReplyProtection({ requested: { isBlurred: true }, quoted: null })).toEqual({
      effectFlags: BLURRED,
      isBlurred: true,
      ephemeralDuration: null,
    });
  });

  it('citer un message FLOU rend la réponse floue', () => {
    expect(
      contaminateReplyProtection({ requested: {}, quoted: { effectFlags: BLURRED, isBlurred: true } }),
    ).toEqual({ effectFlags: BLURRED, isBlurred: true, ephemeralDuration: null });
  });

  it('le flou se lit aussi sur la seule colonne isBlurred (message antérieur au bitfield)', () => {
    expect(contaminateReplyProtection({ requested: {}, quoted: { isBlurred: true } }).isBlurred).toBe(true);
  });

  it('citer une FLAMME-ŒIL rend la réponse flamme-œil, sans durée', () => {
    expect(contaminateReplyProtection({ requested: {}, quoted: { effectFlags: AFTER_READ } })).toEqual({
      effectFlags: AFTER_READ,
      isBlurred: false,
      ephemeralDuration: null,
    });
  });

  it('citer un éphémère à DURÉE donne la même durée', () => {
    expect(
      contaminateReplyProtection({ requested: {}, quoted: { effectFlags: EPHEMERAL, ephemeralDuration: 300 } }),
    ).toEqual({ effectFlags: EPHEMERAL, isBlurred: false, ephemeralDuration: 300 });
  });

  it('le mode éphémère du message cité est IMPOSÉ : le choix propre de la réponse est remplacé', () => {
    expect(
      contaminateReplyProtection({
        requested: { effectFlags: EPHEMERAL, ephemeralDuration: 86_400 },
        quoted: { effectFlags: AFTER_READ },
      }),
    ).toEqual({ effectFlags: AFTER_READ, isBlurred: false, ephemeralDuration: null });

    expect(
      contaminateReplyProtection({
        requested: { effectFlags: AFTER_READ },
        quoted: { effectFlags: EPHEMERAL, ephemeralDuration: 30 },
      }),
    ).toEqual({ effectFlags: EPHEMERAL, isBlurred: false, ephemeralDuration: 30 });
  });

  it('éphémère ET flou : la réponse gagne les deux', () => {
    expect(
      contaminateReplyProtection({ requested: {}, quoted: { effectFlags: AFTER_READ | BLURRED, isBlurred: true } }),
    ).toEqual({ effectFlags: AFTER_READ | BLURRED, isBlurred: true, ephemeralDuration: null });
  });

  it('contaminée par le flou, la réponse peut AJOUTER l’éphémère', () => {
    expect(
      contaminateReplyProtection({ requested: { ephemeralDuration: 60 }, quoted: { isBlurred: true } }),
    ).toEqual({ effectFlags: EPHEMERAL | BLURRED, isBlurred: true, ephemeralDuration: 60 });
  });

  it('contaminée par l’éphémère, la réponse peut AJOUTER le flou', () => {
    expect(
      contaminateReplyProtection({ requested: { isBlurred: true }, quoted: { effectFlags: AFTER_READ } }),
    ).toEqual({ effectFlags: AFTER_READ | BLURRED, isBlurred: true, ephemeralDuration: null });
  });

  it('la vue unique ne se transmet pas, et reste un choix libre de la réponse', () => {
    expect(contaminateReplyProtection({ requested: {}, quoted: { effectFlags: VIEW_ONCE } }).effectFlags).toBe(0);
    expect(
      contaminateReplyProtection({ requested: { effectFlags: VIEW_ONCE }, quoted: { effectFlags: BLURRED } }).effectFlags,
    ).toBe(VIEW_ONCE | BLURRED);
  });

  it('un bit EPHEMERAL sans durée ni flamme-œil (message hérité) ne transmet rien d’inventé', () => {
    expect(contaminateReplyProtection({ requested: {}, quoted: { effectFlags: EPHEMERAL } })).toEqual({
      effectFlags: 0,
      isBlurred: false,
      ephemeralDuration: null,
    });
  });
});

describe('imposedReplyProtection — ce que le composeur verrouille', () => {
  it('rien pour un message ordinaire', () => {
    expect(imposedReplyProtection({ effectFlags: GLOW })).toEqual({ blurred: false, ephemeral: null });
  });

  it('flou + flamme-œil', () => {
    expect(imposedReplyProtection({ effectFlags: AFTER_READ | BLURRED })).toEqual({
      blurred: true,
      ephemeral: { kind: 'after-read' },
    });
  });

  it('durée', () => {
    expect(imposedReplyProtection({ effectFlags: EPHEMERAL, ephemeralDuration: 15 })).toEqual({
      blurred: false,
      ephemeral: { kind: 'duration', seconds: 15 },
    });
  });
});
