// Mock apiService BEFORE importing adminService
const mockGet = jest.fn();
const mockPost = jest.fn();
const mockPatch = jest.fn();
const mockPut = jest.fn();
const mockDelete = jest.fn();

jest.mock('@/services/api.service', () => ({
  apiService: {
    get: (...args: any[]) => mockGet(...args),
    post: (...args: any[]) => mockPost(...args),
    patch: (...args: any[]) => mockPatch(...args),
    put: (...args: any[]) => mockPut(...args),
    delete: (...args: any[]) => mockDelete(...args),
  },
}));

jest.spyOn(console, 'error').mockImplementation(() => {});

import { adminService } from '@/services/admin.service';

const mockDashboard = { statistics: {}, recentActivity: {}, userPermissions: null, timestamp: '2026-01-01' };
const mockUser = { id: 'u1', username: 'alice' };
const mockUsers = { users: [mockUser], pagination: { offset: 0, limit: 20, total: 1, hasMore: false } };
const mockAnons = { anonymousUsers: [], pagination: { offset: 0, limit: 20, total: 0, hasMore: false } };

describe('adminService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getDashboardStats', () => {
    it('calls GET /admin/dashboard', async () => {
      mockGet.mockResolvedValue({ success: true, data: mockDashboard });
      await adminService.getDashboardStats();
      expect(mockGet).toHaveBeenCalledWith('/admin/dashboard');
    });

    it('returns the API response', async () => {
      mockGet.mockResolvedValue({ success: true, data: mockDashboard });
      const result = await adminService.getDashboardStats();
      expect(result.data).toEqual(mockDashboard);
    });

    it('re-throws on error', async () => {
      mockGet.mockRejectedValue(new Error('network error'));
      await expect(adminService.getDashboardStats()).rejects.toThrow('network error');
    });
  });

  describe('getUsers', () => {
    it('calls GET /admin/users with offset and limit', async () => {
      mockGet.mockResolvedValue({ success: true, data: mockUsers });
      await adminService.getUsers(10, 5);
      expect(mockGet).toHaveBeenCalledWith('/admin/users', expect.objectContaining({ offset: 10, limit: 5 }));
    });

    it('uses default offset=0 and limit=20', async () => {
      mockGet.mockResolvedValue({ success: true, data: mockUsers });
      await adminService.getUsers();
      expect(mockGet).toHaveBeenCalledWith('/admin/users', expect.objectContaining({ offset: 0, limit: 20 }));
    });

    it('includes search param when provided', async () => {
      mockGet.mockResolvedValue({ success: true, data: mockUsers });
      await adminService.getUsers(0, 20, 'alice');
      expect(mockGet).toHaveBeenCalledWith('/admin/users', expect.objectContaining({ search: 'alice' }));
    });

    it('omits search param when not provided', async () => {
      mockGet.mockResolvedValue({ success: true, data: mockUsers });
      await adminService.getUsers(0, 20);
      const params = mockGet.mock.calls[0][1];
      expect(params).not.toHaveProperty('search');
    });

    it('includes role and status when provided', async () => {
      mockGet.mockResolvedValue({ success: true, data: mockUsers });
      await adminService.getUsers(0, 20, undefined, 'ADMIN', 'active');
      const params = mockGet.mock.calls[0][1];
      expect(params).toMatchObject({ role: 'ADMIN', status: 'active' });
    });

    it('re-throws on error', async () => {
      mockGet.mockRejectedValue(new Error('server error'));
      await expect(adminService.getUsers()).rejects.toThrow('server error');
    });
  });

  describe('updateUserRole', () => {
    it('calls PATCH /admin/users/:id/role with the role', async () => {
      mockPatch.mockResolvedValue({ success: true, data: mockUser });
      await adminService.updateUserRole('u1', 'ADMIN');
      expect(mockPatch).toHaveBeenCalledWith('/admin/users/u1/role', { role: 'ADMIN' });
    });

    it('re-throws on error', async () => {
      mockPatch.mockRejectedValue(new Error('forbidden'));
      await expect(adminService.updateUserRole('u1', 'ADMIN')).rejects.toThrow('forbidden');
    });
  });

  describe('toggleUserStatus', () => {
    it('calls PATCH /admin/users/:id/status with isActive', async () => {
      mockPatch.mockResolvedValue({ success: true, data: mockUser });
      await adminService.toggleUserStatus('u1', false);
      expect(mockPatch).toHaveBeenCalledWith('/admin/users/u1/status', { isActive: false });
    });

    it('re-throws on error', async () => {
      mockPatch.mockRejectedValue(new Error('conflict'));
      await expect(adminService.toggleUserStatus('u1', true)).rejects.toThrow('conflict');
    });
  });

  describe('deleteUser', () => {
    it('calls DELETE /admin/users/:id', async () => {
      mockDelete.mockResolvedValue({ success: true });
      await adminService.deleteUser('u1');
      expect(mockDelete).toHaveBeenCalledWith('/admin/users/u1');
    });

    it('re-throws on error', async () => {
      mockDelete.mockRejectedValue(new Error('not found'));
      await expect(adminService.deleteUser('u1')).rejects.toThrow('not found');
    });
  });

  describe('getAnonymousUsers', () => {
    it('calls GET /admin/anonymous-users with offset and limit', async () => {
      mockGet.mockResolvedValue({ success: true, data: mockAnons });
      await adminService.getAnonymousUsers(5, 10);
      expect(mockGet).toHaveBeenCalledWith('/admin/anonymous-users', expect.objectContaining({ offset: 5, limit: 10 }));
    });

    it('includes search and status when provided', async () => {
      mockGet.mockResolvedValue({ success: true, data: mockAnons });
      await adminService.getAnonymousUsers(0, 20, 'bob', 'active');
      const params = mockGet.mock.calls[0][1];
      expect(params).toMatchObject({ search: 'bob', status: 'active' });
    });

    it('omits optional params when not provided', async () => {
      mockGet.mockResolvedValue({ success: true, data: mockAnons });
      await adminService.getAnonymousUsers();
      const params = mockGet.mock.calls[0][1];
      expect(params).not.toHaveProperty('search');
      expect(params).not.toHaveProperty('status');
    });

    it('re-throws on error', async () => {
      mockGet.mockRejectedValue(new Error('anon error'));
      await expect(adminService.getAnonymousUsers()).rejects.toThrow('anon error');
    });
  });

  describe('getMessages', () => {
    it('calls GET /admin/messages with offset and limit', async () => {
      mockGet.mockResolvedValue({ success: true, data: {} });
      await adminService.getMessages(0, 10);
      expect(mockGet).toHaveBeenCalledWith('/admin/messages', expect.objectContaining({ offset: 0, limit: 10 }));
    });

    it('includes optional search, type, period when provided', async () => {
      mockGet.mockResolvedValue({ success: true, data: {} });
      await adminService.getMessages(0, 20, 'hello', 'text', 'week');
      const params = mockGet.mock.calls[0][1];
      expect(params).toMatchObject({ search: 'hello', type: 'text', period: 'week' });
    });

    it('re-throws on error', async () => {
      mockGet.mockRejectedValue(new Error('msg error'));
      await expect(adminService.getMessages()).rejects.toThrow('msg error');
    });
  });

  describe('getCommunities', () => {
    it('calls GET /admin/communities with offset and limit', async () => {
      mockGet.mockResolvedValue({ success: true, data: {} });
      await adminService.getCommunities(0, 20);
      expect(mockGet).toHaveBeenCalledWith('/admin/communities', expect.objectContaining({ offset: 0, limit: 20 }));
    });

    it('serializes isPrivate to a string in params', async () => {
      mockGet.mockResolvedValue({ success: true, data: {} });
      await adminService.getCommunities(0, 20, undefined, true);
      const params = mockGet.mock.calls[0][1];
      expect(params.isPrivate).toBe('true');
    });

    it('includes search when provided', async () => {
      mockGet.mockResolvedValue({ success: true, data: {} });
      await adminService.getCommunities(0, 20, 'sports');
      const params = mockGet.mock.calls[0][1];
      expect(params.search).toBe('sports');
    });

    it('omits isPrivate param when undefined', async () => {
      mockGet.mockResolvedValue({ success: true, data: {} });
      await adminService.getCommunities();
      const params = mockGet.mock.calls[0][1];
      expect(params).not.toHaveProperty('isPrivate');
    });

    it('re-throws on error', async () => {
      mockGet.mockRejectedValue(new Error('community error'));
      await expect(adminService.getCommunities()).rejects.toThrow('community error');
    });
  });

  describe('getRankings', () => {
    it('calls GET /admin/ranking with all required params as strings', async () => {
      mockGet.mockResolvedValue({ success: true, data: {} });
      await adminService.getRankings('user', 'messages', 'week', 25);
      expect(mockGet).toHaveBeenCalledWith('/admin/ranking', {
        entityType: 'user',
        criterion: 'messages',
        period: 'week',
        limit: '25',
      });
    });

    it('uses default limit of 50 when not specified', async () => {
      mockGet.mockResolvedValue({ success: true, data: {} });
      await adminService.getRankings('user', 'messages', 'week');
      const params = mockGet.mock.calls[0][1];
      expect(params.limit).toBe('50');
    });

    it('re-throws on error', async () => {
      mockGet.mockRejectedValue(new Error('ranking error'));
      await expect(adminService.getRankings('user', 'msg', 'week')).rejects.toThrow('ranking error');
    });
  });

  describe('Broadcasts CRUD', () => {
    it('getBroadcasts calls GET /admin/broadcasts with pagination', async () => {
      mockGet.mockResolvedValue({ success: true, data: {} });
      await adminService.getBroadcasts(0, 10);
      expect(mockGet).toHaveBeenCalledWith('/admin/broadcasts', expect.objectContaining({ offset: 0, limit: 10 }));
    });

    it('getBroadcasts includes status when provided', async () => {
      mockGet.mockResolvedValue({ success: true, data: {} });
      await adminService.getBroadcasts(0, 20, 'sent');
      const params = mockGet.mock.calls[0][1];
      expect(params.status).toBe('sent');
    });

    it('getBroadcasts re-throws on error', async () => {
      mockGet.mockRejectedValue(new Error('list error'));
      await expect(adminService.getBroadcasts()).rejects.toThrow('list error');
    });

    it('getBroadcast calls GET /admin/broadcasts/:id', async () => {
      mockGet.mockResolvedValue({ success: true, data: {} });
      await adminService.getBroadcast('bc1');
      expect(mockGet).toHaveBeenCalledWith('/admin/broadcasts/bc1');
    });

    it('getBroadcast re-throws on error', async () => {
      mockGet.mockRejectedValue(new Error('get error'));
      await expect(adminService.getBroadcast('bc1')).rejects.toThrow('get error');
    });

    it('createBroadcast calls POST /admin/broadcasts with data', async () => {
      mockPost.mockResolvedValue({ success: true, data: {} });
      const data = { name: 'N', subject: 'S', body: 'B', sourceLanguage: 'en', targeting: {} };
      await adminService.createBroadcast(data);
      expect(mockPost).toHaveBeenCalledWith('/admin/broadcasts', data);
    });

    it('createBroadcast re-throws on error', async () => {
      mockPost.mockRejectedValue(new Error('create error'));
      await expect(adminService.createBroadcast({ name: 'N', subject: 'S', body: 'B', sourceLanguage: 'en', targeting: {} })).rejects.toThrow('create error');
    });

    it('updateBroadcast calls PUT /admin/broadcasts/:id', async () => {
      mockPut.mockResolvedValue({ success: true, data: {} });
      await adminService.updateBroadcast('bc1', { subject: 'Updated' });
      expect(mockPut).toHaveBeenCalledWith('/admin/broadcasts/bc1', { subject: 'Updated' });
    });

    it('updateBroadcast re-throws on error', async () => {
      mockPut.mockRejectedValue(new Error('update error'));
      await expect(adminService.updateBroadcast('bc1', {})).rejects.toThrow('update error');
    });

    it('previewBroadcast calls POST /admin/broadcasts/:id/preview', async () => {
      mockPost.mockResolvedValue({ success: true, data: {} });
      await adminService.previewBroadcast('bc1');
      expect(mockPost).toHaveBeenCalledWith('/admin/broadcasts/bc1/preview', {});
    });

    it('previewBroadcast re-throws on error', async () => {
      mockPost.mockRejectedValue(new Error('preview error'));
      await expect(adminService.previewBroadcast('bc1')).rejects.toThrow('preview error');
    });

    it('sendBroadcast calls POST /admin/broadcasts/:id/send', async () => {
      mockPost.mockResolvedValue({ success: true, data: {} });
      await adminService.sendBroadcast('bc1');
      expect(mockPost).toHaveBeenCalledWith('/admin/broadcasts/bc1/send', {});
    });

    it('sendBroadcast re-throws on error', async () => {
      mockPost.mockRejectedValue(new Error('send error'));
      await expect(adminService.sendBroadcast('bc1')).rejects.toThrow('send error');
    });

    it('deleteBroadcast calls DELETE /admin/broadcasts/:id', async () => {
      mockDelete.mockResolvedValue({ success: true });
      await adminService.deleteBroadcast('bc1');
      expect(mockDelete).toHaveBeenCalledWith('/admin/broadcasts/bc1');
    });

    it('deleteBroadcast re-throws on error', async () => {
      mockDelete.mockRejectedValue(new Error('delete error'));
      await expect(adminService.deleteBroadcast('bc1')).rejects.toThrow('delete error');
    });
  });

  describe('getTranslations', () => {
    it('calls GET /admin/translations with offset and limit', async () => {
      mockGet.mockResolvedValue({ success: true, data: {} });
      await adminService.getTranslations(0, 10);
      expect(mockGet).toHaveBeenCalledWith('/admin/translations', expect.objectContaining({ offset: 0, limit: 10 }));
    });

    it('includes optional language and period params', async () => {
      mockGet.mockResolvedValue({ success: true, data: {} });
      await adminService.getTranslations(0, 20, 'fr', 'en', 'day');
      const params = mockGet.mock.calls[0][1];
      expect(params).toMatchObject({ sourceLanguage: 'fr', targetLanguage: 'en', period: 'day' });
    });

    it('re-throws on error', async () => {
      mockGet.mockRejectedValue(new Error('translation error'));
      await expect(adminService.getTranslations()).rejects.toThrow('translation error');
    });
  });

  describe('getShareLinks', () => {
    it('calls GET /admin/share-links with offset and limit', async () => {
      mockGet.mockResolvedValue({ success: true, data: {} });
      await adminService.getShareLinks(0, 20);
      expect(mockGet).toHaveBeenCalledWith('/admin/share-links', expect.objectContaining({ offset: 0, limit: 20 }));
    });

    it('serializes isActive to a string in params', async () => {
      mockGet.mockResolvedValue({ success: true, data: {} });
      await adminService.getShareLinks(0, 20, undefined, false);
      const params = mockGet.mock.calls[0][1];
      expect(params.isActive).toBe('false');
    });

    it('includes search when provided', async () => {
      mockGet.mockResolvedValue({ success: true, data: {} });
      await adminService.getShareLinks(0, 20, 'my-link');
      const params = mockGet.mock.calls[0][1];
      expect(params.search).toBe('my-link');
    });

    it('omits isActive when not provided', async () => {
      mockGet.mockResolvedValue({ success: true, data: {} });
      await adminService.getShareLinks();
      const params = mockGet.mock.calls[0][1];
      expect(params).not.toHaveProperty('isActive');
    });

    it('re-throws on error', async () => {
      mockGet.mockRejectedValue(new Error('share-link error'));
      await expect(adminService.getShareLinks()).rejects.toThrow('share-link error');
    });
  });
});
