/**
 * Tests for services/push-token.service.ts
 */

const mockAxiosPost = jest.fn();
const mockAxiosDelete = jest.fn();
const mockIsAxiosError = jest.fn();

jest.mock('axios', () => ({
  default: {
    post: (...args: any[]) => mockAxiosPost(...args),
    delete: (...args: any[]) => mockAxiosDelete(...args),
    isAxiosError: (...args: any[]) => mockIsAxiosError(...args),
  },
  post: (...args: any[]) => mockAxiosPost(...args),
  delete: (...args: any[]) => mockAxiosDelete(...args),
  isAxiosError: (...args: any[]) => mockIsAxiosError(...args),
}));

jest.mock('@/utils/logger', () => ({
  logger: {
    error: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
  },
}));

import {
  pushTokenService,
  getPushTokenService,
  resetPushTokenService,
} from '@/services/push-token.service';

const TOKEN = 'fcm-token-abc123';
const STORAGE_KEY = 'fcm_token_registered';
const STORAGE_AT_KEY = 'fcm_token_registered_at';

beforeEach(() => {
  jest.clearAllMocks();
  mockIsAxiosError.mockReturnValue(false);
  resetPushTokenService();
  localStorage.clear();
});

// ─── registerToken ────────────────────────────────────────────────────────────

describe('register (registerToken)', () => {
  it('calls POST /api/users/push-token with the token', async () => {
    mockAxiosPost.mockResolvedValueOnce({ data: { success: true } });
    await pushTokenService.register(TOKEN);
    expect(mockAxiosPost).toHaveBeenCalledWith(
      expect.stringContaining('/api/users/push-token'),
      expect.objectContaining({ token: TOKEN }),
      expect.any(Object)
    );
  });

  it('returns success:true on successful registration', async () => {
    mockAxiosPost.mockResolvedValueOnce({ data: { success: true } });
    const result = await pushTokenService.register(TOKEN);
    expect(result.success).toBe(true);
  });

  it('saves the token to localStorage on success', async () => {
    mockAxiosPost.mockResolvedValueOnce({ data: { success: true } });
    await pushTokenService.register(TOKEN);
    expect(localStorage.getItem(STORAGE_KEY)).toBe(TOKEN);
  });

  it('skips the API call when token was already registered in this session', async () => {
    mockAxiosPost.mockResolvedValueOnce({ data: { success: true } });
    await pushTokenService.register(TOKEN);
    const result = await pushTokenService.register(TOKEN);
    expect(mockAxiosPost).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(true);
  });

  it('returns success:false on axios error', async () => {
    const axiosErr = Object.assign(new Error('Network error'), {
      response: { data: { message: 'Failed' } },
    });
    mockAxiosPost.mockRejectedValueOnce(axiosErr);
    mockIsAxiosError.mockReturnValueOnce(true);
    const result = await pushTokenService.register(TOKEN);
    expect(result.success).toBe(false);
    expect(result.message).toBe('Failed');
  });

  it('returns success:false with error message on non-axios error', async () => {
    mockAxiosPost.mockRejectedValueOnce(new Error('Something unexpected'));
    mockIsAxiosError.mockReturnValueOnce(false);
    const result = await pushTokenService.register(TOKEN);
    expect(result.success).toBe(false);
    expect(result.message).toBe('Something unexpected');
  });
});

// ─── deleteToken ─────────────────────────────────────────────────────────────

describe('delete (deleteToken)', () => {
  it('calls DELETE /api/users/push-token with the provided token', async () => {
    mockAxiosDelete.mockResolvedValueOnce({ data: { success: true } });
    await pushTokenService.delete(TOKEN);
    expect(mockAxiosDelete).toHaveBeenCalledWith(
      expect.stringContaining('/api/users/push-token'),
      expect.objectContaining({ data: { token: TOKEN } })
    );
  });

  it('uses lastRegisteredToken when no token is passed', async () => {
    mockAxiosPost.mockResolvedValueOnce({ data: { success: true } });
    await pushTokenService.register(TOKEN);

    mockAxiosDelete.mockResolvedValueOnce({ data: { success: true } });
    await pushTokenService.delete();
    expect(mockAxiosDelete).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ data: { token: TOKEN } })
    );
  });

  it('returns immediately when there is no token to delete', async () => {
    const result = await pushTokenService.delete();
    expect(mockAxiosDelete).not.toHaveBeenCalled();
    expect(result.success).toBe(true);
  });

  it('removes the token from localStorage on success', async () => {
    localStorage.setItem(STORAGE_KEY, TOKEN);
    mockAxiosDelete.mockResolvedValueOnce({ data: { success: true } });
    await pushTokenService.delete(TOKEN);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('returns success:false on axios error', async () => {
    const axiosErr = Object.assign(new Error('Delete failed'), {
      response: { data: { message: 'Forbidden' } },
    });
    mockAxiosDelete.mockRejectedValueOnce(axiosErr);
    mockIsAxiosError.mockReturnValueOnce(true);
    const result = await pushTokenService.delete(TOKEN);
    expect(result.success).toBe(false);
    expect(result.message).toBe('Forbidden');
  });
});

// ─── shouldRefreshToken ───────────────────────────────────────────────────────

describe('shouldRefresh (shouldRefreshToken)', () => {
  it('returns true when no registration timestamp is stored', () => {
    expect(pushTokenService.shouldRefresh()).toBe(true);
  });

  it('returns false when token was registered less than 24h ago', () => {
    const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
    localStorage.setItem(STORAGE_AT_KEY, twoHoursAgo.toString());
    expect(pushTokenService.shouldRefresh()).toBe(false);
  });

  it('returns true when token was registered more than 24h ago', () => {
    const thirtyHoursAgo = Date.now() - 30 * 60 * 60 * 1000;
    localStorage.setItem(STORAGE_AT_KEY, thirtyHoursAgo.toString());
    expect(pushTokenService.shouldRefresh()).toBe(true);
  });
});

// ─── getRegisteredToken / hasRegisteredToken ──────────────────────────────────

describe('getRegistered / hasRegistered', () => {
  it('getRegistered returns null when no token in localStorage', () => {
    expect(pushTokenService.getRegistered()).toBeNull();
  });

  it('getRegistered returns the stored token', () => {
    localStorage.setItem(STORAGE_KEY, TOKEN);
    expect(pushTokenService.getRegistered()).toBe(TOKEN);
  });

  it('hasRegistered returns false when no token', () => {
    expect(pushTokenService.hasRegistered()).toBe(false);
  });

  it('hasRegistered returns true when token is stored', () => {
    localStorage.setItem(STORAGE_KEY, TOKEN);
    expect(pushTokenService.hasRegistered()).toBe(true);
  });
});

// ─── syncToken ────────────────────────────────────────────────────────────────

describe('sync (syncToken)', () => {
  it('skips registration when token matches stored and no refresh needed', async () => {
    localStorage.setItem(STORAGE_KEY, TOKEN);
    localStorage.setItem(STORAGE_AT_KEY, Date.now().toString());
    const result = await pushTokenService.sync(TOKEN);
    expect(mockAxiosPost).not.toHaveBeenCalled();
    expect(result).toBe(true);
  });

  it('registers token when stored token differs', async () => {
    localStorage.setItem(STORAGE_KEY, 'old-token');
    localStorage.setItem(STORAGE_AT_KEY, Date.now().toString());
    mockAxiosPost.mockResolvedValueOnce({ data: { success: true } });
    const result = await pushTokenService.sync(TOKEN);
    expect(mockAxiosPost).toHaveBeenCalled();
    expect(result).toBe(true);
  });

  it('registers token when refresh is needed', async () => {
    localStorage.setItem(STORAGE_KEY, TOKEN);
    localStorage.setItem(STORAGE_AT_KEY, (Date.now() - 30 * 60 * 60 * 1000).toString());
    mockAxiosPost.mockResolvedValueOnce({ data: { success: true } });
    const result = await pushTokenService.sync(TOKEN);
    expect(mockAxiosPost).toHaveBeenCalled();
    expect(result).toBe(true);
  });

  it('returns false when registration fails', async () => {
    mockAxiosPost.mockRejectedValueOnce(new Error('fail'));
    mockIsAxiosError.mockReturnValueOnce(false);
    const result = await pushTokenService.sync('new-token');
    expect(result).toBe(false);
  });
});

// ─── resetPushTokenService ────────────────────────────────────────────────────

describe('resetPushTokenService', () => {
  it('creates a fresh singleton after reset', async () => {
    mockAxiosPost.mockResolvedValueOnce({ data: { success: true } });
    await pushTokenService.register(TOKEN);
    resetPushTokenService();
    const s1 = getPushTokenService();
    const s2 = getPushTokenService();
    expect(s1).toBe(s2);
  });
});
