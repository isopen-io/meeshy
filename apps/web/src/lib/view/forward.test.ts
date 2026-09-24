import { describe, expect, test } from 'bun:test';

import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';

import { admitForward, forwardRefusalOf, type ForwardCandidate } from './forward';

/**
 * LA LOI DU TRANSFERT, CÔTÉ CLIENT (#5866) — miroir de `admitMessageForward`
 * (`services/gateway/src/services/messaging/forwardAdmission.ts:172-229`).
 *
 * Le serveur REFUSE déjà la vue unique ; une garde qui ne vivrait que là-bas
 * laisserait l'utilisateur découvrir l'interdit APRÈS l'aller-retour — et,
 * pire, après avoir cru choisir un destinataire.
 */

const candidate = (overrides: Partial<ForwardCandidate> = {}): ForwardCandidate => ({
  id: 'm1',
  isViewOnce: false,
  viewOnceCount: 0,
  isBlurred: false,
  ...overrides,
});

const NOW = 1_700_000_000_000;

describe('forwardRefusalOf — la règle serveur, rejouée avant l’aller-retour', () => {
  test('un message ordinaire ne rencontre aucun refus', () => {
    expect(forwardRefusalOf(candidate(), NOW)).toBeNull();
  });

  test('un message à VUE UNIQUE est refusé — `isViewOnce`', () => {
    expect(forwardRefusalOf(candidate({ isViewOnce: true }), NOW)).toBe('view-once');
  });

  test('la COLONNE ne suffit pas : le BIT du bitfield refuse aussi (forwardAdmission.ts:218)', () => {
    expect(forwardRefusalOf(candidate({ effectFlags: MESSAGE_EFFECT_FLAGS.VIEW_ONCE }), NOW)).toBe('view-once');
  });

  test('un ÉPHÉMÈRE encore vivant se transfère — le serveur lui fait HÉRITER sa durée', () => {
    expect(forwardRefusalOf(candidate({ expiresAt: new Date(NOW + 60_000) }), NOW)).toBeNull();
  });

  test('un éphémère ÉCHU n’a plus de source à copier', () => {
    expect(forwardRefusalOf(candidate({ expiresAt: new Date(NOW - 1) }), NOW)).toBe('unavailable');
  });

  test('un message SUPPRIMÉ n’a plus de source à copier', () => {
    expect(forwardRefusalOf(candidate({ deletedAt: new Date(NOW - 1000) }), NOW)).toBe('unavailable');
  });

  test('un FLOU se transfère — le serveur ne le refuse pas, le client non plus', () => {
    expect(forwardRefusalOf(candidate({ isBlurred: true }), NOW)).toBeNull();
  });
});

describe('admitForward — la SÉLECTION entière, jamais un transfert à moitié', () => {
  test('trois messages ordinaires ⇒ trois ids, dans l’ordre reçu', () => {
    const admission = admitForward([candidate({ id: 'a' }), candidate({ id: 'b' }), candidate({ id: 'c' })], NOW);
    expect(admission).toEqual({ admitted: true, ids: ['a', 'b', 'c'] });
  });

  test('UNE vue unique dans la sélection refuse TOUT le lot — jamais un envoi partiel silencieux', () => {
    const admission = admitForward([candidate({ id: 'a' }), candidate({ id: 'b', isViewOnce: true })], NOW);
    expect(admission).toEqual({ admitted: false, reason: 'view-once' });
  });

  test('une sélection vide est un refus, jamais un envoi de zéro message', () => {
    expect(admitForward([], NOW)).toEqual({ admitted: false, reason: 'unavailable' });
  });
});
