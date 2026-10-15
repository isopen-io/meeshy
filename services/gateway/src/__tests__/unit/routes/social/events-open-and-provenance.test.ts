/**
 * @jest-environment node
 *
 * #10483 — l'ENGAGEMENT D'OUVERTURE et la PROVENANCE d'une vue (demande du
 * porteur 2026-10-13).
 *
 *  - Le TAP sur un contenu d'un listing envoie `open` avec son ORIGINE (fil,
 *    profil, rail…) : il ne compte AUCUNE vue, seulement `openCountByOrigin`.
 *  - L'écran DÉTAIL (détail, lecteur de réels, lecteur de story) compte à
 *    chaque affichage UNE impression et UNE vue ; la vue porte sa PROVENANCE
 *    (listing + origine, notification, lien partagé, lien de suivi, externe,
 *    direct), rangée sur la ligne du lecteur et agrégée sur le post.
 *  - Une origine ou une provenance INCONNUE est ignorée, jamais un refus.
 *
 * Les témoins passent par la vraie porte et lisent ce qui a été ÉCRIT.
 */
import { describe, it, expect, jest } from '@jest/globals';
import {
  reachHarness, sendReach, visitorHeader, viewEvent, impressionEvent,
} from '../../../helpers/reach-harness';

jest.mock('../../../../services/PostService', () => ({ PostService: jest.fn() }));
jest.mock('../../../../services/MediaService', () => ({ MediaService: jest.fn() }));

const POST = '507f1f77bcf86cd799439031';
const NEXT_REEL = '507f1f77bcf86cd799439032';
const READER = '507f1f77bcf86cd7994390f1';
const AUTHOR = '507f1f77bcf86cd7994390f2';
const account = (id = READER) => ({ authorization: `Bearer ${id}` });

const openEvent = (postId: string, extra: Record<string, unknown> = {}) => ({ type: 'open', postId, ...extra });

describe('Le tap d’un listing — un engagement d’ouverture, jamais une vue', () => {
  it('un compte tape un post du fil ⇒ openCountByOrigin.feed +1, aucune vue', async () => {
    const h = await reachHarness([{ id: POST }]);
    const res = await sendReach(h.app, [openEvent(POST, { origin: 'feed' })], account());

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({ recorded: 1, rejected: 0 });
    const post = h.store.read(POST);
    expect(post?.openCountByOrigin).toEqual({ feed: 1 });
    expect(post?.viewCount ?? 0).toBe(0);
    expect(h.postViews).toHaveLength(0);
    await h.app.close();
  });

  it('chaque tap compte, par origine', async () => {
    const h = await reachHarness([{ id: POST }]);
    await sendReach(h.app, [openEvent(POST, { origin: 'feed' }), openEvent(POST, { origin: 'profile' })], account());
    await sendReach(h.app, [openEvent(POST, { origin: 'feed' })], account());

    expect(h.store.read(POST)?.openCountByOrigin).toEqual({ feed: 2, profile: 1 });
    await h.app.close();
  });

  it('un anonyme tape un post du profil ⇒ openCountByOrigin.profile +1, aucune vue ni ligne', async () => {
    const h = await reachHarness([{ id: POST }]);
    const res = await sendReach(h.app, [openEvent(POST, { origin: 'profile' })], visitorHeader(1));

    expect(res.statusCode).toBe(200);
    expect(h.store.read(POST)?.openCountByOrigin).toEqual({ profile: 1 });
    expect(h.store.read(POST)?.viewCount ?? 0).toBe(0);
    expect(h.opens).toHaveLength(0);
    await h.app.close();
  });

  it('une origine inconnue ou absente ⇒ comptée sous « other », le lot passe', async () => {
    const h = await reachHarness([{ id: POST }]);
    const res = await sendReach(h.app, [
      openEvent(POST, { origin: 'hologram' }),
      openEvent(POST),
      impressionEvent(POST),
    ], account());

    expect(res.statusCode).toBe(200);
    expect(h.store.read(POST)).toMatchObject({ openCountByOrigin: { other: 2 }, impressionCount: 1 });
    await h.app.close();
  });

  it('l’auteur qui tape son propre post ne compte pas', async () => {
    const h = await reachHarness([{ id: POST, authorId: AUTHOR }]);
    await sendReach(h.app, [openEvent(POST, { origin: 'profile' })], account(AUTHOR));

    expect(h.store.read(POST)?.openCountByOrigin).toBeUndefined();
    await h.app.close();
  });
});

describe('L’écran détail — une impression et une vue à chaque affichage, la vue porte sa provenance', () => {
  const detailOpening = (postId: string, view: Record<string, unknown>) => [
    impressionEvent(postId, { source: 'detail', surface: 'detail' }),
    viewEvent(postId, { surface: 'detail', ...view }),
  ];

  it('tap dans le fil puis détail ⇒ open feed, +1 impression, +1 vue provenance listing/feed', async () => {
    const h = await reachHarness([{ id: POST }]);
    await sendReach(h.app, [openEvent(POST, { origin: 'feed' })], account());
    await sendReach(h.app, detailOpening(POST, { provenance: 'listing', origin: 'feed' }), account());

    expect(h.store.read(POST)).toMatchObject({
      openCountByOrigin: { feed: 1 },
      impressionCount: 1,
      viewCount: 1,
      viewCountByProvenance: { listing: 1 },
      listingViewCountByOrigin: { feed: 1 },
    });
    expect(h.postViews).toEqual([expect.objectContaining({ provenance: 'listing', origin: 'feed', surface: 'detail' })]);
    await h.app.close();
  });

  it('rouvert ⇒ +1 impression et +1 vue ; la sortie avec durée ne recompte rien', async () => {
    const h = await reachHarness([{ id: POST }]);
    await sendReach(h.app, detailOpening(POST, { provenance: 'listing', origin: 'feed' }), account());
    await sendReach(h.app, [viewEvent(POST, { durationMs: 4000, provenance: 'listing', origin: 'feed' })], account());
    await sendReach(h.app, detailOpening(POST, { provenance: 'listing', origin: 'profile' }), account());

    expect(h.store.read(POST)).toMatchObject({
      impressionCount: 2,
      viewCount: 2,
      uniqueViewCount: 1,
      viewCountByProvenance: { listing: 2 },
      listingViewCountByOrigin: { feed: 1, profile: 1 },
    });
    await h.app.close();
  });

  it.each([
    ['tracking_link'],
    ['shared_link'],
    ['notification'],
    ['external'],
    ['direct'],
  ])('ouvert par %s ⇒ la vue porte cette provenance (compte)', async (provenance) => {
    const h = await reachHarness([{ id: POST }]);
    await sendReach(h.app, detailOpening(POST, { provenance }), account());

    expect(h.store.read(POST)).toMatchObject({ viewCount: 1, viewCountByProvenance: { [provenance]: 1 } });
    expect(h.store.read(POST)?.listingViewCountByOrigin).toBeUndefined();
    expect(h.postViews).toEqual([expect.objectContaining({ provenance })]);
    await h.app.close();
  });

  it.each([
    ['tracking_link'],
    ['shared_link'],
    ['direct'],
  ])('un anonyme ouvert par %s ⇒ +1 impression, +1 vue, provenance rangée sur sa ligne', async (provenance) => {
    const h = await reachHarness([{ id: POST }]);
    await sendReach(h.app, detailOpening(POST, { provenance }), visitorHeader(1));

    expect(h.store.read(POST)).toMatchObject({
      impressionCount: 1,
      anonymousViewCount: 1,
      viewCount: 1,
      viewCountByProvenance: { [provenance]: 1 },
    });
    expect(h.opens).toEqual([expect.objectContaining({ provenance })]);
    await h.app.close();
  });

  it('un anonyme venu d’un listing ⇒ origine rangée et agrégée', async () => {
    const h = await reachHarness([{ id: POST }]);
    await sendReach(h.app, [openEvent(POST, { origin: 'hashtag' })], visitorHeader(2));
    await sendReach(h.app, detailOpening(POST, { provenance: 'listing', origin: 'hashtag' }), visitorHeader(2));
    await sendReach(h.app, detailOpening(POST, { provenance: 'listing', origin: 'hashtag' }), visitorHeader(2));

    expect(h.store.read(POST)).toMatchObject({
      openCountByOrigin: { hashtag: 1 },
      viewCount: 2,
      viewCountByProvenance: { listing: 2 },
      listingViewCountByOrigin: { hashtag: 2 },
    });
    expect(h.opens).toEqual([expect.objectContaining({ provenance: 'listing', origin: 'hashtag' })]);
    await h.app.close();
  });

  it('une provenance inconnue est ignorée : la vue compte, rien n’est rangé', async () => {
    const h = await reachHarness([{ id: POST }]);
    const res = await sendReach(h.app, [viewEvent(POST, { provenance: 'carrier_pigeon', origin: 'teleport' })], account());

    expect(res.statusCode).toBe(200);
    expect(h.store.read(POST)?.viewCount).toBe(1);
    expect(h.store.read(POST)?.viewCountByProvenance).toBeUndefined();
    expect(h.postViews[0]?.provenance).toBeUndefined();
    await h.app.close();
  });

  it('un ancien client (vue sans provenance) est compté comme avant', async () => {
    const h = await reachHarness([{ id: POST }]);
    await sendReach(h.app, [viewEvent(POST)], visitorHeader(3));

    expect(h.store.read(POST)).toMatchObject({ viewCount: 1, anonymousViewCount: 1 });
    expect(h.store.read(POST)?.viewCountByProvenance).toBeUndefined();
    await h.app.close();
  });

  it('une origine sans provenance listing n’est pas agrégée par origine', async () => {
    const h = await reachHarness([{ id: POST }]);
    await sendReach(h.app, [viewEvent(POST, { provenance: 'direct', origin: 'feed' })], account());

    expect(h.store.read(POST)?.viewCountByProvenance).toEqual({ direct: 1 });
    expect(h.store.read(POST)?.listingViewCountByOrigin).toBeUndefined();
    expect(h.postViews[0]?.origin).toBeUndefined();
    await h.app.close();
  });
});

describe('Le lecteur de réels — un écran détail', () => {
  const reelShown = (postId: string, view: Record<string, unknown>) => [
    impressionEvent(postId, { source: 'detail', surface: 'reels' }),
    viewEvent(postId, { surface: 'reels', ...view }),
  ];

  it('réel tapé dans le fil ⇒ open feed, puis 1 impression + 1 vue ; balayage ⇒ +1/+1 listing/reels', async () => {
    const h = await reachHarness([{ id: POST, type: 'REEL' }, { id: NEXT_REEL, type: 'REEL' }]);
    await sendReach(h.app, [openEvent(POST, { origin: 'feed' })], account());
    await sendReach(h.app, reelShown(POST, { provenance: 'listing', origin: 'feed' }), account());
    await sendReach(h.app, reelShown(NEXT_REEL, { provenance: 'listing', origin: 'reels' }), account());

    expect(h.store.read(POST)).toMatchObject({
      openCountByOrigin: { feed: 1 }, impressionCount: 1, viewCount: 1, listingViewCountByOrigin: { feed: 1 },
    });
    expect(h.store.read(NEXT_REEL)).toMatchObject({
      impressionCount: 1, viewCount: 1, listingViewCountByOrigin: { reels: 1 },
    });
    expect(h.store.read(NEXT_REEL)?.openCountByOrigin).toBeUndefined();
    await h.app.close();
  });

  it('réel listé dans le profil sans tap ⇒ 1 impression seulement', async () => {
    const h = await reachHarness([{ id: POST, type: 'REEL' }]);
    await sendReach(h.app, [impressionEvent(POST, { source: 'profile', surface: 'profile' })], account());

    expect(h.store.read(POST)).toMatchObject({ impressionCount: 1 });
    expect(h.store.read(POST)?.viewCount ?? 0).toBe(0);
    expect(h.store.read(POST)?.openCountByOrigin).toBeUndefined();
    await h.app.close();
  });
});
