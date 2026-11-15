/**
 * #4392 — « Quelles colonnes lourdes une LISTE sert encore ».
 *
 * `GET /admin/posts` sert ses médias par `mediaSelect` (la forme CANONIQUE de
 * `PostMedia`, `services/posts/postIncludes.ts`) à travers un schéma de
 * réponse `additionalProperties: true` — donc TOUT ce que Prisma rend part sur
 * le fil, `transcription` (texte + segments mot-à-mot) et `translations`
 * (toutes les langues, avec leurs URL de TTS) comprises, pour chaque média de
 * chaque post de chaque page.
 *
 * Comptage des lecteurs (critère 1 de l'issue), sur les quatre surfaces :
 *   - web      : `apps/web/components/admin/user-detail/UserPostsSection.tsx`
 *                est le SEUL appelant du dépôt, et son type `AdminPostMedia`
 *                déclare quatre champs — `id`, `mimeType`, `fileUrl`,
 *                `thumbnailUrl`. Ni transcription, ni traductions ;
 *   - iOS      : `AdminEndpoint.posts` est DÉCLARÉ et jamais appelé — le seul
 *                cas d'`AdminEndpoint` consommé par tout iOS est
 *                `mePermissions` (`PermissionsService.swift`) ;
 *   - SDK      : idem ;
 *   - Android  : aucune surface admin (pas d'`AdminApi` dans
 *                `core/network/.../api/`).
 * Zéro lecteur ⇒ la LISTE ne les sert plus. La route de DÉTAIL
 * (`GET /admin/posts/:postId`, `adminPostDetailSelect`) continue de les servir
 * par `mediaSelect` — même partage que #4166 sur `translatedBodies` /
 * `translatedSubjects` (retirés de la LISTE des diffusions, gardés au DÉTAIL).
 *
 * Ce que ce témoin garde, et POURQUOI il est écrit ainsi :
 *   - il assert sur la VALEUR SERVIE, jamais sur le seul `select` ;
 *   - le double Prisma est CONSCIENT DU SELECT (`projectBySelect`) — un double
 *     qui rendrait sa fixture entière quel que soit le `select` mesurerait sa
 *     propre fixture, pas le correctif ;
 *   - la fixture porte un média RÉEL, transcription et traductions NON VIDES :
 *     un témoin de retrait écrit sur une réponse vide est trivialement vert ;
 *   - il assert aussi sur ce qui RESTE servi (jeu de clés EXACT) — un retrait
 *     qui emporte un voisin est le défaut le plus probable de ce lot.
 *
 * Fichier séparé de `admin-routes-group3.test.ts` (1564 lignes, hors budget) :
 * « Ajouter à un fichier déjà hors budget est interdit ».
 *
 * @jest-environment node
 */

import Fastify, { FastifyInstance } from 'fastify';
import { describe, it, expect, jest } from '@jest/globals';

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn<any>().mockReturnValue({
      info: jest.fn<any>(), warn: jest.fn<any>(), error: jest.fn<any>(), debug: jest.fn<any>(),
    }),
  },
}));

jest.mock('../../../../utils/logger', () => ({
  logError: jest.fn<any>(),
  logWarn: jest.fn<any>(),
  logger: { info: jest.fn<any>(), warn: jest.fn<any>(), error: jest.fn<any>(), debug: jest.fn<any>() },
}));

import { adminPostRoutes } from '../../../../routes/admin/posts';

const VALID_ID = '507f1f77bcf86cd799439011';
const POST_ID = '507f1f77bcf86cd799439022';
const MEDIA_ID = '507f1f77bcf86cd799439033';

/** Les colonnes lourdes que la LISTE ne doit plus servir. */
const HEAVY_MEDIA_KEYS = ['transcription', 'translations'] as const;

/**
 * Ce que la LISTE sert désormais d'un média : `mediaSelect` moins la paire
 * lourde. Les quatre champs que le web lit (`id`, `mimeType`, `fileUrl`,
 * `thumbnailUrl`) y sont, et tout le reste de l'inspection avec eux.
 */
const SERVED_MEDIA_KEYS = [
  'alt', 'caption', 'duration', 'fileName', 'fileSize', 'fileUrl', 'height', 'id',
  'language', 'mimeType', 'order', 'originalName', 'thumbHash', 'thumbnailUrl',
  'variantOf', 'width',
] as const;

/** Un média tel que MongoDB le porte — toutes les colonnes de `mediaSelect`. */
const FULL_MEDIA_ROW: Record<string, unknown> = {
  id: MEDIA_ID,
  fileName: 'reel.mp4',
  originalName: 'Mon reel.mp4',
  mimeType: 'video/mp4',
  fileSize: 4_812_004,
  fileUrl: 'https://cdn.example.com/reel.mp4',
  width: 1080,
  height: 1920,
  thumbnailUrl: 'https://cdn.example.com/reel.jpg',
  thumbHash: 'AQIDBAU=',
  duration: 18400,
  order: 0,
  caption: 'La démo',
  alt: 'Une démo produit',
  language: 'fr',
  variantOf: null,
  transcription: {
    type: 'video',
    text: 'Bienvenue sur la démo produit de Meeshy.',
    language: 'fr',
    confidence: 0.96,
    source: 'whisper',
    durationMs: 18400,
    segments: [
      { text: 'Bienvenue', startMs: 0, endMs: 700, speakerId: 's0', confidence: 0.98 },
      { text: 'sur la démo produit', startMs: 700, endMs: 2100, speakerId: 's0', confidence: 0.95 },
      { text: 'de Meeshy.', startMs: 2100, endMs: 3000, speakerId: 's0', confidence: 0.93 },
    ],
  },
  translations: {
    en: {
      type: 'video',
      transcription: 'Welcome to the Meeshy product demo.',
      url: 'https://cdn.example.com/reel.en.mp4',
      durationMs: 18400,
      createdAt: new Date('2026-09-01T09:00:00.000Z'),
    },
    es: {
      type: 'video',
      transcription: 'Bienvenido a la demo del producto Meeshy.',
      url: 'https://cdn.example.com/reel.es.mp4',
      durationMs: 18400,
      createdAt: new Date('2026-09-01T09:00:05.000Z'),
    },
  },
};

const POST_ROW: Record<string, unknown> = {
  id: POST_ID,
  type: 'REEL',
  visibility: 'PUBLIC',
  content: 'Nouvelle démo',
  originalLanguage: 'fr',
  communityId: null,
  moodEmoji: null,
  isPinned: false,
  isEdited: false,
  deletedAt: null,
  expiresAt: null,
  likeCount: 12,
  commentCount: 3,
  repostCount: 1,
  viewCount: 240,
  bookmarkCount: 4,
  shareCount: 2,
  createdAt: new Date('2026-09-01T08:00:00.000Z'),
  updatedAt: new Date('2026-09-01T08:30:00.000Z'),
  author: { id: VALID_ID, username: 'alice', displayName: 'Alice', avatar: null },
  _count: { comments: 3, views: 240, bookmarks: 4 },
};

/**
 * Projection à la manière de Prisma : un `select` ne rend QUE ses clés. C'est
 * ce qui rend l'assertion de VALEUR SERVIE sensible au `select` du handler.
 */
function projectBySelect(row: Record<string, unknown>, select: unknown): Record<string, unknown> {
  if (select === true || select === undefined) return { ...row };
  const spec = (select as { select?: Record<string, unknown> }).select ?? (select as Record<string, unknown>);
  return Object.keys(spec).reduce<Record<string, unknown>>((acc, key) => {
    if (spec[key] === true && key in row) return { ...acc, [key]: row[key] };
    return acc;
  }, {});
}

function makeMockPrisma() {
  return {
    post: {
      findUnique: jest.fn<any>().mockResolvedValue({ id: POST_ID }),
      findMany: jest.fn<any>(async ({ select }: { select: Record<string, unknown> }) => [
        { ...POST_ROW, media: [projectBySelect(FULL_MEDIA_ROW, select.media)] },
      ]),
      count: jest.fn<any>().mockResolvedValue(1),
      update: jest.fn<any>(),
    },
  };
}

function buildApp(prisma: ReturnType<typeof makeMockPrisma>): FastifyInstance {
  const app = Fastify({ logger: false });
  app.decorate('prisma', prisma);
  app.decorate('authenticate', async (request: any) => {
    request.authContext = {
      isAuthenticated: true,
      registeredUser: { id: VALID_ID, role: 'ADMIN', username: 'admin' },
    };
  });
  app.register(adminPostRoutes);
  return app;
}

async function servedMedia(): Promise<{ media: Record<string, unknown>; body: any }> {
  const app = buildApp(makeMockPrisma());
  await app.ready();
  try {
    const res = await app.inject({ method: 'GET', url: '/posts' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    return { media: body.data[0].media[0], body };
  } finally {
    await app.close();
  }
}

// ─────────────────────────────────────────────────────────────────────────────

describe('GET /admin/posts — la LISTE ne sert plus le Prisme du média (#4392)', () => {
  it('ne sert ni transcription ni translations', async () => {
    const { media } = await servedMedia();

    for (const key of HEAVY_MEDIA_KEYS) {
      expect(media).not.toHaveProperty(key);
    }
  });

  it("sert EXACTEMENT le reste de `mediaSelect` — un retrait qui emporte un voisin tombe ici", async () => {
    const { media } = await servedMedia();

    expect(Object.keys(media).sort()).toEqual([...SERVED_MEDIA_KEYS]);
  });

  it("les quatre champs que le SEUL lecteur mesuré lit sont intacts (UserPostsSection.tsx)", async () => {
    const { media } = await servedMedia();

    expect(media.id).toBe(MEDIA_ID);
    expect(media.mimeType).toBe('video/mp4');
    expect(media.fileUrl).toBe('https://cdn.example.com/reel.mp4');
    expect(media.thumbnailUrl).toBe('https://cdn.example.com/reel.jpg');
  });

  it('le RESTE de la ligne de post est intact — contenu, compteurs, auteur, pagination', async () => {
    const { body } = await servedMedia();
    const row = body.data[0];

    expect(row.id).toBe(POST_ID);
    expect(row.type).toBe('REEL');
    expect(row.content).toBe('Nouvelle démo');
    expect(row.likeCount).toBe(12);
    expect(row.author).toEqual({ id: VALID_ID, username: 'alice', displayName: 'Alice', avatar: null });
    expect(row._count).toEqual({ comments: 3, views: 240, bookmarks: 4 });
    expect(body.pagination).toEqual({ total: 1, limit: 20, offset: 0, hasMore: false });
  });
});

describe('GET /admin/posts/:postId — le DÉTAIL garde le Prisme du média (#4392)', () => {
  it("le select du détail demande toujours transcription et translations — c'est la LISTE qui les perd, pas la route qui les affiche", async () => {
    const prisma = makeMockPrisma();
    const app = buildApp(prisma);
    await app.ready();
    try {
      await app.inject({ method: 'GET', url: `/posts/${POST_ID}` });

      const call = prisma.post.findUnique.mock.calls[0][0] as {
        select: { media: { select: Record<string, unknown> } };
      };
      expect(call.select.media.select).toMatchObject({ transcription: true, translations: true });
    } finally {
      await app.close();
    }
  });
});
