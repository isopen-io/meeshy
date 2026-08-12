/**
 * Service tests — PostService.recordMediaDownloads
 *
 * Deux invariants critiques y sont verrouillés :
 *  1. Les mediaIds sont DÉDUPLIQUÉS avant écriture. `updateMany` avec un filtre
 *     `in` ne matche qu'une fois un id répété : sans dédup en amont, deux
 *     lignes d'historique seraient écrites pour un seul incrément de compteur,
 *     et les deux divergeraient silencieusement et définitivement.
 *  2. `Post.downloadCount` compte des ACTIONS (+1 par appel), pendant que
 *     `PostMedia.downloadCount` compte des MÉDIAS (+1 chacun). Leur écart est
 *     l'information, pas un bug à corriger.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { PostService } from '../services/PostService';

const POST_ID = '507f1f77bcf86cd799439011';
const MEDIA_A = '507f1f77bcf86cd799439021';
const MEDIA_B = '507f1f77bcf86cd799439022';
const FOREIGN_MEDIA = '507f1f77bcf86cd799439099';
const USER_ID = '507f1f77bcf86cd799439031';

const postFindFirst = jest.fn<(...a: unknown[]) => Promise<unknown>>();
const mediaFindMany = jest.fn<(...a: unknown[]) => Promise<unknown>>();
const downloadCreateMany = jest.fn<(...a: unknown[]) => Promise<unknown>>();
const mediaUpdateMany = jest.fn<(...a: unknown[]) => Promise<unknown>>();
const postUpdate = jest.fn<(...a: unknown[]) => Promise<unknown>>();

/**
 * Même pattern que `posts-view-idempotence.test.ts` : le service est instancié
 * avec un prisma stub à UN seul argument, et `buildVisibilityFilter` — privé,
 * qui interroge amis / contacts DM / communautés — est court-circuité pour
 * isoler le chemin testé. Le marqueur `__acl` permet de vérifier que le filtre
 * est bien injecté dans le `where` du findFirst.
 */
function makeSUT() {
  const prisma = {
    post: { findFirst: postFindFirst, update: postUpdate },
    postMedia: { findMany: mediaFindMany, updateMany: mediaUpdateMany },
    postMediaDownload: { createMany: downloadCreateMany },
  };

  const svc = new PostService(prisma as never);
  (svc as unknown as { buildVisibilityFilter: () => Promise<object> }).buildVisibilityFilter =
    async () => ({ __acl: true });
  return svc;
}

describe('PostService.recordMediaDownloads', () => {
  beforeEach(() => {
    postFindFirst.mockReset().mockResolvedValue({ id: POST_ID, authorId: USER_ID });
    mediaFindMany.mockReset().mockResolvedValue([{ id: MEDIA_A }, { id: MEDIA_B }]);
    downloadCreateMany.mockReset().mockResolvedValue({ count: 2 });
    mediaUpdateMany.mockReset().mockResolvedValue({ count: 2 });
    postUpdate.mockReset().mockResolvedValue({});
  });

  it('écrit une ligne par média et renvoie le compte écrit', async () => {
    const sut = makeSUT();
    const result = await sut.recordMediaDownloads(POST_ID, USER_ID, {
      mediaIds: [MEDIA_A, MEDIA_B],
      surface: 'detail',
    });

    expect(result).toEqual({ recorded: 2 });
    expect(downloadCreateMany).toHaveBeenCalledWith({
      data: [
        { postId: POST_ID, mediaId: MEDIA_A, userId: USER_ID, surface: 'detail' },
        { postId: POST_ID, mediaId: MEDIA_B, userId: USER_ID, surface: 'detail' },
      ],
    });
  });

  it('DÉDUPLIQUE un mediaId répété dans le même batch', async () => {
    mediaFindMany.mockResolvedValue([{ id: MEDIA_A }]);
    const sut = makeSUT();
    const result = await sut.recordMediaDownloads(POST_ID, USER_ID, {
      mediaIds: [MEDIA_A, MEDIA_A, MEDIA_A],
      surface: 'feed',
    });

    expect(result).toEqual({ recorded: 1 });
    expect(downloadCreateMany).toHaveBeenCalledWith({
      data: [{ postId: POST_ID, mediaId: MEDIA_A, userId: USER_ID, surface: 'feed' }],
    });
    expect(mediaUpdateMany).toHaveBeenCalledWith({
      where: { id: { in: [MEDIA_A] } },
      data: { downloadCount: { increment: 1 } },
    });
  });

  it('filtre un média appartenant à un autre poste sans échouer', async () => {
    mediaFindMany.mockResolvedValue([{ id: MEDIA_A }]);
    const sut = makeSUT();
    const result = await sut.recordMediaDownloads(POST_ID, USER_ID, {
      mediaIds: [MEDIA_A, FOREIGN_MEDIA],
      surface: 'detail',
    });

    expect(result).toEqual({ recorded: 1 });
    expect(downloadCreateMany).toHaveBeenCalledWith({
      data: [{ postId: POST_ID, mediaId: MEDIA_A, userId: USER_ID, surface: 'detail' }],
    });
  });

  it('incrémente Post.downloadCount de 1 pour un batch de 2 médias', async () => {
    const sut = makeSUT();
    await sut.recordMediaDownloads(POST_ID, USER_ID, {
      mediaIds: [MEDIA_A, MEDIA_B],
      surface: 'detail',
    });

    expect(postUpdate).toHaveBeenCalledWith({
      where: { id: POST_ID },
      data: { downloadCount: { increment: 1 } },
    });
    expect(mediaUpdateMany).toHaveBeenCalledWith({
      where: { id: { in: [MEDIA_A, MEDIA_B] } },
      data: { downloadCount: { increment: 1 } },
    });
  });

  it('écrit les événements AVANT les compteurs (ordre réparable)', async () => {
    const order: string[] = [];
    downloadCreateMany.mockImplementation(async () => { order.push('events'); return { count: 2 }; });
    mediaUpdateMany.mockImplementation(async () => { order.push('media'); return { count: 2 }; });
    postUpdate.mockImplementation(async () => { order.push('post'); return {}; });

    const sut = makeSUT();
    await sut.recordMediaDownloads(POST_ID, USER_ID, {
      mediaIds: [MEDIA_A, MEDIA_B],
      surface: 'detail',
    });

    expect(order[0]).toBe('events');
  });

  it('renvoie null quand le poste est introuvable ou invisible', async () => {
    postFindFirst.mockResolvedValue(null);
    const sut = makeSUT();
    const result = await sut.recordMediaDownloads(POST_ID, USER_ID, {
      mediaIds: [MEDIA_A],
      surface: 'detail',
    });

    expect(result).toBeNull();
    expect(downloadCreateMany).not.toHaveBeenCalled();
    expect(postUpdate).not.toHaveBeenCalled();
  });

  it('applique le filtre de VISIBILITÉ au chargement du poste', async () => {
    const sut = makeSUT();
    await sut.recordMediaDownloads(POST_ID, USER_ID, {
      mediaIds: [MEDIA_A],
      surface: 'detail',
    });

    // Le marqueur injecté par le stub de buildVisibilityFilter doit se
    // retrouver dans le `where` : sans lui, n'importe qui pourrait enregistrer
    // les médias d'un poste privé en connaissant son identifiant.
    const where = (postFindFirst.mock.calls[0][0] as { where: Record<string, unknown> }).where;
    expect(where.__acl).toBe(true);
    expect(where.id).toBe(POST_ID);
  });

  it("n'écrit rien quand aucun média ne survit au filtrage", async () => {
    mediaFindMany.mockResolvedValue([]);
    const sut = makeSUT();
    const result = await sut.recordMediaDownloads(POST_ID, USER_ID, {
      mediaIds: [FOREIGN_MEDIA],
      surface: 'detail',
    });

    expect(result).toEqual({ recorded: 0 });
    expect(downloadCreateMany).not.toHaveBeenCalled();
    expect(postUpdate).not.toHaveBeenCalled();
  });
});
