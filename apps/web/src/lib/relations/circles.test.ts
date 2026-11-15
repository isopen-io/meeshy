import { describe, expect, test } from 'bun:test';

import type { FriendRequestRecord } from '@/lib/api/friend-requests';
import type { RelationLink } from '@/lib/api/relations';

import { circleSections, demotionOf, listedLinks, pendingRaiseOf, progressSummary, raiseOffer, raiseRequests, requestedLevelOf } from './circles';

/**
 * « MES CERCLES », LES RÈGLES PURES (#13938) — miroir de `CirclesViewModel`
 * (sections, demandes de montée, cran en attente) et de `CircleProgressSummary`
 * (`CirclesPresentation.swift`). Le client ne décide d'aucun niveau : il lit ce
 * que le serveur sert et ce que la loi de demande (`evaluateRelationRequest`,
 * `@meeshy/shared`) lui laisse PROPOSER.
 */

const NOW = new Date('2026-11-02T12:00:00.000Z');

const link = (overrides: Partial<RelationLink> = {}): RelationLink => ({
  userId: 'u-ada',
  effectiveLevel: 'FRIEND',
  grantedByMe: 'FRIEND',
  since: null,
  progress: { activeWeeks: 0, needed: null, missing: [] },
  eligibleFor: null,
  ...overrides,
});

const request = (overrides: Partial<FriendRequestRecord> = {}): FriendRequestRecord => ({
  id: 'f-1',
  senderId: 'u-ada',
  receiverId: 'u-me',
  status: 'pending',
  message: null,
  createdAt: '2026-11-01T09:00:00.000Z',
  sender: null,
  receiver: null,
  ...overrides,
});

describe('les liens qui se listent', () => {
  test('Connaissance et au-dessus ; Public et Communauté ne sont pas des liens', () => {
    const links = [link({ userId: 'a', effectiveLevel: 'PUBLIC' }), link({ userId: 'b', effectiveLevel: 'COMMUNITY' }), link({ userId: 'c', effectiveLevel: 'ACQUAINTANCE' })];
    expect(listedLinks(links).map((l) => l.userId)).toEqual(['c']);
  });

  test('les sections vont du plus proche au plus lointain, sans section vide, chacune triée par nom', () => {
    const links = [
      link({ userId: 'u-zoe', effectiveLevel: 'FRIEND' }),
      link({ userId: 'u-ada', effectiveLevel: 'FRIEND' }),
      link({ userId: 'u-bob', effectiveLevel: 'BLOOD' }),
      link({ userId: 'u-eve', effectiveLevel: 'ACQUAINTANCE' }),
    ];
    const names = new Map([
      ['u-zoe', 'Zoé'],
      ['u-ada', 'ada'],
      ['u-bob', 'Bob'],
    ]);
    const sections = circleSections(links, (id) => names.get(id) ?? null);
    expect(sections.map((s) => [s.level, s.links.map((l) => l.userId)])).toEqual([
      ['BLOOD', ['u-bob']],
      ['FRIEND', ['u-ada', 'u-zoe']],
      ['ACQUAINTANCE', ['u-eve']],
    ]);
  });

  test('une personne qu’on ne sait pas nommer se range après les autres, jamais devant', () => {
    const links = [link({ userId: 'u-x' }), link({ userId: 'u-ada' })];
    const sections = circleSections(links, (id) => (id === 'u-ada' ? 'Ada' : null));
    expect(sections[0]?.links.map((l) => l.userId)).toEqual(['u-ada', 'u-x']);
  });
});

describe('le cran proposé — la loi de demande, consommée', () => {
  test('Connaissance → Ami : ouvert, aucune série', () => {
    expect(raiseOffer(link({ effectiveLevel: 'ACQUAINTANCE' }), NOW)).toEqual({ kind: 'available', target: 'FRIEND' });
  });

  test('Ami → Proche : verrouillé tant que la série n’est pas servie comme atteinte', () => {
    expect(raiseOffer(link({ effectiveLevel: 'FRIEND' }), NOW)).toEqual({ kind: 'locked', target: 'CLOSE' });
    expect(raiseOffer(link({ effectiveLevel: 'FRIEND', eligibleFor: 'CLOSE' }), NOW)).toEqual({ kind: 'available', target: 'CLOSE' });
  });

  test('une éligibilité qui saute un cran n’ouvre rien', () => {
    expect(raiseOffer(link({ effectiveLevel: 'FRIEND', eligibleFor: 'BLOOD' }), NOW)).toEqual({ kind: 'locked', target: 'CLOSE' });
  });

  test('Proche → Sang avec sa série ; au sommet, plus rien', () => {
    expect(raiseOffer(link({ effectiveLevel: 'CLOSE', eligibleFor: 'BLOOD' }), NOW)).toEqual({ kind: 'available', target: 'BLOOD' });
    expect(raiseOffer(link({ effectiveLevel: 'BLOOD' }), NOW)).toEqual({ kind: 'none' });
  });
});

describe('ce que la ligne DIT de sa progression', () => {
  test('ce qui MANQUE d’abord, sans doublon et dans l’ordre servi', () => {
    expect(progressSummary(link({ effectiveLevel: 'ACQUAINTANCE', progress: { activeWeeks: 0, needed: null, missing: ['audio', 'message', 'audio'] } }), NOW)).toEqual({
      kind: 'missing',
      pieces: ['audio', 'message'],
    });
  });

  test('une nature inconnue se dit « une interaction », jamais sa clé', () => {
    expect(progressSummary(link({ progress: { activeWeeks: 0, needed: null, missing: ['hologram'] } }), NOW)).toEqual({ kind: 'missing', pieces: ['other'] });
  });

  test('puis ce qu’on PEUT demander', () => {
    expect(progressSummary(link({ effectiveLevel: 'FRIEND', eligibleFor: 'CLOSE', progress: { activeWeeks: 4, needed: 4, missing: [] } }), NOW)).toEqual({ kind: 'eligible', target: 'CLOSE' });
  });

  test('puis où l’on en est — borné au nombre exigé', () => {
    expect(progressSummary(link({ effectiveLevel: 'FRIEND', progress: { activeWeeks: 3, needed: 4, missing: [] } }), NOW)).toEqual({ kind: 'weeks', done: 3, needed: 4 });
    expect(progressSummary(link({ effectiveLevel: 'CLOSE', progress: { activeWeeks: 15, needed: 12, missing: [] } }), NOW)).toEqual({ kind: 'weeks', done: 12, needed: 12 });
  });

  test('puis rien : aucune série servie, ou le sommet', () => {
    expect(progressSummary(link({ effectiveLevel: 'FRIEND', progress: { activeWeeks: 2, needed: null, missing: [] } }), NOW)).toEqual({ kind: 'none' });
    expect(progressSummary(link({ effectiveLevel: 'BLOOD', progress: { activeWeeks: 30, needed: null, missing: [] } }), NOW)).toEqual({ kind: 'none' });
  });
});

describe('les demandes de montée — une projection des paniers, aucun second cache', () => {
  test('une demande sans cran se lit Ami, le sens historique', () => {
    expect(requestedLevelOf(request())).toBe('FRIEND');
    expect(requestedLevelOf(request({ targetLevel: 'BLOOD' }))).toBe('BLOOD');
  });

  test('seules les demandes EN ATTENTE d’une personne déjà dans mes cercles sont des montées', () => {
    const links = [link({ userId: 'u-ada' }), link({ userId: 'u-pub', effectiveLevel: 'PUBLIC' })];
    const received = [
      request({ id: 'r-ada', senderId: 'u-ada', targetLevel: 'CLOSE' }),
      request({ id: 'r-new', senderId: 'u-new' }),
      request({ id: 'r-pub', senderId: 'u-pub' }),
      request({ id: 'r-done', senderId: 'u-ada', status: 'accepted' }),
    ];
    const sent = [request({ id: 's-ada', senderId: 'u-me', receiverId: 'u-ada', targetLevel: 'BLOOD' }), request({ id: 's-new', senderId: 'u-me', receiverId: 'u-new' })];
    const { incoming, outgoing } = raiseRequests({ links, received, sent });
    expect(incoming.map((r) => r.id)).toEqual(['r-ada']);
    expect(outgoing.map((r) => r.id)).toEqual(['s-ada']);
  });

  test('le cran en attente se lit dans le panier des envoyées — l’optimiste compris', () => {
    const sent = [request({ id: 'optimiste:u-ada', senderId: 'u-me', receiverId: 'u-ada', targetLevel: 'CLOSE' })];
    expect(pendingRaiseOf(sent, 'u-ada')).toBe('CLOSE');
    expect(pendingRaiseOf(sent, 'u-bob')).toBeNull();
    expect(pendingRaiseOf([request({ senderId: 'u-me', receiverId: 'u-ada', status: 'accepted' })], 'u-ada')).toBeNull();
  });
});

describe('rétrograder ou annuler le lien (#14910) — un cran à la fois, jamais sous Connaissance par ce geste', () => {
  test('Sang → Proche → Ami → Connaissance : un cran sous le niveau EFFECTIF', () => {
    expect(demotionOf(link({ effectiveLevel: 'BLOOD', grantedByMe: 'BLOOD' }))).toEqual({ kind: 'demote', from: 'BLOOD', to: 'CLOSE' });
    expect(demotionOf(link({ effectiveLevel: 'CLOSE', grantedByMe: 'CLOSE' }))).toEqual({ kind: 'demote', from: 'CLOSE', to: 'FRIEND' });
    expect(demotionOf(link({ effectiveLevel: 'FRIEND', grantedByMe: 'FRIEND' }))).toEqual({ kind: 'demote', from: 'FRIEND', to: 'ACQUAINTANCE' });
  });

  test('sous l’accord quand j’accorde plus haut que l’effectif', () => {
    expect(demotionOf(link({ effectiveLevel: 'FRIEND', grantedByMe: 'BLOOD' }))).toEqual({ kind: 'demote', from: 'FRIEND', to: 'ACQUAINTANCE' });
  });

  test('à Connaissance, le geste devient « Annuler le lien » (PUBLIC)', () => {
    expect(demotionOf(link({ effectiveLevel: 'ACQUAINTANCE', grantedByMe: 'ACQUAINTANCE' }))).toEqual({ kind: 'unlink', from: 'ACQUAINTANCE', to: 'PUBLIC' });
  });

  test('sans lien, ou quand mon accord est déjà au plus bas, rien', () => {
    expect(demotionOf(link({ effectiveLevel: 'COMMUNITY' }))).toBeNull();
    expect(demotionOf(link({ effectiveLevel: 'PUBLIC' }))).toBeNull();
    expect(demotionOf(link({ effectiveLevel: 'ACQUAINTANCE', grantedByMe: 'PUBLIC' }))).toBeNull();
  });
});

describe('la montée masquée tant que la passerelle sert un délai (#14910)', () => {
  test('raiseBlockedUntil dans le futur verrouille ; passé ou absent, la loi habituelle', () => {
    const eligible = link({ effectiveLevel: 'FRIEND', eligibleFor: 'CLOSE' });
    expect(raiseOffer({ ...eligible, raiseBlockedUntil: '2026-12-01T00:00:00.000Z' }, NOW)).toEqual({ kind: 'locked', target: 'CLOSE' });
    expect(raiseOffer({ ...eligible, raiseBlockedUntil: '2020-01-01T00:00:00.000Z' }, NOW)).toEqual({ kind: 'available', target: 'CLOSE' });
    expect(raiseOffer({ ...eligible, raiseBlockedUntil: 'pas une date' }, NOW)).toEqual({ kind: 'available', target: 'CLOSE' });
    expect(raiseOffer(eligible, NOW)).toEqual({ kind: 'available', target: 'CLOSE' });
  });
});

describe('la montée suit `canRaise` quand la passerelle le sert (#14910)', () => {
  test('false ⇒ verrouillée même éligible ; true ⇒ ouverte ; absent ⇒ la loi habituelle', () => {
    const eligible = link({ effectiveLevel: 'FRIEND', eligibleFor: 'CLOSE' });
    expect(raiseOffer({ ...eligible, canRaise: false }, NOW)).toEqual({ kind: 'locked', target: 'CLOSE' });
    expect(raiseOffer({ ...link({ effectiveLevel: 'FRIEND' }), canRaise: true }, NOW)).toEqual({ kind: 'available', target: 'CLOSE' });
    expect(raiseOffer({ ...link({ effectiveLevel: 'BLOOD' }), canRaise: true }, NOW)).toEqual({ kind: 'none' });
    expect(raiseOffer(eligible, NOW)).toEqual({ kind: 'available', target: 'CLOSE' });
  });
});
