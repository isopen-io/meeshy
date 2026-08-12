import axios from 'axios';
import { messageTranslationService } from '@/services/message-translation.service';
import type { ForceTranslationRequest } from '@/services/message-translation.service';

jest.mock('axios');
const mockAxios = axios as jest.Mocked<typeof axios>;

const mockGetAuthToken = jest.fn();
const mockGetAnonymousSession = jest.fn();

jest.mock('@/services/auth-manager.service', () => ({
  authManager: {
    getAuthToken: (...args: any[]) => mockGetAuthToken(...args),
    getAnonymousSession: (...args: any[]) => mockGetAnonymousSession(...args),
  },
}));

jest.mock('@/lib/config', () => ({
  buildApiUrl: jest.fn((path: string) => `https://gate.meeshy.me/api/v1${path}`),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockGetAuthToken.mockReturnValue(null);
  mockGetAnonymousSession.mockReturnValue(null);
});

function makeRequest(overrides: Partial<ForceTranslationRequest> = {}): ForceTranslationRequest {
  return {
    messageId: 'msg-123',
    targetLanguage: 'fr',
    ...overrides,
  };
}

describe('MessageTranslationService.requestTranslation', () => {
  it('throws when no auth token and no session token available', async () => {
    await expect(messageTranslationService.requestTranslation(makeRequest())).rejects.toThrow(
      'Impossible de demander la traduction'
    );
  });

  it('uses Authorization header when auth token is present', async () => {
    mockGetAuthToken.mockReturnValue('jwt-token-123');
    mockAxios.post.mockResolvedValueOnce({
      data: { success: true, translationId: 'tr-1', estimatedTime: 500 },
    });

    await messageTranslationService.requestTranslation(makeRequest());

    expect(mockAxios.post).toHaveBeenCalledWith(
      expect.stringContaining('/translate'),
      expect.any(Object),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer jwt-token-123' }),
      })
    );
  });

  it('uses X-Session-Token header when session token is present and no auth token', async () => {
    mockGetAuthToken.mockReturnValue(null);
    mockGetAnonymousSession.mockReturnValue({ token: 'session-abc', participantId: 'p1', expiresAt: Date.now() + 10000 });
    mockAxios.post.mockResolvedValueOnce({ data: { success: true } });

    await messageTranslationService.requestTranslation(makeRequest());

    expect(mockAxios.post).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Object),
      expect.objectContaining({
        headers: expect.objectContaining({ 'X-Session-Token': 'session-abc' }),
      })
    );
  });

  it('includes source_language in request body when sourceLanguage is provided', async () => {
    mockGetAuthToken.mockReturnValue('token');
    mockAxios.post.mockResolvedValueOnce({ data: { success: true } });

    await messageTranslationService.requestTranslation(
      makeRequest({ sourceLanguage: 'en' })
    );

    expect(mockAxios.post).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ source_language: 'en' }),
      expect.any(Object)
    );
  });

  it('omits source_language from request body when sourceLanguage is not provided', async () => {
    mockGetAuthToken.mockReturnValue('token');
    mockAxios.post.mockResolvedValueOnce({ data: { success: true } });

    await messageTranslationService.requestTranslation(makeRequest());

    const callArgs = mockAxios.post.mock.calls[0][1];
    expect(callArgs).not.toHaveProperty('source_language');
  });

  it('defaults model_type to basic when no model specified', async () => {
    mockGetAuthToken.mockReturnValue('token');
    mockAxios.post.mockResolvedValueOnce({ data: { success: true } });

    await messageTranslationService.requestTranslation(makeRequest());

    expect(mockAxios.post).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ model_type: 'basic' }),
      expect.any(Object)
    );
  });

  it('returns completed status when response.data.success is true', async () => {
    mockGetAuthToken.mockReturnValue('token');
    mockAxios.post.mockResolvedValueOnce({
      data: { success: true, translationId: 'tr-42', estimatedTime: 200 },
    });

    const result = await messageTranslationService.requestTranslation(makeRequest());

    expect(result.status).toBe('completed');
    expect(result.messageId).toBe('msg-123');
    expect(result.targetLanguage).toBe('fr');
    expect(result.translationId).toBe('tr-42');
    expect(result.estimatedTime).toBe(200);
  });

  it('returns failed status when response.data.success is false', async () => {
    mockGetAuthToken.mockReturnValue('token');
    mockAxios.post.mockResolvedValueOnce({ data: { success: false } });

    const result = await messageTranslationService.requestTranslation(makeRequest());

    expect(result.status).toBe('failed');
  });

  it('throws with API error message when request fails with response data', async () => {
    mockGetAuthToken.mockReturnValue('token');
    const apiError = Object.assign(new Error('bad request'), {
      response: { data: { message: 'Message not found' } },
    });
    mockAxios.post.mockRejectedValueOnce(apiError);

    await expect(messageTranslationService.requestTranslation(makeRequest())).rejects.toThrow(
      'Message not found'
    );
  });

  it('throws with generic error message when request fails without response', async () => {
    mockGetAuthToken.mockReturnValue('token');
    mockAxios.post.mockRejectedValueOnce(new Error('Network error'));

    await expect(messageTranslationService.requestTranslation(makeRequest())).rejects.toThrow(
      'Network error'
    );
  });

  it('sets timeout of 30000ms on the request', async () => {
    mockGetAuthToken.mockReturnValue('token');
    mockAxios.post.mockResolvedValueOnce({ data: { success: true } });

    await messageTranslationService.requestTranslation(makeRequest());

    expect(mockAxios.post).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Object),
      expect.objectContaining({ timeout: 30000 })
    );
  });
});

describe('MessageTranslationService.getTranslationStatus', () => {
  it('returns translation status from API', async () => {
    mockAxios.get.mockResolvedValueOnce({
      data: {
        status: 'completed',
        progress: 100,
        translatedContent: 'Bonjour',
        error: undefined,
      },
    });

    const result = await messageTranslationService.getTranslationStatus('msg-1', 'fr');

    expect(result.messageId).toBe('msg-1');
    expect(result.targetLanguage).toBe('fr');
    expect(result.status).toBe('completed');
    expect(result.progress).toBe(100);
    expect(result.translatedContent).toBe('Bonjour');
    expect(mockAxios.get).toHaveBeenCalledWith(
      expect.stringContaining('/msg-1/translate/fr/status'),
      expect.objectContaining({ timeout: 10000 })
    );
  });

  it('returns failed status with error message when request fails', async () => {
    mockAxios.get.mockRejectedValueOnce(new Error('Service unavailable'));

    const result = await messageTranslationService.getTranslationStatus('msg-1', 'fr');

    expect(result.messageId).toBe('msg-1');
    expect(result.targetLanguage).toBe('fr');
    expect(result.status).toBe('failed');
    expect(result.error).toBe('Impossible de vérifier le statut');
  });
});

describe('MessageTranslationService.cancelTranslation', () => {
  it('returns true when cancellation succeeds', async () => {
    mockAxios.delete.mockResolvedValueOnce({});

    const result = await messageTranslationService.cancelTranslation('msg-1', 'fr');

    expect(result).toBe(true);
    expect(mockAxios.delete).toHaveBeenCalledWith(
      expect.stringContaining('/msg-1/translate/fr'),
      expect.objectContaining({ timeout: 10000 })
    );
  });

  it('returns false when cancellation fails', async () => {
    mockAxios.delete.mockRejectedValueOnce(new Error('Delete failed'));

    const result = await messageTranslationService.cancelTranslation('msg-1', 'fr');

    expect(result).toBe(false);
  });
});

describe('MessageTranslationService.getMessageTranslations', () => {
  it('returns translations array when API responds with translations', async () => {
    const mockTranslations = [
      { messageId: 'msg-1', targetLanguage: 'fr', status: 'completed', translatedContent: 'Bonjour' },
      { messageId: 'msg-1', targetLanguage: 'es', status: 'completed', translatedContent: 'Hola' },
    ];
    mockAxios.get.mockResolvedValueOnce({ data: { translations: mockTranslations } });

    const result = await messageTranslationService.getMessageTranslations('msg-1');

    expect(result).toEqual(mockTranslations);
    expect(mockAxios.get).toHaveBeenCalledWith(
      expect.stringContaining('/msg-1/translations'),
      expect.objectContaining({ timeout: 10000 })
    );
  });

  it('returns empty array when response has no translations field', async () => {
    mockAxios.get.mockResolvedValueOnce({ data: {} });

    const result = await messageTranslationService.getMessageTranslations('msg-1');

    expect(result).toEqual([]);
  });

  it('returns empty array when request fails', async () => {
    mockAxios.get.mockRejectedValueOnce(new Error('Network error'));

    const result = await messageTranslationService.getMessageTranslations('msg-1');

    expect(result).toEqual([]);
  });
});
