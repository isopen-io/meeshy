/**
 * prisma-queries unit tests
 *
 * Tests routing logic (ObjectId vs. slug/linkId) and Prisma call shapes
 * for the four query helpers in routes/links/utils/prisma-queries.ts.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

// ---------------------------------------------------------------------------
// Mock attachmentIncludes so the module resolves without the full Prisma
// validator environment.
// ---------------------------------------------------------------------------
jest.mock('../../../../services/attachments/attachmentIncludes', () => ({
  attachmentMediaSelect: { id: true, url: true, mimeType: true },
}));

import {
  findShareLinkByIdentifier,
  getConversationMessages,
  getConversationMessagesWithDetails,
  countConversationMessages,
  shareLinkIncludeStructure,
} from '../../../../routes/links/utils/prisma-queries';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** 24-char hex string — valid MongoDB ObjectId shape */
const OBJECT_ID = '507f1f77bcf86cd799439011';
/** Short custom slug — NOT a valid ObjectId */
const CUSTOM_SLUG = 'mshy_meeshy-public';
/** linkId style — NOT a valid ObjectId (has a dot) */
const LINK_ID = `mshy_${OBJECT_ID}.1748000000`;

function makeMockPrisma(overrides: Record<string, unknown> = {}): PrismaClient {
  return {
    conversationShareLink: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
    },
    message: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
    ...overrides,
  } as unknown as PrismaClient;
}

// ---------------------------------------------------------------------------
// findShareLinkByIdentifier
// ---------------------------------------------------------------------------

describe('findShareLinkByIdentifier — ObjectId routing', () => {
  it('calls findUnique with id when identifier is a 24-char hex string', async () => {
    const prisma = makeMockPrisma();
    const findUnique = prisma.conversationShareLink.findUnique as jest.Mock;
    findUnique.mockResolvedValue({ id: OBJECT_ID });

    await findShareLinkByIdentifier(prisma, OBJECT_ID);

    expect(findUnique).toHaveBeenCalledTimes(1);
    expect(findUnique).toHaveBeenCalledWith({
      where: { id: OBJECT_ID },
      include: shareLinkIncludeStructure,
    });
  });

  it('does NOT call findFirst when identifier is a valid ObjectId', async () => {
    const prisma = makeMockPrisma();
    const findFirst = prisma.conversationShareLink.findFirst as jest.Mock;
    (prisma.conversationShareLink.findUnique as jest.Mock).mockResolvedValue(null);

    await findShareLinkByIdentifier(prisma, OBJECT_ID);

    expect(findFirst).not.toHaveBeenCalled();
  });

  it('returns the value from findUnique', async () => {
    const prisma = makeMockPrisma();
    const expected = { id: OBJECT_ID, linkId: 'whatever' };
    (prisma.conversationShareLink.findUnique as jest.Mock).mockResolvedValue(expected);

    const result = await findShareLinkByIdentifier(prisma, OBJECT_ID);

    expect(result).toBe(expected);
  });

  it('returns null when findUnique finds nothing', async () => {
    const prisma = makeMockPrisma();
    (prisma.conversationShareLink.findUnique as jest.Mock).mockResolvedValue(null);

    const result = await findShareLinkByIdentifier(prisma, OBJECT_ID);

    expect(result).toBeNull();
  });
});

describe('findShareLinkByIdentifier — slug/linkId routing', () => {
  it('calls findFirst with OR clause when identifier is a custom slug', async () => {
    const prisma = makeMockPrisma();
    const findFirst = prisma.conversationShareLink.findFirst as jest.Mock;
    findFirst.mockResolvedValue({ identifier: CUSTOM_SLUG });

    await findShareLinkByIdentifier(prisma, CUSTOM_SLUG);

    expect(findFirst).toHaveBeenCalledTimes(1);
    expect(findFirst).toHaveBeenCalledWith({
      where: { OR: [{ linkId: CUSTOM_SLUG }, { identifier: CUSTOM_SLUG }] },
      include: shareLinkIncludeStructure,
    });
  });

  it('calls findFirst with OR clause when identifier is a mshy_*.ts linkId', async () => {
    const prisma = makeMockPrisma();
    const findFirst = prisma.conversationShareLink.findFirst as jest.Mock;
    findFirst.mockResolvedValue(null);

    await findShareLinkByIdentifier(prisma, LINK_ID);

    expect(findFirst).toHaveBeenCalledWith({
      where: { OR: [{ linkId: LINK_ID }, { identifier: LINK_ID }] },
      include: shareLinkIncludeStructure,
    });
  });

  it('does NOT call findUnique when identifier is a slug', async () => {
    const prisma = makeMockPrisma();
    const findUnique = prisma.conversationShareLink.findUnique as jest.Mock;
    (prisma.conversationShareLink.findFirst as jest.Mock).mockResolvedValue(null);

    await findShareLinkByIdentifier(prisma, CUSTOM_SLUG);

    expect(findUnique).not.toHaveBeenCalled();
  });

  it('returns the value from findFirst', async () => {
    const prisma = makeMockPrisma();
    const expected = { id: OBJECT_ID, identifier: CUSTOM_SLUG };
    (prisma.conversationShareLink.findFirst as jest.Mock).mockResolvedValue(expected);

    const result = await findShareLinkByIdentifier(prisma, CUSTOM_SLUG);

    expect(result).toBe(expected);
  });

  it('returns null when findFirst finds nothing', async () => {
    const prisma = makeMockPrisma();
    (prisma.conversationShareLink.findFirst as jest.Mock).mockResolvedValue(null);

    const result = await findShareLinkByIdentifier(prisma, CUSTOM_SLUG);

    expect(result).toBeNull();
  });
});

describe('findShareLinkByIdentifier — ObjectId boundary cases', () => {
  it('treats a 23-char hex string as a slug (not ObjectId)', async () => {
    const prisma = makeMockPrisma();
    const findFirst = prisma.conversationShareLink.findFirst as jest.Mock;
    findFirst.mockResolvedValue(null);

    const twentyThreeHex = 'a'.repeat(23);
    await findShareLinkByIdentifier(prisma, twentyThreeHex);

    expect(findFirst).toHaveBeenCalled();
    expect(prisma.conversationShareLink.findUnique as jest.Mock).not.toHaveBeenCalled();
  });

  it('treats a 25-char hex string as a slug (not ObjectId)', async () => {
    const prisma = makeMockPrisma();
    const findFirst = prisma.conversationShareLink.findFirst as jest.Mock;
    findFirst.mockResolvedValue(null);

    const twentyFiveHex = 'a'.repeat(25);
    await findShareLinkByIdentifier(prisma, twentyFiveHex);

    expect(findFirst).toHaveBeenCalled();
    expect(prisma.conversationShareLink.findUnique as jest.Mock).not.toHaveBeenCalled();
  });

  it('treats a 24-char string containing non-hex chars as a slug', async () => {
    const prisma = makeMockPrisma();
    const findFirst = prisma.conversationShareLink.findFirst as jest.Mock;
    findFirst.mockResolvedValue(null);

    // Contains 'g' which is not a hex char
    const notHex = 'g07f1f77bcf86cd799439011';
    await findShareLinkByIdentifier(prisma, notHex);

    expect(findFirst).toHaveBeenCalled();
    expect(prisma.conversationShareLink.findUnique as jest.Mock).not.toHaveBeenCalled();
  });

  it('accepts uppercase hex as a valid ObjectId', async () => {
    const prisma = makeMockPrisma();
    const findUnique = prisma.conversationShareLink.findUnique as jest.Mock;
    findUnique.mockResolvedValue(null);

    const upperHex = OBJECT_ID.toUpperCase();
    await findShareLinkByIdentifier(prisma, upperHex);

    expect(findUnique).toHaveBeenCalledWith({
      where: { id: upperHex },
      include: shareLinkIncludeStructure,
    });
  });
});

// ---------------------------------------------------------------------------
// getConversationMessages
// ---------------------------------------------------------------------------

describe('getConversationMessages', () => {
  it('calls prisma.message.findMany with correct shape', async () => {
    const prisma = makeMockPrisma();
    const findMany = prisma.message.findMany as jest.Mock;
    findMany.mockResolvedValue([]);

    await getConversationMessages(prisma, OBJECT_ID, 20, 0);

    expect(findMany).toHaveBeenCalledTimes(1);
    const call = findMany.mock.calls[0][0] as Record<string, unknown>;
    expect(call).toMatchObject({
      where: { conversationId: OBJECT_ID, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 20,
      skip: 0,
    });
  });

  it('includes sender and statusEntries in the query', async () => {
    const prisma = makeMockPrisma();
    const findMany = prisma.message.findMany as jest.Mock;
    findMany.mockResolvedValue([]);

    await getConversationMessages(prisma, OBJECT_ID, 10, 5);

    const call = findMany.mock.calls[0][0] as Record<string, unknown>;
    const include = call.include as Record<string, unknown>;
    expect(include).toHaveProperty('sender');
    expect(include).toHaveProperty('statusEntries');
  });

  it('does NOT include attachments, replyTo, or reactions', async () => {
    const prisma = makeMockPrisma();
    const findMany = prisma.message.findMany as jest.Mock;
    findMany.mockResolvedValue([]);

    await getConversationMessages(prisma, OBJECT_ID, 10, 0);

    const call = findMany.mock.calls[0][0] as Record<string, unknown>;
    const include = call.include as Record<string, unknown>;
    expect(include).not.toHaveProperty('attachments');
    expect(include).not.toHaveProperty('replyTo');
    expect(include).not.toHaveProperty('reactions');
  });

  it('forwards limit and offset correctly', async () => {
    const prisma = makeMockPrisma();
    const findMany = prisma.message.findMany as jest.Mock;
    findMany.mockResolvedValue([]);

    await getConversationMessages(prisma, OBJECT_ID, 50, 100);

    const call = findMany.mock.calls[0][0] as Record<string, unknown>;
    expect(call.take).toBe(50);
    expect(call.skip).toBe(100);
  });

  it('returns the array from findMany', async () => {
    const prisma = makeMockPrisma();
    const messages = [{ id: 'msg1' }, { id: 'msg2' }];
    (prisma.message.findMany as jest.Mock).mockResolvedValue(messages);

    const result = await getConversationMessages(prisma, OBJECT_ID, 10, 0);

    expect(result).toBe(messages);
  });

  it('filters out deleted messages (deletedAt: null in where clause)', async () => {
    const prisma = makeMockPrisma();
    const findMany = prisma.message.findMany as jest.Mock;
    findMany.mockResolvedValue([]);

    await getConversationMessages(prisma, OBJECT_ID, 10, 0);

    const call = findMany.mock.calls[0][0] as Record<string, unknown>;
    const where = call.where as Record<string, unknown>;
    expect(where.deletedAt).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getConversationMessagesWithDetails
// ---------------------------------------------------------------------------

describe('getConversationMessagesWithDetails', () => {
  it('calls prisma.message.findMany with correct base shape', async () => {
    const prisma = makeMockPrisma();
    const findMany = prisma.message.findMany as jest.Mock;
    findMany.mockResolvedValue([]);

    await getConversationMessagesWithDetails(prisma, OBJECT_ID, 20, 0);

    expect(findMany).toHaveBeenCalledTimes(1);
    const call = findMany.mock.calls[0][0] as Record<string, unknown>;
    expect(call).toMatchObject({
      where: { conversationId: OBJECT_ID, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 20,
      skip: 0,
    });
  });

  it('includes sender, attachments, replyTo, statusEntries and reactions', async () => {
    const prisma = makeMockPrisma();
    const findMany = prisma.message.findMany as jest.Mock;
    findMany.mockResolvedValue([]);

    await getConversationMessagesWithDetails(prisma, OBJECT_ID, 10, 0);

    const call = findMany.mock.calls[0][0] as Record<string, unknown>;
    const include = call.include as Record<string, unknown>;
    expect(include).toHaveProperty('sender');
    expect(include).toHaveProperty('attachments');
    expect(include).toHaveProperty('replyTo');
    expect(include).toHaveProperty('statusEntries');
    expect(include).toHaveProperty('reactions');
  });

  it('replyTo includes nested sender, attachments and reactions', async () => {
    const prisma = makeMockPrisma();
    const findMany = prisma.message.findMany as jest.Mock;
    findMany.mockResolvedValue([]);

    await getConversationMessagesWithDetails(prisma, OBJECT_ID, 10, 0);

    const call = findMany.mock.calls[0][0] as Record<string, unknown>;
    const include = call.include as Record<string, unknown>;
    const replyTo = include.replyTo as Record<string, unknown>;
    expect(replyTo).toHaveProperty('include');
    const replyToInclude = replyTo.include as Record<string, unknown>;
    expect(replyToInclude).toHaveProperty('sender');
    expect(replyToInclude).toHaveProperty('attachments');
    expect(replyToInclude).toHaveProperty('reactions');
  });

  it('forwards limit and offset correctly', async () => {
    const prisma = makeMockPrisma();
    const findMany = prisma.message.findMany as jest.Mock;
    findMany.mockResolvedValue([]);

    await getConversationMessagesWithDetails(prisma, OBJECT_ID, 30, 60);

    const call = findMany.mock.calls[0][0] as Record<string, unknown>;
    expect(call.take).toBe(30);
    expect(call.skip).toBe(60);
  });

  it('returns the array from findMany', async () => {
    const prisma = makeMockPrisma();
    const messages = [{ id: 'msg_detail_1' }];
    (prisma.message.findMany as jest.Mock).mockResolvedValue(messages);

    const result = await getConversationMessagesWithDetails(prisma, OBJECT_ID, 10, 0);

    expect(result).toBe(messages);
  });

  it('also filters out deleted messages (deletedAt: null)', async () => {
    const prisma = makeMockPrisma();
    const findMany = prisma.message.findMany as jest.Mock;
    findMany.mockResolvedValue([]);

    await getConversationMessagesWithDetails(prisma, OBJECT_ID, 10, 0);

    const call = findMany.mock.calls[0][0] as Record<string, unknown>;
    const where = call.where as Record<string, unknown>;
    expect(where.deletedAt).toBeNull();
  });

  it('includes more fields than the basic getConversationMessages', async () => {
    const prisma = makeMockPrisma();
    const findMany = prisma.message.findMany as jest.Mock;
    findMany.mockResolvedValue([]);

    await getConversationMessagesWithDetails(prisma, OBJECT_ID, 10, 0);

    const call = findMany.mock.calls[0][0] as Record<string, unknown>;
    const include = call.include as Record<string, unknown>;
    // These fields are ONLY in the "WithDetails" variant
    expect(Object.keys(include).length).toBeGreaterThan(2);
    expect(include).toHaveProperty('attachments');
    expect(include).toHaveProperty('replyTo');
    expect(include).toHaveProperty('reactions');
  });
});

// ---------------------------------------------------------------------------
// countConversationMessages
// ---------------------------------------------------------------------------

describe('countConversationMessages', () => {
  it('calls prisma.message.count with conversationId and deletedAt: null', async () => {
    const prisma = makeMockPrisma();
    const count = prisma.message.count as jest.Mock;
    count.mockResolvedValue(42);

    await countConversationMessages(prisma, OBJECT_ID);

    expect(count).toHaveBeenCalledTimes(1);
    expect(count).toHaveBeenCalledWith({
      where: { conversationId: OBJECT_ID, deletedAt: null },
    });
  });

  it('returns the numeric count from Prisma', async () => {
    const prisma = makeMockPrisma();
    (prisma.message.count as jest.Mock).mockResolvedValue(99);

    const result = await countConversationMessages(prisma, OBJECT_ID);

    expect(result).toBe(99);
  });

  it('returns 0 when there are no messages', async () => {
    const prisma = makeMockPrisma();
    (prisma.message.count as jest.Mock).mockResolvedValue(0);

    const result = await countConversationMessages(prisma, OBJECT_ID);

    expect(result).toBe(0);
  });

  it('excludes deleted messages from the count (where deletedAt: null)', async () => {
    const prisma = makeMockPrisma();
    const count = prisma.message.count as jest.Mock;
    count.mockResolvedValue(5);

    await countConversationMessages(prisma, OBJECT_ID);

    const call = count.mock.calls[0][0] as Record<string, unknown>;
    const where = call.where as Record<string, unknown>;
    expect(where.deletedAt).toBeNull();
    expect(where.conversationId).toBe(OBJECT_ID);
  });
});
