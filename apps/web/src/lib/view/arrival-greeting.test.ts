import { describe, expect, test } from 'bun:test';

import { ARRIVALS_NOTICE_KIND, type ArrivalsNoticeMetadata } from '@meeshy/shared/utils/arrivals-notice';

import { arrivalGreetingOf, greetingInsertion } from './arrival-greeting';
import type { SystemRow } from './message-badges';

/**
 * #16338 — « DIS-LUI SALUT » : l'avis d'arrivée porte une invite, et son toucher
 * écrit la mention de chaque arrivant dans le composeur.
 */
const join = (patch: Partial<Extract<SystemRow, { kind: 'join' }>> = {}): SystemRow => ({
  kind: 'join',
  displayName: 'Tom',
  handle: null,
  isAnonymous: false,
  username: 'tom_b',
  ...patch,
});

const arrivals = (list: ArrivalsNoticeMetadata['arrivals'], count = list.length): SystemRow => ({
  kind: 'arrivals',
  notice: { kind: ARRIVALS_NOTICE_KIND, arrivals: list, count, windowStartedAt: '2026-11-05T10:00:00.000Z' },
});

describe('arrivalGreetingOf — à qui le salut s’adresse', () => {
  test('un arrivant avec un compte : sa mention, au singulier', () => {
    expect(arrivalGreetingOf(join(), null)).toEqual({ mentions: ['@tom_b'], plural: false });
  });

  test('un visiteur sans compte n’a pas de pseudo à mentionner : aucune invite', () => {
    expect(arrivalGreetingOf(join({ isAnonymous: true, username: 'ano_x' }), null)).toBeNull();
    expect(arrivalGreetingOf(join({ username: undefined }), null)).toBeNull();
  });

  test('plusieurs arrivées : TOUTES les mentions connues, au pluriel ; un arrivant sans pseudo est sauté', () => {
    const row = arrivals([
      { participantId: 'p1', displayName: 'Léa', username: 'lea' },
      { participantId: 'p2', displayName: 'Omar' },
      { participantId: 'p3', displayName: 'Zoé', username: 'zoe' },
    ]);
    expect(arrivalGreetingOf(row, null)).toEqual({ mentions: ['@lea', '@zoe'], plural: true });
  });

  test('le lecteur ne se salue pas lui-même', () => {
    expect(arrivalGreetingOf(join(), 'tom_b')).toBeNull();
    const row = arrivals([
      { participantId: 'p1', displayName: 'Moi', username: 'me' },
      { participantId: 'p2', displayName: 'Léa', username: 'lea' },
    ]);
    expect(arrivalGreetingOf(row, 'me')).toEqual({ mentions: ['@lea'], plural: false });
  });

  test('une ligne d’arrivées écrite avant le pseudo n’a personne à mentionner : aucune invite', () => {
    expect(arrivalGreetingOf(arrivals([{ participantId: 'p1', displayName: 'Léa' }]), null)).toBeNull();
  });

  test('les autres rangées système ne saluent personne', () => {
    expect(arrivalGreetingOf({ kind: 'notice', text: 'x' }, null)).toBeNull();
  });
});

describe('greetingInsertion — ce que le composeur reçoit', () => {
  test('les mentions, séparées et suivies d’une espace', () => {
    expect(greetingInsertion({ mentions: ['@a', '@b'], plural: true })).toBe('@a @b ');
  });
});
