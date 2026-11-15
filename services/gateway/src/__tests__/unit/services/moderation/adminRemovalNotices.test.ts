/**
 * Un retrait fait depuis la console d'administration prévient l'auteur (#11158),
 * par la même notification `content_removed` que le retrait depuis l'app.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';

import { noticeAdminRemoval, noticeWithdrawals } from '../../../../services/moderation/adminRemovalNotices';

const AUTHOR = '64b7f0c2a1b2c3d4e5f60001';
const ACTOR = '64b7f0c2a1b2c3d4e5f60002';
const HIDDEN_AT = new Date('2026-10-20T10:00:00.000Z');

const flushDetached = () => new Promise((resolve) => setImmediate(resolve));

const buildDeps = () => ({
  prisma: { user: { findUnique: jest.fn<any>(async () => ({ systemLanguage: 'fr' })) } } as never,
  notifications: { createNotification: jest.fn<any>(async () => ({ id: 'n1' })) },
});

const callsOf = (deps: ReturnType<typeof buildDeps>) =>
  deps.notifications.createNotification.mock.calls.map(([call]) => call as { userId: string; content: string; metadata: Record<string, unknown> });

const plan = (over: Record<string, unknown> = {}) => ({
  row: { id: 'p1', authorId: AUTHOR, type: 'REEL' },
  before: { visibility: 'PUBLIC', moderationHiddenAt: null },
  after: { visibility: 'PRIVATE', moderationHiddenAt: HIDDEN_AT },
  ...over,
});

describe('noticeAdminRemoval — un retrait de la console', () => {
  it("prévient l'auteur seul, motif nettoyé, sans l'identité du modérateur", async () => {
    const deps = buildDeps();

    noticeAdminRemoval(deps, { actorUserId: ACTOR, authorUserId: AUTHOR, contentType: 'comment', contentId: 'c1', postId: 'p1', reason: '  Propos haineux ' });
    await flushDetached();

    const [call] = callsOf(deps);
    expect(callsOf(deps)).toHaveLength(1);
    expect(call).toMatchObject({ userId: AUTHOR, type: 'content_removed', content: 'Motif : Propos haineux' });
    expect(call.metadata).toEqual({ contentType: 'comment', contentId: 'c1', postId: 'p1', reason: 'Propos haineux' });
    expect(JSON.stringify(call)).not.toContain(ACTOR);
  });

  it('le rang souverain sans motif : la notification part, sans ligne motif', async () => {
    const deps = buildDeps();

    noticeAdminRemoval(deps, { actorUserId: ACTOR, authorUserId: AUTHOR, contentType: 'post', contentId: 'p1', postId: 'p1', reason: undefined });
    await flushDetached();

    const [call] = callsOf(deps);
    expect(call.content).toBe('');
    expect(call.metadata.reason).toBeUndefined();
  });

  it("ne prévient personne quand l'acteur retire son propre contenu", async () => {
    const deps = buildDeps();

    noticeAdminRemoval(deps, { actorUserId: AUTHOR, authorUserId: AUTHOR, contentType: 'post', contentId: 'p1', reason: 'Doublon' });
    await flushDetached();

    expect(callsOf(deps)).toEqual([]);
  });
});

describe('noticeWithdrawals — les publications mises hors ligne ou en privé', () => {
  it("prévient l'auteur de chaque publication NOUVELLEMENT mise hors ligne, avec son type", async () => {
    const deps = buildDeps();

    noticeWithdrawals(deps, [plan(), plan({ row: { id: 'p2', authorId: AUTHOR, type: 'STORY' } })], { actorUserId: ACTOR, reason: 'Nudité' });
    await flushDetached();

    expect(callsOf(deps).map((call) => call.metadata)).toEqual([
      { contentType: 'reel', contentId: 'p1', postId: 'p1', reason: 'Nudité' },
      { contentType: 'story', contentId: 'p2', postId: 'p2', reason: 'Nudité' },
    ]);
  });

  it("une publication passée en PRIVÉ prévient son auteur, avec le libellé « rendu privé » et madePrivate", async () => {
    const deps = buildDeps();

    noticeWithdrawals(deps, [plan({ row: { id: 'p3', authorId: AUTHOR, type: 'POST' }, after: { visibility: 'PRIVATE', moderationHiddenAt: null } })], { actorUserId: ACTOR, reason: 'Hors sujet' });
    await flushDetached();

    const [call] = callsOf(deps) as unknown as [{ title: string; content: string; metadata: Record<string, unknown> }];
    expect(call.title).toBe('Votre publication a été rendue privée par la modération');
    expect(call.content).toBe('Motif : Hors sujet');
    expect(call.metadata).toEqual({ contentType: 'post', contentId: 'p3', postId: 'p3', reason: 'Hors sujet', madePrivate: true });
  });

  it("ne prévient ni d'une copie, ni d'une remise en ligne, ni d'un resserrement à FRIENDS, ni d'une publication déjà hors ligne ou déjà privée", async () => {
    const deps = buildDeps();

    noticeWithdrawals(deps, [
      plan({ copyOf: 'p0' }),
      plan({ before: { visibility: 'PRIVATE', moderationHiddenAt: HIDDEN_AT }, after: { visibility: 'PUBLIC', moderationHiddenAt: null } }),
      plan({ after: { visibility: 'FRIENDS', moderationHiddenAt: null } }),
      plan({ before: { visibility: 'PRIVATE', moderationHiddenAt: HIDDEN_AT } }),
      plan({ before: { visibility: 'PRIVATE', moderationHiddenAt: null }, after: { visibility: 'PRIVATE', moderationHiddenAt: null } }),
      plan({ after: null }),
    ], { actorUserId: ACTOR, reason: 'Nudité' });
    await flushDetached();

    expect(callsOf(deps)).toEqual([]);
  });
});
