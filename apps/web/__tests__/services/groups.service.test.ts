/**
 * Tests for services/groups.service.ts
 */

import { groupsService } from '@/services/groups.service';
import { apiService } from '@/services/api.service';

jest.mock('@/services/api.service', () => ({
  apiService: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
  },
}));

const mockApi = apiService as jest.Mocked<typeof apiService>;

const ok = <T>(data: T) => ({ success: true, data });

beforeEach(() => {
  jest.clearAllMocks();
});

// ─── read operations ───────────────────────────────────────────────────────────

describe('getGroups', () => {
  it('calls GET /communities without arguments', async () => {
    mockApi.get.mockResolvedValue(ok({ groups: [], total: 0, page: 1, limit: 10, totalPages: 0 }));
    await groupsService.getGroups();
    expect(mockApi.get).toHaveBeenCalledWith('/communities', undefined);
  });

  it('forwards filter parameters to the API', async () => {
    mockApi.get.mockResolvedValue(ok({ groups: [], total: 0, page: 1, limit: 5, totalPages: 0 }));
    const filters = { page: 1, limit: 5, search: 'test' };
    await groupsService.getGroups(filters);
    expect(mockApi.get).toHaveBeenCalledWith('/communities', filters);
  });
});

describe('getGroupById', () => {
  it('calls GET /communities/:id', async () => {
    mockApi.get.mockResolvedValue(ok({ id: 'g1' }));
    await groupsService.getGroupById('g1');
    expect(mockApi.get).toHaveBeenCalledWith('/communities/g1');
  });
});

describe('getGroupMembers', () => {
  it('calls GET /communities/:id/members', async () => {
    mockApi.get.mockResolvedValue(ok([]));
    await groupsService.getGroupMembers('g1');
    expect(mockApi.get).toHaveBeenCalledWith('/communities/g1/members');
  });
});

// ─── write operations ──────────────────────────────────────────────────────────

describe('createGroup', () => {
  it('calls POST /communities with the group data', async () => {
    mockApi.post.mockResolvedValue(ok({ id: 'g2' }));
    const dto = { name: 'Dev Team', isPrivate: false };
    await groupsService.createGroup(dto);
    expect(mockApi.post).toHaveBeenCalledWith('/communities', dto);
  });
});

describe('updateGroup', () => {
  it('calls PATCH /communities/:id with partial data', async () => {
    mockApi.patch.mockResolvedValue(ok({ id: 'g1' }));
    await groupsService.updateGroup('g1', { name: 'Renamed' });
    expect(mockApi.patch).toHaveBeenCalledWith('/communities/g1', { name: 'Renamed' });
  });
});

describe('deleteGroup', () => {
  it('calls DELETE /communities/:id', async () => {
    mockApi.delete.mockResolvedValue(ok(undefined));
    await groupsService.deleteGroup('g1');
    expect(mockApi.delete).toHaveBeenCalledWith('/communities/g1');
  });
});

describe('inviteMember', () => {
  it('calls POST /communities/:id/members', async () => {
    mockApi.post.mockResolvedValue(ok({ id: 'm1' }));
    await groupsService.inviteMember('g1', { userId: 'u1', role: 'MEMBER' });
    expect(mockApi.post).toHaveBeenCalledWith('/communities/g1/members', { userId: 'u1', role: 'MEMBER' });
  });
});

describe('updateMemberRole', () => {
  it('calls PATCH /communities/:id/members/:memberId', async () => {
    mockApi.patch.mockResolvedValue(ok({ id: 'm1' }));
    await groupsService.updateMemberRole('g1', 'm1', 'ADMIN');
    expect(mockApi.patch).toHaveBeenCalledWith('/communities/g1/members/m1', { role: 'ADMIN' });
  });
});

describe('removeMember', () => {
  it('calls DELETE /communities/:id/members/:memberId', async () => {
    mockApi.delete.mockResolvedValue(ok(undefined));
    await groupsService.removeMember('g1', 'm1');
    expect(mockApi.delete).toHaveBeenCalledWith('/communities/g1/members/m1');
  });
});

describe('leaveGroup', () => {
  it('calls POST /communities/:id/leave', async () => {
    mockApi.post.mockResolvedValue(ok(undefined));
    await groupsService.leaveGroup('g1');
    expect(mockApi.post).toHaveBeenCalledWith('/communities/g1/leave');
  });
});

describe('joinGroup', () => {
  it('calls POST /communities/:id/join', async () => {
    mockApi.post.mockResolvedValue(ok({ id: 'm2' }));
    await groupsService.joinGroup('g1');
    expect(mockApi.post).toHaveBeenCalledWith('/communities/g1/join');
  });
});

describe('generateInviteLink', () => {
  it('calls POST /communities/:id/invite-link with default expiry', async () => {
    mockApi.post.mockResolvedValue(ok({ link: 'http://...', expiresAt: new Date() }));
    await groupsService.generateInviteLink('g1');
    const [endpoint, body] = mockApi.post.mock.calls[0];
    expect(endpoint).toBe('/communities/g1/invite-link');
    expect(typeof (body as any).expiresIn).toBe('number');
  });

  it('passes a custom expiry when provided', async () => {
    mockApi.post.mockResolvedValue(ok({ link: 'http://...', expiresAt: new Date() }));
    await groupsService.generateInviteLink('g1', 3600);
    const [, body] = mockApi.post.mock.calls[0];
    expect((body as any).expiresIn).toBe(3600);
  });
});

describe('joinGroupByInvite', () => {
  it('calls POST /communities/join-by-invite with the invite code', async () => {
    mockApi.post.mockResolvedValue(ok({ group: {}, member: {} }));
    await groupsService.joinGroupByInvite('abc123');
    expect(mockApi.post).toHaveBeenCalledWith('/communities/join-by-invite', { inviteCode: 'abc123' });
  });
});

// ─── searchUsers ──────────────────────────────────────────────────────────────

describe('searchUsers', () => {
  it('returns empty array without API call when query is empty', async () => {
    const result = await groupsService.searchUsers('');
    expect(result.data).toEqual([]);
    expect(result.success).toBe(true);
    expect(mockApi.get).not.toHaveBeenCalled();
  });

  it('returns empty array without API call when query has only 1 character', async () => {
    const result = await groupsService.searchUsers('a');
    expect(result.data).toEqual([]);
    expect(mockApi.get).not.toHaveBeenCalled();
  });

  it('returns empty array without API call when query is whitespace only', async () => {
    const result = await groupsService.searchUsers('  ');
    expect(result.data).toEqual([]);
    expect(mockApi.get).not.toHaveBeenCalled();
  });

  it('calls GET /users/search when query has 2+ characters', async () => {
    mockApi.get.mockResolvedValue(ok([]));
    await groupsService.searchUsers('al');
    expect(mockApi.get).toHaveBeenCalledWith('/users/search', expect.objectContaining({ search: 'al' }));
  });

  it('trims the search query before validation', async () => {
    mockApi.get.mockResolvedValue(ok([]));
    await groupsService.searchUsers('  alice  ');
    expect(mockApi.get).toHaveBeenCalledWith('/users/search', expect.objectContaining({ search: 'alice' }));
  });

  it('includes excludeGroup param when excludeGroupId is provided', async () => {
    mockApi.get.mockResolvedValue(ok([]));
    await groupsService.searchUsers('alice', 'g1');
    expect(mockApi.get).toHaveBeenCalledWith('/users/search', expect.objectContaining({ excludeGroup: 'g1' }));
  });

  it('does not include excludeGroup param when excludeGroupId is absent', async () => {
    mockApi.get.mockResolvedValue(ok([]));
    await groupsService.searchUsers('alice');
    const [, params] = mockApi.get.mock.calls[0];
    expect((params as any).excludeGroup).toBeUndefined();
  });
});
