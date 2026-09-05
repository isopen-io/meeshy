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

// #5299 — les témoins de `getShareLinks`/`createShareLink`/`deactivateShareLink`/
// `getShareLinkInfo`/`joinViaShareLink` sont retirés avec les méthodes : ils
// mockaient `apiService` en ENTIER et n'asseraient que « le mock a été appelé
// avec ce chemin » — un chemin qui n'a jamais existé côté passerelle. Aucun
// des cinq ne pouvait jamais tomber sur une route absente (§ CLAUDE.md « un
// témoin qui ne peut pas tomber n'est pas un témoin »).
