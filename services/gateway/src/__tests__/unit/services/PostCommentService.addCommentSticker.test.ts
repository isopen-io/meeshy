/**
 * PostCommentService.addComment — sticker (#9080)
 *
 * Le sticker d'un commentaire a la MÊME forme que celui d'un message : le
 * descripteur `MessageSticker`, que `parseMessageSticker` blanchit avant de
 * l'écrire dans `metadata.sticker`. Ce qui n'est pas dans la loi n'atteint
 * pas la base.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { PostCommentService } from '../../../services/PostCommentService';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

const noopTrackingLinks = {
  collectContentTrackingLinks: jest.fn().mockResolvedValue([]),
} as any;

const buildPrisma = () => {
  const create = jest.fn().mockImplementation(async ({ data }: any) => ({
    id: 'c-new', content: data.content, originalLanguage: null, translations: null,
    likeCount: 0, replyCount: 0, effectFlags: 0, parentId: null, postId: data.postId,
    createdAt: new Date('2026-10-02T00:00:00Z'), metadata: data.metadata ?? null,
    author: { id: 'a1', username: 'al', displayName: 'Al', avatar: null },
  }));
  const prisma = {
    post: {
      findFirst: jest.fn().mockResolvedValue({ id: 'post-1' }),
      update: jest.fn().mockResolvedValue({}),
    },
    postComment: { findFirst: jest.fn(), create, update: jest.fn().mockResolvedValue({}) },
    postMedia: { findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
  } as unknown as PrismaClient;
  return { prisma, create };
};

const writtenMetadata = (create: jest.Mock): unknown => create.mock.calls[0][0].data.metadata;

describe('PostCommentService.addComment — sticker', () => {
  it('écrit le descripteur BLANCHI dans metadata.sticker — une clé étrangère ne passe pas', async () => {
    const { prisma, create } = buildPrisma();
    const service = new PostCommentService(prisma, noopTrackingLinks);
    await service.addComment('post-1', 'a1', '', {
      sticker: { templateId: ' mee.mee-coucou ', animation: 'wobble', postReplyTo: { forged: true } },
    });
    expect(writtenMetadata(create)).toEqual({ sticker: { templateId: 'mee.mee-coucou', animation: 'wobble' } });
  });

  it('un sticker hors loi n’écrit RIEN — aucune clé sticker, aucun metadata', async () => {
    const { prisma, create } = buildPrisma();
    const service = new PostCommentService(prisma, noopTrackingLinks);
    await service.addComment('post-1', 'a1', 'texte', { sticker: { emoji: '🔥', animation: 'moonwalk' } });
    expect(writtenMetadata(create)).toBeUndefined();
  });

  it('le sticker et le lieu cohabitent dans le MÊME metadata, composé en une fois', async () => {
    const { prisma, create } = buildPrisma();
    const service = new PostCommentService(prisma, noopTrackingLinks);
    await service.addComment('post-1', 'a1', 'ici', {
      sticker: { stickerId: '507F1F77BCF86CD799439011' },
      location: { latitude: 48.85, longitude: 2.35 },
    });
    const metadata = writtenMetadata(create) as Record<string, unknown>;
    expect(metadata.sticker).toEqual({ stickerId: '507f1f77bcf86cd799439011' });
    expect(metadata.location).toBeDefined();
  });
});
