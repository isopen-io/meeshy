/**
 * TrackingLinkService Unit Tests
 *
 * Covers:
 * - resolveFrontendBaseUrl(): env var priority, trailing-slash strip
 * - generateShortToken(): length, character set
 * - buildTrackingUrl() / buildShortFormat()
 * - createTrackingLink(): custom token (collision), auto-unique token, DB create
 * - getTrackingLinkByToken(): found / not found
 * - resolveTarget(): tracking link path, conversation link fallback, null for 404
 * - isLinkActive(): inactive flag, expired date
 * - findExistingTrackingLink(): with and without conversationId filter
 * - recordClick(): not found, inactive, expired, unique detection, stats update
 * - updateRedirectStatus(): delegates to prisma update
 * - getTrackingLinkStats(): not found, aggregation, date filter, unique clicks
 * - getUserTrackingLinks() / getConversationTrackingLinks()
 * - deactivateTrackingLink()
 * - deleteTrackingLink(): not found, deletes clicks then link
 * - getAllTrackingLinks(): with/without search
 * - getTrackingLinkClicks()
 * - processExplicitLinksInContent(): [[url]], <url>, markdown protection, reuse
 * - processMessageLinks(): URL detection, skip existing tracking links, rewrite flag
 * - collectContentTrackingLinks(): empty content, dedup, error → []
 * - updateTrackingLinksMessageId(): no-op for empty, updateMany
 * - updateTrackingLink(): not found, token collision, updates fields
 * - isTokenAvailable()
 *
 * @jest-environment node
 */

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: () => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() }),
  },
}));

import {
  TrackingLinkService,
  resolveFrontendBaseUrl,
  generateShortToken,
} from '../../../services/TrackingLinkService';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const LINK_FIXTURE = {
  id: 'link_001',
  token: 'AbCd12',
  shortUrl: '/l/AbCd12',
  originalUrl: 'https://example.com/page',
  isActive: true,
  expiresAt: null,
  totalClicks: 0,
  uniqueClicks: 0,
  createdBy: 'user_001',
  conversationId: null,
  messageId: null,
  targetType: 'URL',
  targetId: null,
  name: null,
  campaign: null,
  source: null,
  medium: null,
  createdAt: new Date('2024-01-01'),
  lastClickedAt: null,
};

// ---------------------------------------------------------------------------
// Prisma factory
// ---------------------------------------------------------------------------

function makePrisma(overrides: Record<string, Partial<Record<string, jest.Mock>>> = {}) {
  return {
    trackingLink: {
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue(LINK_FIXTURE),
      update: jest.fn().mockResolvedValue(LINK_FIXTURE),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      delete: jest.fn().mockResolvedValue({}),
      count: jest.fn().mockResolvedValue(0),
      ...overrides.trackingLink,
    },
    trackingLinkClick: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ id: 'click_001', clickedAt: new Date() }),
      update: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      count: jest.fn().mockResolvedValue(0),
      ...overrides.trackingLinkClick,
    },
    conversationShareLink: {
      findFirst: jest.fn().mockResolvedValue(null),
      ...overrides.conversationShareLink,
    },
  } as any;
}

afterEach(() => jest.clearAllMocks());

// ---------------------------------------------------------------------------
// resolveFrontendBaseUrl
// ---------------------------------------------------------------------------
describe('resolveFrontendBaseUrl', () => {
  const ORIGINAL_ENV = { ...process.env };

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('returns FRONTEND_URL when set', () => {
    process.env.FRONTEND_URL = 'https://app.example.com';
    expect(resolveFrontendBaseUrl()).toBe('https://app.example.com');
  });

  it('falls back to NEXT_PUBLIC_FRONTEND_URL when FRONTEND_URL is unset', () => {
    delete process.env.FRONTEND_URL;
    process.env.NEXT_PUBLIC_FRONTEND_URL = 'https://next.example.com';
    expect(resolveFrontendBaseUrl()).toBe('https://next.example.com');
  });

  it('falls back to meeshy.me when both vars are unset', () => {
    delete process.env.FRONTEND_URL;
    delete process.env.NEXT_PUBLIC_FRONTEND_URL;
    expect(resolveFrontendBaseUrl()).toBe('https://meeshy.me');
  });

  it('strips trailing slashes', () => {
    process.env.FRONTEND_URL = 'https://app.example.com///';
    expect(resolveFrontendBaseUrl()).toBe('https://app.example.com');
  });
});

// ---------------------------------------------------------------------------
// generateShortToken
// ---------------------------------------------------------------------------
describe('generateShortToken', () => {
  it('generates a 6-char token by default', () => {
    const token = generateShortToken();
    expect(token).toHaveLength(6);
  });

  it('generates a token of the requested length', () => {
    expect(generateShortToken(10)).toHaveLength(10);
    expect(generateShortToken(3)).toHaveLength(3);
  });

  it('uses only alphanumeric characters', () => {
    const token = generateShortToken(100);
    expect(token).toMatch(/^[A-Za-z0-9]+$/);
  });

  it('generates different tokens on repeated calls (statistically)', () => {
    const tokens = new Set(Array.from({ length: 20 }, () => generateShortToken()));
    expect(tokens.size).toBeGreaterThan(1);
  });
});

// ---------------------------------------------------------------------------
// buildTrackingUrl / buildShortFormat
// ---------------------------------------------------------------------------
describe('buildTrackingUrl and buildShortFormat', () => {
  const svc = new TrackingLinkService(makePrisma());

  it('buildTrackingUrl returns baseUrl + /l/<token>', () => {
    const url = svc.buildTrackingUrl('AbCd12');
    expect(url).toMatch(/\/l\/AbCd12$/);
  });

  it('buildShortFormat returns m+<token>', () => {
    expect(svc.buildShortFormat('AbCd12')).toBe('m+AbCd12');
  });
});

// ---------------------------------------------------------------------------
// createTrackingLink
// ---------------------------------------------------------------------------
describe('createTrackingLink', () => {
  it('uses customToken when provided', async () => {
    const prisma = makePrisma({
      trackingLink: {
        findUnique: jest.fn().mockResolvedValue(null), // no collision
        create: jest.fn().mockResolvedValue({ ...LINK_FIXTURE, token: 'CUSTOM' }),
      },
    });
    const svc = new TrackingLinkService(prisma);

    const result = await svc.createTrackingLink({ originalUrl: 'https://x.com', customToken: 'CUSTOM' });

    expect(result.token).toBe('CUSTOM');
  });

  it('throws when customToken already exists', async () => {
    const prisma = makePrisma({
      trackingLink: { findUnique: jest.fn().mockResolvedValue(LINK_FIXTURE) },
    });
    const svc = new TrackingLinkService(prisma);

    await expect(
      svc.createTrackingLink({ originalUrl: 'https://x.com', customToken: 'TAKEN' })
    ).rejects.toThrow('Token already exists');
  });

  it('generates a unique token when no customToken', async () => {
    const prisma = makePrisma({
      trackingLink: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(LINK_FIXTURE),
      },
    });
    const svc = new TrackingLinkService(prisma);

    const result = await svc.createTrackingLink({ originalUrl: 'https://x.com' });
    expect(result).toBeDefined();
  });

  it('retries token generation on collision', async () => {
    const findUnique = jest.fn()
      .mockResolvedValueOnce(LINK_FIXTURE) // first token collides
      .mockResolvedValueOnce(null);        // second token is free
    const prisma = makePrisma({ trackingLink: { findUnique, create: jest.fn().mockResolvedValue(LINK_FIXTURE) } });
    const svc = new TrackingLinkService(prisma);

    await svc.createTrackingLink({ originalUrl: 'https://x.com' });

    // findUnique called twice: once collision, once clear
    expect(findUnique).toHaveBeenCalledTimes(2);
  });

  it('throws when max token generation attempts exceeded', async () => {
    const prisma = makePrisma({
      trackingLink: { findUnique: jest.fn().mockResolvedValue(LINK_FIXTURE) }, // always collides
    });
    const svc = new TrackingLinkService(prisma);

    await expect(svc.createTrackingLink({ originalUrl: 'https://x.com' })).rejects.toThrow(
      'Unable to generate unique token after maximum attempts'
    );
  });

  it('sets shortUrl as /l/<token>', async () => {
    const create = jest.fn().mockResolvedValue(LINK_FIXTURE);
    const prisma = makePrisma({ trackingLink: { findUnique: jest.fn().mockResolvedValue(null), create } });
    const svc = new TrackingLinkService(prisma);

    await svc.createTrackingLink({ originalUrl: 'https://x.com' });

    const [arg] = create.mock.calls[0];
    expect(arg.data.shortUrl).toMatch(/^\/l\//);
  });
});

// ---------------------------------------------------------------------------
// getTrackingLinkByToken
// ---------------------------------------------------------------------------
describe('getTrackingLinkByToken', () => {
  it('returns link when found', async () => {
    const prisma = makePrisma({ trackingLink: { findUnique: jest.fn().mockResolvedValue(LINK_FIXTURE) } });
    const svc = new TrackingLinkService(prisma);
    expect(await svc.getTrackingLinkByToken('AbCd12')).toEqual(LINK_FIXTURE);
  });

  it('returns null when not found', async () => {
    const svc = new TrackingLinkService(makePrisma());
    expect(await svc.getTrackingLinkByToken('nope')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// resolveTarget
// ---------------------------------------------------------------------------
describe('resolveTarget', () => {
  it('returns null when neither link nor invitation exists', async () => {
    const svc = new TrackingLinkService(makePrisma());
    expect(await svc.resolveTarget('unknown')).toBeNull();
  });

  it('returns tracking kind when a TrackingLink is found', async () => {
    const prisma = makePrisma({
      trackingLink: { findUnique: jest.fn().mockResolvedValue(LINK_FIXTURE) },
    });
    const svc = new TrackingLinkService(prisma);
    const result = await svc.resolveTarget('AbCd12');
    expect(result?.kind).toBe('tracking');
    expect(result?.isActive).toBe(true);
  });

  it('marks as inactive when link.isActive is false', async () => {
    const prisma = makePrisma({
      trackingLink: { findUnique: jest.fn().mockResolvedValue({ ...LINK_FIXTURE, isActive: false }) },
    });
    const svc = new TrackingLinkService(prisma);
    const result = await svc.resolveTarget('AbCd12');
    expect(result?.isActive).toBe(false);
  });

  it('marks as inactive when link has expired', async () => {
    const prisma = makePrisma({
      trackingLink: { findUnique: jest.fn().mockResolvedValue({ ...LINK_FIXTURE, expiresAt: new Date('2000-01-01') }) },
    });
    const svc = new TrackingLinkService(prisma);
    const result = await svc.resolveTarget('AbCd12');
    expect(result?.isActive).toBe(false);
  });

  it('falls back to conversation kind when TrackingLink not found', async () => {
    const invitation = {
      conversationId: 'conv_001',
      createdBy: 'user_001',
      isActive: true,
      expiresAt: null,
    };
    const prisma = makePrisma({
      conversationShareLink: { findFirst: jest.fn().mockResolvedValue(invitation) },
    });
    const svc = new TrackingLinkService(prisma);
    const result = await svc.resolveTarget('token123');
    expect(result?.kind).toBe('conversation');
    expect(result?.targetType).toBe('CONVERSATION');
    expect(result?.targetId).toBe('conv_001');
  });
});

// ---------------------------------------------------------------------------
// findExistingTrackingLink
// ---------------------------------------------------------------------------
describe('findExistingTrackingLink', () => {
  it('queries without conversationId when not provided', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const prisma = makePrisma({ trackingLink: { findFirst } });
    const svc = new TrackingLinkService(prisma);

    await svc.findExistingTrackingLink('https://x.com');

    const [arg] = findFirst.mock.calls[0];
    expect(arg.where).not.toHaveProperty('conversationId');
  });

  it('queries with conversationId filter when provided', async () => {
    const findFirst = jest.fn().mockResolvedValue(LINK_FIXTURE);
    const prisma = makePrisma({ trackingLink: { findFirst } });
    const svc = new TrackingLinkService(prisma);

    await svc.findExistingTrackingLink('https://x.com', 'conv_001');

    const [arg] = findFirst.mock.calls[0];
    expect(arg.where.conversationId).toBe('conv_001');
  });
});

// ---------------------------------------------------------------------------
// recordClick
// ---------------------------------------------------------------------------
describe('recordClick', () => {
  const CLICK_PARAMS = { token: 'AbCd12', ipAddress: '1.2.3.4' };

  it('throws when link not found', async () => {
    const svc = new TrackingLinkService(makePrisma());
    await expect(svc.recordClick(CLICK_PARAMS)).rejects.toThrow('Tracking link not found');
  });

  it('throws when link is inactive', async () => {
    const prisma = makePrisma({
      trackingLink: { findUnique: jest.fn().mockResolvedValue({ ...LINK_FIXTURE, isActive: false }) },
    });
    const svc = new TrackingLinkService(prisma);
    await expect(svc.recordClick(CLICK_PARAMS)).rejects.toThrow('Tracking link is inactive');
  });

  it('throws when link has expired', async () => {
    const prisma = makePrisma({
      trackingLink: { findUnique: jest.fn().mockResolvedValue({ ...LINK_FIXTURE, expiresAt: new Date('2000-01-01') }) },
    });
    const svc = new TrackingLinkService(prisma);
    await expect(svc.recordClick(CLICK_PARAMS)).rejects.toThrow('Tracking link has expired');
  });

  it('creates a click record on success', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'click_001', clickedAt: new Date() });
    const prisma = makePrisma({
      trackingLink: {
        findUnique: jest.fn().mockResolvedValue(LINK_FIXTURE),
        update: jest.fn().mockResolvedValue(LINK_FIXTURE),
      },
      trackingLinkClick: { findFirst: jest.fn().mockResolvedValue(null), create },
    });
    const svc = new TrackingLinkService(prisma);

    await svc.recordClick(CLICK_PARAMS);

    expect(create).toHaveBeenCalledTimes(1);
  });

  it('increments uniqueClicks when click is unique (no prior click from IP)', async () => {
    const update = jest.fn().mockResolvedValue(LINK_FIXTURE);
    const prisma = makePrisma({
      trackingLink: {
        findUnique: jest.fn().mockResolvedValue(LINK_FIXTURE),
        update,
      },
      trackingLinkClick: {
        findFirst: jest.fn().mockResolvedValue(null), // unique
        create: jest.fn().mockResolvedValue({ id: 'click_001', clickedAt: new Date() }),
      },
    });
    const svc = new TrackingLinkService(prisma);

    await svc.recordClick(CLICK_PARAMS);

    const updateData = update.mock.calls[0][0].data;
    expect(updateData.uniqueClicks).toEqual({ increment: 1 });
  });

  it('does not increment uniqueClicks for non-unique click', async () => {
    const update = jest.fn().mockResolvedValue(LINK_FIXTURE);
    const prisma = makePrisma({
      trackingLink: {
        findUnique: jest.fn().mockResolvedValue(LINK_FIXTURE),
        update,
      },
      trackingLinkClick: {
        findFirst: jest.fn().mockResolvedValue({ id: 'existing_click' }), // NOT unique
        create: jest.fn().mockResolvedValue({ id: 'click_001', clickedAt: new Date() }),
      },
    });
    const svc = new TrackingLinkService(prisma);

    await svc.recordClick(CLICK_PARAMS);

    const updateData = update.mock.calls[0][0].data;
    expect(updateData.uniqueClicks).toBeUndefined();
  });

  it('returns both trackingLink and click', async () => {
    const click = { id: 'click_001', clickedAt: new Date() };
    const prisma = makePrisma({
      trackingLink: {
        findUnique: jest.fn().mockResolvedValue(LINK_FIXTURE),
        update: jest.fn().mockResolvedValue(LINK_FIXTURE),
      },
      trackingLinkClick: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(click),
      },
    });
    const svc = new TrackingLinkService(prisma);

    const result = await svc.recordClick(CLICK_PARAMS);

    expect(result.click).toEqual(click);
    expect(result.trackingLink).toBeDefined();
  });

  it('treats click as non-unique when no ipAddress and no fingerprint', async () => {
    const update = jest.fn().mockResolvedValue(LINK_FIXTURE);
    const prisma = makePrisma({
      trackingLink: {
        findUnique: jest.fn().mockResolvedValue(LINK_FIXTURE),
        update,
      },
      trackingLinkClick: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'click_001', clickedAt: new Date() }),
      },
    });
    const svc = new TrackingLinkService(prisma);

    // No ipAddress, no deviceFingerprint → isUnique = false
    await svc.recordClick({ token: 'AbCd12' });

    const updateData = update.mock.calls[0][0].data;
    expect(updateData.uniqueClicks).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// updateRedirectStatus
// ---------------------------------------------------------------------------
describe('updateRedirectStatus', () => {
  it('calls prisma update with correct args', async () => {
    const update = jest.fn().mockResolvedValue({});
    const prisma = makePrisma({ trackingLinkClick: { update } });
    const svc = new TrackingLinkService(prisma);

    await svc.updateRedirectStatus('click_001', 'link_001', 'confirmed');

    expect(update).toHaveBeenCalledWith({
      where: { id: 'click_001', trackingLinkId: 'link_001' },
      data: { redirectStatus: 'confirmed' },
    });
  });
});

// ---------------------------------------------------------------------------
// getTrackingLinkStats
// ---------------------------------------------------------------------------
describe('getTrackingLinkStats', () => {
  it('throws when link not found', async () => {
    const svc = new TrackingLinkService(makePrisma());
    await expect(svc.getTrackingLinkStats('nope')).rejects.toThrow('Tracking link not found');
  });

  it('aggregates clicks by country', async () => {
    const clicks = [
      { country: 'US', device: null, browser: null, os: null, language: null, clickedAt: new Date('2024-01-01T10:00:00Z'), socialSource: null, referrer: null, ipAddress: '1.1.1.1', deviceFingerprint: null, redirectStatus: null },
      { country: 'US', device: null, browser: null, os: null, language: null, clickedAt: new Date('2024-01-01T11:00:00Z'), socialSource: null, referrer: null, ipAddress: '1.1.1.2', deviceFingerprint: null, redirectStatus: null },
      { country: 'FR', device: null, browser: null, os: null, language: null, clickedAt: new Date('2024-01-01T12:00:00Z'), socialSource: null, referrer: null, ipAddress: '2.2.2.2', deviceFingerprint: null, redirectStatus: null },
    ];
    const prisma = makePrisma({
      trackingLink: {
        findUnique: jest.fn().mockResolvedValue(LINK_FIXTURE),
      },
      trackingLinkClick: { findMany: jest.fn().mockResolvedValue(clicks) },
    });
    const svc = new TrackingLinkService(prisma);

    const stats = await svc.getTrackingLinkStats('AbCd12');

    expect(stats.clicksByCountry).toEqual({ US: 2, FR: 1 });
    expect(stats.totalClicks).toBe(3);
  });

  it('applies date filter when startDate/endDate provided', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const prisma = makePrisma({
      trackingLink: { findUnique: jest.fn().mockResolvedValue(LINK_FIXTURE) },
      trackingLinkClick: { findMany },
    });
    const svc = new TrackingLinkService(prisma);

    const startDate = new Date('2024-01-01');
    const endDate = new Date('2024-01-31');
    await svc.getTrackingLinkStats('AbCd12', { startDate, endDate });

    const [arg] = findMany.mock.calls[0];
    expect(arg.where.clickedAt.gte).toBe(startDate);
    expect(arg.where.clickedAt.lte).toBe(endDate);
  });

  it('uses stored uniqueClicks from link record', async () => {
    const link = { ...LINK_FIXTURE, uniqueClicks: 42 };
    const prisma = makePrisma({
      trackingLink: { findUnique: jest.fn().mockResolvedValue(link) },
      trackingLinkClick: { findMany: jest.fn().mockResolvedValue([]) },
    });
    const svc = new TrackingLinkService(prisma);

    const stats = await svc.getTrackingLinkStats('AbCd12');

    expect(stats.uniqueClicks).toBe(42);
  });

  it('recomputes uniqueClicks from the filtered set when a date range is provided', async () => {
    // Stored all-time counter is 40, but only 2 clicks (from 1 unique IP) fall
    // inside the requested window. The date-filtered uniqueClicks MUST reflect
    // the window, not the all-time counter — otherwise uniqueClicks (40) would
    // exceed totalClicks (2), an impossible state.
    const link = { ...LINK_FIXTURE, totalClicks: 100, uniqueClicks: 40 };
    const windowedClicks = [
      { country: null, device: null, browser: null, os: null, language: null, clickedAt: new Date('2024-01-10T10:00:00Z'), socialSource: null, referrer: null, ipAddress: '9.9.9.9', deviceFingerprint: null, redirectStatus: null },
      { country: null, device: null, browser: null, os: null, language: null, clickedAt: new Date('2024-01-10T11:00:00Z'), socialSource: null, referrer: null, ipAddress: '9.9.9.9', deviceFingerprint: null, redirectStatus: null },
    ];
    const prisma = makePrisma({
      trackingLink: { findUnique: jest.fn().mockResolvedValue(link) },
      trackingLinkClick: { findMany: jest.fn().mockResolvedValue(windowedClicks) },
    });
    const svc = new TrackingLinkService(prisma);

    const stats = await svc.getTrackingLinkStats('AbCd12', {
      startDate: new Date('2024-01-01'),
      endDate: new Date('2024-01-31'),
    });

    expect(stats.totalClicks).toBe(2);
    expect(stats.uniqueClicks).toBe(1);
    expect(stats.uniqueClicks).toBeLessThanOrEqual(stats.totalClicks);
  });

  it('counts confirmedClicks correctly', async () => {
    const clicks = [
      { country: null, device: null, browser: null, os: null, language: null, clickedAt: new Date(), socialSource: null, referrer: null, ipAddress: null, deviceFingerprint: null, redirectStatus: 'confirmed' },
      { country: null, device: null, browser: null, os: null, language: null, clickedAt: new Date(), socialSource: null, referrer: null, ipAddress: null, deviceFingerprint: null, redirectStatus: 'failed' },
      { country: null, device: null, browser: null, os: null, language: null, clickedAt: new Date(), socialSource: null, referrer: null, ipAddress: null, deviceFingerprint: null, redirectStatus: 'confirmed' },
    ];
    const prisma = makePrisma({
      trackingLink: { findUnique: jest.fn().mockResolvedValue(LINK_FIXTURE) },
      trackingLinkClick: { findMany: jest.fn().mockResolvedValue(clicks) },
    });
    const svc = new TrackingLinkService(prisma);

    const stats = await svc.getTrackingLinkStats('AbCd12');

    expect(stats.confirmedClicks).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// getUserTrackingLinks / getConversationTrackingLinks
// ---------------------------------------------------------------------------
describe('getUserTrackingLinks', () => {
  it('queries by createdBy with desc order', async () => {
    const findMany = jest.fn().mockResolvedValue([LINK_FIXTURE]);
    const prisma = makePrisma({ trackingLink: { findMany } });
    const svc = new TrackingLinkService(prisma);

    const result = await svc.getUserTrackingLinks('user_001');

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { createdBy: 'user_001' },
    }));
    expect(result).toHaveLength(1);
  });
});

describe('getConversationTrackingLinks', () => {
  it('queries by conversationId', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const prisma = makePrisma({ trackingLink: { findMany } });
    const svc = new TrackingLinkService(prisma);

    await svc.getConversationTrackingLinks('conv_001');

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { conversationId: 'conv_001' },
    }));
  });
});

// ---------------------------------------------------------------------------
// deactivateTrackingLink
// ---------------------------------------------------------------------------
describe('deactivateTrackingLink', () => {
  it('sets isActive to false', async () => {
    const update = jest.fn().mockResolvedValue({ ...LINK_FIXTURE, isActive: false });
    const prisma = makePrisma({ trackingLink: { update } });
    const svc = new TrackingLinkService(prisma);

    const result = await svc.deactivateTrackingLink('AbCd12');

    expect(update).toHaveBeenCalledWith({ where: { token: 'AbCd12' }, data: { isActive: false } });
    expect(result.isActive).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// deleteTrackingLink
// ---------------------------------------------------------------------------
describe('deleteTrackingLink', () => {
  it('throws when link not found', async () => {
    const svc = new TrackingLinkService(makePrisma());
    await expect(svc.deleteTrackingLink('nope')).rejects.toThrow('Tracking link not found');
  });

  it('deletes clicks then deletes the link', async () => {
    const deleteMany = jest.fn().mockResolvedValue({ count: 2 });
    const del = jest.fn().mockResolvedValue({});
    const prisma = makePrisma({
      trackingLink: {
        findUnique: jest.fn().mockResolvedValue(LINK_FIXTURE),
        delete: del,
      },
      trackingLinkClick: { deleteMany },
    });
    const svc = new TrackingLinkService(prisma);

    await svc.deleteTrackingLink('AbCd12');

    expect(deleteMany).toHaveBeenCalledWith({ where: { trackingLinkId: LINK_FIXTURE.id } });
    expect(del).toHaveBeenCalledWith({ where: { token: 'AbCd12' } });
  });
});

// ---------------------------------------------------------------------------
// getAllTrackingLinks
// ---------------------------------------------------------------------------
describe('getAllTrackingLinks', () => {
  it('returns trackingLinks and total without search', async () => {
    const findMany = jest.fn().mockResolvedValue([LINK_FIXTURE]);
    const count = jest.fn().mockResolvedValue(1);
    const prisma = makePrisma({ trackingLink: { findMany, count } });
    const svc = new TrackingLinkService(prisma);

    const result = await svc.getAllTrackingLinks({ limit: 10, offset: 0 });

    expect(result.total).toBe(1);
    expect(result.trackingLinks).toHaveLength(1);
  });

  it('adds OR search filter when search is provided', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    const prisma = makePrisma({ trackingLink: { findMany, count } });
    const svc = new TrackingLinkService(prisma);

    await svc.getAllTrackingLinks({ limit: 10, offset: 0, search: 'example' });

    const [arg] = findMany.mock.calls[0];
    expect(arg.where.OR).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// getTrackingLinkClicks
// ---------------------------------------------------------------------------
describe('getTrackingLinkClicks', () => {
  it('returns clicks and total with pagination', async () => {
    const clicks = [{ id: 'click_001', clickedAt: new Date() }];
    const findMany = jest.fn().mockResolvedValue(clicks);
    const count = jest.fn().mockResolvedValue(1);
    const prisma = makePrisma({ trackingLinkClick: { findMany, count } });
    const svc = new TrackingLinkService(prisma);

    const result = await svc.getTrackingLinkClicks('link_001', 10, 0);

    expect(result.total).toBe(1);
    expect(result.clicks).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// processExplicitLinksInContent
// ---------------------------------------------------------------------------
describe('processExplicitLinksInContent', () => {
  it('replaces [[url]] with m+<token>', async () => {
    const prisma = makePrisma({
      trackingLink: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ ...LINK_FIXTURE, token: 'tok001' }),
      },
    });
    const svc = new TrackingLinkService(prisma);

    const { processedContent } = await svc.processExplicitLinksInContent({
      content: 'Check [[https://example.com/page]]',
      conversationId: 'conv_001',
    });

    expect(processedContent).toContain('m+tok001');
    expect(processedContent).not.toContain('[[');
  });

  it('replaces <url> with m+<token>', async () => {
    const prisma = makePrisma({
      trackingLink: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ ...LINK_FIXTURE, token: 'tok002' }),
      },
    });
    const svc = new TrackingLinkService(prisma);

    const { processedContent } = await svc.processExplicitLinksInContent({
      content: 'See <https://example.com/page>',
      conversationId: 'conv_001',
    });

    expect(processedContent).toContain('m+tok002');
  });

  it('reuses existing token for duplicate [[url]] in same content', async () => {
    const create = jest.fn().mockResolvedValue({ ...LINK_FIXTURE, token: 'tok003' });
    const prisma = makePrisma({
      trackingLink: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue(null),
        create,
      },
    });
    const svc = new TrackingLinkService(prisma);

    const { processedContent } = await svc.processExplicitLinksInContent({
      content: 'A: [[https://x.com/p]] B: [[https://x.com/p]]',
      conversationId: 'conv_001',
    });

    expect(processedContent.match(/m\+tok003/g)!.length).toBe(2);
    expect(create).toHaveBeenCalledTimes(1); // only created once
  });

  it('protects markdown links from conversion', async () => {
    const svc = new TrackingLinkService(makePrisma());

    const { processedContent } = await svc.processExplicitLinksInContent({
      content: '[click here](https://example.com)',
      conversationId: 'conv_001',
    });

    expect(processedContent).toContain('[click here](https://example.com)');
  });

  it('falls back to raw URL when createTrackingLink throws for [[url]]', async () => {
    const prisma = makePrisma({
      trackingLink: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockRejectedValue(new Error('DB error')),
      },
    });
    const svc = new TrackingLinkService(prisma);

    const { processedContent } = await svc.processExplicitLinksInContent({
      content: '[[https://example.com/page]]',
      conversationId: 'conv_001',
    });

    expect(processedContent).toContain('https://example.com/page');
  });
});

// ---------------------------------------------------------------------------
// processMessageLinks
// ---------------------------------------------------------------------------
describe('processMessageLinks', () => {
  it('returns original content when no URLs found', async () => {
    const svc = new TrackingLinkService(makePrisma());
    const { processedContent, trackingLinks } = await svc.processMessageLinks({
      content: 'Hello world, no links here!',
      conversationId: 'conv_001',
    });
    expect(processedContent).toBe('Hello world, no links here!');
    expect(trackingLinks).toHaveLength(0);
  });

  it('replaces URL with m+<token> when rewriteToShortLink is true (default)', async () => {
    const prisma = makePrisma({
      trackingLink: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ ...LINK_FIXTURE, token: 'tok001' }),
      },
    });
    const svc = new TrackingLinkService(prisma);

    const { processedContent } = await svc.processMessageLinks({
      content: 'Check https://example.com/page',
      conversationId: 'conv_001',
    });

    expect(processedContent).toContain('m+tok001');
    expect(processedContent).not.toContain('https://example.com/page');
  });

  it('does NOT rewrite when rewriteToShortLink is false', async () => {
    const prisma = makePrisma({
      trackingLink: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(LINK_FIXTURE),
      },
    });
    const svc = new TrackingLinkService(prisma);

    const { processedContent, trackingLinks } = await svc.processMessageLinks({
      content: 'Check https://example.com/page',
      conversationId: 'conv_001',
      rewriteToShortLink: false,
    });

    expect(processedContent).toContain('https://example.com/page');
    expect(trackingLinks).toHaveLength(1);
  });

  it('skips existing /l/<token> tracking URLs', async () => {
    const create = jest.fn().mockResolvedValue(LINK_FIXTURE);
    const svc = new TrackingLinkService(makePrisma({ trackingLink: { create } }));

    await svc.processMessageLinks({
      content: 'See https://meeshy.me/l/AbCd12 for more',
      conversationId: 'conv_001',
    });

    expect(create).not.toHaveBeenCalled();
  });

  it('skips existing m+<token> short links', async () => {
    const create = jest.fn().mockResolvedValue(LINK_FIXTURE);
    const svc = new TrackingLinkService(makePrisma({ trackingLink: { create } }));

    // m+token pattern contains https:// which matches urlRegex — but the short form
    // itself doesn't start with http. The underlying test is that m+... is skipped.
    await svc.processMessageLinks({
      content: 'Click m+AbCd12 to view',
      conversationId: 'conv_001',
    });

    expect(create).not.toHaveBeenCalled();
  });

  it('reuses existing tracking link for same URL in same conversation', async () => {
    const findFirst = jest.fn().mockResolvedValue(LINK_FIXTURE);
    const create = jest.fn();
    const prisma = makePrisma({ trackingLink: { findFirst, create } });
    const svc = new TrackingLinkService(prisma);

    await svc.processMessageLinks({
      content: 'Check https://example.com/page',
      conversationId: 'conv_001',
    });

    expect(create).not.toHaveBeenCalled();
    expect(findFirst).toHaveBeenCalled();
  });

  it('continues processing other links when one throws', async () => {
    const create = jest.fn()
      .mockRejectedValueOnce(new Error('DB error'))
      .mockResolvedValueOnce({ ...LINK_FIXTURE, token: 'tok002' });
    const prisma = makePrisma({
      trackingLink: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue(null),
        create,
      },
    });
    const svc = new TrackingLinkService(prisma);

    // Two URLs — first one throws, second succeeds
    const { processedContent } = await svc.processMessageLinks({
      content: 'A: https://fail.com/page B: https://ok.com/page',
    });

    expect(processedContent).toContain('https://fail.com/page'); // left as-is
    expect(processedContent).toContain('m+tok002'); // second one processed
  });
});

// ---------------------------------------------------------------------------
// collectContentTrackingLinks
// ---------------------------------------------------------------------------
describe('collectContentTrackingLinks', () => {
  it('returns [] for empty content', async () => {
    const svc = new TrackingLinkService(makePrisma());
    expect(await svc.collectContentTrackingLinks({ content: '' })).toEqual([]);
  });

  it('returns [] for null/undefined content', async () => {
    const svc = new TrackingLinkService(makePrisma());
    expect(await svc.collectContentTrackingLinks({ content: null as any })).toEqual([]);
  });

  it('returns deduplicated { url, token } pairs', async () => {
    // Both URLs with token=tok001 and tok002
    const links = [
      { ...LINK_FIXTURE, token: 'tok001', originalUrl: 'https://a.com' },
      { ...LINK_FIXTURE, token: 'tok001', originalUrl: 'https://a.com' }, // duplicate
      { ...LINK_FIXTURE, token: 'tok002', originalUrl: 'https://b.com' },
    ];
    let callIdx = 0;
    const prisma = makePrisma({
      trackingLink: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(() => Promise.resolve(links[callIdx++] ?? links[0])),
      },
    });
    const svc = new TrackingLinkService(prisma);

    const result = await svc.collectContentTrackingLinks({
      content: 'https://a.com and https://a.com and https://b.com',
    });

    // Deduplicated by URL
    const urls = result.map(r => r.url);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it('returns [] when processMessageLinks throws', async () => {
    const prisma = makePrisma({
      trackingLink: {
        findFirst: jest.fn().mockRejectedValue(new Error('crash')),
        findUnique: jest.fn().mockRejectedValue(new Error('crash')),
        create: jest.fn().mockRejectedValue(new Error('crash')),
      },
    });
    const svc = new TrackingLinkService(prisma);

    // processMessageLinks catches individual link errors and continues — so we need
    // to also test the outer try/catch of collectContentTrackingLinks.
    // Force the outer error by making the findMany/etc crash at a higher level.
    jest.spyOn(svc as any, 'processMessageLinks').mockRejectedValue(new Error('outer crash'));

    const result = await svc.collectContentTrackingLinks({ content: 'https://x.com' });
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// updateTrackingLinksMessageId
// ---------------------------------------------------------------------------
describe('updateTrackingLinksMessageId', () => {
  it('is a no-op for empty tokens array', async () => {
    const updateMany = jest.fn();
    const prisma = makePrisma({ trackingLink: { updateMany } });
    const svc = new TrackingLinkService(prisma);

    await svc.updateTrackingLinksMessageId([], 'msg_001');
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('calls updateMany with correct tokens and messageId', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 2 });
    const prisma = makePrisma({ trackingLink: { updateMany } });
    const svc = new TrackingLinkService(prisma);

    await svc.updateTrackingLinksMessageId(['tok001', 'tok002'], 'msg_001');

    expect(updateMany).toHaveBeenCalledWith({
      where: { token: { in: ['tok001', 'tok002'] } },
      data: { messageId: 'msg_001' },
    });
  });
});

// ---------------------------------------------------------------------------
// updateTrackingLink
// ---------------------------------------------------------------------------
describe('updateTrackingLink', () => {
  it('throws when link not found', async () => {
    const svc = new TrackingLinkService(makePrisma());
    await expect(svc.updateTrackingLink({ token: 'nope' })).rejects.toThrow('Tracking link not found');
  });

  it('throws when newToken already exists', async () => {
    const prisma = makePrisma({
      trackingLink: {
        findUnique: jest.fn()
          .mockResolvedValueOnce(LINK_FIXTURE) // getTrackingLinkByToken
          .mockResolvedValueOnce(LINK_FIXTURE), // tokenExists for newToken
      },
    });
    const svc = new TrackingLinkService(prisma);

    await expect(svc.updateTrackingLink({ token: 'AbCd12', newToken: 'TAKEN' })).rejects.toThrow(
      'Token already exists'
    );
  });

  it('updates originalUrl when provided', async () => {
    const update = jest.fn().mockResolvedValue(LINK_FIXTURE);
    const prisma = makePrisma({
      trackingLink: {
        findUnique: jest.fn().mockResolvedValue(LINK_FIXTURE),
        update,
      },
    });
    const svc = new TrackingLinkService(prisma);

    await svc.updateTrackingLink({ token: 'AbCd12', originalUrl: 'https://new.example.com' });

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ originalUrl: 'https://new.example.com' }) })
    );
  });

  it('updates token and shortUrl when newToken is different', async () => {
    const update = jest.fn().mockResolvedValue(LINK_FIXTURE);
    const prisma = makePrisma({
      trackingLink: {
        findUnique: jest.fn()
          .mockResolvedValueOnce(LINK_FIXTURE) // link exists
          .mockResolvedValueOnce(null),         // newToken is free
        update,
      },
    });
    const svc = new TrackingLinkService(prisma);

    await svc.updateTrackingLink({ token: 'AbCd12', newToken: 'NewTok' });

    const updateData = update.mock.calls[0][0].data;
    expect(updateData.token).toBe('NewTok');
    expect(updateData.shortUrl).toBe('/l/NewTok');
  });
});

// ---------------------------------------------------------------------------
// isTokenAvailable
// ---------------------------------------------------------------------------
describe('isTokenAvailable', () => {
  it('returns true when token does not exist', async () => {
    const svc = new TrackingLinkService(makePrisma());
    expect(await svc.isTokenAvailable('free_token')).toBe(true);
  });

  it('returns false when token already exists', async () => {
    const prisma = makePrisma({ trackingLink: { findUnique: jest.fn().mockResolvedValue(LINK_FIXTURE) } });
    const svc = new TrackingLinkService(prisma);
    expect(await svc.isTokenAvailable('AbCd12')).toBe(false);
  });
});
