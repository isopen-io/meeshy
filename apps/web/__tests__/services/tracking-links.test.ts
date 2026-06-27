/**
 * Tests for services/tracking-links.ts
 *
 * Covers all 7 exported functions:
 * getUserTrackingLinks, getTrackingLinkStats, createTrackingLink,
 * recordTrackingLinkClick, deactivateTrackingLink, deleteTrackingLink,
 * copyTrackingLinkToClipboard
 */

import {
  getUserTrackingLinks,
  getTrackingLinkStats,
  createTrackingLink,
  recordTrackingLinkClick,
  deactivateTrackingLink,
  deleteTrackingLink,
  copyTrackingLinkToClipboard,
} from '@/services/tracking-links';
import type { TrackingLink, CreateTrackingLinkRequest, RecordClickRequest } from '@meeshy/shared/types/tracking-link';

jest.mock('@/lib/config', () => ({
  buildApiUrl: jest.fn((endpoint: string) => `http://localhost:3000/api/v1${endpoint}`),
}));

jest.mock('@/utils/logger', () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
  },
}));

jest.mock('@/services/auth-manager.service', () => ({
  authManager: {
    getAuthToken: jest.fn(),
  },
}));

const mockFetch = jest.fn();
global.fetch = mockFetch;

import { buildApiUrl } from '@/lib/config';
import { authManager } from '@/services/auth-manager.service';
import { logger } from '@/utils/logger';

const mockBuildApiUrl = buildApiUrl as jest.MockedFunction<typeof buildApiUrl>;
const mockGetAuthToken = authManager.getAuthToken as jest.MockedFunction<typeof authManager.getAuthToken>;

const makeOkResponse = (data: unknown, success = true) =>
  Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ success, data }),
  });

const makeFailResponse = (status: number) =>
  Promise.resolve({
    ok: false,
    status,
    json: () => Promise.resolve({ success: false, error: 'Server error' }),
  });

const makeTrackingLink = (overrides: Partial<TrackingLink> = {}): TrackingLink => ({
  id: 'link-id-123',
  token: 'abc123',
  name: 'Test Link',
  originalUrl: 'https://example.com/page',
  shortUrl: 'https://meeshy.io/t/abc123',
  totalClicks: 42,
  uniqueClicks: 30,
  isActive: true,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-15'),
  ...overrides,
});

describe('tracking-links service', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockBuildApiUrl.mockImplementation((endpoint: string) => `http://localhost:3000/api/v1${endpoint}`);
    mockGetAuthToken.mockReturnValue('test-jwt-token');
  });

  describe('getUserTrackingLinks', () => {
    it('returns tracking links on success', async () => {
      const links = [makeTrackingLink(), makeTrackingLink({ id: 'link-2', token: 'xyz789' })];
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true, data: { trackingLinks: links } }),
      });

      const result = await getUserTrackingLinks();

      expect(result).toEqual(links);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/v1/api/tracking-links/user/me',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({ Authorization: 'Bearer test-jwt-token' }),
        })
      );
    });

    it('throws when not authenticated', async () => {
      mockGetAuthToken.mockReturnValue(null);

      await expect(getUserTrackingLinks()).rejects.toThrow('Non authentifié');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('throws on HTTP error response', async () => {
      mockFetch.mockResolvedValueOnce(makeFailResponse(500));

      await expect(getUserTrackingLinks()).rejects.toThrow('Erreur HTTP: 500');
    });

    it('throws when success is false in response body', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: false, error: 'Access denied' }),
      });

      await expect(getUserTrackingLinks()).rejects.toThrow('Access denied');
    });

    it('throws with default message when no error provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: false }),
      });

      await expect(getUserTrackingLinks()).rejects.toThrow('Erreur lors de la récupération des liens');
    });
  });

  describe('getTrackingLinkStats', () => {
    const makeStatsData = () => ({
      trackingLink: makeTrackingLink(),
      clicks: [],
      totalClicks: 42,
      uniqueClicks: 30,
      confirmedClicks: 25,
      clicksByCountry: [],
      clicksByDevice: [],
      clicksByDate: [],
    });

    it('returns stats data on success', async () => {
      const statsData = makeStatsData();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true, data: statsData }),
      });

      const result = await getTrackingLinkStats('abc123');

      expect(result).toEqual(statsData);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/v1/api/tracking-links/abc123/stats',
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('appends startDate query param when provided', async () => {
      const statsData = makeStatsData();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true, data: statsData }),
      });
      const startDate = new Date('2026-01-01T00:00:00.000Z');

      await getTrackingLinkStats('abc123', { startDate });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('startDate=2026-01-01T00%3A00%3A00.000Z'),
        expect.anything()
      );
    });

    it('appends endDate query param when provided', async () => {
      const statsData = makeStatsData();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true, data: statsData }),
      });
      const endDate = new Date('2026-01-31T00:00:00.000Z');

      await getTrackingLinkStats('abc123', { endDate });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('endDate=2026-01-31T00%3A00%3A00.000Z'),
        expect.anything()
      );
    });

    it('includes both date params when both provided', async () => {
      const statsData = makeStatsData();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true, data: statsData }),
      });
      const startDate = new Date('2026-01-01T00:00:00.000Z');
      const endDate = new Date('2026-01-31T00:00:00.000Z');

      await getTrackingLinkStats('abc123', { startDate, endDate });

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain('startDate=');
      expect(calledUrl).toContain('endDate=');
    });

    it('throws when not authenticated', async () => {
      mockGetAuthToken.mockReturnValue(null);

      await expect(getTrackingLinkStats('abc123')).rejects.toThrow('Non authentifié');
    });

    it('throws on HTTP error', async () => {
      mockFetch.mockResolvedValueOnce(makeFailResponse(404));

      await expect(getTrackingLinkStats('abc123')).rejects.toThrow('Erreur HTTP: 404');
    });

    it('throws when success false in response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: false, error: 'Not found' }),
      });

      await expect(getTrackingLinkStats('abc123')).rejects.toThrow('Not found');
    });
  });

  describe('createTrackingLink', () => {
    const makeRequest = (overrides: Partial<CreateTrackingLinkRequest> = {}): CreateTrackingLinkRequest => ({
      originalUrl: 'https://example.com',
      name: 'My link',
      ...overrides,
    });

    it('creates a tracking link and returns it', async () => {
      const newLink = makeTrackingLink();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true, data: { trackingLink: newLink } }),
      });

      const result = await createTrackingLink(makeRequest());

      expect(result).toEqual(newLink);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/v1/api/tracking-links',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ Authorization: 'Bearer test-jwt-token' }),
          body: expect.any(String),
        })
      );
    });

    it('omits Authorization header when not authenticated', async () => {
      mockGetAuthToken.mockReturnValue(null);
      const newLink = makeTrackingLink();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true, data: { trackingLink: newLink } }),
      });

      const result = await createTrackingLink(makeRequest());

      expect(result).toEqual(newLink);
      const calledHeaders = mockFetch.mock.calls[0][1].headers as Record<string, string>;
      expect(calledHeaders).not.toHaveProperty('Authorization');
    });

    it('sends the request body as JSON', async () => {
      const newLink = makeTrackingLink();
      const req = makeRequest({ name: 'My campaign', campaign: 'summer' });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true, data: { trackingLink: newLink } }),
      });

      await createTrackingLink(req);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
      expect(body.name).toBe('My campaign');
      expect(body.campaign).toBe('summer');
    });

    it('throws on HTTP error', async () => {
      mockFetch.mockResolvedValueOnce(makeFailResponse(400));

      await expect(createTrackingLink(makeRequest())).rejects.toThrow('Erreur HTTP: 400');
    });

    it('throws when success false in response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: false, error: 'Invalid URL' }),
      });

      await expect(createTrackingLink(makeRequest())).rejects.toThrow('Invalid URL');
    });
  });

  describe('recordTrackingLinkClick', () => {
    const makeClickRequest = (overrides: Partial<RecordClickRequest> = {}): RecordClickRequest => ({
      token: 'abc123',
      ...overrides,
    });

    it('records a click and returns the original URL', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            success: true,
            data: { originalUrl: 'https://example.com', trackingLink: makeTrackingLink() },
          }),
      });

      const result = await recordTrackingLinkClick(makeClickRequest());

      expect(result).toBe('https://example.com');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/v1/api/tracking-links/abc123/click',
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('omits Authorization header when unauthenticated', async () => {
      mockGetAuthToken.mockReturnValue(null);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            success: true,
            data: { originalUrl: 'https://example.com', trackingLink: makeTrackingLink() },
          }),
      });

      await recordTrackingLinkClick(makeClickRequest());

      const calledHeaders = mockFetch.mock.calls[0][1].headers as Record<string, string>;
      expect(calledHeaders).not.toHaveProperty('Authorization');
    });

    it('throws on HTTP error', async () => {
      mockFetch.mockResolvedValueOnce(makeFailResponse(404));

      await expect(recordTrackingLinkClick(makeClickRequest())).rejects.toThrow('Erreur HTTP: 404');
    });

    it('throws when success false in response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: false, error: 'Link inactive' }),
      });

      await expect(recordTrackingLinkClick(makeClickRequest())).rejects.toThrow('Link inactive');
    });

    it('throws with default message when no error field', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: false }),
      });

      await expect(recordTrackingLinkClick(makeClickRequest())).rejects.toThrow(
        "Erreur lors de l'enregistrement du clic"
      );
    });
  });

  describe('deactivateTrackingLink', () => {
    it('deactivates a link and returns updated link', async () => {
      const deactivated = makeTrackingLink({ isActive: false });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true, data: { trackingLink: deactivated } }),
      });

      const result = await deactivateTrackingLink('abc123');

      expect(result).toEqual(deactivated);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/v1/api/tracking-links/abc123/deactivate',
        expect.objectContaining({
          method: 'PATCH',
          headers: expect.objectContaining({ Authorization: 'Bearer test-jwt-token' }),
        })
      );
    });

    it('throws when not authenticated', async () => {
      mockGetAuthToken.mockReturnValue(null);

      await expect(deactivateTrackingLink('abc123')).rejects.toThrow('Non authentifié');
    });

    it('throws on HTTP error', async () => {
      mockFetch.mockResolvedValueOnce(makeFailResponse(403));

      await expect(deactivateTrackingLink('abc123')).rejects.toThrow('Erreur HTTP: 403');
    });

    it('throws when success false in response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: false, error: 'Permission denied' }),
      });

      await expect(deactivateTrackingLink('abc123')).rejects.toThrow('Permission denied');
    });

    it('throws with default message when no error field', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: false }),
      });

      await expect(deactivateTrackingLink('abc123')).rejects.toThrow(
        'Erreur lors de la désactivation du lien'
      );
    });
  });

  describe('deleteTrackingLink', () => {
    it('deletes a link successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true }),
      });

      await expect(deleteTrackingLink('abc123')).resolves.toBeUndefined();
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/v1/api/tracking-links/abc123',
        expect.objectContaining({
          method: 'DELETE',
          headers: expect.objectContaining({ Authorization: 'Bearer test-jwt-token' }),
        })
      );
    });

    it('throws when not authenticated', async () => {
      mockGetAuthToken.mockReturnValue(null);

      await expect(deleteTrackingLink('abc123')).rejects.toThrow('Non authentifié');
    });

    it('throws on HTTP error', async () => {
      mockFetch.mockResolvedValueOnce(makeFailResponse(404));

      await expect(deleteTrackingLink('abc123')).rejects.toThrow('Erreur HTTP: 404');
    });

    it('throws when success false in response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: false, error: 'Link not found' }),
      });

      await expect(deleteTrackingLink('abc123')).rejects.toThrow('Link not found');
    });

    it('throws with default message when no error field', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: false }),
      });

      await expect(deleteTrackingLink('abc123')).rejects.toThrow(
        'Erreur lors de la suppression du lien'
      );
    });
  });

  describe('copyTrackingLinkToClipboard', () => {
    it('copies text to clipboard and returns true on success', async () => {
      const mockWriteText = jest.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: mockWriteText },
        configurable: true,
      });

      const result = await copyTrackingLinkToClipboard('https://meeshy.io/t/abc123');

      expect(result).toBe(true);
      expect(mockWriteText).toHaveBeenCalledWith('https://meeshy.io/t/abc123');
    });

    it('returns false and logs error when clipboard write fails', async () => {
      const mockWriteText = jest.fn().mockRejectedValue(new Error('Clipboard not allowed'));
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: mockWriteText },
        configurable: true,
      });

      const result = await copyTrackingLinkToClipboard('https://meeshy.io/t/abc123');

      expect(result).toBe(false);
      expect(logger.error).toHaveBeenCalledWith(
        '[TrackingLinks]',
        'Erreur lors de la copie dans le presse-papiers',
        expect.objectContaining({ error: expect.any(Error) })
      );
    });
  });
});
