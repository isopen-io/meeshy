/**
 * POST /posts/media/:mediaId/caption/translate — traduction à la demande de
 * la LÉGENDE d'un média (#6280), miroir exact de
 * `POST /posts/:postId/translate` : même `TranslatePostSchema`, même
 * rate-limit, même discipline de gate (`mayConsumePost` — jamais la forme
 * select-sous-include fautive de #6503/#6506).
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

const USER_ID = '507f1f77bcf86cd799439011';
const MEDIA_ID = '507f1f77bcf86cd799439099';
const POST_ID = '507f1f77bcf86cd799439033';
const COMMENT_ID = '507f1f77bcf86cd799439044';

function makePreValidationAuth(authenticated: boolean) {
  return async (req: FastifyRequest) => {
    if (authenticated) {
      (req as any).authContext = {
        isAuthenticated: true,
        registeredUser: { id: USER_ID, role: 'USER' },
      };
    } else {
      (req as any).authContext = null;
    }
  };
}

import { registerPostMediaRoutes } from '../media';
import { MediaCaptionTranslationService } from '../../../services/posts/MediaCaptionTranslationService';

interface BuildOpts {
  authenticated?: boolean;
  media?: { id: string; postId: string | null; commentId: string | null } | null;
  commentPostId?: string | null;
  canConsume?: boolean;
}

async function buildApp(opts: BuildOpts = {}) {
  const {
    authenticated = true,
    media = { id: MEDIA_ID, postId: POST_ID, commentId: null },
    commentPostId = POST_ID,
    canConsume = true,
  } = opts;
  const app = Fastify({ logger: false });

  const findFirst = jest.fn<any>(async () => media);
  const postComment = { findUnique: jest.fn<any>(async () => (media?.commentId ? { postId: commentPostId } : null)) };
  // La ACL du post consommé — juste assez pour que `mayConsumePost` rende son
  // verdict, sans jamais passer par une forme select-sous-include.
  const post = {
    findFirst: jest.fn<any>(async () => (canConsume
      ? { id: POST_ID, authorId: USER_ID, visibility: 'PUBLIC', visibilityUserIds: [], expiresAt: null }
      : null)),
  };
  const prisma = { postMedia: { findFirst }, postComment, post } as any;

  const translateOnDemand = jest.fn<any>(async () => {});
  // @ts-expect-error accessing private static
  MediaCaptionTranslationService._shared = { translateOnDemand };

  registerPostMediaRoutes(app, prisma, makePreValidationAuth(authenticated));
  await app.ready();
  return { app, findFirst, translateOnDemand };
}

afterEach(() => {
  // @ts-expect-error accessing private static
  MediaCaptionTranslationService._shared = null;
});

describe('POST /posts/media/:mediaId/caption/translate — non authentifié', () => {
  it('rend 401 sans contexte auth', async () => {
    const { app } = await buildApp({ authenticated: false });
    const res = await app.inject({
      method: 'POST',
      url: `/posts/media/${MEDIA_ID}/caption/translate`,
      payload: { targetLanguage: 'en' },
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

describe('POST /posts/media/:mediaId/caption/translate — requête invalide', () => {
  it('rend 400 quand targetLanguage est absent', async () => {
    const { app } = await buildApp();
    const res = await app.inject({ method: 'POST', url: `/posts/media/${MEDIA_ID}/caption/translate`, payload: {} });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

describe('POST /posts/media/:mediaId/caption/translate — média introuvable', () => {
  it('rend 404 quand le média n\'existe pas', async () => {
    const { app } = await buildApp({ media: null });
    const res = await app.inject({
      method: 'POST', url: `/posts/media/${MEDIA_ID}/caption/translate`, payload: { targetLanguage: 'en' },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe('POST /posts/media/:mediaId/caption/translate — hors audience du post', () => {
  it('rend 404 quand le lecteur ne peut pas consommer le post porteur', async () => {
    const { app, translateOnDemand } = await buildApp({ canConsume: false });
    const res = await app.inject({
      method: 'POST', url: `/posts/media/${MEDIA_ID}/caption/translate`, payload: { targetLanguage: 'en' },
    });
    expect(res.statusCode).toBe(404);
    expect(translateOnDemand).not.toHaveBeenCalled();
    await app.close();
  });
});

describe('POST /posts/media/:mediaId/caption/translate — média de post', () => {
  it('rend 200 et transmet la demande à MediaCaptionTranslationService', async () => {
    const { app, translateOnDemand } = await buildApp();
    const res = await app.inject({
      method: 'POST', url: `/posts/media/${MEDIA_ID}/caption/translate`, payload: { targetLanguage: 'en', force: true },
    });
    expect(res.statusCode).toBe(200);
    expect(translateOnDemand).toHaveBeenCalledWith(MEDIA_ID, 'en', { force: true });
    await app.close();
  });
});

describe('POST /posts/media/:mediaId/caption/translate — média de commentaire', () => {
  it('résout le post porteur via le commentaire pour la garde d\'audience', async () => {
    const { app, translateOnDemand } = await buildApp({
      media: { id: MEDIA_ID, postId: null, commentId: COMMENT_ID },
      commentPostId: POST_ID,
    });
    const res = await app.inject({
      method: 'POST', url: `/posts/media/${MEDIA_ID}/caption/translate`, payload: { targetLanguage: 'en' },
    });
    expect(res.statusCode).toBe(200);
    expect(translateOnDemand).toHaveBeenCalledWith(MEDIA_ID, 'en', { force: undefined });
    await app.close();
  });
});
