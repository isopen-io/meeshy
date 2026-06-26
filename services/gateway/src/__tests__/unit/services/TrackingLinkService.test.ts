import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import {
  TrackingLinkService,
  resolveFrontendBaseUrl,
  generateShortToken,
} from '../../../services/TrackingLinkService';

jest.mock('@meeshy/shared/prisma/client', () => ({
  PrismaClient: jest.fn(),
}));

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({
      trace: jest.fn(),
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    })),
  },
}));

const buildMockPrisma = () => ({
  trackingLink: {
    findUnique: jest.fn() as jest.Mock<any>,
    findFirst: jest.fn() as jest.Mock<any>,
    findMany: jest.fn() as jest.Mock<any>,
    create: jest.fn() as jest.Mock<any>,
    update: jest.fn() as jest.Mock<any>,
    updateMany: jest.fn() as jest.Mock<any>,
    delete: jest.fn() as jest.Mock<any>,
    count: jest.fn() as jest.Mock<any>,
  },
  trackingLinkClick: {
    findFirst: jest.fn() as jest.Mock<any>,
    findMany: jest.fn() as jest.Mock<any>,
    create: jest.fn() as jest.Mock<any>,
    update: jest.fn() as jest.Mock<any>,
    deleteMany: jest.fn() as jest.Mock<any>,
    count: jest.fn() as jest.Mock<any>,
  },
  conversationShareLink: {
    findFirst: jest.fn() as jest.Mock<any>,
  },
});

const makeLink = (overrides: Record<string, unknown> = {}) => ({
  id: 'link-id-1',
  token: 'ABC123',
  name: 'Test Link',
  originalUrl: 'https://example.com',
  shortUrl: '/l/ABC123',
  isActive: true,
  totalClicks: 0,
  uniqueClicks: 0,
  expiresAt: null,
  createdBy: 'user-1',
  conversationId: null,
  messageId: null,
  campaign: null,
  source: null,
  medium: null,
  targetType: 'post',
  targetId: null,
  lastClickedAt: null,
  createdAt: new Date('2026-01-01'),
  ...overrides,
});

const makeClick = (overrides: Record<string, unknown> = {}) => ({
  id: 'click-id-1',
  trackingLinkId: 'link-id-1',
  clickedAt: new Date('2026-06-01T10:00:00Z'),
  country: 'FR',
  device: 'mobile',
  browser: 'Safari',
  os: 'iOS',
  language: 'fr',
  socialSource: null,
  referrer: 'https://google.com',
  ipAddress: '1.2.3.4',
  deviceFingerprint: null,
  redirectStatus: 'pending',
  participantId: null,
  ...overrides,
});

// ── Standalone functions ──────────────────────────────────────────────────

describe('resolveFrontendBaseUrl', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.FRONTEND_URL;
    delete process.env.NEXT_PUBLIC_FRONTEND_URL;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('uses FRONTEND_URL when set', () => {
    process.env.FRONTEND_URL = 'https://staging.meeshy.me';
    expect(resolveFrontendBaseUrl()).toBe('https://staging.meeshy.me');
  });

  it('falls back to NEXT_PUBLIC_FRONTEND_URL when FRONTEND_URL not set', () => {
    process.env.NEXT_PUBLIC_FRONTEND_URL = 'https://app.meeshy.me';
    expect(resolveFrontendBaseUrl()).toBe('https://app.meeshy.me');
  });

  it('falls back to https://meeshy.me when neither env var is set', () => {
    expect(resolveFrontendBaseUrl()).toBe('https://meeshy.me');
  });

  it('strips trailing slashes', () => {
    process.env.FRONTEND_URL = 'https://meeshy.me///';
    expect(resolveFrontendBaseUrl()).toBe('https://meeshy.me');
  });

  it('FRONTEND_URL takes priority over NEXT_PUBLIC_FRONTEND_URL', () => {
    process.env.FRONTEND_URL = 'https://primary.meeshy.me';
    process.env.NEXT_PUBLIC_FRONTEND_URL = 'https://secondary.meeshy.me';
    expect(resolveFrontendBaseUrl()).toBe('https://primary.meeshy.me');
  });
});

describe('generateShortToken', () => {
  it('generates a 6-character token by default', () => {
    const token = generateShortToken();
    expect(token).toHaveLength(6);
  });

  it('generates a token of the requested length', () => {
    expect(generateShortToken(12)).toHaveLength(12);
  });

  it('only uses alphanumeric characters', () => {
    for (let i = 0; i < 20; i++) {
      expect(generateShortToken(6)).toMatch(/^[A-Za-z0-9]{6}$/);
    }
  });

  it('generates different tokens on successive calls', () => {
    const tokens = new Set(Array.from({ length: 50 }, () => generateShortToken(6)));
    expect(tokens.size).toBeGreaterThan(1);
  });
});

// ── TrackingLinkService ───────────────────────────────────────────────────

describe('TrackingLinkService', () => {
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let service: TrackingLinkService;

  beforeEach(() => {
    mockPrisma = buildMockPrisma();
    service = new TrackingLinkService(mockPrisma as any);
  });

  // ── buildTrackingUrl / buildShortFormat ────────────────────────────────

  describe('buildTrackingUrl', () => {
    it('builds the full URL using the resolved base', () => {
      const url = service.buildTrackingUrl('TOK123');
      expect(url).toMatch(/\/l\/TOK123$/);
    });
  });

  describe('buildShortFormat', () => {
    it('returns m+<token>', () => {
      expect(service.buildShortFormat('ABC')).toBe('m+ABC');
    });
  });

  // ── createTrackingLink ─────────────────────────────────────────────────

  describe('createTrackingLink', () => {
    it('creates a link with generated token when no customToken given', async () => {
      mockPrisma.trackingLink.findUnique.mockResolvedValue(null); // token unique
      mockPrisma.trackingLink.create.mockResolvedValue(makeLink());

      const result = await service.createTrackingLink({ originalUrl: 'https://example.com' });

      expect(mockPrisma.trackingLink.create).toHaveBeenCalledTimes(1);
      expect(result.isActive).toBe(true);
    });

    it('creates a link with customToken when it is available', async () => {
      mockPrisma.trackingLink.findUnique.mockResolvedValue(null); // token unique
      mockPrisma.trackingLink.create.mockResolvedValue(makeLink({ token: 'CUSTOM1' }));

      const result = await service.createTrackingLink({
        originalUrl: 'https://example.com',
        customToken: 'CUSTOM1',
      });

      const createCall = mockPrisma.trackingLink.create.mock.calls[0][0] as any;
      expect(createCall.data.token).toBe('CUSTOM1');
      expect(result.token).toBe('CUSTOM1');
    });

    it('throws when customToken already exists', async () => {
      mockPrisma.trackingLink.findUnique.mockResolvedValue(makeLink());

      await expect(
        service.createTrackingLink({ originalUrl: 'https://example.com', customToken: 'TAKEN' })
      ).rejects.toThrow('Token already exists');
      expect(mockPrisma.trackingLink.create).not.toHaveBeenCalled();
    });

    it('throws after max token generation attempts', async () => {
      // Always return a link (token always exists) to exhaust attempts
      mockPrisma.trackingLink.findUnique.mockResolvedValue(makeLink());

      await expect(
        service.createTrackingLink({ originalUrl: 'https://example.com' })
      ).rejects.toThrow('Unable to generate unique token after maximum attempts');
    });

    it('stores shortUrl as /l/<token>', async () => {
      mockPrisma.trackingLink.findUnique.mockResolvedValue(null);
      mockPrisma.trackingLink.create.mockResolvedValue(makeLink());

      await service.createTrackingLink({ originalUrl: 'https://example.com' });

      const createCall = mockPrisma.trackingLink.create.mock.calls[0][0] as any;
      expect(createCall.data.shortUrl).toMatch(/^\/l\//);
    });
  });

  // ── getTrackingLinkByToken ─────────────────────────────────────────────

  describe('getTrackingLinkByToken', () => {
    it('returns the link when found', async () => {
      mockPrisma.trackingLink.findUnique.mockResolvedValue(makeLink());
      const result = await service.getTrackingLinkByToken('ABC123');
      expect(result?.token).toBe('ABC123');
    });

    it('returns null when not found', async () => {
      mockPrisma.trackingLink.findUnique.mockResolvedValue(null);
      const result = await service.getTrackingLinkByToken('NOPE');
      expect(result).toBeNull();
    });
  });

  // ── resolveTarget ──────────────────────────────────────────────────────

  describe('resolveTarget', () => {
    it('resolves a tracking link with kind:"tracking"', async () => {
      mockPrisma.trackingLink.findUnique.mockResolvedValue(makeLink());

      const result = await service.resolveTarget('ABC123');

      expect(result?.kind).toBe('tracking');
      expect(result?.targetType).toBe('post');
      expect(result?.isActive).toBe(true);
    });

    it('marks tracking link as inactive when expiresAt is in the past', async () => {
      const expired = makeLink({ expiresAt: new Date(Date.now() - 1000) });
      mockPrisma.trackingLink.findUnique.mockResolvedValue(expired);

      const result = await service.resolveTarget('ABC123');

      expect(result?.isActive).toBe(false);
    });

    it('marks tracking link as inactive when isActive=false', async () => {
      mockPrisma.trackingLink.findUnique.mockResolvedValue(makeLink({ isActive: false }));

      const result = await service.resolveTarget('ABC123');

      expect(result?.isActive).toBe(false);
    });

    it('falls back to conversationShareLink when no tracking link found', async () => {
      mockPrisma.trackingLink.findUnique.mockResolvedValue(null);
      mockPrisma.conversationShareLink.findFirst.mockResolvedValue({
        id: 'share-1',
        linkId: 'INV-TOKEN',
        identifier: 'INV-TOKEN',
        conversationId: 'conv-123',
        createdBy: 'user-1',
        isActive: true,
        expiresAt: null,
      });

      const result = await service.resolveTarget('INV-TOKEN');

      expect(result?.kind).toBe('conversation');
      expect(result?.targetType).toBe('CONVERSATION');
      expect(result?.targetId).toBe('conv-123');
    });

    it('returns null when neither tracking link nor conversation share link found', async () => {
      mockPrisma.trackingLink.findUnique.mockResolvedValue(null);
      mockPrisma.conversationShareLink.findFirst.mockResolvedValue(null);

      const result = await service.resolveTarget('GHOST');

      expect(result).toBeNull();
    });

    it('marks conversation share link as active when valid', async () => {
      mockPrisma.trackingLink.findUnique.mockResolvedValue(null);
      mockPrisma.conversationShareLink.findFirst.mockResolvedValue({
        id: 'share-1',
        linkId: 'CONV-TOK',
        identifier: 'CONV-TOK',
        conversationId: 'conv-456',
        createdBy: 'user-2',
        isActive: true,
        expiresAt: new Date(Date.now() + 60_000), // future
      });

      const result = await service.resolveTarget('CONV-TOK');

      expect(result?.isActive).toBe(true);
    });
  });

  // ── findExistingTrackingLink ───────────────────────────────────────────

  describe('findExistingTrackingLink', () => {
    it('queries by originalUrl and isActive:true', async () => {
      mockPrisma.trackingLink.findFirst.mockResolvedValue(makeLink());

      await service.findExistingTrackingLink('https://example.com');

      const call = mockPrisma.trackingLink.findFirst.mock.calls[0][0] as any;
      expect(call.where.originalUrl).toBe('https://example.com');
      expect(call.where.isActive).toBe(true);
    });

    it('adds conversationId to query when provided', async () => {
      mockPrisma.trackingLink.findFirst.mockResolvedValue(null);

      await service.findExistingTrackingLink('https://example.com', 'conv-123');

      const call = mockPrisma.trackingLink.findFirst.mock.calls[0][0] as any;
      expect(call.where.conversationId).toBe('conv-123');
    });

    it('returns null when no link found', async () => {
      mockPrisma.trackingLink.findFirst.mockResolvedValue(null);
      const result = await service.findExistingTrackingLink('https://new.example.com');
      expect(result).toBeNull();
    });
  });

  // ── recordClick ────────────────────────────────────────────────────────

  describe('recordClick', () => {
    it('throws when tracking link not found', async () => {
      mockPrisma.trackingLink.findUnique.mockResolvedValue(null);

      await expect(service.recordClick({ token: 'GHOST' })).rejects.toThrow('Tracking link not found');
    });

    it('throws when tracking link is inactive', async () => {
      mockPrisma.trackingLink.findUnique.mockResolvedValue(makeLink({ isActive: false }));

      await expect(service.recordClick({ token: 'ABC123' })).rejects.toThrow('Tracking link is inactive');
    });

    it('throws when tracking link has expired', async () => {
      const expiredLink = makeLink({ expiresAt: new Date(Date.now() - 1000) });
      mockPrisma.trackingLink.findUnique.mockResolvedValue(expiredLink);

      await expect(service.recordClick({ token: 'ABC123' })).rejects.toThrow('Tracking link has expired');
    });

    it('records a click and increments totalClicks', async () => {
      mockPrisma.trackingLink.findUnique.mockResolvedValue(makeLink({ totalClicks: 5 }));
      mockPrisma.trackingLinkClick.findFirst.mockResolvedValue(null); // first-ever click
      mockPrisma.trackingLinkClick.create.mockResolvedValue(makeClick());
      mockPrisma.trackingLink.update.mockResolvedValue(makeLink({ totalClicks: 6 }));

      const result = await service.recordClick({ token: 'ABC123', ipAddress: '5.5.5.5' });

      expect(mockPrisma.trackingLinkClick.create).toHaveBeenCalledTimes(1);
      expect(result.trackingLink.totalClicks).toBe(6);
    });

    it('increments uniqueClicks when click is from a new IP', async () => {
      mockPrisma.trackingLink.findUnique.mockResolvedValue(makeLink());
      mockPrisma.trackingLinkClick.findFirst.mockResolvedValue(null); // unique
      mockPrisma.trackingLinkClick.create.mockResolvedValue(makeClick());
      mockPrisma.trackingLink.update.mockResolvedValue(makeLink());

      await service.recordClick({ token: 'ABC123', ipAddress: '1.2.3.4' });

      const updateCall = mockPrisma.trackingLink.update.mock.calls[0][0] as any;
      expect(updateCall.data.uniqueClicks).toEqual({ increment: 1 });
    });

    it('does NOT increment uniqueClicks when same IP has clicked before', async () => {
      mockPrisma.trackingLink.findUnique.mockResolvedValue(makeLink());
      mockPrisma.trackingLinkClick.findFirst.mockResolvedValue(makeClick()); // existing
      mockPrisma.trackingLinkClick.create.mockResolvedValue(makeClick());
      mockPrisma.trackingLink.update.mockResolvedValue(makeLink());

      await service.recordClick({ token: 'ABC123', ipAddress: '1.2.3.4' });

      const updateCall = mockPrisma.trackingLink.update.mock.calls[0][0] as any;
      expect(updateCall.data.uniqueClicks).toBeUndefined();
    });

    it('treats click as non-unique when no IP or fingerprint provided', async () => {
      mockPrisma.trackingLink.findUnique.mockResolvedValue(makeLink());
      mockPrisma.trackingLinkClick.create.mockResolvedValue(makeClick());
      mockPrisma.trackingLink.update.mockResolvedValue(makeLink());

      await service.recordClick({ token: 'ABC123' }); // no IP or fingerprint

      const updateCall = mockPrisma.trackingLink.update.mock.calls[0][0] as any;
      expect(updateCall.data.uniqueClicks).toBeUndefined();
    });

    it('prefers deviceFingerprint over ipAddress for uniqueness check', async () => {
      mockPrisma.trackingLink.findUnique.mockResolvedValue(makeLink());
      mockPrisma.trackingLinkClick.findFirst.mockResolvedValue(null);
      mockPrisma.trackingLinkClick.create.mockResolvedValue(makeClick());
      mockPrisma.trackingLink.update.mockResolvedValue(makeLink());

      await service.recordClick({ token: 'ABC123', ipAddress: '1.2.3.4', deviceFingerprint: 'fp-abc' });

      const uniqueCheckCall = mockPrisma.trackingLinkClick.findFirst.mock.calls[0][0] as any;
      expect(uniqueCheckCall.where.deviceFingerprint).toBe('fp-abc');
    });
  });

  // ── updateRedirectStatus ───────────────────────────────────────────────

  describe('updateRedirectStatus', () => {
    it('calls update with correct args', async () => {
      mockPrisma.trackingLinkClick.update.mockResolvedValue({});

      await service.updateRedirectStatus('click-id-1', 'link-id-1', 'confirmed');

      expect(mockPrisma.trackingLinkClick.update).toHaveBeenCalledWith({
        where: { id: 'click-id-1', trackingLinkId: 'link-id-1' },
        data: { redirectStatus: 'confirmed' },
      });
    });
  });

  // ── getTrackingLinkStats ───────────────────────────────────────────────

  describe('getTrackingLinkStats', () => {
    it('throws when link not found', async () => {
      mockPrisma.trackingLink.findUnique.mockResolvedValue(null);

      await expect(service.getTrackingLinkStats('GHOST')).rejects.toThrow('Tracking link not found');
    });

    it('aggregates clicks by country, device, browser, OS, language', async () => {
      mockPrisma.trackingLink.findUnique.mockResolvedValue(makeLink({ uniqueClicks: 3 }));
      mockPrisma.trackingLinkClick.findMany.mockResolvedValue([
        makeClick({ country: 'FR', device: 'mobile', browser: 'Safari', os: 'iOS', language: 'fr' }),
        makeClick({ id: 'c2', country: 'DE', device: 'desktop', browser: 'Chrome', os: 'Windows', language: 'de' }),
        makeClick({ id: 'c3', country: 'FR', device: 'mobile', browser: 'Safari', os: 'iOS', language: 'fr' }),
      ]);

      const stats = await service.getTrackingLinkStats('ABC123');

      expect(stats.totalClicks).toBe(3);
      expect(stats.clicksByCountry['FR']).toBe(2);
      expect(stats.clicksByCountry['DE']).toBe(1);
      expect(stats.clicksByDevice['mobile']).toBe(2);
      expect(stats.clicksByBrowser['Safari']).toBe(2);
      expect(stats.clicksByOS['iOS']).toBe(2);
      expect(stats.clicksByLanguage['fr']).toBe(2);
    });

    it('counts confirmedClicks correctly', async () => {
      mockPrisma.trackingLink.findUnique.mockResolvedValue(makeLink());
      mockPrisma.trackingLinkClick.findMany.mockResolvedValue([
        makeClick({ redirectStatus: 'confirmed' }),
        makeClick({ id: 'c2', redirectStatus: 'pending' }),
        makeClick({ id: 'c3', redirectStatus: 'confirmed' }),
      ]);

      const stats = await service.getTrackingLinkStats('ABC123');

      expect(stats.confirmedClicks).toBe(2);
    });

    it('uses stored uniqueClicks from the tracking link', async () => {
      mockPrisma.trackingLink.findUnique.mockResolvedValue(makeLink({ uniqueClicks: 42 }));
      mockPrisma.trackingLinkClick.findMany.mockResolvedValue([]);

      const stats = await service.getTrackingLinkStats('ABC123');

      expect(stats.uniqueClicks).toBe(42);
    });

    it('applies date range filter when provided', async () => {
      mockPrisma.trackingLink.findUnique.mockResolvedValue(makeLink());
      mockPrisma.trackingLinkClick.findMany.mockResolvedValue([]);

      const startDate = new Date('2026-01-01');
      const endDate = new Date('2026-12-31');
      await service.getTrackingLinkStats('ABC123', { startDate, endDate });

      const findManyCall = mockPrisma.trackingLinkClick.findMany.mock.calls[0][0] as any;
      expect(findManyCall.where.clickedAt.gte).toBe(startDate);
      expect(findManyCall.where.clickedAt.lte).toBe(endDate);
    });

    it('returns top referrers sorted by count', async () => {
      mockPrisma.trackingLink.findUnique.mockResolvedValue(makeLink());
      mockPrisma.trackingLinkClick.findMany.mockResolvedValue([
        makeClick({ referrer: 'https://google.com' }),
        makeClick({ id: 'c2', referrer: 'https://google.com' }),
        makeClick({ id: 'c3', referrer: 'https://twitter.com' }),
      ]);

      const stats = await service.getTrackingLinkStats('ABC123');

      expect(stats.topReferrers[0].referrer).toBe('https://google.com');
      expect(stats.topReferrers[0].count).toBe(2);
    });

    it('aggregates clicks by hour and date', async () => {
      mockPrisma.trackingLink.findUnique.mockResolvedValue(makeLink());
      const click = makeClick({ clickedAt: new Date('2026-06-15T14:30:00Z') });
      mockPrisma.trackingLinkClick.findMany.mockResolvedValue([click]);

      const stats = await service.getTrackingLinkStats('ABC123');

      const hour = new Date('2026-06-15T14:30:00Z').getHours().toString().padStart(2, '0');
      expect(stats.clicksByHour[hour]).toBe(1);
      expect(stats.clicksByDate['2026-06-15']).toBe(1);
    });
  });

  // ── getUserTrackingLinks ───────────────────────────────────────────────

  describe('getUserTrackingLinks', () => {
    it('returns links for the user sorted by createdAt desc', async () => {
      const links = [makeLink(), makeLink({ id: 'link-2', token: 'XYZ456' })];
      mockPrisma.trackingLink.findMany.mockResolvedValue(links);

      const result = await service.getUserTrackingLinks('user-1');

      expect(result).toHaveLength(2);
      const call = mockPrisma.trackingLink.findMany.mock.calls[0][0] as any;
      expect(call.where.createdBy).toBe('user-1');
      expect(call.orderBy.createdAt).toBe('desc');
    });
  });

  // ── getConversationTrackingLinks ───────────────────────────────────────

  describe('getConversationTrackingLinks', () => {
    it('queries by conversationId', async () => {
      mockPrisma.trackingLink.findMany.mockResolvedValue([makeLink()]);

      await service.getConversationTrackingLinks('conv-123');

      const call = mockPrisma.trackingLink.findMany.mock.calls[0][0] as any;
      expect(call.where.conversationId).toBe('conv-123');
    });
  });

  // ── deactivateTrackingLink ─────────────────────────────────────────────

  describe('deactivateTrackingLink', () => {
    it('sets isActive to false', async () => {
      mockPrisma.trackingLink.update.mockResolvedValue(makeLink({ isActive: false }));

      const result = await service.deactivateTrackingLink('ABC123');

      expect(result.isActive).toBe(false);
      expect(mockPrisma.trackingLink.update).toHaveBeenCalledWith({
        where: { token: 'ABC123' },
        data: { isActive: false },
      });
    });
  });

  // ── deleteTrackingLink ─────────────────────────────────────────────────

  describe('deleteTrackingLink', () => {
    it('throws when link not found', async () => {
      mockPrisma.trackingLink.findUnique.mockResolvedValue(null);

      await expect(service.deleteTrackingLink('GHOST')).rejects.toThrow('Tracking link not found');
      expect(mockPrisma.trackingLinkClick.deleteMany).not.toHaveBeenCalled();
    });

    it('deletes clicks then the link', async () => {
      mockPrisma.trackingLink.findUnique.mockResolvedValue(makeLink());
      mockPrisma.trackingLinkClick.deleteMany.mockResolvedValue({ count: 3 });
      mockPrisma.trackingLink.delete.mockResolvedValue(makeLink());

      await service.deleteTrackingLink('ABC123');

      expect(mockPrisma.trackingLinkClick.deleteMany).toHaveBeenCalledWith({
        where: { trackingLinkId: 'link-id-1' },
      });
      expect(mockPrisma.trackingLink.delete).toHaveBeenCalledWith({
        where: { token: 'ABC123' },
      });
    });
  });

  // ── getAllTrackingLinks ─────────────────────────────────────────────────

  describe('getAllTrackingLinks', () => {
    it('returns paginated results without search', async () => {
      mockPrisma.trackingLink.findMany.mockResolvedValue([makeLink()]);
      mockPrisma.trackingLink.count.mockResolvedValue(1);

      const result = await service.getAllTrackingLinks({ limit: 10, offset: 0 });

      expect(result.trackingLinks).toHaveLength(1);
      expect(result.total).toBe(1);
      const call = mockPrisma.trackingLink.findMany.mock.calls[0][0] as any;
      expect(call.where.OR).toBeUndefined();
    });

    it('adds OR search filter when search term provided', async () => {
      mockPrisma.trackingLink.findMany.mockResolvedValue([]);
      mockPrisma.trackingLink.count.mockResolvedValue(0);

      await service.getAllTrackingLinks({ limit: 10, offset: 0, search: 'example' });

      const call = mockPrisma.trackingLink.findMany.mock.calls[0][0] as any;
      expect(call.where.OR).toBeDefined();
      expect(call.where.OR).toHaveLength(3);
    });

    it('applies pagination with skip and take', async () => {
      mockPrisma.trackingLink.findMany.mockResolvedValue([]);
      mockPrisma.trackingLink.count.mockResolvedValue(20);

      await service.getAllTrackingLinks({ limit: 5, offset: 10 });

      const call = mockPrisma.trackingLink.findMany.mock.calls[0][0] as any;
      expect(call.skip).toBe(10);
      expect(call.take).toBe(5);
    });
  });

  // ── getTrackingLinkClicks ──────────────────────────────────────────────

  describe('getTrackingLinkClicks', () => {
    it('returns clicks with total count for pagination', async () => {
      mockPrisma.trackingLinkClick.findMany.mockResolvedValue([makeClick()]);
      mockPrisma.trackingLinkClick.count.mockResolvedValue(42);

      const result = await service.getTrackingLinkClicks('link-id-1', 10, 0);

      expect(result.clicks).toHaveLength(1);
      expect(result.total).toBe(42);
    });
  });

  // ── processExplicitLinksInContent ─────────────────────────────────────

  describe('processExplicitLinksInContent', () => {
    it('converts [[url]] to m+<token>', async () => {
      mockPrisma.trackingLink.findFirst.mockResolvedValue(null); // no existing
      mockPrisma.trackingLink.findUnique.mockResolvedValue(null); // token unique
      mockPrisma.trackingLink.create.mockResolvedValue(makeLink({ token: 'TOK001' }));

      const result = await service.processExplicitLinksInContent({
        content: 'Check [[https://example.com]] now',
        conversationId: 'conv-1',
      });

      expect(result.processedContent).toContain('m+TOK001');
      expect(result.processedContent).not.toContain('[[');
    });

    it('converts <url> to m+<token>', async () => {
      mockPrisma.trackingLink.findFirst.mockResolvedValue(null);
      mockPrisma.trackingLink.findUnique.mockResolvedValue(null);
      mockPrisma.trackingLink.create.mockResolvedValue(makeLink({ token: 'TOK002' }));

      const result = await service.processExplicitLinksInContent({
        content: 'Visit <https://example.com> today',
        conversationId: 'conv-1',
      });

      expect(result.processedContent).toContain('m+TOK002');
      expect(result.processedContent).not.toContain('<https://');
    });

    it('protects markdown [text](url) links from conversion', async () => {
      mockPrisma.trackingLink.findFirst.mockResolvedValue(null);
      mockPrisma.trackingLink.findUnique.mockResolvedValue(null);
      mockPrisma.trackingLink.create.mockResolvedValue(makeLink({ token: 'TOK003' }));

      const result = await service.processExplicitLinksInContent({
        content: '[Click here](https://example.com) and [[https://other.com]]',
        conversationId: 'conv-1',
      });

      // Markdown link preserved, double bracket converted
      expect(result.processedContent).toContain('[Click here](https://example.com)');
      expect(result.processedContent).toContain('m+TOK003');
    });

    it('reuses token for duplicate URLs within the same content', async () => {
      mockPrisma.trackingLink.findFirst.mockResolvedValue(null);
      mockPrisma.trackingLink.findUnique.mockResolvedValue(null);
      mockPrisma.trackingLink.create.mockResolvedValue(makeLink({ token: 'TOK004' }));

      const result = await service.processExplicitLinksInContent({
        content: '[[https://example.com]] and [[https://example.com]]',
        conversationId: 'conv-1',
      });

      // Only one DB create call even though same URL appears twice
      expect(mockPrisma.trackingLink.create).toHaveBeenCalledTimes(1);
      expect(result.processedContent.match(/m\+TOK004/g)?.length).toBe(2);
    });

    it('falls back to raw URL when [[url]] processing errors', async () => {
      mockPrisma.trackingLink.findFirst.mockRejectedValue(new Error('DB error'));

      const result = await service.processExplicitLinksInContent({
        content: '[[https://example.com]]',
        conversationId: 'conv-1',
      });

      // Error → raw URL without brackets
      expect(result.processedContent).toContain('https://example.com');
      expect(result.processedContent).not.toContain('[[');
    });

    it('returns empty trackingLinks array when no explicit links in content', async () => {
      const result = await service.processExplicitLinksInContent({
        content: 'No special syntax here, just plain text.',
        conversationId: 'conv-1',
      });

      expect(result.processedContent).toBe('No special syntax here, just plain text.');
      expect(result.trackingLinks).toHaveLength(0);
    });
  });

  // ── updateTrackingLinksMessageId ───────────────────────────────────────

  describe('updateTrackingLinksMessageId', () => {
    it('calls updateMany with token filter', async () => {
      mockPrisma.trackingLink.updateMany.mockResolvedValue({ count: 2 });

      await service.updateTrackingLinksMessageId(['TOK1', 'TOK2'], 'msg-id-1');

      expect(mockPrisma.trackingLink.updateMany).toHaveBeenCalledWith({
        where: { token: { in: ['TOK1', 'TOK2'] } },
        data: { messageId: 'msg-id-1' },
      });
    });

    it('returns early without DB call when tokens array is empty', async () => {
      await service.updateTrackingLinksMessageId([], 'msg-id-1');
      expect(mockPrisma.trackingLink.updateMany).not.toHaveBeenCalled();
    });
  });

  // ── updateTrackingLink ─────────────────────────────────────────────────

  describe('updateTrackingLink', () => {
    it('throws when link not found', async () => {
      mockPrisma.trackingLink.findUnique.mockResolvedValue(null);

      await expect(service.updateTrackingLink({ token: 'GHOST' })).rejects.toThrow('Tracking link not found');
    });

    it('throws when newToken already exists', async () => {
      // First call: find the current link; second call: check newToken availability
      mockPrisma.trackingLink.findUnique
        .mockResolvedValueOnce(makeLink())           // getTrackingLinkByToken
        .mockResolvedValueOnce(makeLink({ token: 'TAKEN' })); // tokenExists for newToken

      await expect(
        service.updateTrackingLink({ token: 'ABC123', newToken: 'TAKEN' })
      ).rejects.toThrow('Token already exists');
    });

    it('updates originalUrl and expiresAt when provided', async () => {
      mockPrisma.trackingLink.findUnique.mockResolvedValue(makeLink());
      mockPrisma.trackingLink.update.mockResolvedValue(makeLink());

      const newExpiry = new Date('2027-01-01');
      await service.updateTrackingLink({
        token: 'ABC123',
        originalUrl: 'https://new.example.com',
        expiresAt: newExpiry,
        isActive: false,
      });

      const updateCall = mockPrisma.trackingLink.update.mock.calls[0][0] as any;
      expect(updateCall.data.originalUrl).toBe('https://new.example.com');
      expect(updateCall.data.expiresAt).toBe(newExpiry);
      expect(updateCall.data.isActive).toBe(false);
    });

    it('updates token and shortUrl when newToken provided and available', async () => {
      mockPrisma.trackingLink.findUnique
        .mockResolvedValueOnce(makeLink())  // getTrackingLinkByToken
        .mockResolvedValueOnce(null);       // tokenExists(newToken) → available
      mockPrisma.trackingLink.update.mockResolvedValue(makeLink({ token: 'NEWTOKEN' }));

      await service.updateTrackingLink({ token: 'ABC123', newToken: 'NEWTOKEN' });

      const updateCall = mockPrisma.trackingLink.update.mock.calls[0][0] as any;
      expect(updateCall.data.token).toBe('NEWTOKEN');
      expect(updateCall.data.shortUrl).toBe('/l/NEWTOKEN');
    });

    it('does not update token when newToken matches current token', async () => {
      mockPrisma.trackingLink.findUnique.mockResolvedValue(makeLink());
      mockPrisma.trackingLink.update.mockResolvedValue(makeLink());

      await service.updateTrackingLink({ token: 'ABC123', newToken: 'ABC123' });

      const updateCall = mockPrisma.trackingLink.update.mock.calls[0][0] as any;
      expect(updateCall.data.token).toBeUndefined();
    });
  });

  // ── isTokenAvailable ───────────────────────────────────────────────────

  describe('isTokenAvailable', () => {
    it('returns true when token does not exist', async () => {
      mockPrisma.trackingLink.findUnique.mockResolvedValue(null);
      expect(await service.isTokenAvailable('FREE-TOKEN')).toBe(true);
    });

    it('returns false when token already exists', async () => {
      mockPrisma.trackingLink.findUnique.mockResolvedValue(makeLink());
      expect(await service.isTokenAvailable('TAKEN-TOKEN')).toBe(false);
    });
  });
});
