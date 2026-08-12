/**
 * Tests for ConversationsCrudService
 *
 * Tests all CRUD operations: getConversations (pagination, filters, cursor),
 * getConversation, createConversation, updateConversation, deleteConversation,
 * getEncryptionStatus, enableEncryption, searchConversations, getConversationsWithUser.
 */

import { ConversationsCrudService } from '@/services/conversations/crud.service';
import { apiService } from '@/services/api.service';
import { transformersService } from '@/services/conversations/transformers.service';
import type { Conversation } from '@meeshy/shared/types';

jest.mock('@/services/api.service', () => ({
  apiService: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
  },
}));

jest.mock('@/services/conversations/transformers.service', () => ({
  transformersService: {
    transformConversationData: jest.fn((data: unknown) => data as Conversation),
  },
}));

const mockApi = apiService as jest.Mocked<typeof apiService>;
const mockTransformers = transformersService as jest.Mocked<typeof transformersService>;

// ─── Factories ─────────────────────────────────────────────────────────────

const makeConversation = (id = 'conv-1'): Conversation =>
  ({ id, title: `Conversation ${id}`, type: 'group' } as unknown as Conversation);

const makeApiGetConvResponse = (
  conversations: unknown[],
  pagination?: object,
  cursorPagination?: object,
) => ({
  data: {
    success: true,
    data: conversations,
    ...(pagination ? { pagination } : {}),
    ...(cursorPagination ? { cursorPagination } : {}),
  },
});

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('ConversationsCrudService', () => {
  let svc: ConversationsCrudService;

  beforeEach(() => {
    jest.resetAllMocks();
    svc = new ConversationsCrudService();
    mockTransformers.transformConversationData.mockImplementation(
      (data: unknown) => data as Conversation,
    );
  });

  // ── getConversations ──────────────────────────────────────────────────────

  describe('getConversations', () => {
    it('returns conversations with pagination from API response', async () => {
      const rawConvs = [{ id: 'c1' }, { id: 'c2' }];
      const pagination = { limit: 20, offset: 0, total: 2, hasMore: false };
      mockApi.get.mockResolvedValue(makeApiGetConvResponse(rawConvs, pagination) as any);

      const result = await svc.getConversations();

      expect(mockApi.get).toHaveBeenCalledWith('/conversations', expect.objectContaining({ limit: '20' }));
      expect(result.conversations).toHaveLength(2);
      expect(result.pagination).toEqual(pagination);
    });

    it('builds query params with offset by default', async () => {
      mockApi.get.mockResolvedValue(makeApiGetConvResponse([], { limit: 20, offset: 5, total: 0, hasMore: false }) as any);

      await svc.getConversations({ limit: 10, offset: 5 });

      expect(mockApi.get).toHaveBeenCalledWith(
        '/conversations',
        expect.objectContaining({ limit: '10', offset: '5' }),
      );
    });

    it('uses before cursor instead of offset when provided', async () => {
      mockApi.get.mockResolvedValue(makeApiGetConvResponse([]) as any);

      await svc.getConversations({ before: 'cursor-abc' });

      const [, params] = mockApi.get.mock.calls[0];
      expect(params).toHaveProperty('before', 'cursor-abc');
      expect(params).not.toHaveProperty('offset');
    });

    it('includes type filter when provided', async () => {
      mockApi.get.mockResolvedValue(makeApiGetConvResponse([]) as any);

      await svc.getConversations({ type: 'direct' });

      expect(mockApi.get).toHaveBeenCalledWith(
        '/conversations',
        expect.objectContaining({ type: 'direct' }),
      );
    });

    it('includes withUserId filter when provided', async () => {
      mockApi.get.mockResolvedValue(makeApiGetConvResponse([]) as any);

      await svc.getConversations({ withUserId: 'user-42' });

      expect(mockApi.get).toHaveBeenCalledWith(
        '/conversations',
        expect.objectContaining({ withUserId: 'user-42' }),
      );
    });

    it('falls back to conservative pagination when backend omits it', async () => {
      const rawConvs = Array.from({ length: 20 }, (_, i) => ({ id: `c${i}` }));
      mockApi.get.mockResolvedValue(makeApiGetConvResponse(rawConvs) as any);

      const result = await svc.getConversations({ limit: 20 });

      // full page ⇒ hasMore = true (conservative fallback)
      expect(result.pagination.hasMore).toBe(true);
      expect(result.pagination.total).toBe(20);
    });

    it('hasMore is false when page is partial (below limit)', async () => {
      const rawConvs = [{ id: 'c1' }];
      mockApi.get.mockResolvedValue(makeApiGetConvResponse(rawConvs) as any);

      const result = await svc.getConversations({ limit: 20 });
      expect(result.pagination.hasMore).toBe(false);
    });

    it('passes cursorPagination through', async () => {
      const cursorPagination = { hasNextPage: true, nextCursor: 'cursor-next', total: 100 };
      mockApi.get.mockResolvedValue(
        makeApiGetConvResponse([{ id: 'c1' }], { limit: 20, offset: 0, total: 100, hasMore: true }, cursorPagination) as any,
      );

      const result = await svc.getConversations();
      expect(result.cursorPagination).toEqual(cursorPagination);
    });

    it('throws when API returns success=false', async () => {
      mockApi.get.mockResolvedValue({ data: { success: false, data: null } } as any);

      await expect(svc.getConversations()).rejects.toThrow('Format de réponse invalide');
    });

    it('throws when data is not an array', async () => {
      mockApi.get.mockResolvedValue({ data: { success: true, data: 'bad' } } as any);

      await expect(svc.getConversations()).rejects.toThrow('Format de réponse invalide');
    });

    it('calls transformConversationData for each returned item', async () => {
      const rawConvs = [{ id: 'c1' }, { id: 'c2' }];
      mockApi.get.mockResolvedValue(makeApiGetConvResponse(rawConvs, { limit: 20, offset: 0, total: 2, hasMore: false }) as any);

      await svc.getConversations();

      expect(mockTransformers.transformConversationData).toHaveBeenCalledTimes(2);
    });
  });

  // ── getConversation ───────────────────────────────────────────────────────

  describe('getConversation', () => {
    it('returns transformed conversation on success', async () => {
      const rawConv = { id: 'conv-42' };
      mockApi.get.mockResolvedValue({ data: { success: true, data: rawConv } } as any);
      mockTransformers.transformConversationData.mockReturnValue(makeConversation('conv-42'));

      const result = await svc.getConversation('conv-42');

      expect(mockApi.get).toHaveBeenCalledWith('/conversations/conv-42');
      expect(result.id).toBe('conv-42');
    });

    it('throws when success=false', async () => {
      mockApi.get.mockResolvedValue({ data: { success: false, data: null } } as any);

      await expect(svc.getConversation('conv-42')).rejects.toThrow('Conversation non trouvée');
    });

    it('throws when data is falsy', async () => {
      mockApi.get.mockResolvedValue({ data: { success: true, data: null } } as any);

      await expect(svc.getConversation('conv-42')).rejects.toThrow('Conversation non trouvée');
    });
  });

  // ── createConversation ────────────────────────────────────────────────────

  describe('createConversation', () => {
    const createRequest = { type: 'group' as const, title: 'New Group' };

    it('returns the created conversation', async () => {
      const rawConv = { id: 'new-conv' };
      mockApi.post.mockResolvedValue({ data: { success: true, data: rawConv } } as any);
      mockTransformers.transformConversationData.mockReturnValue(makeConversation('new-conv'));

      const result = await svc.createConversation(createRequest);

      expect(mockApi.post).toHaveBeenCalledWith('/conversations', createRequest);
      expect(result.id).toBe('new-conv');
    });

    it('throws when response has no data', async () => {
      mockApi.post.mockResolvedValue({ data: { data: null } } as any);

      await expect(svc.createConversation(createRequest)).rejects.toThrow(
        "Erreur lors de la création de la conversation",
      );
    });
  });

  // ── updateConversation ────────────────────────────────────────────────────

  describe('updateConversation', () => {
    it('returns updated conversation data directly', async () => {
      const updated = makeConversation('conv-1');
      mockApi.patch.mockResolvedValue({ data: updated } as any);

      const result = await svc.updateConversation('conv-1', { title: 'Updated' });

      expect(mockApi.patch).toHaveBeenCalledWith('/conversations/conv-1', { title: 'Updated' });
      expect(result).toBe(updated);
    });

    it('throws when response is empty', async () => {
      mockApi.patch.mockResolvedValue({ data: null } as any);

      await expect(svc.updateConversation('conv-1', {})).rejects.toThrow(
        'Erreur lors de la mise à jour de la conversation',
      );
    });
  });

  // ── deleteConversation ────────────────────────────────────────────────────

  describe('deleteConversation', () => {
    it('calls the delete API endpoint', async () => {
      mockApi.delete.mockResolvedValue({} as any);

      await svc.deleteConversation('conv-1');

      expect(mockApi.delete).toHaveBeenCalledWith('/conversations/conv-1');
    });
  });

  // ── getEncryptionStatus ───────────────────────────────────────────────────

  describe('getEncryptionStatus', () => {
    it('returns encryption status data', async () => {
      const status = { isEncrypted: true, mode: 'e2ee', enabledAt: '2026-01-01', enabledBy: 'user-1', canTranslate: false };
      mockApi.get.mockResolvedValue({ data: status } as any);

      const result = await svc.getEncryptionStatus('conv-1');

      expect(mockApi.get).toHaveBeenCalledWith('/conversations/conv-1/encryption-status');
      expect(result).toBe(status);
    });

    it('throws when response has no data', async () => {
      mockApi.get.mockResolvedValue({ data: null } as any);

      await expect(svc.getEncryptionStatus('conv-1')).rejects.toThrow(
        'Erreur lors de la lecture du statut de chiffrement',
      );
    });
  });

  // ── enableEncryption ──────────────────────────────────────────────────────

  describe('enableEncryption', () => {
    it('calls API and returns result', async () => {
      const result = { conversationId: 'conv-1', mode: 'e2ee', enabledAt: '2026-01-01', enabledBy: 'user-1' };
      mockApi.post.mockResolvedValue({ data: result } as any);

      const response = await svc.enableEncryption('conv-1', 'e2ee');

      expect(mockApi.post).toHaveBeenCalledWith('/conversations/conv-1/encryption', { mode: 'e2ee' });
      expect(response).toBe(result);
    });

    it('throws when response has no data', async () => {
      mockApi.post.mockResolvedValue({ data: null } as any);

      await expect(svc.enableEncryption('conv-1', 'e2ee')).rejects.toThrow(
        "Erreur lors de l'activation du chiffrement",
      );
    });
  });

  // ── searchConversations ───────────────────────────────────────────────────

  describe('searchConversations', () => {
    it('returns conversations from nested data shape', async () => {
      const rawConvs = [{ id: 'c1' }, { id: 'c2' }];
      mockApi.get.mockResolvedValue({ data: { success: true, data: rawConvs } } as any);

      const result = await svc.searchConversations('hello');

      expect(mockApi.get).toHaveBeenCalledWith('/conversations/search', { q: 'hello' });
      expect(result).toHaveLength(2);
      expect(mockTransformers.transformConversationData).toHaveBeenCalledTimes(2);
    });

    it('returns conversations from flat array response', async () => {
      const rawConvs = [{ id: 'c1' }];
      mockApi.get.mockResolvedValue({ data: rawConvs } as any);

      const result = await svc.searchConversations('hello');

      expect(result).toHaveLength(1);
    });

    it('returns empty array when API throws', async () => {
      mockApi.get.mockRejectedValue(new Error('Network error'));

      const result = await svc.searchConversations('query');

      expect(result).toEqual([]);
    });
  });

  // ── getConversationsWithUser ──────────────────────────────────────────────

  describe('getConversationsWithUser', () => {
    it('returns direct conversations with specified user, sorted by lastActivityAt desc', async () => {
      const conv1 = { id: 'c1', lastActivityAt: '2026-06-01T08:00:00.000Z' } as unknown as Conversation;
      const conv2 = { id: 'c2', lastActivityAt: '2026-06-01T10:00:00.000Z' } as unknown as Conversation;
      mockApi.get.mockResolvedValue(
        makeApiGetConvResponse([conv1, conv2], { limit: 20, offset: 0, total: 2, hasMore: false }) as any,
      );
      mockTransformers.transformConversationData.mockImplementation((d: unknown) => d as Conversation);

      const result = await svc.getConversationsWithUser('user-99');

      expect(mockApi.get).toHaveBeenCalledWith(
        '/conversations',
        expect.objectContaining({ type: 'direct', withUserId: 'user-99' }),
      );
      // newer first
      expect(result[0].id).toBe('c2');
      expect(result[1].id).toBe('c1');
    });

    it('falls back to updatedAt when lastActivityAt is absent', async () => {
      const conv1 = { id: 'c1', updatedAt: '2026-06-01T08:00:00.000Z' } as unknown as Conversation;
      const conv2 = { id: 'c2', updatedAt: '2026-06-01T10:00:00.000Z' } as unknown as Conversation;
      mockApi.get.mockResolvedValue(
        makeApiGetConvResponse([conv1, conv2], { limit: 20, offset: 0, total: 2, hasMore: false }) as any,
      );
      mockTransformers.transformConversationData.mockImplementation((d: unknown) => d as Conversation);

      const result = await svc.getConversationsWithUser('user-99');
      expect(result[0].id).toBe('c2');
    });

    it('returns empty array when API throws', async () => {
      mockApi.get.mockRejectedValue(new Error('Timeout'));

      const result = await svc.getConversationsWithUser('user-99');

      expect(result).toEqual([]);
    });
  });
});
