/**
 * Unit tests for the ORDERING helpers of the presence gate — a position obeys
 * the law of the field :
 * - mayOrderByRawPresence — who may ask the database for « online first » ;
 * - servedOnlineFirst — the stable comparator that re-ranks a served page on
 *   the presence it SERVES, and on nothing else.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import type { GlobalUserRoleType } from '@meeshy/shared/types/role-types';
import type { PresenceViewer } from '../../../../services/PresenceVisibilityService';
import { mayOrderByRawPresence, servedOnlineFirst } from '../../../../routes/users/presence-gate';

const viewerOf = (role: GlobalUserRoleType): PresenceViewer => ({ userId: 'viewer', role });
const PRIVILEGED: readonly GlobalUserRoleType[] = ['ADMIN', 'BIGBOSS'];
const ORDINARY: readonly GlobalUserRoleType[] = ['MODERATOR', 'AUDIT', 'ANALYST', 'USER', 'AGENT'];

// Trier « en ligne d'abord » en base, puis masquer `isOnline` à la sortie,
// laisse lire la présence dans la POSITION. Seul le viewer que la loi sert
// FULL — même pour une cible qu'elle ne sait pas résoudre — peut classer par
// la présence brute : pour lui, la position n'apprend rien que le champ ne dise.
describe('mayOrderByRawPresence', () => {
  it.each(PRIVILEGED)('%s ⇒ true — la loi le sert FULL, la position ne lui apprend rien', (role) => {
    expect(mayOrderByRawPresence(viewerOf(role))).toBe(true);
  });

  it.each(ORDINARY)('%s ⇒ false — un rang ordinaire, MODERATOR compris', (role) => {
    expect(mayOrderByRawPresence(viewerOf(role))).toBe(false);
  });

  it('viewer absent (anonyme / non authentifié) ⇒ false', () => {
    expect(mayOrderByRawPresence(null)).toBe(false);
  });
});

// Le comparateur ne connaît qu'UNE chose : `isOnline === true` tel que SERVI.
// Il ne renverse jamais deux lignes pour une autre raison — l'ordre de la
// base (nom, ancienneté) reste celui des lignes qu'il ne départage pas.
describe('servedOnlineFirst', () => {
  const row = (id: string, isOnline: boolean | null) => ({ id, isOnline });
  const ranked = (page: ReadonlyArray<{ id: string; isOnline: boolean | null }>) =>
    [...page].sort(servedOnlineFirst).map((r) => r.id);

  it('remonte les lignes servies en ligne, sans toucher à l\'ordre relatif des autres (tri stable)', () => {
    expect(ranked([row('a', false), row('b', true), row('c', null), row('d', true), row('e', false)]))
      .toEqual(['b', 'd', 'a', 'c', 'e']);
  });

  it('ne renverse JAMAIS deux lignes non servies en ligne — `null` et `false` sont un même rang', () => {
    expect(ranked([row('z', null), row('a', false), row('m', null)])).toEqual(['z', 'a', 'm']);
  });

  it('idempotent sur une page déjà classée par la présence servie', () => {
    const page = [row('b', true), row('d', true), row('a', false), row('e', null)];
    expect(ranked(page)).toEqual(['b', 'd', 'a', 'e']);
  });

  it('contrat du comparateur : négatif quand seul a est en ligne, positif quand seul b l\'est, nul sinon', () => {
    expect(servedOnlineFirst(row('a', true), row('b', false))).toBeLessThan(0);
    expect(servedOnlineFirst(row('a', false), row('b', true))).toBeGreaterThan(0);
    expect(servedOnlineFirst(row('a', true), row('b', true))).toBe(0);
    expect(servedOnlineFirst(row('a', false), row('b', false))).toBe(0);
    expect(servedOnlineFirst(row('a', null), row('b', false))).toBe(0);
  });
});
