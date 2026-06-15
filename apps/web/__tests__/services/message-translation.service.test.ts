/**
 * Tests for MessageTranslationService
 *
 * Covers requestTranslation (Bearer/session/no-auth/error paths),
 * getTranslationStatus, cancelTranslation, and getMessageTranslations.
 */

import axios from 'axios';
import { messageTranslationService } from '@/services/message-translation.service';

jest.mock('axios');
const mockAxios = axios as jest.Mocked<typeof axios>;

jest.mock('@/lib/config', () => ({
  buildApiUrl: jest.fn((path: string) => `http://test.api${path}`),
}));

const mockGetAuthToken = jest.fn<string | null, []>(() => null);
const mockGetAnonymousSession = jest.fn<{ token: string } | null, []>(() => null);

jest.mock('@/services/auth-manager.service', () => ({
  authManager: {
    getAuthToken: () => mockGetAuthToken(),
    getAnonymousSession: () => mockGetAnonymousSession(),
  },
}));

describe('MessageTranslationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetAuthToken.mockReturnValue(null);
    mockGetAnonymousSession.mockReturnValue(null);
  });

  describe('requestTranslation', () => {
    const baseRequest = { messageId: 'msg-1', targetLanguage: 'fr' };

    it('throws when neither auth token nor session token is available', async () => {
      await expect(messageTranslationService.requestTranslation(baseRequest))
        .rejects.toThrow('Impossible de demander la traduction');
    });

    it('sends Bearer authorization header when authenticated', async () => {
      mockGetAuthToken.mockReturnValue('jwt-token');
      mockAxios.post.mockResolvedValueOnce({ data: { success: true, translationId: 'tid-1' } });

      const result = await messageTranslationService.requestTranslation(baseRequest);

      expect(mockAxios.post).toHaveBeenCalledWith(
        'http://test.api/translate',
        expect.objectContaining({
          message_id: 'msg-1',
          target_language: 'fr',
          model_type: 'basic',
        }),
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer jwt-token' }),
        })
      );
      expect(result.status).toBe('completed');
      expect(result.translationId).toBe('tid-1');
      expect(result.messageId).toBe('msg-1');
      expect(result.targetLanguage).toBe('fr');
    });

    it('sends X-Session-Token header for anonymous session', async () => {
      mockGetAnonymousSession.mockReturnValue({ token: 'session-abc' });
      mockAxios.post.mockResolvedValueOnce({ data: { success: true } });

      await messageTranslationService.requestTranslation(baseRequest);

      expect(mockAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({
          headers: expect.objectContaining({ 'X-Session-Token': 'session-abc' }),
        })
      );
    });

    it('prefers Bearer token over session token when both present', async () => {
      mockGetAuthToken.mockReturnValue('jwt-token');
      mockGetAnonymousSession.mockReturnValue({ token: 'session-abc' });
      mockAxios.post.mockResolvedValueOnce({ data: { success: true } });

      await messageTranslationService.requestTranslation(baseRequest);

      const callHeaders = (mockAxios.post.mock.calls[0]?.[2] as any)?.headers;
      expect(callHeaders?.Authorization).toBe('Bearer jwt-token');
      expect(callHeaders?.['X-Session-Token']).toBeUndefined();
    });

    it('includes source_language in request body when provided', async () => {
      mockGetAuthToken.mockReturnValue('tok');
      mockAxios.post.mockResolvedValueOnce({ data: { success: true } });

      await messageTranslationService.requestTranslation({ ...baseRequest, sourceLanguage: 'en' });

      expect(mockAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ source_language: 'en' }),
        expect.any(Object)
      );
    });

    it('omits source_language from body when not provided', async () => {
      mockGetAuthToken.mockReturnValue('tok');
      mockAxios.post.mockResolvedValueOnce({ data: { success: true } });

      await messageTranslationService.requestTranslation(baseRequest);

      const body = mockAxios.post.mock.calls[0]?.[1] as any;
      expect(body?.source_language).toBeUndefined();
    });

    it('uses specified model type', async () => {
      mockGetAuthToken.mockReturnValue('tok');
      mockAxios.post.mockResolvedValueOnce({ data: { success: true } });

      await messageTranslationService.requestTranslation({ ...baseRequest, model: 'advanced' as any });

      expect(mockAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ model_type: 'advanced' }),
        expect.any(Object)
      );
    });

    it('returns failed status when API success field is false', async () => {
      mockGetAuthToken.mockReturnValue('tok');
      mockAxios.post.mockResolvedValueOnce({ data: { success: false } });

      const result = await messageTranslationService.requestTranslation(baseRequest);
      expect(result.status).toBe('failed');
    });

    it('includes estimatedTime from API response', async () => {
      mockGetAuthToken.mockReturnValue('tok');
      mockAxios.post.mockResolvedValueOnce({ data: { success: true, estimatedTime: 5000 } });

      const result = await messageTranslationService.requestTranslation(baseRequest);
      expect(result.estimatedTime).toBe(5000);
    });

    it('throws with API error message when response data contains it', async () => {
      mockGetAuthToken.mockReturnValue('tok');
      mockAxios.post.mockRejectedValueOnce({
        response: { data: { message: 'Message not found' } },
        message: 'Request failed with status 404',
      });

      await expect(messageTranslationService.requestTranslation(baseRequest))
        .rejects.toThrow('Message not found');
    });

    it('throws with generic error message on network error', async () => {
      mockGetAuthToken.mockReturnValue('tok');
      mockAxios.post.mockRejectedValueOnce(new Error('Network error'));

      await expect(messageTranslationService.requestTranslation(baseRequest))
        .rejects.toThrow('Network error');
    });

    it('uses 30-second timeout', async () => {
      mockGetAuthToken.mockReturnValue('tok');
      mockAxios.post.mockResolvedValueOnce({ data: { success: true } });

      await messageTranslationService.requestTranslation(baseRequest);

      expect(mockAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({ timeout: 30000 })
      );
    });
  });

  describe('getTranslationStatus', () => {
    it('returns translation status on success', async () => {
      mockAxios.get.mockResolvedValueOnce({
        data: {
          status: 'completed',
          progress: 100,
          translatedContent: 'Bonjour',
          error: undefined,
        },
      });

      const status = await messageTranslationService.getTranslationStatus('msg-1', 'fr');

      expect(status.messageId).toBe('msg-1');
      expect(status.targetLanguage).toBe('fr');
      expect(status.status).toBe('completed');
      expect(status.progress).toBe(100);
      expect(status.translatedContent).toBe('Bonjour');
    });

    it('calls correct endpoint with 10s timeout', async () => {
      mockAxios.get.mockResolvedValueOnce({ data: { status: 'pending' } });

      await messageTranslationService.getTranslationStatus('msg-2', 'en');

      expect(mockAxios.get).toHaveBeenCalledWith(
        expect.stringContaining('msg-2/translate/en/status'),
        expect.objectContaining({ timeout: 10000 })
      );
    });

    it('returns failed status with error message on network error', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      mockAxios.get.mockRejectedValueOnce(new Error('Network error'));

      const status = await messageTranslationService.getTranslationStatus('msg-2', 'en');

      expect(status.status).toBe('failed');
      expect(status.error).toBe('Impossible de vérifier le statut');
      expect(status.messageId).toBe('msg-2');
      expect(status.targetLanguage).toBe('en');
      consoleSpy.mockRestore();
    });
  });

  describe('cancelTranslation', () => {
    it('returns true on successful cancellation', async () => {
      mockAxios.delete.mockResolvedValueOnce({ data: {} });

      const result = await messageTranslationService.cancelTranslation('msg-1', 'fr');

      expect(result).toBe(true);
      expect(mockAxios.delete).toHaveBeenCalledWith(
        expect.stringContaining('msg-1/translate/fr'),
        expect.objectContaining({ timeout: 10000 })
      );
    });

    it('returns false on cancellation network error', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      mockAxios.delete.mockRejectedValueOnce(new Error('Cannot cancel'));

      const result = await messageTranslationService.cancelTranslation('msg-1', 'fr');

      expect(result).toBe(false);
      consoleSpy.mockRestore();
    });
  });

  describe('getMessageTranslations', () => {
    it('returns array of translations on success', async () => {
      const translations = [
        { messageId: 'msg-1', targetLanguage: 'fr', status: 'completed' },
        { messageId: 'msg-1', targetLanguage: 'en', status: 'completed' },
      ];
      mockAxios.get.mockResolvedValueOnce({ data: { translations } });

      const result = await messageTranslationService.getMessageTranslations('msg-1');

      expect(result).toHaveLength(2);
      expect(result[0]?.targetLanguage).toBe('fr');
    });

    it('calls correct endpoint', async () => {
      mockAxios.get.mockResolvedValueOnce({ data: { translations: [] } });

      await messageTranslationService.getMessageTranslations('msg-3');

      expect(mockAxios.get).toHaveBeenCalledWith(
        expect.stringContaining('msg-3/translations'),
        expect.objectContaining({ timeout: 10000 })
      );
    });

    it('returns empty array when response has no translations field', async () => {
      mockAxios.get.mockResolvedValueOnce({ data: {} });

      const result = await messageTranslationService.getMessageTranslations('msg-1');
      expect(result).toEqual([]);
    });

    it('returns empty array on network error', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      mockAxios.get.mockRejectedValueOnce(new Error('Not found'));

      const result = await messageTranslationService.getMessageTranslations('msg-1');

      expect(result).toEqual([]);
      consoleSpy.mockRestore();
    });
  });
});
