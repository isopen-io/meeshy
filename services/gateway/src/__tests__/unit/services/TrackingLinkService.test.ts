/**
 * Unit tests for TrackingLinkService utility exports and class methods.
 * Covers: resolveFrontendBaseUrl, generateShortToken, buildTrackingUrl,
 * buildShortFormat, createTrackingLink, getTrackingLinkByToken, resolveTarget,
 * findExistingTrackingLink, recordClick, getTrackingLinkStats,
 * getUserTrackingLinks, getConversationTrackingLinks, deactivateTrackingLink,
 * deleteTrackingLink, processMessageLinks, collectContentTrackingLinks,
 * updateTrackingLinksMessageId, updateTrackingLink, isTokenAvailable.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
  },
}));

import {
  resolveFrontendBaseUrl,
  generateShortToken,
  TrackingLinkService,
} from '../../../services/TrackingLinkService';

// ─── Factories ────────────────────────────────────────────────────────────────

function makeLink(overrides: Record<string, any> = {}) {
  return {
    id: 'link-1',
    token: 'ABC123',
    originalUrl: 'https://example.com',
    shortUrl: '/l/ABC123',
    isActive: true,
    expiresAt: null,
    totalClicks: 5,
    uniqueClicks: 3,
    targetType: 'POST',
    targetId: 'post-1',
    createdBy: 'user-1',
    createdAt: new Date(),
    ...overrides,
  };
}

function makeClick(overrides: Record<string, any> = {}) {
  return {
    id: 'click-1',
    trackingLinkId: 'link-1',
    clickedAt: new Date('2026-06-25T10:00:00Z'),
    redirectStatus: null,
    country: 'FR',
    device: 'mobile',
    browser: 'Safari',
    os: 'iOS',
    language: 'fr',
    socialSource: 'twitter',
    referrer: 'https://google.com',
    ipAddress: '1.2.3.4',
    deviceFingerprint: 'fp-1',
    ...overrides,
  };
}

function makePrisma(overrides: {
  findUniqueResult?: any;
  findFirstResult?: any;
  findManyResult?: any[];
  createLinkResult?: any;
  updateLinkResult?: any;
  clickFindFirstResult?: any;
  clickFindManyResult?: any[];
  invitationResult?: any;
  linkCount?: number;
  clickCount?: number;
} = {}) {
  const defaultLink = makeLink();
  const {
    findUniqueResult = defaultLink,
    findFirstResult = null,
    findManyResult = [],
    createLinkResult = defaultLink,
    updateLinkResult = defaultLink,
    clickFindFirstResult = null,
    clickFindManyResult = [],
    invitationResult = null,
    linkCount = 0,
    clickCount = 0,
  } = overrides;

  return {
    trackingLink: {
      findUnique: jest.fn<any>().mockResolvedValue(findUniqueResult),
      findFirst: jest.fn<any>().mockResolvedValue(findFirstResult),
      create: jest.fn<any>().mockResolvedValue(createLinkResult),
      update: jest.fn<any>().mockResolvedValue(updateLinkResult),
      findMany: jest.fn<any>().mockResolvedValue(findManyResult),
      delete: jest.fn<any>().mockResolvedValue({}),
      count: jest.fn<any>().mockResolvedValue(linkCount),
      updateMany: jest.fn<any>().mockResolvedValue({}),
    },
    trackingLinkClick: {
      create: jest.fn<any>().mockResolvedValue(makeClick()),
      findFirst: jest.fn<any>().mockResolvedValue(clickFindFirstResult),
      findMany: jest.fn<any>().mockResolvedValue(clickFindManyResult),
      count: jest.fn<any>().mockResolvedValue(clickCount),
      update: jest.fn<any>().mockResolvedValue({}),
      deleteMany: jest.fn<any>().mockResolvedValue({ count: 1 }),
    },
    conversationShareLink: {
      findFirst: jest.fn<any>().mockResolvedValue(invitationResult),
    },
  };
}

const originalEnv = process.env;

beforeEach(() => {
  process.env = { ...originalEnv };
});

afterEach(() => {
  process.env = originalEnv;
});

// ─── resolveFrontendBaseUrl ───────────────────────────────────────────────────

describe('resolveFrontendBaseUrl', () => {
  it('returns FRONTEND_URL when set', () => {
    process.env.FRONTEND_URL = 'https://app.meeshy.me';
    delete process.env.NEXT_PUBLIC_FRONTEND_URL;
    expect(resolveFrontendBaseUrl()).toBe('https://app.meeshy.me');
  });

  it('falls back to NEXT_PUBLIC_FRONTEND_URL when FRONTEND_URL is absent', () => {
    delete process.env.FRONTEND_URL;
    process.env.NEXT_PUBLIC_FRONTEND_URL = 'https://next.meeshy.me';
    expect(resolveFrontendBaseUrl()).toBe('https://next.meeshy.me');
  });

  it('falls back to https://meeshy.me when both env vars are absent', () => {
    delete process.env.FRONTEND_URL;
    delete process.env.NEXT_PUBLIC_FRONTEND_URL;
    expect(resolveFrontendBaseUrl()).toBe('https://meeshy.me');
  });

  it('strips trailing slashes', () => {
    process.env.FRONTEND_URL = 'https://app.meeshy.me///';
    expect(resolveFrontendBaseUrl()).toBe('https://app.meeshy.me');
  });
});

// ─── generateShortToken ───────────────────────────────────────────────────────

describe('generateShortToken', () => {
  it('returns a string of the requested length', () => {
    expect(generateShortToken(8)).toHaveLength(8);
  });

  it('defaults to 6 characters', () => {
    expect(generateShortToken()).toHaveLength(6);
  });

  it('only contains alphanumeric characters', () => {
    const token = generateShortToken(100);
    expect(token).toMatch(/^[A-Za-z0-9]+$/);
  });
});

// ─── buildTrackingUrl / buildShortFormat ─────────────────────────────────────

describe('TrackingLinkService.buildTrackingUrl', () => {
  it('combines the base URL with the /l/<token> path', () => {
    process.env.FRONTEND_URL = 'https://meeshy.me';
    const sut = new TrackingLinkService(makePrisma() as any);
    expect(sut.buildTrackingUrl('XYZ99')).toBe('https://meeshy.me/l/XYZ99');
  });
});

describe('TrackingLinkService.buildShortFormat', () => {
  it('returns m+<token>', () => {
    const sut = new TrackingLinkService(makePrisma() as any);
    expect(sut.buildShortFormat('ABC123')).toBe('m+ABC123');
  });
});

// ─── createTrackingLink ───────────────────────────────────────────────────────

describe('TrackingLinkService.createTrackingLink', () => {
  it('throws when a customToken already exists', async () => {
    const prisma = makePrisma({ findUniqueResult: makeLink() });
    const sut = new TrackingLinkService(prisma as any);

    await expect(
      sut.createTrackingLink({ originalUrl: 'https://x.com', customToken: 'TAKEN' })
    ).rejects.toThrow('Token already exists');
  });

  it('creates with a custom token when it is available', async () => {
    const link = makeLink({ token: 'MYTOK' });
    const prisma = makePrisma({ findUniqueResult: null, createLinkResult: link });
    const sut = new TrackingLinkService(prisma as any);

    const result = await sut.createTrackingLink({
      originalUrl: 'https://x.com',
      customToken: 'MYTOK',
    });

    expect(result.token).toBe('MYTOK');
    expect(prisma.trackingLink.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ token: 'MYTOK', isActive: true, totalClicks: 0 }),
      })
    );
  });

  it('auto-generates a unique token when no customToken is provided', async () => {
    const link = makeLink({ token: 'AUTOTK' });
    const prisma = makePrisma({ findUniqueResult: null, createLinkResult: link });
    const sut = new TrackingLinkService(prisma as any);

    const result = await sut.createTrackingLink({ originalUrl: 'https://auto.example.com' });

    expect(result.token).toBe('AUTOTK');
  });
});

// ─── getTrackingLinkByToken ───────────────────────────────────────────────────

describe('TrackingLinkService.getTrackingLinkByToken', () => {
  it('returns the link when found', async () => {
    const link = makeLink();
    const prisma = makePrisma({ findUniqueResult: link });
    const sut = new TrackingLinkService(prisma as any);

    const result = await sut.getTrackingLinkByToken('ABC123');

    expect(result).toEqual(link);
  });

  it('returns null when not found', async () => {
    const prisma = makePrisma({ findUniqueResult: null });
    const sut = new TrackingLinkService(prisma as any);

    const result = await sut.getTrackingLinkByToken('MISSING');

    expect(result).toBeNull();
  });
});

// ─── resolveTarget ────────────────────────────────────────────────────────────

describe('TrackingLinkService.resolveTarget', () => {
  it('returns tracking kind when a TrackingLink is found', async () => {
    const prisma = makePrisma({ findUniqueResult: makeLink() });
    const sut = new TrackingLinkService(prisma as any);

    const result = await sut.resolveTarget('ABC123');

    expect(result).not.toBeNull();
    expect(result!.kind).toBe('tracking');
    expect(result!.isActive).toBe(true);
    expect(result!.targetType).toBe('POST');
  });

  it('marks expired tracking link as isActive:false', async () => {
    const expired = makeLink({ isActive: true, expiresAt: new Date(Date.now() - 1000) });
    const prisma = makePrisma({ findUniqueResult: expired });
    const sut = new TrackingLinkService(prisma as any);

    const result = await sut.resolveTarget('EXPIRED');

    expect(result!.isActive).toBe(false);
  });

  it('falls back to conversation kind when no TrackingLink exists', async () => {
    const invitation = {
      conversationId: 'conv-99',
      createdBy: 'user-host',
      isActive: true,
      expiresAt: null,
      linkId: 'INV123',
      identifier: 'INV123',
    };
    const prisma = makePrisma({ findUniqueResult: null, invitationResult: invitation });
    const sut = new TrackingLinkService(prisma as any);

    const result = await sut.resolveTarget('INV123');

    expect(result!.kind).toBe('conversation');
    expect(result!.targetId).toBe('conv-99');
  });

  it('returns null when neither a tracking link nor invitation is found', async () => {
    const prisma = makePrisma({ findUniqueResult: null, invitationResult: null });
    const sut = new TrackingLinkService(prisma as any);

    const result = await sut.resolveTarget('UNKNOWN');

    expect(result).toBeNull();
  });
});

// ─── findExistingTrackingLink ─────────────────────────────────────────────────

describe('TrackingLinkService.findExistingTrackingLink', () => {
  it('queries with originalUrl and isActive:true', async () => {
    const prisma = makePrisma();
    const sut = new TrackingLinkService(prisma as any);

    await sut.findExistingTrackingLink('https://example.com');

    expect(prisma.trackingLink.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ originalUrl: 'https://example.com', isActive: true }),
      })
    );
  });

  it('includes conversationId filter when provided', async () => {
    const prisma = makePrisma();
    const sut = new TrackingLinkService(prisma as any);

    await sut.findExistingTrackingLink('https://example.com', 'conv-42');

    expect(prisma.trackingLink.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ conversationId: 'conv-42' }),
      })
    );
  });
});

// ─── recordClick ─────────────────────────────────────────────────────────────

describe('TrackingLinkService.recordClick', () => {
  it('throws when the tracking link is not found', async () => {
    const prisma = makePrisma({ findUniqueResult: null });
    const sut = new TrackingLinkService(prisma as any);

    await expect(sut.recordClick({ token: 'MISSING' })).rejects.toThrow('not found');
  });

  it('throws when the tracking link is inactive', async () => {
    const prisma = makePrisma({ findUniqueResult: makeLink({ isActive: false }) });
    const sut = new TrackingLinkService(prisma as any);

    await expect(sut.recordClick({ token: 'INACTIVE' })).rejects.toThrow('inactive');
  });

  it('throws when the tracking link has expired', async () => {
    const expired = makeLink({ isActive: true, expiresAt: new Date(Date.now() - 1000) });
    const prisma = makePrisma({ findUniqueResult: expired });
    const sut = new TrackingLinkService(prisma as any);

    await expect(sut.recordClick({ token: 'EXPIRED' })).rejects.toThrow('expired');
  });

  it('creates a click record and updates totalClicks', async () => {
    const link = makeLink({ totalClicks: 5, uniqueClicks: 3 });
    const prisma = makePrisma({ findUniqueResult: link, clickFindFirstResult: null });
    const sut = new TrackingLinkService(prisma as any);

    await sut.recordClick({ token: 'ABC123', ipAddress: '1.2.3.4' });

    expect(prisma.trackingLinkClick.create).toHaveBeenCalled();
    expect(prisma.trackingLink.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ totalClicks: { increment: 1 } }),
      })
    );
  });

  it('increments uniqueClicks when the click is unique (no prior click found)', async () => {
    const prisma = makePrisma({ findUniqueResult: makeLink(), clickFindFirstResult: null });
    const sut = new TrackingLinkService(prisma as any);

    await sut.recordClick({ token: 'ABC123', ipAddress: '9.9.9.9' });

    const updateCall = (prisma.trackingLink.update as jest.Mock<any>).mock.calls[0][0];
    expect(updateCall.data.uniqueClicks).toEqual({ increment: 1 });
  });

  it('does NOT increment uniqueClicks when a prior click exists', async () => {
    const prisma = makePrisma({
      findUniqueResult: makeLink(),
      clickFindFirstResult: makeClick(),
    });
    const sut = new TrackingLinkService(prisma as any);

    await sut.recordClick({ token: 'ABC123', ipAddress: '1.2.3.4' });

    const updateCall = (prisma.trackingLink.update as jest.Mock<any>).mock.calls[0][0];
    expect(updateCall.data.uniqueClicks).toBeUndefined();
  });
});

// ─── getTrackingLinkStats ────────────────────────────────────────────────────

describe('TrackingLinkService.getTrackingLinkStats', () => {
  it('throws when the tracking link is not found', async () => {
    const prisma = makePrisma({ findUniqueResult: null });
    const sut = new TrackingLinkService(prisma as any);

    await expect(sut.getTrackingLinkStats('BAD')).rejects.toThrow('not found');
  });

  it('returns zero-click stats when no clicks exist', async () => {
    const prisma = makePrisma({ findUniqueResult: makeLink(), clickFindManyResult: [] });
    const sut = new TrackingLinkService(prisma as any);

    const stats = await sut.getTrackingLinkStats('ABC123');

    expect(stats.totalClicks).toBe(0);
    expect(stats.confirmedClicks).toBe(0);
    expect(stats.topReferrers).toEqual([]);
  });

  it('aggregates clicks by country, device, browser, os, language, date, socialSource and referrer', async () => {
    const clicks = [
      makeClick({ country: 'FR', device: 'mobile', browser: 'Safari', os: 'iOS', language: 'fr', socialSource: 'twitter', referrer: 'https://google.com', redirectStatus: 'confirmed' }),
      makeClick({ id: 'click-2', country: 'US', device: 'desktop', browser: 'Chrome', os: 'Windows', language: 'en', socialSource: null, referrer: null }),
    ];
    const link = makeLink({ uniqueClicks: 2 });
    const prisma = makePrisma({ findUniqueResult: link, clickFindManyResult: clicks });
    const sut = new TrackingLinkService(prisma as any);

    const stats = await sut.getTrackingLinkStats('ABC123');

    expect(stats.totalClicks).toBe(2);
    expect(stats.clicksByCountry['FR']).toBe(1);
    expect(stats.clicksByCountry['US']).toBe(1);
    expect(stats.clicksByDevice['mobile']).toBe(1);
    expect(stats.clicksByBrowser['Safari']).toBe(1);
    expect(stats.clicksByOS['iOS']).toBe(1);
    expect(stats.clicksByLanguage['fr']).toBe(1);
    expect(stats.clicksBySocialSource['twitter']).toBe(1);
    expect(stats.confirmedClicks).toBe(1);
    expect(stats.uniqueClicks).toBe(2);
    expect(stats.topReferrers).toHaveLength(1);
    expect(stats.topReferrers[0].referrer).toBe('https://google.com');
  });

  it('applies startDate and endDate filters on clickedAt', async () => {
    const prisma = makePrisma({ findUniqueResult: makeLink(), clickFindManyResult: [] });
    const sut = new TrackingLinkService(prisma as any);
    const start = new Date('2026-06-01');
    const end = new Date('2026-06-30');

    await sut.getTrackingLinkStats('ABC123', { startDate: start, endDate: end });

    expect(prisma.trackingLinkClick.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          clickedAt: expect.objectContaining({ gte: start, lte: end }),
        }),
      })
    );
  });
});

// ─── getUserTrackingLinks ─────────────────────────────────────────────────────

describe('TrackingLinkService.getUserTrackingLinks', () => {
  it('queries by createdBy userId ordered by createdAt desc', async () => {
    const prisma = makePrisma({ findManyResult: [] });
    const sut = new TrackingLinkService(prisma as any);

    await sut.getUserTrackingLinks('user-99');

    expect(prisma.trackingLink.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { createdBy: 'user-99' },
        orderBy: { createdAt: 'desc' },
      })
    );
  });
});

// ─── getConversationTrackingLinks ─────────────────────────────────────────────

describe('TrackingLinkService.getConversationTrackingLinks', () => {
  it('queries by conversationId ordered by createdAt desc', async () => {
    const prisma = makePrisma({ findManyResult: [] });
    const sut = new TrackingLinkService(prisma as any);

    await sut.getConversationTrackingLinks('conv-77');

    expect(prisma.trackingLink.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { conversationId: 'conv-77' },
        orderBy: { createdAt: 'desc' },
      })
    );
  });
});

// ─── deactivateTrackingLink ───────────────────────────────────────────────────

describe('TrackingLinkService.deactivateTrackingLink', () => {
  it('updates isActive to false on the target token', async () => {
    const prisma = makePrisma();
    const sut = new TrackingLinkService(prisma as any);

    await sut.deactivateTrackingLink('ABC123');

    expect(prisma.trackingLink.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { token: 'ABC123' },
        data: { isActive: false },
      })
    );
  });
});

// ─── deleteTrackingLink ───────────────────────────────────────────────────────

describe('TrackingLinkService.deleteTrackingLink', () => {
  it('throws when the tracking link does not exist', async () => {
    const prisma = makePrisma({ findUniqueResult: null });
    const sut = new TrackingLinkService(prisma as any);

    await expect(sut.deleteTrackingLink('GHOST')).rejects.toThrow('not found');
  });

  it('deletes all associated clicks then deletes the link', async () => {
    const link = makeLink({ id: 'link-1', token: 'ABC123' });
    const prisma = makePrisma({ findUniqueResult: link });
    const sut = new TrackingLinkService(prisma as any);

    await sut.deleteTrackingLink('ABC123');

    expect(prisma.trackingLinkClick.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { trackingLinkId: 'link-1' } })
    );
    expect(prisma.trackingLink.delete).toHaveBeenCalledWith(
      expect.objectContaining({ where: { token: 'ABC123' } })
    );
  });
});

// ─── processMessageLinks ──────────────────────────────────────────────────────

describe('TrackingLinkService.processMessageLinks', () => {
  it('returns unchanged content and empty links when no URLs are present', async () => {
    const prisma = makePrisma();
    const sut = new TrackingLinkService(prisma as any);

    const result = await sut.processMessageLinks({ content: 'Hello world' });

    expect(result.processedContent).toBe('Hello world');
    expect(result.trackingLinks).toHaveLength(0);
  });

  it('creates a tracking link for a raw URL and replaces it with m+<token>', async () => {
    const link = makeLink({ token: 'NEWTKN' });
    const prisma = makePrisma({ findUniqueResult: null, findFirstResult: null, createLinkResult: link });
    const sut = new TrackingLinkService(prisma as any);

    const result = await sut.processMessageLinks({
      content: 'Visit https://example.com for more',
      conversationId: 'conv-1',
    });

    expect(result.processedContent).toContain('m+NEWTKN');
    expect(result.processedContent).not.toContain('https://example.com');
    expect(result.trackingLinks).toHaveLength(1);
  });

  it('skips URLs that are already m+<token> format', async () => {
    const prisma = makePrisma();
    const sut = new TrackingLinkService(prisma as any);

    const result = await sut.processMessageLinks({ content: 'See m+ABC123 here' });

    expect(result.trackingLinks).toHaveLength(0);
    expect(prisma.trackingLink.findFirst).not.toHaveBeenCalled();
  });

  it('preserves content when rewriteToShortLink is false', async () => {
    const link = makeLink({ token: 'NEWTKN' });
    const prisma = makePrisma({ findUniqueResult: null, findFirstResult: null, createLinkResult: link });
    const sut = new TrackingLinkService(prisma as any);

    const result = await sut.processMessageLinks({
      content: 'https://example.com',
      rewriteToShortLink: false,
    });

    expect(result.processedContent).toBe('https://example.com');
    expect(result.trackingLinks).toHaveLength(1);
  });

  it('reuses an existing tracking link instead of creating a new one', async () => {
    const existing = makeLink({ token: 'EXIST1' });
    const prisma = makePrisma({ findFirstResult: existing });
    const sut = new TrackingLinkService(prisma as any);

    const result = await sut.processMessageLinks({
      content: 'https://example.com',
      conversationId: 'conv-1',
    });

    expect(prisma.trackingLink.create).not.toHaveBeenCalled();
    expect(result.processedContent).toContain('m+EXIST1');
  });
});

// ─── collectContentTrackingLinks ─────────────────────────────────────────────

describe('TrackingLinkService.collectContentTrackingLinks', () => {
  it('returns empty array for empty content', async () => {
    const prisma = makePrisma();
    const sut = new TrackingLinkService(prisma as any);

    const result = await sut.collectContentTrackingLinks({ content: '' });

    expect(result).toEqual([]);
  });

  it('deduplicates URLs when the same URL appears twice', async () => {
    const link = makeLink({ token: 'UNIQ1', originalUrl: 'https://example.com' });
    const prisma = makePrisma({ findFirstResult: link });
    const sut = new TrackingLinkService(prisma as any);

    const result = await sut.collectContentTrackingLinks({
      content: 'https://example.com and again https://example.com',
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ url: 'https://example.com', token: 'UNIQ1' });
  });

  it('returns empty array without throwing when DB errors occur', async () => {
    const prisma = makePrisma({ findUniqueResult: null, findFirstResult: null });
    (prisma.trackingLink.create as jest.Mock<any>).mockRejectedValue(new Error('DB down'));
    const sut = new TrackingLinkService(prisma as any);

    const result = await sut.collectContentTrackingLinks({ content: 'https://example.com' });

    expect(result).toEqual([]);
  });
});

// ─── updateTrackingLinksMessageId ─────────────────────────────────────────────

describe('TrackingLinkService.updateTrackingLinksMessageId', () => {
  it('does nothing when the tokens array is empty', async () => {
    const prisma = makePrisma();
    const sut = new TrackingLinkService(prisma as any);

    await sut.updateTrackingLinksMessageId([], 'msg-1');

    expect(prisma.trackingLink.updateMany).not.toHaveBeenCalled();
  });

  it('calls updateMany with the provided tokens and messageId', async () => {
    const prisma = makePrisma();
    const sut = new TrackingLinkService(prisma as any);

    await sut.updateTrackingLinksMessageId(['TK1', 'TK2'], 'msg-999');

    expect(prisma.trackingLink.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { token: { in: ['TK1', 'TK2'] } },
        data: { messageId: 'msg-999' },
      })
    );
  });
});

// ─── updateTrackingLink ───────────────────────────────────────────────────────

describe('TrackingLinkService.updateTrackingLink', () => {
  it('throws when the tracking link does not exist', async () => {
    const prisma = makePrisma({ findUniqueResult: null });
    const sut = new TrackingLinkService(prisma as any);

    await expect(sut.updateTrackingLink({ token: 'GHOST' })).rejects.toThrow('not found');
  });

  it('throws when the new token is already taken', async () => {
    const existing = makeLink({ token: 'EXISTING' });
    const prisma = makePrisma({ findUniqueResult: existing });
    (prisma.trackingLink.findUnique as jest.Mock<any>)
      .mockResolvedValueOnce(existing)  // current link found
      .mockResolvedValueOnce(existing); // newToken check → already exists
    const sut = new TrackingLinkService(prisma as any);

    await expect(
      sut.updateTrackingLink({ token: 'EXISTING', newToken: 'TAKEN' })
    ).rejects.toThrow('Token already exists');
  });

  it('calls update with correct fields when isActive and expiresAt are provided', async () => {
    const link = makeLink();
    const prisma = makePrisma({ findUniqueResult: link, updateLinkResult: link });
    const sut = new TrackingLinkService(prisma as any);
    const expires = new Date('2027-01-01');

    await sut.updateTrackingLink({ token: 'ABC123', isActive: false, expiresAt: expires });

    expect(prisma.trackingLink.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { token: 'ABC123' },
        data: expect.objectContaining({ isActive: false, expiresAt: expires }),
      })
    );
  });
});

// ─── isTokenAvailable ─────────────────────────────────────────────────────────

describe('TrackingLinkService.isTokenAvailable', () => {
  it('returns true when no link is found for the token', async () => {
    const prisma = makePrisma({ findUniqueResult: null });
    const sut = new TrackingLinkService(prisma as any);

    expect(await sut.isTokenAvailable('FREE')).toBe(true);
  });

  it('returns false when a link already uses the token', async () => {
    const prisma = makePrisma({ findUniqueResult: makeLink() });
    const sut = new TrackingLinkService(prisma as any);

    expect(await sut.isTokenAvailable('TAKEN')).toBe(false);
  });
});
