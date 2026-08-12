jest.mock('@/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('@/services/api.service', () => ({
  apiService: { get: jest.fn(), post: jest.fn(), patch: jest.fn() },
}));

import { dashboardService } from '@/services/dashboard.service';
import { apiService } from '@/services/api.service';

const mockApi = apiService as jest.Mocked<typeof apiService>;

function makeStats(overrides: Record<string, unknown> = {}) {
  return {
    totalConversations: 5,
    totalCommunities: 2,
    totalMessages: 100,
    activeConversations: 3,
    translationsToday: 10,
    totalLinks: 1,
    lastUpdated: new Date().toISOString(),
    ...overrides,
  };
}

function makeShareLink(overrides: Record<string, unknown> = {}) {
  return {
    id: 'link-1',
    linkId: 'abc123',
    conversationId: 'conv-1',
    conversation: { id: 'conv-1', type: 'GROUP' },
    isActive: true,
    currentUses: 0,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

beforeEach(() => jest.clearAllMocks());

// ─── getDashboardData ─────────────────────────────────────────────────────────

describe('dashboardService.getDashboardData', () => {
  it('returns data when API responds with valid shape', async () => {
    const data = {
      stats: makeStats(),
      recentConversations: [],
      recentCommunities: [],
    };
    mockApi.get.mockResolvedValue({ data: { success: true, data } } as any);

    const result = await dashboardService.getDashboardData();

    expect(mockApi.get).toHaveBeenCalledWith('/users/me/dashboard-stats');
    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({ stats: data.stats });
  });

  it('migrates totalGroups → totalCommunities when backend returns legacy field', async () => {
    const stats = makeStats({ totalGroups: 7, totalCommunities: undefined });
    const data = { stats, recentConversations: [], recentCommunities: [] };
    mockApi.get.mockResolvedValue({ data: { success: true, data } } as any);

    const result = await dashboardService.getDashboardData();

    expect(result.data!.stats.totalCommunities).toBe(7);
    expect((result.data!.stats as any).totalGroups).toBeUndefined();
  });

  it('does not overwrite totalCommunities when it is already set', async () => {
    const stats = makeStats({ totalGroups: 7, totalCommunities: 3 });
    const data = { stats, recentConversations: [], recentCommunities: [] };
    mockApi.get.mockResolvedValue({ data: { success: true, data } } as any);

    const result = await dashboardService.getDashboardData();

    expect(result.data!.stats.totalCommunities).toBe(3);
  });

  it('migrates recentGroups → recentCommunities when backend returns legacy field', async () => {
    const communities = [{ id: 'c1', name: 'Community 1', members: [], memberCount: 5 }];
    const data = { stats: makeStats(), recentConversations: [], recentGroups: communities };
    mockApi.get.mockResolvedValue({ data: { success: true, data } } as any);

    const result = await dashboardService.getDashboardData();

    expect(result.data!.recentCommunities).toEqual(communities);
    expect((result.data as any).recentGroups).toBeUndefined();
  });

  it('throws when the API call fails', async () => {
    mockApi.get.mockRejectedValue(new Error('network down'));

    await expect(dashboardService.getDashboardData()).rejects.toThrow('network down');
  });
});

// ─── getShareLinks ────────────────────────────────────────────────────────────

describe('dashboardService.getShareLinks', () => {
  it('returns share links array on success', async () => {
    const links = [makeShareLink()];
    mockApi.get.mockResolvedValue({ data: { success: true, data: links }, message: 'ok' } as any);

    const result = await dashboardService.getShareLinks();

    expect(mockApi.get).toHaveBeenCalledWith('/share-links');
    expect(result.success).toBe(true);
    expect(result.data).toEqual(links);
  });

  it('throws when API fails', async () => {
    mockApi.get.mockRejectedValue(new Error('forbidden'));

    await expect(dashboardService.getShareLinks()).rejects.toThrow('forbidden');
  });
});

// ─── createShareLink ──────────────────────────────────────────────────────────

describe('dashboardService.createShareLink', () => {
  it('POSTs and returns new share link', async () => {
    const link = makeShareLink();
    mockApi.post.mockResolvedValue({ data: { success: true, data: link }, message: 'created' } as any);

    const result = await dashboardService.createShareLink({
      conversationId: 'conv-1',
      name: 'My Link',
      maxUses: 10,
    });

    expect(mockApi.post).toHaveBeenCalledWith('/share-links', {
      conversationId: 'conv-1',
      name: 'My Link',
      maxUses: 10,
    });
    expect(result.success).toBe(true);
    expect(result.data).toEqual(link);
  });

  it('throws when API fails', async () => {
    mockApi.post.mockRejectedValue(new Error('conflict'));

    await expect(dashboardService.createShareLink({ conversationId: 'c1' })).rejects.toThrow('conflict');
  });
});

// ─── deactivateShareLink ──────────────────────────────────────────────────────

describe('dashboardService.deactivateShareLink', () => {
  it('PATCHes deactivate endpoint and returns response', async () => {
    const response = { success: true };
    mockApi.patch.mockResolvedValue(response as any);

    const result = await dashboardService.deactivateShareLink('link-42');

    expect(mockApi.patch).toHaveBeenCalledWith('/share-links/link-42/deactivate');
    expect(result).toEqual(response);
  });

  it('throws when API fails', async () => {
    mockApi.patch.mockRejectedValue(new Error('not found'));

    await expect(dashboardService.deactivateShareLink('x')).rejects.toThrow('not found');
  });
});

// ─── getShareLinkInfo ─────────────────────────────────────────────────────────

describe('dashboardService.getShareLinkInfo', () => {
  it('returns link info for the given linkId', async () => {
    const link = makeShareLink({ linkId: 'xyz' });
    mockApi.get.mockResolvedValue(link as any);

    const result = await dashboardService.getShareLinkInfo('xyz');

    expect(mockApi.get).toHaveBeenCalledWith('/share-links/xyz');
    expect(result).toEqual(link);
  });

  it('throws when API fails', async () => {
    mockApi.get.mockRejectedValue(new Error('expired'));

    await expect(dashboardService.getShareLinkInfo('xyz')).rejects.toThrow('expired');
  });
});

// ─── joinViaShareLink ─────────────────────────────────────────────────────────

describe('dashboardService.joinViaShareLink', () => {
  it('POSTs to join endpoint and returns conversation + message', async () => {
    const response = {
      success: true,
      data: { conversation: { id: 'conv-1' }, message: 'Joined!' },
    };
    mockApi.post.mockResolvedValue(response as any);

    const result = await dashboardService.joinViaShareLink('link-abc');

    expect(mockApi.post).toHaveBeenCalledWith('/share-links/link-abc/join');
    expect(result).toEqual(response);
  });

  it('throws when API fails', async () => {
    mockApi.post.mockRejectedValue(new Error('max uses reached'));

    await expect(dashboardService.joinViaShareLink('link-abc')).rejects.toThrow('max uses reached');
  });
});
