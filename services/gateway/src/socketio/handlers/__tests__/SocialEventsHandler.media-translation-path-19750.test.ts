/**
 * #19750 — l'écho temps réel d'une publication ou d'un commentaire ne transporte
 * jamais le chemin disque ABSOLU (`path`) d'une piste traduite de média. Le
 * socket n'a pas de schéma de réponse : la diffusion retire elle-même la clé,
 * quelle que soit la composition reçue de l'appelant. La charge est relue
 * SÉRIALISÉE, comme elle part sur le fil.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { SocialEventsHandler } from '../SocialEventsHandler';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }) },
}));

const AUTEUR = 'auteur-19750';
const POST_ID = '507f191e810c19729de19750';
const DISK = '/app/uploads/translated/';

const voiceMedia = (id: string) => ({
  id,
  fileUrl: `/api/v1/attachments/file/2026/11/u/${id}.m4a`,
  translations: {
    fr: { type: 'audio', transcription: 'bonjour', path: `${DISK}${id}_fr.mp3`, url: `/api/v1/attachments/file/translated/${id}_fr.mp3` },
  },
});

function monter() {
  const charges: Array<{ evenement: string; charge: any }> = [];
  const operateur: any = {
    to: () => operateur,
    except: () => operateur,
    emit: (evenement: string, data: unknown) => {
      charges.push({ evenement, charge: JSON.parse(JSON.stringify(data)) });
      return true;
    },
  };
  const prisma = {
    userRelation: { findUnique: jest.fn<any>().mockResolvedValue(null), findMany: jest.fn<any>().mockResolvedValue([]) },
    friendRequest: { findMany: jest.fn(async () => [{ senderId: AUTEUR, receiverId: 'ami-19750' }]) },
    user: { findMany: jest.fn(async () => []), findUnique: jest.fn(async () => null) },
  } as unknown as PrismaClient;
  return { handler: new SocialEventsHandler({ io: { to: () => operateur } as any, prisma }), charges };
}

const publication = (type: string): any => ({
  id: POST_ID,
  authorId: AUTEUR,
  type,
  visibility: 'PUBLIC',
  visibilityUserIds: [],
  repostOfId: null,
  media: [voiceMedia('m-post')],
  repostOf: { id: 'p-source', media: [voiceMedia('m-source')] },
  comments: [{ id: 'c0', media: [voiceMedia('m-c0')] }],
});

const commentaire = (): any => ({ id: 'c1', postId: POST_ID, content: 'écoute', media: [voiceMedia('m-c1')], quotedMedia: voiceMedia('m-cited') });

describe('#19750 — la diffusion d’une publication ou d’un commentaire retire le chemin disque des pistes', () => {
  const diffusions: ReadonlyArray<readonly [string, (h: SocialEventsHandler) => Promise<void>]> = [
    ['post:created', (h) => h.broadcastPostCreated(publication('POST'), AUTEUR)],
    ['post:updated', (h) => h.broadcastPostUpdated(publication('POST'), AUTEUR)],
    ['story:created', (h) => h.broadcastStoryCreated(publication('STORY'), AUTEUR)],
    ['story:updated', (h) => h.broadcastStoryUpdated(publication('STORY'), AUTEUR)],
    ['status:updated', (h) => h.broadcastStatusUpdated(publication('STATUS'), AUTEUR)],
    ['comment:added', (h) => h.broadcastCommentAdded({ postId: POST_ID, comment: commentaire(), commentCount: 1 }, AUTEUR, 'PUBLIC', [])],
    ['comment:updated', (h) => h.broadcastCommentUpdated({ postId: POST_ID, comment: commentaire() }, AUTEUR, 'PUBLIC', [])],
    ['comment:media-updated', (h) => h.broadcastCommentMediaUpdated({ postId: POST_ID, commentId: 'c1', comment: commentaire() }, AUTEUR, 'PUBLIC', [])],
  ];

  it.each(diffusions)('%s', async (evenement, diffuser) => {
    const { handler, charges } = monter();

    await diffuser(handler);

    const recues = charges.filter((c) => c.evenement === evenement);
    expect(recues.length).toBeGreaterThan(0);
    for (const { charge } of recues) {
      const fil = JSON.stringify(charge);
      expect(fil).not.toContain(DISK);
      expect(fil).toContain('/api/v1/attachments/file/translated/');
    }
  });
});
