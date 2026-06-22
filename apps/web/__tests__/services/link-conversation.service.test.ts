/**
 * Tests for LinkConversationService
 *
 * Tests getConversationData (valid/invalid identifier, auth headers, fallback logic),
 * getLinkInfo, validateLink, joinConversation, getConversationStats,
 * getConversationParticipants.
 */

import { LinkConversationService } from '@/services/link-conversation.service';
import { buildApiUrl } from '@/lib/config';
import {
  analyzeLinkIdentifier,
  generateFallbackIdentifiers,
  isValidForApiRequest,
} from '@/utils/link-identifier';

jest.mock('@/lib/config', () => ({
  buildApiUrl: jest.fn((endpoint: string) => `http://localhost:3000/api/v1${endpoint}`),
  API_ENDPOINTS: {},
}));

jest.mock('@/utils/link-identifier', () => ({
  analyzeLinkIdentifier: jest.fn(),
  generateFallbackIdentifiers: jest.fn(() => []),
  isValidForApiRequest: jest.fn(() => true),
}));

const mockBuildApiUrl = buildApiUrl as jest.MockedFunction<typeof buildApiUrl>;
const mockAnalyze = analyzeLinkIdentifier as jest.MockedFunction<typeof analyzeLinkIdentifier>;
const mockFallbacks = generateFallbackIdentifiers as jest.MockedFunction<typeof generateFallbackIdentifiers>;
const mockIsValid = isValidForApiRequest as jest.MockedFunction<typeof isValidForApiRequest>;

// ─── fetch mock ─────────────────────────────────────────────────────────────

const mockFetch = jest.fn();
global.fetch = mockFetch;

const makeOkResponse = (data: unknown, success = true) => ({
  ok: true,
  status: 200,
  json: () => Promise.resolve({ success, data, message: undefined }),
});

const makeErrorResponse = (status: number, statusText = 'Error') => ({
  ok: false,
  status,
  statusText,
  json: () => Promise.resolve({ message: `HTTP ${status}` }),
});

// ─── Factories ─────────────────────────────────────────────────────────────

const makeValidLinkInfo = (overrides = {}) => ({
  type: 'linkId' as const,
  value: '68ee540df062ef6a37bd3cca.2510141545_ordljlc5',
  isValid: true,
  ...overrides,
});

const makeLinkConversationData = () => ({
  conversation: { id: 'conv-1', title: 'Test', description: '', type: 'group', createdAt: '', updatedAt: '' },
  link: { id: 'link-1', linkId: 'lnk-abc', name: 'My Link', description: '', allowViewHistory: true, allowAnonymousMessages: true, allowAnonymousFiles: false, allowAnonymousImages: true, requireAccount: false, requireEmail: false, requireNickname: true, requireBirthday: false, expiresAt: null, isActive: true },
  userType: 'member' as const,
  messages: [],
  stats: { totalMessages: 5, totalMembers: 3, hasMore: false },
  members: [],
  anonymousParticipants: [],
  currentUser: null,
});

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('LinkConversationService', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockBuildApiUrl.mockImplementation((endpoint: string) => `http://localhost:3000/api/v1${endpoint}`);
    mockAnalyze.mockReturnValue(makeValidLinkInfo());
    mockIsValid.mockReturnValue(true);
    mockFallbacks.mockReturnValue([]);
  });

  // ── getConversationData ───────────────────────────────────────────────────

  describe('getConversationData', () => {
    const IDENTIFIER = '68ee540df062ef6a37bd3cca.2510141545_ordljlc5';

    it('throws for invalid identifier', async () => {
      mockIsValid.mockReturnValue(false);
      mockAnalyze.mockReturnValue({ type: 'unknown', value: 'bad', isValid: false });

      await expect(LinkConversationService.getConversationData('bad-id')).rejects.toThrow(
        'Identifiant invalide: bad-id',
      );
    });

    it('calls fetch with X-Session-Token header when sessionToken provided', async () => {
      mockFetch.mockResolvedValue(makeOkResponse(makeLinkConversationData()) as any);

      await LinkConversationService.getConversationData(IDENTIFIER, { sessionToken: 'sess-xyz' });

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers['X-Session-Token']).toBe('sess-xyz');
    });

    it('calls fetch with Authorization header when authToken provided (no sessionToken)', async () => {
      mockFetch.mockResolvedValue(makeOkResponse(makeLinkConversationData()) as any);

      await LinkConversationService.getConversationData(IDENTIFIER, { authToken: 'jwt-token' });

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers['Authorization']).toBe('Bearer jwt-token');
    });

    it('calls fetch with empty headers when no auth provided', async () => {
      mockFetch.mockResolvedValue(makeOkResponse(makeLinkConversationData()) as any);

      await LinkConversationService.getConversationData(IDENTIFIER);

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers).toEqual({});
    });

    it('includes limit and offset as query params', async () => {
      mockFetch.mockResolvedValue(makeOkResponse(makeLinkConversationData()) as any);

      await LinkConversationService.getConversationData(IDENTIFIER, { limit: 25, offset: 10 });

      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain('limit=25');
      expect(url).toContain('offset=10');
    });

    it('returns data on success', async () => {
      const data = makeLinkConversationData();
      mockFetch.mockResolvedValue(makeOkResponse(data) as any);

      const result = await LinkConversationService.getConversationData(IDENTIFIER);

      expect(result).toEqual(data);
    });

    it('throws when HTTP status is not ok', async () => {
      mockFetch.mockResolvedValue(makeErrorResponse(404, 'Not Found') as any);
      mockFallbacks.mockReturnValue([]);

      await expect(LinkConversationService.getConversationData(IDENTIFIER)).rejects.toThrow(
        'HTTP 404: Not Found',
      );
    });

    it('throws when data.success is false', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: false, message: 'Link expired' }),
      } as any);
      mockFallbacks.mockReturnValue([]);

      await expect(LinkConversationService.getConversationData(IDENTIFIER)).rejects.toThrow();
    });

    it('tries fallback identifier when primary request fails', async () => {
      const fallbackId = '68ee540df062ef6a37bd3cca';
      mockFallbacks.mockReturnValue([fallbackId]);

      const data = makeLinkConversationData();

      // Primary fails, fallback succeeds
      mockFetch
        .mockResolvedValueOnce(makeErrorResponse(404) as any)
        .mockResolvedValueOnce(makeOkResponse(data) as any);

      const result = await LinkConversationService.getConversationData(IDENTIFIER);

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result).toEqual(data);
    });

    it('skips fallback if fallback response is not ok', async () => {
      mockFallbacks.mockReturnValue(['fallback-id']);
      mockFetch
        .mockResolvedValueOnce(makeErrorResponse(404) as any)
        .mockResolvedValueOnce(makeErrorResponse(500) as any);

      await expect(LinkConversationService.getConversationData(IDENTIFIER)).rejects.toThrow();
    });

    it('skips fallback if fallback data.success is false', async () => {
      mockFallbacks.mockReturnValue(['fallback-id']);
      mockFetch
        .mockResolvedValueOnce(makeErrorResponse(404) as any)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ success: false }),
        } as any);

      await expect(LinkConversationService.getConversationData(IDENTIFIER)).rejects.toThrow();
    });

    it('re-throws original error when no fallbacks configured', async () => {
      mockFallbacks.mockReturnValue([]);
      mockFetch.mockResolvedValue(makeErrorResponse(503) as any);

      await expect(LinkConversationService.getConversationData(IDENTIFIER)).rejects.toThrow(
        'HTTP 503',
      );
    });

    it('rethrows original error when fallback fetch itself throws', async () => {
      mockFallbacks.mockReturnValue(['fallback-id']);
      mockFetch
        .mockResolvedValueOnce(makeErrorResponse(404) as any)
        .mockRejectedValueOnce(new Error('Network failure on fallback'));

      await expect(LinkConversationService.getConversationData(IDENTIFIER)).rejects.toThrow(
        'HTTP 404',
      );
    });
  });

  // ── getLinkInfo ───────────────────────────────────────────────────────────

  describe('getLinkInfo', () => {
    const linkData = {
      id: 'share-1',
      linkId: 'lnk-abc',
      name: 'My Link',
      description: '',
      requireAccount: false,
      requireEmail: false,
      requireNickname: true,
      requireBirthday: false,
      expiresAt: null,
      conversation: { id: 'conv-1', title: 'Test', description: '', type: 'group' },
    };

    it('returns link info data on success', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true, data: linkData }),
      } as any);

      const result = await LinkConversationService.getLinkInfo('lnk-abc');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/anonymous/link/lnk-abc'),
        expect.objectContaining({ method: 'GET' }),
      );
      expect(result.data).toEqual(linkData);
    });

    it('throws when HTTP status is not ok', async () => {
      mockFetch.mockResolvedValue(makeErrorResponse(404, 'Not Found') as any);

      await expect(LinkConversationService.getLinkInfo('bad-link')).rejects.toThrow('HTTP 404: Not Found');
    });

    it('throws when data.success is false', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: false, message: 'Link not found' }),
      } as any);

      await expect(LinkConversationService.getLinkInfo('lnk-abc')).rejects.toThrow('Link not found');
    });
  });

  // ── validateLink ──────────────────────────────────────────────────────────

  describe('validateLink', () => {
    it('returns isValid=true with link data on success', async () => {
      const linkData = {
        id: 'share-1',
        linkId: 'lnk-abc',
        name: 'L',
        description: '',
        requireAccount: false,
        requireEmail: false,
        requireNickname: true,
        requireBirthday: false,
        expiresAt: null,
        conversation: { id: 'conv-1', title: 'T', description: '', type: 'group' },
      };
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true, data: linkData }),
      } as any);

      const result = await LinkConversationService.validateLink('lnk-abc');

      expect(result.isValid).toBe(true);
      expect(result.link).toEqual(linkData);
    });

    it('returns isValid=false with message on fetch error', async () => {
      mockFetch.mockRejectedValue(new Error('Network failure'));

      const result = await LinkConversationService.validateLink('bad-link');

      expect(result.isValid).toBe(false);
      expect(result.message).toBe('Network failure');
    });

    it('returns isValid=false with generic message for non-Error throws', async () => {
      mockFetch.mockRejectedValue('string error');

      const result = await LinkConversationService.validateLink('bad-link');

      expect(result.isValid).toBe(false);
      expect(result.message).toBe('Erreur lors de la validation du lien');
    });

    it('returns isValid=false when HTTP fails', async () => {
      mockFetch.mockResolvedValue(makeErrorResponse(410, 'Gone') as any);

      const result = await LinkConversationService.validateLink('expired-link');

      expect(result.isValid).toBe(false);
      expect(result.message).toContain('HTTP 410');
    });
  });

  // ── joinConversation ──────────────────────────────────────────────────────

  describe('joinConversation', () => {
    it('returns conversationId on success', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true, data: { conversationId: 'conv-99', redirectTo: '/conversations/conv-99' } }),
      } as any);

      const result = await LinkConversationService.joinConversation('lnk-abc', 'jwt-token');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/conversations/join/lnk-abc'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ Authorization: 'Bearer jwt-token' }),
        }),
      );
      expect(result.conversationId).toBe('conv-99');
      expect(result.redirectTo).toBe('/conversations/conv-99');
    });

    it('throws error message from JSON body when HTTP fails', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 403,
        json: () => Promise.resolve({ message: 'Already a member' }),
      } as any);

      await expect(LinkConversationService.joinConversation('lnk-abc', 'jwt')).rejects.toThrow(
        'Already a member',
      );
    });

    it('throws generic error when JSON parse fails on error response', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.reject(new Error('json parse fail')),
      } as any);

      await expect(LinkConversationService.joinConversation('lnk-abc', 'jwt')).rejects.toThrow(
        'Erreur HTTP 500',
      );
    });

    it('throws when result.success is false', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: false, message: 'Link expired' }),
      } as any);

      await expect(LinkConversationService.joinConversation('lnk-abc', 'jwt')).rejects.toThrow(
        'Link expired',
      );
    });
  });

  // ── getConversationStats ──────────────────────────────────────────────────

  describe('getConversationStats', () => {
    it('delegates to getConversationData and returns stats', async () => {
      const data = makeLinkConversationData();
      mockFetch.mockResolvedValue(makeOkResponse(data) as any);

      const result = await LinkConversationService.getConversationStats('share-1');

      expect(result).toEqual(data.stats);
    });
  });

  // ── getConversationParticipants ───────────────────────────────────────────

  describe('getConversationParticipants', () => {
    it('delegates to getConversationData and returns members + anonymousParticipants', async () => {
      const data = makeLinkConversationData();
      data.members = [{ id: 'm1', role: 'MEMBER', joinedAt: '', user: { id: 'u1', username: 'alice', firstName: '', lastName: '', displayName: '', avatar: '', isOnline: true, lastActiveAt: '' } }];
      mockFetch.mockResolvedValue(makeOkResponse(data) as any);

      const result = await LinkConversationService.getConversationParticipants('share-1');

      expect(result.members).toEqual(data.members);
      expect(result.anonymousParticipants).toEqual([]);
    });
  });
});
