/**
 * #7950 — la LISTE de messages sert « Story indisponible » pour une story que
 * son auteur a supprimée, et garde l'instantané d'une story seulement expirée.
 *
 * Témoin au site : `enrichPostReplyMessagesForList`, l'étape de la route
 * `GET /conversations/:id/messages` qui hisse `metadata.postReplyTo`.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { enrichPostReplyMessagesForList } from '../../../routes/conversations/messages-list-query';
import type { MappedMessageRow } from '../../../routes/conversations/messages-list-query-types';

const STORY = '507f1f77bcf86cd799439b01';
const PUBLIEE = new Date('2026-09-25T08:00:00.000Z');
const SUPPRIMEE = new Date('2026-09-25T09:00:00.000Z');

const instantane = {
  id: STORY,
  type: 'STORY',
  moodEmoji: null,
  previewText: 'Coucher de soleil',
  thumbnailUrl: 'https://cdn.meeshy.me/stories/soleil-thumb.jpg',
  reactionCount: 3,
  commentCount: 1,
  shareCount: 0,
  createdAt: PUBLIEE.toISOString(),
  authorId: '507f1f77bcf86cd799439c01',
  authorName: 'Demo',
};

const lignePost = (over: Record<string, unknown> = {}) => ({
  id: STORY,
  type: 'STORY',
  content: 'Coucher de soleil',
  moodEmoji: null,
  reactionCount: 3,
  commentCount: 1,
  shareCount: 0,
  createdAt: PUBLIEE,
  media: [{ thumbnailUrl: 'https://cdn.meeshy.me/stories/soleil-thumb.jpg' }],
  author: { id: '507f1f77bcf86cd799439c01', username: 'demo', displayName: 'Demo' },
  deletedAt: null,
  expiresAt: new Date('2026-09-26T05:00:00.000Z'),
  ...over,
});

const fauxPrisma = (posts: ReadonlyArray<ReturnType<typeof lignePost>>) => {
  const appels: unknown[] = [];
  const prisma = {
    post: {
      findMany: async (args: unknown) => {
        appels.push(args);
        return posts;
      },
    },
  } as unknown as PrismaClient;
  return { prisma, appels };
};

const reponse = (over: Partial<MappedMessageRow> = {}) =>
  ({ id: 'm1', storyReplyToId: STORY, metadata: { postReplyTo: instantane }, ...over }) as unknown as MappedMessageRow;

describe('#7950 — enrichPostReplyMessagesForList', () => {
  it('sert la citation d’une story SUPPRIMÉE sans vignette ni aperçu, avec deletedAt, en une requête', async () => {
    const { prisma, appels } = fauxPrisma([lignePost({ deletedAt: SUPPRIMEE })]);

    const [servie] = await enrichPostReplyMessagesForList(prisma, [reponse()]);

    expect(appels).toHaveLength(1);
    expect(servie.postReplyTo).toMatchObject({ id: STORY, thumbnailUrl: null, previewText: '', deletedAt: SUPPRIMEE.toISOString() });
    expect(JSON.stringify(servie)).not.toContain('soleil');
  });

  it('garde l’instantané complet d’une story seulement EXPIRÉE', async () => {
    const { prisma } = fauxPrisma([lignePost({ expiresAt: new Date('2026-09-20T00:00:00.000Z') })]);

    const [servie] = await enrichPostReplyMessagesForList(prisma, [reponse()]);

    expect(servie.postReplyTo).toEqual(instantane);
  });

  it('une réponse legacy sans instantané à une story supprimée ne reconstruit PAS le contenu depuis la ligne', async () => {
    const { prisma } = fauxPrisma([lignePost({ deletedAt: SUPPRIMEE })]);

    const [servie] = await enrichPostReplyMessagesForList(prisma, [reponse({ metadata: null })]);

    expect(servie.postReplyTo).toMatchObject({ thumbnailUrl: null, previewText: '', deletedAt: SUPPRIMEE.toISOString() });
  });

  it('une réponse legacy à une story vivante se reconstruit depuis la ligne', async () => {
    const { prisma } = fauxPrisma([lignePost()]);

    const [servie] = await enrichPostReplyMessagesForList(prisma, [reponse({ metadata: null })]);

    expect(servie.postReplyTo).toMatchObject({ id: STORY, previewText: 'Coucher de soleil' });
    expect(servie.postReplyTo).not.toHaveProperty('deletedAt');
  });
});
