import { describe, expect, test } from 'bun:test';

import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';

import { EXIT_ACTIONS, contentExitOf, exitOffers, mediaLeaves, quotedExitOf, type ExitAction, type ExitMessage } from './content-exit';

const NOW = 1_700_000_000_000;
const { EPHEMERAL, EPHEMERAL_AFTER_READ, VIEW_ONCE, BLURRED } = MESSAGE_EFFECT_FLAGS;

const message = (overrides: Partial<ExitMessage> = {}): ExitMessage => ({
  isViewOnce: false,
  viewOnceCount: 0,
  isBlurred: false,
  ...overrides,
});

const NATURES = {
  ordinary: message(),
  'timed-flame': message({ effectFlags: EPHEMERAL, ephemeralDuration: 300 }),
  'after-read-flame': message({ effectFlags: EPHEMERAL | EPHEMERAL_AFTER_READ }),
  'view-once': message({ isViewOnce: true }),
} as const;

const offeredBy = (subject: ExitMessage): readonly ExitAction[] => {
  const exit = contentExitOf(subject, NOW);
  return EXIT_ACTIONS.filter((action) => exitOffers(exit, action));
};

describe('la matrice nature × action — la loi de sortie projetée pour le web', () => {
  test('les huit sorties sont nommées', () => {
    expect([...EXIT_ACTIONS].sort()).toEqual(['compose', 'copy', 'forward', 'image', 'imageDiscussion', 'publish', 'save', 'share']);
  });

  test('un message ORDINAIRE offre toutes les sorties', () => {
    expect(contentExitOf(NATURES.ordinary, NOW).nature).toBe('ordinary');
    expect(offeredBy(NATURES.ordinary)).toEqual(EXIT_ACTIONS);
  });

  test('une FLAMME À DURÉE n’offre que le transfert, borné par sa durée', () => {
    const exit = contentExitOf(NATURES['timed-flame'], NOW);
    expect(exit.nature).toBe('timed-flame');
    expect(offeredBy(NATURES['timed-flame'])).toEqual(['forward']);
    expect(exit.forward).toEqual({ allowed: true, maxDurationSeconds: 300 });
  });

  test('une FLAMME APRÈS LECTURE n’offre aucune sortie', () => {
    const exit = contentExitOf(NATURES['after-read-flame'], NOW);
    expect(exit.nature).toBe('after-read-flame');
    expect(offeredBy(NATURES['after-read-flame'])).toEqual([]);
    expect(exit.forward).toEqual({ allowed: false, reason: 'after-read' });
  });

  test('une VUE UNIQUE n’offre aucune sortie', () => {
    const exit = contentExitOf(NATURES['view-once'], NOW);
    expect(exit.nature).toBe('view-once');
    expect(offeredBy(NATURES['view-once'])).toEqual([]);
    expect(exit.forward).toEqual({ allowed: false, reason: 'view-once' });
  });
});

describe('ce que la loi lit — jamais une seconde règle écrite ici', () => {
  test('la vue unique se lit aussi sur le BIT et sur une PIÈCE', () => {
    expect(offeredBy(message({ effectFlags: VIEW_ONCE }))).toEqual([]);
    expect(offeredBy(message({ attachments: [{ isViewOnce: true }] }))).toEqual([]);
  });

  test('`expiresAt` ne donne jamais la durée : un éphémère déclaré sans durée lisible est une flamme après lecture', () => {
    const exit = contentExitOf(message({ expiresAt: new Date(NOW + 60_000) }), NOW);
    expect(exit.nature).toBe('after-read-flame');
    expect(exit.forward).toEqual({ allowed: false, reason: 'after-read' });
  });

  test('la copie transférée d’une flamme porte durée ET après lecture : elle ne se retransfère pas', () => {
    expect(offeredBy(message({ effectFlags: EPHEMERAL | EPHEMERAL_AFTER_READ, ephemeralDuration: 60 }))).toEqual([]);
  });
});

describe('les restrictions existantes se composent avec la loi', () => {
  test('un message SUPPRIMÉ ou ÉCHU n’a plus de source : transfert indisponible, rien ne sort', () => {
    const deleted = contentExitOf(message({ deletedAt: new Date(NOW - 1) }), NOW);
    expect(deleted.forward).toEqual({ allowed: false, reason: 'unavailable' });
    expect(deleted.leaves).toBe(false);
    const expired = contentExitOf(message({ effectFlags: EPHEMERAL, ephemeralDuration: 30, expiresAt: new Date(NOW - 1) }), NOW);
    expect(expired.forward).toEqual({ allowed: false, reason: 'unavailable' });
  });

  test('le refus de NATURE se dit avant l’indisponibilité', () => {
    expect(contentExitOf(message({ isViewOnce: true, deletedAt: new Date(NOW - 1) }), NOW).forward).toEqual({ allowed: false, reason: 'view-once' });
  });

  test('un FLOU se transfère mais ne sort pas autrement', () => {
    expect(offeredBy(message({ isBlurred: true }))).toEqual(['forward']);
  });

  test('un média ne sort pas quand son message ou sa pièce est voilé par un bit, ou chiffré', () => {
    const piece = { isViewOnce: false, isBlurred: false };
    expect(mediaLeaves({ message: message(), piece, now: NOW })).toBe(true);
    expect(mediaLeaves({ message: message({ effectFlags: BLURRED }), piece, now: NOW })).toBe(false);
    expect(mediaLeaves({ message: message({ isEncrypted: true }), piece, now: NOW })).toBe(false);
    expect(mediaLeaves({ message: message(), piece: { ...piece, isEncrypted: true }, now: NOW })).toBe(false);
    expect(mediaLeaves({ message: message(), piece: { ...piece, effectFlags: BLURRED }, now: NOW })).toBe(false);
  });

  test('le média d’une flamme à durée ne sort pas, même en clair', () => {
    expect(mediaLeaves({ message: NATURES['timed-flame'], piece: { isViewOnce: false, isBlurred: false }, now: NOW })).toBe(false);
  });
});

/**
 * UNE CITATION N'EST PAS UN MESSAGE SERVI EN ENTIER (#9573). La passerelle
 * sert toujours `effectFlags` sur un message du fil ; sur une citation
 * reconstruite pour `message:new`, elle ne déclare la nature que d'un contenu
 * voilé — une flamme citée y arrive en clair, sans rien qui la dise. Sans la
 * déclaration, le verdict se FERME.
 */
describe('une citation dont la nature n’est pas déclarée ne sort pas', () => {
  const piece = { isViewOnce: false, isBlurred: false };

  test('sans `effectFlags`, la citation est fermée : ni transfert, ni sortie', () => {
    const exit = quotedExitOf(message(), NOW);
    expect(EXIT_ACTIONS.filter((action) => exitOffers(exit, action))).toEqual([]);
  });

  test('le verdict fermé l’est sur TOUS ses champs : rien n’y dit « non protégé »', () => {
    const exit = quotedExitOf(message(), NOW);
    expect(exit.readable).toBe(false);
    expect(exit.leaves).toBe(false);
    expect(exit.forward.allowed).toBe(false);
    expect(exit.nature).not.toBe('ordinary');
    expect('kind' in exit).toBe(false);
  });

  test('avec `effectFlags` servi, la loi juge la citation comme un message', () => {
    expect(quotedExitOf(message({ effectFlags: 0 }), NOW)).toEqual(contentExitOf(message({ effectFlags: 0 }), NOW));
    expect(quotedExitOf(message({ effectFlags: EPHEMERAL, ephemeralDuration: 60 }), NOW).leaves).toBe(false);
  });

  test('la pièce d’une citation non déclarée ne sort pas ; déclarée ordinaire, elle sort', () => {
    expect(mediaLeaves({ message: message(), piece, now: NOW, source: 'quote' })).toBe(false);
    expect(mediaLeaves({ message: message({ effectFlags: 0 }), piece, now: NOW, source: 'quote' })).toBe(true);
    expect(mediaLeaves({ message: message(), piece, now: NOW })).toBe(true);
  });
});
