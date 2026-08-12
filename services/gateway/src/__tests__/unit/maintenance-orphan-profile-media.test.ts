/**
 * cleanupOrphanedAttachments ne doit JAMAIS supprimer un attachment encore
 * référencé comme avatar/bannière par un User, une Conversation ou une
 * Community — les uploads de profil passent par POST /attachments/upload et
 * restent messageId:null pour toujours ; sans cette protection le job
 * quotidien les détruisait sous 24-48h (avatars/bannières 404 en production).
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { MaintenanceService } from '../../services/MaintenanceService';
import type { AttachmentService } from '../../services/attachments';

jest.mock('../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }
}));

type EndsWithClause = { avatar?: { endsWith: string }; banner?: { endsWith: string } };

const AVATAR_URL = '/api/v1/attachments/file/2026%2F07%2Fu1%2Favatar_ref.jpg';
const BANNER_URL = '/api/v1/attachments/file/2026%2F07%2Fu1%2Fbanner_ref.jpg';
const STRAY_URL = '/api/v1/attachments/file/2026%2F07%2Fu1%2Fstray.jpg';

const orphan = (id: string, fileUrl: string) => ({
  id,
  originalName: id,
  fileSize: 1000,
  createdAt: new Date('2026-07-01T00:00:00Z'),
  uploadedBy: 'u1',
  fileUrl
});

function referencedBy(referenced: string[]) {
  return jest.fn(async (args: { where: { OR: EndsWithClause[] } }) => {
    const targets = args.where.OR.flatMap((clause) =>
      [clause.avatar?.endsWith, clause.banner?.endsWith].filter(Boolean)
    ) as string[];
    return targets.some((t) => referenced.some((r) => r.endsWith(t))) ? { id: 'ref' } : null;
  });
}

function makeMocks(options: {
  orphans: ReturnType<typeof orphan>[];
  userRefs?: string[];
  conversationRefs?: string[];
  communityRefs?: string[];
}) {
  const prisma = {
    messageAttachment: {
      findMany: jest.fn(async () => options.orphans)
    },
    user: { findFirst: referencedBy(options.userRefs ?? []) },
    conversation: { findFirst: referencedBy(options.conversationRefs ?? []) },
    community: { findFirst: referencedBy(options.communityRefs ?? []) }
  } as unknown as PrismaClient;

  const attachmentService = {
    deleteAttachment: jest.fn(async () => undefined)
  } as unknown as AttachmentService;

  const service = new MaintenanceService(prisma, attachmentService);
  const cleanup = (service as unknown as { cleanupOrphanedAttachments: () => Promise<void> })
    .cleanupOrphanedAttachments.bind(service);

  return { prisma, attachmentService, cleanup };
}

describe('cleanupOrphanedAttachments — protection des médias de profil', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('supprime un orphelin non référencé', async () => {
    const { attachmentService, cleanup } = makeMocks({
      orphans: [orphan('stray', STRAY_URL)]
    });

    await cleanup();

    expect(attachmentService.deleteAttachment).toHaveBeenCalledWith('stray');
  });

  it('conserve un orphelin référencé par User.avatar (URL relative)', async () => {
    const { attachmentService, cleanup } = makeMocks({
      orphans: [orphan('avatar', AVATAR_URL), orphan('stray', STRAY_URL)],
      userRefs: [AVATAR_URL]
    });

    await cleanup();

    expect(attachmentService.deleteAttachment).not.toHaveBeenCalledWith('avatar');
    expect(attachmentService.deleteAttachment).toHaveBeenCalledWith('stray');
  });

  it('conserve un orphelin référencé par User.banner en forme absolue', async () => {
    const { attachmentService, cleanup } = makeMocks({
      orphans: [orphan('banner', BANNER_URL)],
      userRefs: [`https://gate.meeshy.me${BANNER_URL}`]
    });

    await cleanup();

    expect(attachmentService.deleteAttachment).not.toHaveBeenCalled();
  });

  it('conserve un orphelin référencé par une Conversation ou une Community', async () => {
    const { attachmentService, cleanup } = makeMocks({
      orphans: [orphan('conv-avatar', AVATAR_URL), orphan('community-banner', BANNER_URL)],
      conversationRefs: [AVATAR_URL],
      communityRefs: [BANNER_URL]
    });

    await cleanup();

    expect(attachmentService.deleteAttachment).not.toHaveBeenCalled();
  });
});
