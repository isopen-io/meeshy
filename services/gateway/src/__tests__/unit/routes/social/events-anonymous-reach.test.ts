/**
 * @jest-environment node
 *
 * #10483 — chaque affichage est compté, avec ou sans compte.
 *
 * Ces témoins passent par la VRAIE porte (`POST /social/events`) et un Prisma
 * en mémoire qui tient la loi de MongoDB (`reach-prisma.ts`) : ils lisent ce
 * qui a été ÉCRIT (compteurs, lignes `AnonymousPostOpen`, `PostImpression`),
 * jamais l'appel d'un double.
 */
import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';
import { makeReachPrisma, type ReachGuest, type ReachPost } from '../../../helpers/reach-prisma';
import { registerSocialEventRoutes, type SocialEventsDeps } from '../../../../routes/social/events';
import { creditPostView } from '../../../../services/posts/postViewCredit';
import { resetCacheStore } from '../../../../services/CacheStore';

jest.mock('../../../../services/PostService', () => ({ PostService: jest.fn() }));
jest.mock('../../../../services/MediaService', () => ({ MediaService: jest.fn() }));

const POST = '507f1f77bcf86cd799439011';
const OTHER = '507f1f77bcf86cd799439012';
const ROOT = '507f1f77bcf86cd799439013';
const REPOST = '507f1f77bcf86cd799439014';
const READER = '507f1f77bcf86cd7994390ff';
const GUEST: ReachGuest = { id: '507f1f77bcf86cd7994390ee', sessionTokens: ['guest-token-iphone', 'guest-token-web'] };

type Harness = ReturnType<typeof makeReachPrisma> & { app: FastifyInstance };

async function harness(
  posts: readonly ReachPost[],
  guests: readonly ReachGuest[] = [GUEST],
  world?: Parameters<typeof makeReachPrisma>[2],
): Promise<Harness> {
  // Le registre des ouvertures (`viewOpenLedger`) vit dans le CacheStore : un
  // banc neuf repart d'un registre vide.
  resetCacheStore();
  const fake = makeReachPrisma(posts, guests, world);
  const app = Fastify({ logger: false });
  app.decorate('prisma', fake.prisma as never);

  // Le régime du VRAI middleware facultatif : un jeton porteur = un compte ; un
  // X-Session-Token d'invité = un participant ; tout autre jeton (clé visiteur)
  // retombe sur le contexte non authentifié.
  const optionalAuth = async (req: FastifyRequest) => {
    const bearer = req.headers.authorization?.replace('Bearer ', '');
    const token = req.headers['x-session-token'] as string | undefined;
    const guest = guests.find((g) => token !== undefined && g.sessionTokens.includes(token));
    (req as unknown as { authContext: unknown }).authContext = bearer
      ? { type: 'user', isAuthenticated: true, isAnonymous: false, userId: bearer, registeredUser: { id: bearer, username: 'reader' } }
      : guest
        ? { type: 'anonymous', isAuthenticated: true, isAnonymous: true, userId: guest.id, participantId: guest.id, sessionToken: token }
        : { type: 'anonymous', isAuthenticated: false, isAnonymous: true, userId: 'anonymous' };
  };

  const postService = {
    recordView: async (postId: string, userId: string) => creditPostView(fake.prisma as never, { postId, userId }),
    getPostById: async () => null,
    recordMediaDownloads: async () => null,
    recordEngagementBatch: async () => 0,
  } as unknown as SocialEventsDeps['postService'];

  registerSocialEventRoutes(app, fake.prisma as never, optionalAuth, postService);
  await app.ready();
  return { ...fake, app };
}

const send = (app: FastifyInstance, events: unknown[], headers: Record<string, string>, ip = '203.0.113.7') =>
  app.inject({ method: 'POST', url: '/social/events', headers, payload: { events }, remoteAddress: ip });

const visitor = (n: number | string) => ({ 'x-session-token': `visitor_00000000-0000-4000-8000-${String(n).padStart(12, '0')}` });
const view = (postId: string, durationMs?: number) => ({ type: 'view', postId, ...(durationMs !== undefined ? { durationMs } : {}) });
const impression = (postId: string, extra: Record<string, unknown> = {}) => ({ type: 'impression', postId, ...extra });

const HEX64 = /^[0-9a-f]{64}$/;

describe('G3 — un anonyme est désigné par sa clé de lecteur, jamais par son jeton', () => {
  it('un invité réel et un visiteur écrivent une clé hex 64 qui n’est pas leur en-tête', async () => {
    const h = await harness([{ id: POST }]);
    await send(h.app, [view(POST)], { 'x-session-token': 'guest-token-iphone' });
    await send(h.app, [view(POST)], visitor(1));

    expect(h.opens).toHaveLength(2);
    h.opens.forEach((open) => expect(open.sessionKey).toMatch(HEX64));
    const ecrit = JSON.stringify(h.writes);
    expect(ecrit).not.toContain('guest-token-iphone');
    expect(ecrit).not.toContain(visitor(1)['x-session-token']);
    await h.app.close();
  });

  it('le même invité sur deux appareils est UN lecteur', async () => {
    const h = await harness([{ id: POST }]);
    await send(h.app, [view(POST)], { 'x-session-token': 'guest-token-iphone' });
    await send(h.app, [view(POST)], { 'x-session-token': 'guest-token-web' });

    expect(h.opens).toHaveLength(1);
    expect(h.store.read(POST)).toMatchObject({ viewCount: 2, uniqueViewCount: 1, anonymousUniqueViewCount: 1 });
    await h.app.close();
  });
});

describe('G4 — on ne compte que ce qu’un anonyme peut lire (isServableToAnonymous)', () => {
  const passe = new Date(Date.now() - 60_000);

  it.each([
    ['une story PUBLIC expirée', { id: POST, type: 'STORY', expiresAt: passe }],
    ['un auteur désactivé', { id: POST, author: { isActive: false, deletedAt: null, deactivatedAt: passe } }],
    ['un post réservé aux amis', { id: POST, visibility: 'FRIENDS' }],
  ])('%s ⇒ rejected, rien d’écrit', async (_nom, post) => {
    const h = await harness([post]);
    const res = await send(h.app, [view(POST), impression(POST)], visitor(1));

    expect(JSON.parse(res.payload).data).toMatchObject({ recorded: 0, rejected: 2 });
    expect(h.writes).toEqual([]);
    await h.app.close();
  });

  it('un repost public d’un original non public ⇒ rejected', async () => {
    const h = await harness([{ id: ROOT, visibility: 'FRIENDS' }, { id: REPOST, repostOfId: ROOT }]);
    const res = await send(h.app, [view(REPOST)], visitor(1));

    expect(JSON.parse(res.payload).data).toMatchObject({ recorded: 0, rejected: 1 });
    expect(h.writes).toEqual([]);
    await h.app.close();
  });

  it('un post public vivant ⇒ recorded', async () => {
    const h = await harness([{ id: POST }]);
    const res = await send(h.app, [view(POST)], visitor(1));

    expect(JSON.parse(res.payload).data).toMatchObject({ recorded: 1, rejected: 0 });
    await h.app.close();
  });
});

describe('G5 — la vue anonyme entre dans viewCount à chaque ouverture, une fois dans les uniques', () => {
  it('deux vues de la même clé ⇒ +2 au total, +1 unique ; la part anonyme et l’ouverture suivent', async () => {
    const h = await harness([{ id: POST }]);
    await send(h.app, [view(POST)], visitor(1));
    await send(h.app, [view(POST)], visitor(1));

    expect(h.store.read(POST)).toMatchObject({
      viewCount: 2, anonymousViewCount: 2, postOpenCount: 2, uniqueViewCount: 1, anonymousUniqueViewCount: 1,
    });
    await h.app.close();
  });

  it('deux clés ⇒ +2', async () => {
    const h = await harness([{ id: POST }]);
    await send(h.app, [view(POST)], visitor(1));
    await send(h.app, [view(POST)], visitor(2));

    expect(h.store.read(POST)).toMatchObject({ viewCount: 2, anonymousViewCount: 2 });
    await h.app.close();
  });

  it('la vue d’un repost crédite aussi sa racine', async () => {
    const h = await harness([{ id: ROOT }, { id: REPOST, repostOfId: ROOT, originalRepostOfId: ROOT }]);
    await send(h.app, [view(REPOST)], visitor(1));

    expect(h.store.read(REPOST)?.viewCount).toBe(1);
    expect(h.store.read(ROOT)).toMatchObject({ viewCount: 1, anonymousViewCount: 1 });
    await h.app.close();
  });

  it('la durée la plus longue est gardée, et la ligne vit 90 jours', async () => {
    const h = await harness([{ id: POST }]);
    await send(h.app, [view(POST, 4000)], visitor(1));
    await send(h.app, [view(POST, 9000)], visitor(1));
    await send(h.app, [view(POST, 2000)], visitor(1));

    expect(h.opens).toHaveLength(1);
    expect(h.opens[0].durationMs).toBe(9000);
    const jours = ((h.opens[0].expiresAt as Date).getTime() - Date.now()) / 86_400_000;
    expect(Math.round(jours)).toBe(90);
    expect(h.store.read(POST)).toMatchObject({ viewCount: 3, uniqueViewCount: 1 });
    await h.app.close();
  });

  it('la vue d’un compte puis celle d’un anonyme ⇒ +2 (populations disjointes)', async () => {
    const h = await harness([{ id: POST }]);
    await send(h.app, [view(POST)], { authorization: `Bearer ${READER}` });
    await send(h.app, [view(POST)], visitor(1));

    expect(h.store.read(POST)).toMatchObject({ viewCount: 2, anonymousViewCount: 1 });
    await h.app.close();
  });
});

describe('G6 — l’impression anonyme compte, sans ligne ni identité', () => {
  it('un lot anonyme d’impressions ⇒ impressionCount +1 et anonymousImpressionCount +1, sans PostImpression', async () => {
    const h = await harness([{ id: POST }, { id: OTHER }]);
    const res = await send(h.app, [impression(POST), impression(OTHER, { surface: 'visitor' })], visitor(1));

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload).data).toMatchObject({ recorded: 2, rejected: 0 });
    expect(h.store.read(POST)).toMatchObject({ impressionCount: 1, anonymousImpressionCount: 1 });
    expect(h.store.read(OTHER)).toMatchObject({ impressionCount: 1, anonymousImpressionCount: 1 });
    expect(h.impressions).toEqual([]);
    await h.app.close();
  });

  it('la même clé qui liste à nouveau ⇒ chaque listage compte, sans fenêtre', async () => {
    const h = await harness([{ id: POST }]);
    await send(h.app, [impression(POST)], visitor(1));
    const res = await send(h.app, [impression(POST), impression(POST)], visitor(1));

    expect(JSON.parse(res.payload).data.recorded).toBe(2);
    expect(h.store.read(POST)).toMatchObject({ impressionCount: 3, anonymousImpressionCount: 3 });
    await h.app.close();
  });

  it('la racine d’un repost reçoit l’impression', async () => {
    const h = await harness([{ id: ROOT }, { id: REPOST, repostOfId: ROOT, originalRepostOfId: ROOT }]);
    await send(h.app, [impression(REPOST)], visitor(1));

    expect(h.store.read(ROOT)).toMatchObject({ impressionCount: 1, anonymousImpressionCount: 1 });
    await h.app.close();
  });

  it.each([
    ['dwell', { type: 'dwell', postId: POST, sessionId: '6f1c2b9e-1d2a-4c55-9a1e-0a4b5c6d7e8f', contentType: 'POST', surface: 'feed', startedAt: '2026-10-13T00:00:00.000Z', dwellMs: 1000 }],
    ['download', { type: 'download', postId: POST, mediaIds: ['m1'] }],
  ])('un %s anonyme reste 403', async (_nom, event) => {
    const h = await harness([{ id: POST }]);
    const res = await send(h.app, [event], visitor(1));

    expect(res.statusCode).toBe(403);
    expect(h.writes).toEqual([]);
    await h.app.close();
  });
});

describe('G7 — le débit anonyme est borné par lecteur, et seulement HAUT par adresse', () => {
  it('121 lots d’une même adresse sous 121 clés visiteur ⇒ tous comptés (une IP partagée n’est pas un abus), l’adresse jamais écrite', async () => {
    const h = await harness([{ id: POST }]);
    const statuts: number[] = [];
    for (let i = 0; i < 121; i += 1) {
      statuts.push((await send(h.app, [impression(POST)], visitor(i), '198.51.100.23')).statusCode);
    }

    expect(statuts.every((s) => s === 200)).toBe(true);
    expect(h.store.read(POST)?.impressionCount).toBe(121);
    expect(JSON.stringify(h.writes)).not.toContain('198.51.100.23');
    await h.app.close();
  });

  it('61 lots d’une même clé ⇒ 429', async () => {
    const h = await harness([{ id: POST }]);
    const statuts: number[] = [];
    for (let i = 0; i < 61; i += 1) {
      statuts.push((await send(h.app, [view(POST)], visitor('meme'), `198.51.100.${i % 200}`)).statusCode);
    }

    expect(statuts.slice(0, 60).every((s) => s === 200)).toBe(true);
    expect(statuts[60]).toBe(429);
    await h.app.close();
  });
});

describe('G8 — le champ surface', () => {
  it('un ancien corps sans surface reste accepté', async () => {
    const h = await harness([{ id: POST }]);
    const res = await send(h.app, [impression(POST, { source: 'feed' })], { authorization: `Bearer ${READER}` });

    expect(res.statusCode).toBe(200);
    expect(h.impressions).toEqual([expect.objectContaining({ postId: POST, source: 'feed' })]);
    await h.app.close();
  });

  it('une surface inconnue est ignorée, le lot passe ; une source inconnue rend l’événement `ignored` (#10500)', async () => {
    const h = await harness([{ id: POST }]);
    const res = await send(h.app, [impression(POST, { surface: 'ailleurs' })], { authorization: `Bearer ${READER}` });
    const source = await send(h.app, [impression(POST, { source: 'ailleurs' })], { authorization: `Bearer ${READER}` });

    expect(res.statusCode).toBe(200);
    expect(h.impressions).toEqual([expect.objectContaining({ postId: POST, source: 'feed' })]);
    expect(h.impressions[0].surface ?? null).toBeNull();
    expect(source.statusCode).toBe(200);
    expect(JSON.parse(source.payload).data).toMatchObject({ recorded: 0, ignored: 1 });
    expect(h.impressions).toHaveLength(1);
    await h.app.close();
  });

  it('la surface d’un compte est persistée dans PostImpression, qu’il consente à l’analyse ou non (#10785)', async () => {
    const h = await harness([{ id: POST }]);
    await send(h.app, [impression(POST, { surface: 'reels' }), view(POST)], { authorization: `Bearer ${READER}` });
    expect(h.impressions).toEqual([expect.objectContaining({ postId: POST, source: 'feed', surface: 'reels' })]);
    await h.app.close();

    const consenting = await harness([{ id: POST }], [GUEST], { consentedUserIds: [READER] });
    await send(consenting.app, [impression(POST, { surface: 'reels' }), view(POST)], { authorization: `Bearer ${READER}` });
    expect(consenting.impressions).toEqual([expect.objectContaining({ postId: POST, surface: 'reels' })]);
    await consenting.app.close();
  });
});
