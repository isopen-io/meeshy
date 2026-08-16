/**
 * @jest-environment node
 *
 * Chargement des pièces jointes d'un message : UNE requête, quel que soit le
 * nombre de pièces. Le chemin d'envoi validait chaque pièce par un
 * `findUnique` dans un `Promise.all` — à 199 pièces par message
 * (`MAX_ATTACHMENTS_PER_MESSAGE`), un seul événement socket ouvrait 199
 * requêtes concurrentes.
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { MAX_ATTACHMENTS_PER_MESSAGE } from '@meeshy/shared/types/attachment';

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })),
  },
  performanceLogger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { AttachmentService } from '../../../../services/attachments';

const OWNER = '507f1f77bcf86cd799439099';

function makeRow(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    messageId: null,
    fileName: `${id}.jpg`,
    originalName: `${id}-original.jpg`,
    mimeType: 'image/jpeg',
    fileSize: 1024,
    filePath: `attachments/${id}.jpg`,
    fileUrl: `https://cdn.example.com/${id}.jpg`,
    thumbnailUrl: null,
    width: null,
    height: null,
    duration: null,
    bitrate: null,
    sampleRate: null,
    codec: null,
    channels: null,
    uploadedBy: OWNER,
    isAnonymous: false,
    createdAt: new Date('2026-08-16T10:00:00.000Z'),
    isForwarded: false,
    isViewOnce: false,
    viewOnceCount: 0,
    isBlurred: false,
    viewedCount: 0,
    downloadedCount: 0,
    consumedCount: 0,
    isEncrypted: false,
    ...overrides,
  };
}

function makeService(rows: ReturnType<typeof makeRow>[]) {
  const findMany = jest.fn(async () => rows) as jest.Mock<any>;
  const findUnique = jest.fn(async () => null) as jest.Mock<any>;
  const prisma = {
    messageAttachment: { findMany, findUnique },
  } as unknown as PrismaClient;
  return { service: new AttachmentService(prisma), findMany, findUnique };
}

describe('AttachmentService.getAttachmentsByIds', () => {
  beforeEach(() => jest.clearAllMocks());

  it('issues a single query for a full 199-attachment message', async () => {
    const ids = Array.from({ length: MAX_ATTACHMENTS_PER_MESSAGE }, (_, i) => `att-${i}`);
    const { service, findMany, findUnique } = makeService(ids.map((id) => makeRow(id)));

    const result = await service.getAttachmentsByIds(ids);

    expect(findMany).toHaveBeenCalledTimes(1);
    expect(findUnique).not.toHaveBeenCalled();
    expect(result).toHaveLength(MAX_ATTACHMENTS_PER_MESSAGE);
  });

  it('returns attachments in the requested order, not the database order', async () => {
    const ids = ['a', 'b', 'c'];
    // Mongo rend les lignes dans un ordre qui lui appartient.
    const { service } = makeService([makeRow('c'), makeRow('a'), makeRow('b')]);

    const result = await service.getAttachmentsByIds(ids);

    expect(result.map((att) => att?.id)).toEqual(['a', 'b', 'c']);
  });

  it('yields null at the index of a missing id so the caller can name it', async () => {
    const { service } = makeService([makeRow('a'), makeRow('c')]);

    const result = await service.getAttachmentsByIds(['a', 'ghost', 'c']);

    expect(result[0]?.id).toBe('a');
    expect(result[1]).toBeNull();
    expect(result[2]?.id).toBe('c');
  });

  it('queries distinct ids only when the caller repeats one', async () => {
    const { service, findMany } = makeService([makeRow('a')]);

    const result = await service.getAttachmentsByIds(['a', 'a', 'a']);

    expect(findMany).toHaveBeenCalledTimes(1);
    const where = (findMany.mock.calls[0] as any[])[0].where;
    expect(where.id.in).toEqual(['a']);
    expect(result.map((att) => att?.id)).toEqual(['a', 'a', 'a']);
  });

  it('does not hit the database for an empty id list', async () => {
    const { service, findMany } = makeService([]);

    expect(await service.getAttachmentsByIds([])).toEqual([]);
    expect(findMany).not.toHaveBeenCalled();
  });

  it('maps rows to the same shape as the single-attachment read', async () => {
    const { service } = makeService([makeRow('a', { thumbnailUrl: null, duration: 4200 })]);

    const [attachment] = await service.getAttachmentsByIds(['a']);

    expect(attachment).toMatchObject({
      id: 'a',
      mimeType: 'image/jpeg',
      fileSize: 1024,
      uploadedBy: OWNER,
      duration: 4200,
      isViewOnce: false,
      isEncrypted: false,
      createdAt: '2026-08-16T10:00:00.000Z',
    });
    expect(attachment?.thumbnailUrl).toBeUndefined();
  });
});
