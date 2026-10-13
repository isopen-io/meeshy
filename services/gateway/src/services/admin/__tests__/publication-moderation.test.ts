/**
 * La loi des trois gestes de modération d'une publication (#10315) :
 * « Mettre en privé », « Mettre hors ligne », « Remettre en ligne ».
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import {
  nextModerationState,
  withdrawsAudience,
  publicationStateOf,
  liftsSomeoneElsesHold,
  nextVisibilityState,
  widensAuthorAudience,
  adminStateOf,
  type PostModerationState,
} from '../publication-moderation';

const NOW = new Date('2026-10-12T10:00:00.000Z');
const EARLIER = new Date('2026-10-11T08:00:00.000Z');

const ACTOR = 'actor';
const CTX = { now: NOW, actorId: ACTOR };

const state = (over: Partial<PostModerationState> = {}): PostModerationState => ({
  visibility: 'PUBLIC',
  moderationHiddenAt: null,
  moderationHiddenById: null,
  moderationPriorVisibility: null,
  ...over,
});

describe('nextModerationState — mettre en privé', () => {
  it("force PRIVATE et retient l'audience de l'auteur pour la rendre", () => {
    expect(nextModerationState('make-private', state({ visibility: 'FRIENDS' }), CTX)).toEqual({
      visibility: 'PRIVATE',
      moderationHiddenAt: null,
      moderationHiddenById: null,
      moderationPriorVisibility: 'FRIENDS',
    });
  });

  it('ne touche à rien quand la publication est déjà privée', () => {
    expect(nextModerationState('make-private', state({ visibility: 'PRIVATE' }), CTX)).toBeNull();
  });

  it("retient l'audience de l'AUTEUR, même quand l'administration l'avait resserrée (#10471)", () => {
    const after = nextModerationState('make-private', state({ visibility: 'FRIENDS', moderationPriorVisibility: 'PUBLIC' }), CTX);
    expect(after?.moderationPriorVisibility).toBe('PUBLIC');
  });
});

describe('nextModerationState — mettre hors ligne', () => {
  it('date et signe le retrait, force PRIVATE et retient l’audience', () => {
    expect(nextModerationState('take-offline', state({ visibility: 'PUBLIC' }), CTX)).toEqual({
      visibility: 'PRIVATE',
      moderationHiddenAt: NOW,
      moderationHiddenById: ACTOR,
      moderationPriorVisibility: 'PUBLIC',
    });
  });

  it("garde l'audience retenue par une mise en privé antérieure", () => {
    const after = nextModerationState('take-offline', state({ visibility: 'PRIVATE', moderationPriorVisibility: 'COMMUNITY' }), CTX);
    expect(after).toEqual({ visibility: 'PRIVATE', moderationHiddenAt: NOW, moderationHiddenById: ACTOR, moderationPriorVisibility: 'COMMUNITY' });
  });

  it("ne retient rien quand l'auteur l'avait lui-même rendue privée", () => {
    const after = nextModerationState('take-offline', state({ visibility: 'PRIVATE' }), CTX);
    expect(after?.moderationPriorVisibility).toBeNull();
  });

  it('ne redate pas un retrait déjà en place', () => {
    expect(nextModerationState('take-offline', state({ visibility: 'PRIVATE', moderationHiddenAt: EARLIER }), CTX)).toBeNull();
  });
});

describe('nextModerationState — remettre en ligne', () => {
  it("lève le retrait et rend l'audience que l'auteur avait choisie", () => {
    const after = nextModerationState('restore', state({ visibility: 'PRIVATE', moderationHiddenAt: EARLIER, moderationHiddenById: 'admin', moderationPriorVisibility: 'EXCEPT' }), CTX);
    expect(after).toEqual({ visibility: 'EXCEPT', moderationHiddenAt: null, moderationHiddenById: null, moderationPriorVisibility: null });
  });

  it("rend l'audience de l'auteur après un resserrement par l'administration (#10471)", () => {
    const after = nextModerationState('restore', state({ visibility: 'FRIENDS', moderationPriorVisibility: 'PUBLIC' }), CTX);
    expect(after).toEqual({ visibility: 'PUBLIC', moderationHiddenAt: null, moderationHiddenById: null, moderationPriorVisibility: null });
  });

  it("rend l'audience de l'auteur à une publication resserrée PUIS mise hors ligne (#10471)", () => {
    const narrowed = nextVisibilityState(state({ visibility: 'PUBLIC' }), 'FRIENDS');
    const offline = narrowed === null ? null : nextModerationState('take-offline', narrowed, CTX);
    expect(offline?.moderationPriorVisibility).toBe('PUBLIC');
    expect(offline === null ? null : nextModerationState('restore', offline, CTX)?.visibility).toBe('PUBLIC');
  });

  it("laisse privée une publication que l'auteur avait rendue privée lui-même", () => {
    const after = nextModerationState('restore', state({ visibility: 'PRIVATE', moderationHiddenAt: EARLIER }), CTX);
    expect(after).toEqual({ visibility: 'PRIVATE', moderationHiddenAt: null, moderationHiddenById: null, moderationPriorVisibility: null });
  });

  it("n'a rien à faire sur une publication jamais modérée", () => {
    expect(nextModerationState('restore', state({ visibility: 'PUBLIC' }), CTX)).toBeNull();
  });
});

describe('withdrawsAudience', () => {
  it("vaut vrai quand le geste retire la publication à son audience", () => {
    expect(withdrawsAudience(state({ visibility: 'FRIENDS' }), state({ visibility: 'PRIVATE' }))).toBe(true);
  });

  it('vaut faux quand elle était déjà privée', () => {
    expect(withdrawsAudience(state({ visibility: 'PRIVATE' }), state({ visibility: 'PRIVATE', moderationHiddenAt: NOW }))).toBe(false);
  });
});

describe('publicationStateOf', () => {
  const row = (over: Record<string, unknown> = {}) => ({
    visibility: 'PUBLIC' as const,
    deletedAt: null,
    expiresAt: null,
    moderationHiddenAt: null,
    ...over,
  });

  it('dit « supprimée » avant tout autre état', () => {
    expect(publicationStateOf(row({ deletedAt: EARLIER, moderationHiddenAt: EARLIER }), NOW)).toBe('deleted');
  });

  it('dit « hors ligne » pour un retrait de modération', () => {
    expect(publicationStateOf(row({ visibility: 'PRIVATE', moderationHiddenAt: EARLIER }), NOW)).toBe('offline');
  });

  it('dit « expirée » pour une story passée', () => {
    expect(publicationStateOf(row({ expiresAt: EARLIER }), NOW)).toBe('expired');
  });

  it('dit « privée » pour une audience réduite à son auteur', () => {
    expect(publicationStateOf(row({ visibility: 'PRIVATE' }), NOW)).toBe('private');
  });

  it('dit « en ligne » sinon', () => {
    expect(publicationStateOf(row({ visibility: 'FRIENDS', expiresAt: new Date('2026-10-13T00:00:00Z') }), NOW)).toBe('online');
  });
});

describe('liftsSomeoneElsesHold — lever le retrait d’un autre exige son rang', () => {
  const held = state({ visibility: 'PRIVATE', moderationHiddenAt: EARLIER, moderationHiddenById: 'admin' });
  const lifted = state({ visibility: 'PUBLIC' });

  it('vaut vrai quand le retrait levé a été posé par un autre', () => {
    expect(liftsSomeoneElsesHold(held, lifted, ACTOR)).toBe(true);
  });

  it('vaut faux pour qui lève son propre retrait', () => {
    expect(liftsSomeoneElsesHold(held, lifted, 'admin')).toBe(false);
  });

  it('compte un signataire inconnu comme un autre — fail-closed', () => {
    expect(liftsSomeoneElsesHold(state({ visibility: 'PRIVATE', moderationHiddenAt: EARLIER }), lifted, ACTOR)).toBe(true);
  });

  it('vaut faux quand rien n’est levé', () => {
    expect(liftsSomeoneElsesHold(state({ visibility: 'FRIENDS' }), state({ visibility: 'PRIVATE', moderationPriorVisibility: 'FRIENDS' }), ACTOR)).toBe(false);
  });
});

describe('nextVisibilityState — changer l’audience d’un geste (#10392)', () => {
  it("rendre à une publication l'audience de son auteur oublie l'audience retenue", () => {
    expect(nextVisibilityState(state({ visibility: 'PRIVATE', moderationPriorVisibility: 'FRIENDS' }), 'FRIENDS')).toEqual({
      visibility: 'FRIENDS',
      moderationHiddenAt: null,
      moderationHiddenById: null,
      moderationPriorVisibility: null,
    });
  });

  it("lève le retrait quand on remet en ligne une publication hors ligne avec une audience plus étroite, et garde celle de l'auteur", () => {
    expect(
      nextVisibilityState(state({ visibility: 'PRIVATE', moderationHiddenAt: EARLIER, moderationHiddenById: ACTOR, moderationPriorVisibility: 'PUBLIC' }), 'FRIENDS'),
    ).toEqual({ visibility: 'FRIENDS', moderationHiddenAt: null, moderationHiddenById: null, moderationPriorVisibility: 'PUBLIC' });
  });

  it('Publique → Amis → Publique : le resserrement retient l’audience de l’auteur, le retour passe (#10471)', () => {
    const narrowed = nextVisibilityState(state({ visibility: 'PUBLIC' }), 'FRIENDS');
    expect(narrowed).toEqual({ visibility: 'FRIENDS', moderationHiddenAt: null, moderationHiddenById: null, moderationPriorVisibility: 'PUBLIC' });
    expect(narrowed === null ? null : widensAuthorAudience(narrowed, 'PUBLIC')).toBe(false);
    expect(narrowed === null ? null : nextVisibilityState(narrowed, 'PUBLIC')).toEqual({
      visibility: 'PUBLIC',
      moderationHiddenAt: null,
      moderationHiddenById: null,
      moderationPriorVisibility: null,
    });
  });

  it('deux resserrements de suite gardent l’audience de l’auteur, jamais celle du premier', () => {
    expect(nextVisibilityState(state({ visibility: 'FRIENDS', moderationPriorVisibility: 'PUBLIC' }), 'COMMUNITY')?.moderationPriorVisibility).toBe('PUBLIC');
  });

  it("passer en PRIVATE retient l'audience d'avant, comme « mettre en privé »", () => {
    expect(nextVisibilityState(state({ visibility: 'COMMUNITY' }), 'PRIVATE')).toEqual({
      visibility: 'PRIVATE',
      moderationHiddenAt: null,
      moderationHiddenById: null,
      moderationPriorVisibility: 'COMMUNITY',
    });
  });

  it('ne change rien quand l’audience est déjà celle demandée, sans retrait', () => {
    expect(nextVisibilityState(state({ visibility: 'PUBLIC' }), 'PUBLIC')).toBeNull();
    expect(nextVisibilityState(state({ visibility: 'PRIVATE', moderationPriorVisibility: 'FRIENDS' }), 'PRIVATE')).toBeNull();
  });
});

describe('publicationStateOf / adminPostStateOf — une seule définition', () => {
  it('publié se dit « published » pour la liste de la plateforme', () => {
    expect(adminStateOf({ visibility: 'PUBLIC', deletedAt: null, expiresAt: null, moderationHiddenAt: null }, NOW)).toBe('published');
    expect(adminStateOf({ visibility: 'PRIVATE', deletedAt: null, expiresAt: null, moderationHiddenAt: EARLIER }, NOW)).toBe('offline');
  });
});

describe("widensAuthorAudience — l'administration ne publie jamais au-delà de l'audience de l'auteur", () => {
  it.each([
    ['PRIVATE', null, 'PUBLIC'],
    ['PRIVATE', null, 'FRIENDS'],
    ['FRIENDS', null, 'PUBLIC'],
    ['FRIENDS', null, 'COMMUNITY'],
    ['COMMUNITY', null, 'FRIENDS'],
    ['ONLY', null, 'FRIENDS'],
    ['EXCEPT', null, 'FRIENDS'],
    ['EXCEPT', null, 'PUBLIC'],
  ] as const)('%s (avant retrait : %s) vers %s : élargit', (visibility, prior, target) => {
    expect(widensAuthorAudience(state({ visibility, moderationPriorVisibility: prior }), target)).toBe(true);
  });

  it.each([
    ['PUBLIC', null, 'FRIENDS'],
    ['PUBLIC', null, 'COMMUNITY'],
    ['PUBLIC', null, 'PRIVATE'],
    ['FRIENDS', null, 'FRIENDS'],
    ['ONLY', null, 'PRIVATE'],
    ['PRIVATE', 'PUBLIC', 'PUBLIC'],
    ['PRIVATE', 'FRIENDS', 'FRIENDS'],
  ] as const)('%s (avant retrait : %s) vers %s : n’élargit pas', (visibility, prior, target) => {
    expect(widensAuthorAudience(state({ visibility, moderationPriorVisibility: prior }), target)).toBe(false);
  });

  it("une publication hors ligne se juge sur l'audience que l'auteur avait choisie, pas sur PRIVATE", () => {
    const offline = state({ visibility: 'PRIVATE', moderationHiddenAt: EARLIER, moderationHiddenById: 'x', moderationPriorVisibility: 'FRIENDS' });
    expect(widensAuthorAudience(offline, 'FRIENDS')).toBe(false);
    expect(widensAuthorAudience(offline, 'PUBLIC')).toBe(true);
  });
});
