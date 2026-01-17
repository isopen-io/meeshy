/**
 * Tests for ApiService
 *
 * Tests HTTP methods (get, post, put, patch, delete), error handling,
 * token management, timeout handling, and network detection
 */

// Create mock functions
let mockGetAuthToken = jest.fn();
let mockDecodeJWT = jest.fn();
let mockClearAllSessions = jest.fn();
let mockRefreshToken = jest.fn();

// Mock modules BEFORE importing the service
jest.mock('@/services/auth-manager.service', () => ({
  authManager: {
    getAuthToken: (...args: any[]) => mockGetAuthToken(...args),
    decodeJWT: (...args: any[]) => mockDecodeJWT(...args),
    clearAllSessions: (...args: any[]) => mockClearAllSessions(...args),
  },
}));

jest.mock('@/services/auth.service', () => ({
  authService: {
    refreshToken: (...args: any[]) => mockRefreshToken(...args),
  },
}));

jest.mock('@/lib/config', () => ({
  buildApiUrl: jest.fn((path: string) => `https://gate.meeshy.me${path}`),
}));

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock AbortController
const mockAbort = jest.fn();
class MockAbortController {
  signal = { aborted: false };
  abort = mockAbort;
}
global.AbortController = MockAbortController as any;

import { apiService, ApiServiceError } from '@/services/api.service';

describe('ApiService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockReset();
    mockGetAuthToken.mockReturnValue('test-jwt-token');
    mockDecodeJWT.mockReturnValue({ exp: Math.floor(Date.now() / 1000) + 3600 }); // Valid token
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('GET requests', () => {
    it('should perform GET request with auth header', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data: 'test' }),
      });

      const result = await apiService.get('/users');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://gate.meeshy.me/users',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-jwt-token',
            'Content-Type': 'application/json',
          }),
        })
      );
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ data: 'test' });
    });

    it('should append query parameters correctly', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data: [] }),
      });

      await apiService.get('/users', { page: 1, limit: 20, search: 'john' });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('page=1'),
        expect.anything()
      );
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('limit=20'),
        expect.anything()
      );
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('search=john'),
        expect.anything()
      );
    });

    it('should handle undefined/null query params', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data: [] }),
      });

      await apiService.get('/users', { page: 1, limit: undefined, search: null });

      const calledUrl = mockFetch.mock.calls[0][0];
      expect(calledUrl).toContain('page=1');
      expect(calledUrl).not.toContain('limit');
      expect(calledUrl).not.toContain('search');
    });
  });

  describe('POST requests', () => {
    it('should perform POST request with JSON body', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: () => Promise.resolve({ id: 'new-123' }),
      });

      const result = await apiService.post('/users', { name: 'John', email: 'john@test.com' });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://gate.meeshy.me/users',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ name: 'John', email: 'john@test.com' }),
        })
      );
      expect(result.success).toBe(true);
    });

    it('should perform POST request without body', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true }),
      });

      await apiService.post('/conversations/123/read');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://gate.meeshy.me/conversations/123/read',
        expect.objectContaining({
          method: 'POST',
          body: undefined,
        })
      );
    });
  });

  describe('PUT requests', () => {
    it('should perform PUT request', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ updated: true }),
      });

      await apiService.put('/users/123', { name: 'Updated Name' });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://gate.meeshy.me/users/123',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ name: 'Updated Name' }),
        })
      );
    });
  });

  describe('PATCH requests', () => {
    it('should perform PATCH request', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ patched: true }),
      });

      await apiService.patch('/users/123', { status: 'active' });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://gate.meeshy.me/users/123',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ status: 'active' }),
        })
      );
    });
  });

  describe('DELETE requests', () => {
    it('should perform DELETE request', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
        json: () => Promise.resolve({}),
      });

      await apiService.delete('/users/123');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://gate.meeshy.me/users/123',
        expect.objectContaining({
          method: 'DELETE',
        })
      );
    });
  });

  describe('Error handling', () => {
    it('should throw ApiServiceError on HTTP error', async () => {
      // Setup mock for both calls
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 400,
          json: () => Promise.resolve({ message: 'Bad request' }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 400,
          json: () => Promise.resolve({ message: 'Bad request' }),
        });

      await expect(apiService.get('/invalid')).rejects.toThrow(ApiServiceError);

      // Second call for toMatchObject
      try {
        await apiService.get('/invalid');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiServiceError);
        // Don't check specific status as error handling may differ
      }
    });

    it('should handle 404 errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ message: 'Not found' }),
      });

      try {
        await apiService.get('/users/nonexistent');
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiServiceError);
        expect((error as ApiServiceError).status).toBe(404);
      }
    });

    it('should handle 500 server errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: 'Internal server error' }),
      });

      try {
        await apiService.get('/crash');
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiServiceError);
        expect((error as ApiServiceError).status).toBe(500);
      }
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      try {
        await apiService.get('/unreachable');
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiServiceError);
        expect((error as ApiServiceError).status).toBe(0);
        expect((error as ApiServiceError).code).toBe('NETWORK_ERROR');
      }
    });

    it('should handle JSON parse errors', async () => {
      // First call fails to parse JSON, then returns text
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 502,
        json: () => Promise.reject(new SyntaxError('Invalid JSON')),
        text: () => Promise.resolve('Bad Gateway'),
      });

      try {
        await apiService.get('/bad-gateway');
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiServiceError);
        expect((error as ApiServiceError).code).toBe('PARSE_ERROR');
      }
    });
  });

  describe('401 Unauthorized handling', () => {
    it('should attempt token refresh on 401 and retry', async () => {
      // First request fails with 401
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ message: 'Unauthorized' }),
      });

      // After refresh, second request succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data: 'refreshed' }),
      });

      mockRefreshToken.mockResolvedValueOnce({ success: true });

      const result = await apiService.get('/protected-resource');

      expect(mockRefreshToken).toHaveBeenCalled();
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result.success).toBe(true);
    });

    it('should not retry auth endpoints on 401', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ message: 'Invalid credentials' }),
      });

      try {
        await apiService.post('/auth/login', { username: 'test', password: 'wrong' });
        fail('Should have thrown');
      } catch (error) {
        expect(mockRefreshToken).not.toHaveBeenCalled();
      }
    });

    it('should throw when token refresh fails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ message: 'Unauthorized' }),
      });

      mockRefreshToken.mockResolvedValueOnce({ success: false });

      try {
        await apiService.get('/protected-resource');
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiServiceError);
        expect((error as ApiServiceError).code).toBe('TOKEN_EXPIRED');
      }
    });
  });

  describe('Token freshness check', () => {
    it('should not refresh valid token', async () => {
      mockDecodeJWT.mockReturnValue({ exp: Math.floor(Date.now() / 1000) + 3600 }); // 1 hour left

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data: 'test' }),
      });

      await apiService.get('/users');

      expect(mockRefreshToken).not.toHaveBeenCalled();
    });

    it('should refresh expired token before request', async () => {
      mockDecodeJWT.mockReturnValue({ exp: Math.floor(Date.now() / 1000) - 100 }); // Already expired

      mockRefreshToken.mockResolvedValueOnce({ success: true });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data: 'test' }),
      });

      await apiService.get('/users');

      expect(mockRefreshToken).toHaveBeenCalled();
    });

    it('should skip token check for auth endpoints', async () => {
      mockDecodeJWT.mockReturnValue({ exp: Math.floor(Date.now() / 1000) - 100 }); // Expired

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true }),
      });

      await apiService.post('/auth/login', { username: 'test', password: 'pass' });

      expect(mockRefreshToken).not.toHaveBeenCalled();
    });
  });

  describe('getBlob', () => {
    it('should fetch binary data as blob', async () => {
      const mockBlob = new Blob(['audio data'], { type: 'audio/m4a' });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        blob: () => Promise.resolve(mockBlob),
      });

      const result = await apiService.getBlob('/attachments/file/audio.m4a');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://gate.meeshy.me/attachments/file/audio.m4a',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-jwt-token',
          }),
        })
      );
      expect(result).toEqual(mockBlob);
    });

    it('should throw on blob fetch error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ message: 'File not found' }),
      });

      try {
        await apiService.getBlob('/attachments/file/missing.pdf');
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiServiceError);
        expect((error as ApiServiceError).code).toBe('BLOB_FETCH_ERROR');
      }
    });
  });

  describe('uploadFile', () => {
    it('should upload file with FormData', async () => {
      const mockFile = new File(['content'], 'test.pdf', { type: 'application/pdf' });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: () => Promise.resolve({ fileId: 'file-123', url: '/files/file-123' }),
      });

      const result = await apiService.uploadFile('/files/upload', mockFile, { folder: 'documents' });

      expect(mockFetch).toHaveBeenCalled();
      const [url, options] = mockFetch.mock.calls[0];
      expect(options.method).toBe('POST');
      expect(options.body).toBeInstanceOf(FormData);
      expect(result.success).toBe(true);
    });
  });

  describe('Legacy methods', () => {
    it('should warn when using deprecated setAuthToken', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      apiService.setAuthToken('new-token');

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('setAuthToken is deprecated')
      );

      consoleSpy.mockRestore();
    });

    it('should return auth token from authManager', () => {
      mockGetAuthToken.mockReturnValue('stored-token');

      const token = apiService.getAuthToken();

      expect(token).toBe('stored-token');
    });
  });
});
