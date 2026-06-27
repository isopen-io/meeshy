/**
 * Tests for services/user-preferences.service.ts
 */

const mockGet = jest.fn();
const mockPost = jest.fn();
const mockPut = jest.fn();
const mockDelete = jest.fn();

jest.mock('@/services/api.service', () => ({
  apiService: {
    get: (...args: any[]) => mockGet(...args),
    post: (...args: any[]) => mockPost(...args),
    put: (...args: any[]) => mockPut(...args),
    delete: (...args: any[]) => mockDelete(...args),
  },
}));

jest.mock('@/utils/logger', () => ({
  logger: {
    error: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  },
}));

jest.spyOn(console, 'error').mockImplementation(() => {});

import { UserPreferencesService } from '@/services/user-preferences.service';

// Create a fresh instance per test to avoid shared cache state
let service: UserPreferencesService;

const NOW = new Date('2024-01-15T12:00:00Z');

const makeBackendPrefs = (overrides: Record<string, unknown> = {}) => ({
  id: 'pref-1',
  userId: 'user-1',
  conversationId: 'conv-1',
  isPinned: false,
  isMuted: false,
  isArchived: false,
  tags: [],
  createdAt: NOW.toISOString(),
  updatedAt: NOW.toISOString(),
  ...overrides,
});

const makeBackendCategory = (overrides: Record<string, unknown> = {}) => ({
  id: 'cat-1',
  userId: 'user-1',
  name: 'Work',
  order: 1,
  isExpanded: true,
  createdAt: NOW.toISOString(),
  updatedAt: NOW.toISOString(),
  ...overrides,
});

const ok = <T>(data: T) => ({ data: { success: true, data } });

beforeEach(() => {
  jest.clearAllMocks();
  service = new UserPreferencesService();
});

// ─── getPreferences ───────────────────────────────────────────────────────────

describe('getPreferences', () => {
  it('calls GET /api/user-preferences/conversations/:id', async () => {
    mockGet.mockResolvedValueOnce(ok(makeBackendPrefs()));
    await service.getPreferences('conv-1');
    expect(mockGet).toHaveBeenCalledWith('/api/user-preferences/conversations/conv-1');
  });

  it('returns null when API response has no data', async () => {
    mockGet.mockResolvedValueOnce({ data: { success: false } });
    const result = await service.getPreferences('conv-1');
    expect(result).toBeNull();
  });

  it('transforms backend data to domain model', async () => {
    mockGet.mockResolvedValueOnce(ok(makeBackendPrefs({ isPinned: true, tags: ['work', 'urgent'] })));
    const result = await service.getPreferences('conv-1');
    expect(result?.isPinned).toBe(true);
    expect(result?.tags).toEqual(['work', 'urgent']);
    expect(result?.conversationId).toBe('conv-1');
  });

  it('returns null on 404 error', async () => {
    const err = Object.assign(new Error('Not Found'), { status: 404 });
    mockGet.mockRejectedValueOnce(err);
    const result = await service.getPreferences('conv-1');
    expect(result).toBeNull();
  });

  it('re-throws non-404 errors', async () => {
    const err = Object.assign(new Error('Unauthorized'), { status: 401 });
    mockGet.mockRejectedValueOnce(err);
    await expect(service.getPreferences('conv-1')).rejects.toThrow('Unauthorized');
  });

  it('returns cached result on second call without re-fetching', async () => {
    mockGet.mockResolvedValueOnce(ok(makeBackendPrefs()));
    await service.getPreferences('conv-1');
    await service.getPreferences('conv-1');
    expect(mockGet).toHaveBeenCalledTimes(1);
  });
});

// ─── getAllPreferences ────────────────────────────────────────────────────────

describe('getAllPreferences', () => {
  it('calls GET /api/user-preferences/conversations', async () => {
    mockGet.mockResolvedValueOnce({ data: { success: true, data: [] } });
    await service.getAllPreferences();
    expect(mockGet).toHaveBeenCalledWith('/api/user-preferences/conversations');
  });

  it('returns empty array on failure', async () => {
    mockGet.mockRejectedValueOnce(new Error('server error'));
    const result = await service.getAllPreferences();
    expect(result).toEqual([]);
  });

  it('returns empty array when data is not an array', async () => {
    mockGet.mockResolvedValueOnce({ data: { success: true, data: null } });
    const result = await service.getAllPreferences();
    expect(result).toEqual([]);
  });

  it('transforms each item', async () => {
    mockGet.mockResolvedValueOnce({
      data: { success: true, data: [makeBackendPrefs({ conversationId: 'c1' }), makeBackendPrefs({ conversationId: 'c2' })] },
    });
    const result = await service.getAllPreferences();
    expect(result).toHaveLength(2);
    expect(result[0].conversationId).toBe('c1');
    expect(result[1].conversationId).toBe('c2');
  });
});

// ─── upsertPreferences ────────────────────────────────────────────────────────

describe('upsertPreferences', () => {
  it('calls PUT /api/user-preferences/conversations/:id', async () => {
    mockPut.mockResolvedValueOnce(ok(makeBackendPrefs({ isPinned: true })));
    await service.upsertPreferences('conv-1', { isPinned: true });
    expect(mockPut).toHaveBeenCalledWith(
      '/api/user-preferences/conversations/conv-1',
      { isPinned: true }
    );
  });

  it('returns the updated preferences', async () => {
    mockPut.mockResolvedValueOnce(ok(makeBackendPrefs({ isMuted: true })));
    const result = await service.upsertPreferences('conv-1', { isMuted: true });
    expect(result.isMuted).toBe(true);
  });

  it('throws when API reports failure', async () => {
    mockPut.mockResolvedValueOnce({ data: { success: false } });
    await expect(service.upsertPreferences('conv-1', {})).rejects.toThrow();
  });

  it('re-throws API errors', async () => {
    mockPut.mockRejectedValueOnce(new Error('network error'));
    await expect(service.upsertPreferences('conv-1', {})).rejects.toThrow('network error');
  });
});

// ─── deletePreferences ────────────────────────────────────────────────────────

describe('deletePreferences', () => {
  it('calls DELETE /api/user-preferences/conversations/:id', async () => {
    mockDelete.mockResolvedValueOnce({});
    await service.deletePreferences('conv-1');
    expect(mockDelete).toHaveBeenCalledWith('/api/user-preferences/conversations/conv-1');
  });

  it('re-throws errors', async () => {
    mockDelete.mockRejectedValueOnce(new Error('delete failed'));
    await expect(service.deletePreferences('conv-1')).rejects.toThrow('delete failed');
  });

  it('removes entry from cache', async () => {
    // Populate cache via getPreferences
    mockGet.mockResolvedValueOnce(ok(makeBackendPrefs()));
    await service.getPreferences('conv-1');

    // Delete
    mockDelete.mockResolvedValueOnce({});
    await service.deletePreferences('conv-1');

    // Next getPreferences should hit the API again
    mockGet.mockResolvedValueOnce(ok(makeBackendPrefs()));
    await service.getPreferences('conv-1');
    expect(mockGet).toHaveBeenCalledTimes(2);
  });
});

// ─── toggle helpers ───────────────────────────────────────────────────────────

describe('togglePin', () => {
  it('calls upsertPreferences with isPinned', async () => {
    mockPut.mockResolvedValueOnce(ok(makeBackendPrefs({ isPinned: true })));
    const result = await service.togglePin('conv-1', true);
    expect(mockPut).toHaveBeenCalledWith(
      '/api/user-preferences/conversations/conv-1',
      expect.objectContaining({ isPinned: true })
    );
    expect(result.isPinned).toBe(true);
  });
});

describe('toggleMute', () => {
  it('calls upsertPreferences with isMuted', async () => {
    mockPut.mockResolvedValueOnce(ok(makeBackendPrefs({ isMuted: true })));
    await service.toggleMute('conv-1', true);
    expect(mockPut).toHaveBeenCalledWith(
      '/api/user-preferences/conversations/conv-1',
      expect.objectContaining({ isMuted: true })
    );
  });
});

describe('toggleArchive', () => {
  it('calls upsertPreferences with isArchived', async () => {
    mockPut.mockResolvedValueOnce(ok(makeBackendPrefs({ isArchived: true })));
    await service.toggleArchive('conv-1', true);
    expect(mockPut).toHaveBeenCalledWith(
      '/api/user-preferences/conversations/conv-1',
      expect.objectContaining({ isArchived: true })
    );
  });
});

// ─── tag operations ───────────────────────────────────────────────────────────

describe('addTag', () => {
  it('appends the new tag to existing tags', async () => {
    mockGet.mockResolvedValueOnce(ok(makeBackendPrefs({ tags: ['work'] })));
    mockPut.mockResolvedValueOnce(ok(makeBackendPrefs({ tags: ['work', 'urgent'] })));
    const result = await service.addTag('conv-1', 'urgent');
    const putCall = mockPut.mock.calls[0];
    expect(putCall[1].tags).toEqual(['work', 'urgent']);
    expect(result.tags).toEqual(['work', 'urgent']);
  });

  it('throws when tag already exists', async () => {
    mockGet.mockResolvedValueOnce(ok(makeBackendPrefs({ tags: ['work'] })));
    await expect(service.addTag('conv-1', 'work')).rejects.toThrow();
  });

  it('adds tag to empty tags list', async () => {
    mockGet.mockResolvedValueOnce(ok(makeBackendPrefs({ tags: [] })));
    mockPut.mockResolvedValueOnce(ok(makeBackendPrefs({ tags: ['new'] })));
    await service.addTag('conv-1', 'new');
    const putCall = mockPut.mock.calls[0];
    expect(putCall[1].tags).toEqual(['new']);
  });
});

describe('removeTag', () => {
  it('removes the specified tag', async () => {
    mockGet.mockResolvedValueOnce(ok(makeBackendPrefs({ tags: ['work', 'urgent'] })));
    mockPut.mockResolvedValueOnce(ok(makeBackendPrefs({ tags: ['work'] })));
    await service.removeTag('conv-1', 'urgent');
    const putCall = mockPut.mock.calls[0];
    expect(putCall[1].tags).toEqual(['work']);
  });

  it('does nothing harmful when tag is not found', async () => {
    mockGet.mockResolvedValueOnce(ok(makeBackendPrefs({ tags: ['work'] })));
    mockPut.mockResolvedValueOnce(ok(makeBackendPrefs({ tags: ['work'] })));
    await service.removeTag('conv-1', 'nonexistent');
    const putCall = mockPut.mock.calls[0];
    expect(putCall[1].tags).toEqual(['work']);
  });
});

// ─── getCategories ────────────────────────────────────────────────────────────

describe('getCategories', () => {
  it('calls GET /me/preferences/categories', async () => {
    mockGet.mockResolvedValueOnce({ data: { success: true, data: [] } });
    await service.getCategories();
    expect(mockGet).toHaveBeenCalledWith('/me/preferences/categories');
  });

  it('returns empty array on error', async () => {
    mockGet.mockRejectedValueOnce(new Error('server error'));
    const result = await service.getCategories();
    expect(result).toEqual([]);
  });

  it('sorts categories by order field', async () => {
    mockGet.mockResolvedValueOnce({
      data: {
        success: true,
        data: [
          makeBackendCategory({ id: 'c2', order: 2 }),
          makeBackendCategory({ id: 'c1', order: 1 }),
        ],
      },
    });
    const result = await service.getCategories();
    expect(result[0].order).toBe(1);
    expect(result[1].order).toBe(2);
  });

  it('caches the result on second call', async () => {
    mockGet.mockResolvedValueOnce({ data: { success: true, data: [] } });
    await service.getCategories();
    await service.getCategories();
    expect(mockGet).toHaveBeenCalledTimes(1);
  });
});

// ─── reorderInCategory ────────────────────────────────────────────────────────

describe('reorderInCategory', () => {
  it('calls POST /api/user-preferences/reorder with updates', async () => {
    mockPost.mockResolvedValueOnce({});
    const updates = [{ conversationId: 'conv-1', orderInCategory: 0 }];
    await service.reorderInCategory(updates);
    expect(mockPost).toHaveBeenCalledWith('/api/user-preferences/reorder', { updates });
  });

  it('re-throws errors', async () => {
    mockPost.mockRejectedValueOnce(new Error('reorder failed'));
    await expect(service.reorderInCategory([])).rejects.toThrow('reorder failed');
  });
});
