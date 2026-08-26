/**
 * Le nettoyage journalier doit ramasser les `PostMedia` en attente comme il
 * ramasse déjà les `MessageAttachment` orphelins.
 *
 * Depuis que le composer web tague ses uploads (`uploadcontext: 'post'`), un
 * média joint puis abandonné naît `PostMedia(postId: null)` au lieu de
 * `MessageAttachment(messageId: null)`. La première forme était MOISSONNÉE,
 * la seconde ne l'était par personne — ni `MaintenanceService`, ni
 * `OrphanMediaCleanupService`, ni le balayage éphémère. La fuite se produisait
 * sur le geste le plus banal du produit : joindre trois photos, fermer sans
 * publier.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { MaintenanceService } from '../../services/MaintenanceService';
import type { AttachmentService } from '../../services/attachments';
import { unclaimedMediaWhere } from '../../services/posts/mediaOwnership';

jest.mock('../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

function makeService(pending: Array<{ id: string; fileUrl: string | null; thumbnailUrl: string | null }>) {
  const findMany = jest.fn<any>(async () => pending);
  const deleteMany = jest.fn<any>(async () => ({ count: pending.length }));
  const storageDelete = jest.fn<any>(async () => undefined);

  const prisma = {
    postMedia: { findMany, deleteMany },
    sound: { findMany: jest.fn<any>(async () => []) },
    messageAttachment: { findMany: jest.fn<any>(async () => []) },
    user: { findFirst: jest.fn<any>(async () => null) },
    conversation: { findFirst: jest.fn<any>(async () => null) },
    community: { findFirst: jest.fn<any>(async () => null) },
  } as unknown as PrismaClient;

  const attachmentService = { deleteAttachment: jest.fn<any>(async () => undefined) } as unknown as AttachmentService;

  const service = new MaintenanceService(prisma, attachmentService, undefined, { delete: storageDelete });
  return { service, findMany, deleteMany, storageDelete };
}

describe('cleanupOrphanedPostMedia', () => {
  beforeEach(() => jest.clearAllMocks());
  afterEach(() => jest.useRealTimers());

  it('demande les médias LIBRES de plus de 24 h', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-25T12:00:00Z'));
    const { service, findMany } = makeService([]);

    await (service as any).cleanupOrphanedPostMedia();

    const where = (findMany.mock.calls[0][0] as any).where;
    expect(where).toEqual({
      ...unclaimedMediaWhere(),
      createdAt: { lt: new Date('2026-08-24T12:00:00Z') },
    });
  });

  it('détruit les octets ET la ligne d’un média abandonné', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-25T12:00:00Z'));
    const { service, deleteMany, storageDelete } = makeService([
      { id: 'abandonne', fileUrl: 'https://cdn/a.jpg', thumbnailUrl: null },
    ]);

    await (service as any).cleanupOrphanedPostMedia();

    expect(storageDelete).toHaveBeenCalledWith('https://cdn/a.jpg');
    expect(deleteMany).toHaveBeenCalled();
  });

  it('le nettoyage JOURNALIER le déclenche — pas seulement les orphelins de message', async () => {
    // Sans ce témoin, le balayage existe et n'est jamais appelé : exactement
    // la forme « un correctif dont la valeur n'atteint personne ».
    jest.useFakeTimers().setSystemTime(new Date('2026-08-25T02:30:00'));
    const { service } = makeService([]);
    const spy = jest.spyOn(service as any, 'cleanupOrphanedPostMedia');

    await (service as any).runDailyCleanup();

    expect(spy).toHaveBeenCalled();
  });

  it('un balayage en échec n’empêche PAS le reste du nettoyage journalier', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-25T02:30:00'));
    const { service, findMany } = makeService([]);
    findMany.mockRejectedValueOnce(new Error('mongo down'));
    const accountDeletions = jest.spyOn(service as any, 'processAccountDeletionRequests')
      .mockImplementation(async () => undefined);

    await expect((service as any).runDailyCleanup()).resolves.toBeUndefined();

    expect(accountDeletions).toHaveBeenCalled();
  });
});
