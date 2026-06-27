/**
 * Tests for lib/server-cache.ts
 */

// Mock React cache to be transparent (identity wrapper)
jest.mock('react', () => ({
  ...jest.requireActual('react'),
  cache: (fn: (...args: unknown[]) => unknown) => fn,
}));

jest.mock('@/lib/config', () => ({
  buildApiUrl: (endpoint: string) => `https://api.meeshy.me${endpoint}`,
}));

import {
  getDashboardData,
  getUserById,
  getConversationById,
  getConversationMessages,
  getGroups,
  getGroupById,
  getUserNotifications,
  getAvailableLanguages,
  revalidate,
} from '@/lib/server-cache';

function makeFetchResponse(data: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: jest.fn().mockResolvedValue(data),
  } as unknown as Response;
}

beforeEach(() => {
  global.fetch = jest.fn();
});

afterEach(() => {
  jest.resetAllMocks();
});

// ─── getDashboardData ─────────────────────────────────────────────────────────

describe('getDashboardData', () => {
  it('fetches the /dashboard endpoint', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(makeFetchResponse({ stats: {} }));
    await getDashboardData();
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.meeshy.me/dashboard',
      expect.objectContaining({ next: { revalidate: 60 } })
    );
  });

  it('returns parsed JSON on success', async () => {
    const payload = { stats: { totalUsers: 42 } };
    (global.fetch as jest.Mock).mockResolvedValue(makeFetchResponse(payload));
    const result = await getDashboardData();
    expect(result).toEqual(payload);
  });

  it('throws when response is not ok', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(makeFetchResponse(null, false, 500));
    await expect(getDashboardData()).rejects.toThrow('Failed to fetch dashboard data');
  });
});

// ─── getUserById ──────────────────────────────────────────────────────────────

describe('getUserById', () => {
  it('fetches /users/:id', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(makeFetchResponse({ id: 'u1' }));
    await getUserById('u1');
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.meeshy.me/users/u1',
      expect.objectContaining({ next: { revalidate: 300 } })
    );
  });

  it('returns parsed user data', async () => {
    const payload = { id: 'u1', username: 'alice' };
    (global.fetch as jest.Mock).mockResolvedValue(makeFetchResponse(payload));
    const result = await getUserById('u1');
    expect(result).toEqual(payload);
  });

  it('throws with user ID in message when response is not ok', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(makeFetchResponse(null, false, 404));
    await expect(getUserById('u1')).rejects.toThrow('Failed to fetch user u1');
  });
});

// ─── getConversationById ──────────────────────────────────────────────────────

describe('getConversationById', () => {
  it('fetches /conversations/:id', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(makeFetchResponse({ id: 'c1' }));
    await getConversationById('c1');
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.meeshy.me/conversations/c1',
      expect.objectContaining({ next: { revalidate: 30 } })
    );
  });

  it('returns parsed conversation data', async () => {
    const payload = { id: 'c1', title: 'General' };
    (global.fetch as jest.Mock).mockResolvedValue(makeFetchResponse(payload));
    expect(await getConversationById('c1')).toEqual(payload);
  });

  it('throws with conversation ID in message when response is not ok', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(makeFetchResponse(null, false, 403));
    await expect(getConversationById('c1')).rejects.toThrow('Failed to fetch conversation c1');
  });
});

// ─── getConversationMessages ──────────────────────────────────────────────────

describe('getConversationMessages', () => {
  it('fetches messages with default limit=50, offset=0', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(makeFetchResponse([]));
    await getConversationMessages('c1');
    const calledUrl = (global.fetch as jest.Mock).mock.calls[0][0] as string;
    expect(calledUrl).toContain('/conversations/c1/messages');
    expect(calledUrl).toContain('limit=50');
    expect(calledUrl).toContain('offset=0');
  });

  it('applies custom limit and offset', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(makeFetchResponse([]));
    await getConversationMessages('c1', { limit: 20, offset: 40 });
    const calledUrl = (global.fetch as jest.Mock).mock.calls[0][0] as string;
    expect(calledUrl).toContain('limit=20');
    expect(calledUrl).toContain('offset=40');
  });

  it('uses revalidate: 10', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(makeFetchResponse([]));
    await getConversationMessages('c1');
    expect(global.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ next: { revalidate: 10 } })
    );
  });

  it('returns parsed messages array', async () => {
    const msgs = [{ id: 'm1', content: 'hello' }];
    (global.fetch as jest.Mock).mockResolvedValue(makeFetchResponse(msgs));
    expect(await getConversationMessages('c1')).toEqual(msgs);
  });

  it('throws with conversation ID in message when not ok', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(makeFetchResponse(null, false, 500));
    await expect(getConversationMessages('c1')).rejects.toThrow(
      'Failed to fetch messages for conversation c1'
    );
  });
});

// ─── getGroups ────────────────────────────────────────────────────────────────

describe('getGroups', () => {
  it('fetches /groups', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(makeFetchResponse([]));
    await getGroups();
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.meeshy.me/groups',
      expect.objectContaining({ next: { revalidate: 60 } })
    );
  });

  it('returns group list on success', async () => {
    const groups = [{ id: 'g1', name: 'Devs' }];
    (global.fetch as jest.Mock).mockResolvedValue(makeFetchResponse(groups));
    expect(await getGroups()).toEqual(groups);
  });

  it('throws when response is not ok', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(makeFetchResponse(null, false, 500));
    await expect(getGroups()).rejects.toThrow('Failed to fetch groups');
  });
});

// ─── getGroupById ─────────────────────────────────────────────────────────────

describe('getGroupById', () => {
  it('fetches /groups/:id', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(makeFetchResponse({ id: 'g1' }));
    await getGroupById('g1');
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.meeshy.me/groups/g1',
      expect.objectContaining({ next: { revalidate: 60 } })
    );
  });

  it('returns group data', async () => {
    const group = { id: 'g1', name: 'Devs' };
    (global.fetch as jest.Mock).mockResolvedValue(makeFetchResponse(group));
    expect(await getGroupById('g1')).toEqual(group);
  });

  it('throws with group ID in message when not ok', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(makeFetchResponse(null, false, 404));
    await expect(getGroupById('g1')).rejects.toThrow('Failed to fetch group g1');
  });
});

// ─── getUserNotifications ─────────────────────────────────────────────────────

describe('getUserNotifications', () => {
  it('fetches /users/:id/notifications', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(makeFetchResponse([]));
    await getUserNotifications('u1');
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.meeshy.me/users/u1/notifications',
      expect.objectContaining({ next: { revalidate: 30 } })
    );
  });

  it('returns notifications array', async () => {
    const notifs = [{ id: 'n1', message: 'Hi' }];
    (global.fetch as jest.Mock).mockResolvedValue(makeFetchResponse(notifs));
    expect(await getUserNotifications('u1')).toEqual(notifs);
  });

  it('throws with user ID in message when not ok', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(makeFetchResponse(null, false, 404));
    await expect(getUserNotifications('u1')).rejects.toThrow(
      'Failed to fetch notifications for user u1'
    );
  });
});

// ─── getAvailableLanguages ────────────────────────────────────────────────────

describe('getAvailableLanguages', () => {
  it('fetches /languages', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(makeFetchResponse([]));
    await getAvailableLanguages();
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.meeshy.me/languages',
      expect.objectContaining({ next: { revalidate: 3600 } })
    );
  });

  it('returns language list', async () => {
    const langs = [{ code: 'fr', name: 'Français' }];
    (global.fetch as jest.Mock).mockResolvedValue(makeFetchResponse(langs));
    expect(await getAvailableLanguages()).toEqual(langs);
  });

  it('throws when response is not ok', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(makeFetchResponse(null, false, 503));
    await expect(getAvailableLanguages()).rejects.toThrow('Failed to fetch languages');
  });
});

// ─── revalidate helper ────────────────────────────────────────────────────────

describe('revalidate', () => {
  it('dashboard returns /dashboard path', () => {
    expect(revalidate.dashboard()).toBe('/dashboard');
  });

  it('user returns /users/:id path', () => {
    expect(revalidate.user('u1')).toBe('/users/u1');
  });

  it('conversation returns /conversations/:id path', () => {
    expect(revalidate.conversation('c1')).toBe('/conversations/c1');
  });

  it('group returns /groups/:id path', () => {
    expect(revalidate.group('g1')).toBe('/groups/g1');
  });
});
