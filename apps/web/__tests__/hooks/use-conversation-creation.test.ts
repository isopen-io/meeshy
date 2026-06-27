/**
 * Tests for hooks/use-conversation-creation.ts
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { useConversationCreation } from '@/hooks/use-conversation-creation';

const mockToastError = jest.fn();
const mockToastSuccess = jest.fn();

jest.mock('sonner', () => ({
  toast: {
    error: (...args: any[]) => mockToastError(...args),
    success: (...args: any[]) => mockToastSuccess(...args),
  },
}));

jest.mock('@/services/conversations.service', () => ({
  conversationsService: {
    createConversation: jest.fn(),
  },
}));

jest.mock('@/hooks/useI18n', () => ({
  useI18n: jest.fn(() => ({
    t: (key: string, params?: Record<string, string>) => {
      if (params?.username) return `DM with ${params.username}`;
      if (params?.users) return `Group: ${params.users}`;
      return key;
    },
  })),
}));

import { conversationsService } from '@/services/conversations.service';
const mockCreate = conversationsService.createConversation as jest.Mock;

const makeUser = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  username: `user-${id}`,
  displayName: `Display ${id}`,
  ...overrides,
});

const DEFAULT_PARAMS = {
  title: '',
  conversationType: 'direct' as const,
  selectedUsers: [makeUser('u1')],
  customIdentifier: '',
};

beforeEach(() => {
  jest.clearAllMocks();
});

// ─── initial state ────────────────────────────────────────────────────────────

describe('initial state', () => {
  it('isCreating starts as false', () => {
    const { result } = renderHook(() => useConversationCreation());
    expect(result.current.isCreating).toBe(false);
  });
});

// ─── validation ───────────────────────────────────────────────────────────────

describe('validation', () => {
  it('returns null and shows error when direct conversation has no users', async () => {
    const { result } = renderHook(() => useConversationCreation());
    let ret: unknown;
    await act(async () => {
      ret = await result.current.createConversation({
        ...DEFAULT_PARAMS,
        conversationType: 'direct',
        selectedUsers: [],
      });
    });
    expect(ret).toBeNull();
    expect(mockToastError).toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('returns null and shows error when group conversation has no users', async () => {
    const { result } = renderHook(() => useConversationCreation());
    let ret: unknown;
    await act(async () => {
      ret = await result.current.createConversation({
        ...DEFAULT_PARAMS,
        conversationType: 'group',
        selectedUsers: [],
      });
    });
    expect(ret).toBeNull();
    expect(mockToastError).toHaveBeenCalled();
  });

  it('allows public conversation with no selected users', async () => {
    mockCreate.mockResolvedValueOnce({ id: 'c1' });
    const { result } = renderHook(() => useConversationCreation());
    await act(async () => {
      await result.current.createConversation({
        ...DEFAULT_PARAMS,
        conversationType: 'public',
        selectedUsers: [],
        title: 'Open Channel',
      });
    });
    expect(mockCreate).toHaveBeenCalled();
  });
});

// ─── title generation ─────────────────────────────────────────────────────────

describe('title generation', () => {
  it('uses displayName to build default title for direct conversation', async () => {
    mockCreate.mockResolvedValueOnce({ id: 'c1' });
    const { result } = renderHook(() => useConversationCreation());
    await act(async () => {
      await result.current.createConversation({
        ...DEFAULT_PARAMS,
        conversationType: 'direct',
        selectedUsers: [makeUser('u1', { displayName: 'Alice' })],
        title: '',
      });
    });
    const callArg = mockCreate.mock.calls[0][0];
    expect(callArg.title).toContain('Alice');
  });

  it('uses username as fallback when displayName is absent for direct', async () => {
    mockCreate.mockResolvedValueOnce({ id: 'c1' });
    const { result } = renderHook(() => useConversationCreation());
    await act(async () => {
      await result.current.createConversation({
        ...DEFAULT_PARAMS,
        conversationType: 'direct',
        selectedUsers: [{ id: 'u1', username: 'bob', displayName: undefined } as any],
        title: '',
      });
    });
    const callArg = mockCreate.mock.calls[0][0];
    expect(callArg.title).toContain('bob');
  });

  it('builds group title from all user display names', async () => {
    mockCreate.mockResolvedValueOnce({ id: 'c1' });
    const { result } = renderHook(() => useConversationCreation());
    await act(async () => {
      await result.current.createConversation({
        ...DEFAULT_PARAMS,
        conversationType: 'group',
        selectedUsers: [makeUser('u1', { displayName: 'Alice' }), makeUser('u2', { displayName: 'Bob' })],
        title: '',
      });
    });
    const callArg = mockCreate.mock.calls[0][0];
    expect(callArg.title).toContain('Alice');
    expect(callArg.title).toContain('Bob');
  });

  it('preserves explicit title when provided', async () => {
    mockCreate.mockResolvedValueOnce({ id: 'c1' });
    const { result } = renderHook(() => useConversationCreation());
    await act(async () => {
      await result.current.createConversation({
        ...DEFAULT_PARAMS,
        title: 'My Conversation',
      });
    });
    const callArg = mockCreate.mock.calls[0][0];
    expect(callArg.title).toBe('My Conversation');
  });
});

// ─── API call ─────────────────────────────────────────────────────────────────

describe('API call', () => {
  it('passes conversationType as type to the service', async () => {
    mockCreate.mockResolvedValueOnce({ id: 'c1' });
    const { result } = renderHook(() => useConversationCreation());
    await act(async () => {
      await result.current.createConversation({
        ...DEFAULT_PARAMS,
        conversationType: 'group',
      });
    });
    expect(mockCreate.mock.calls[0][0].type).toBe('group');
  });

  it('includes participantIds from selectedUsers', async () => {
    mockCreate.mockResolvedValueOnce({ id: 'c1' });
    const { result } = renderHook(() => useConversationCreation());
    await act(async () => {
      await result.current.createConversation({
        ...DEFAULT_PARAMS,
        selectedUsers: [makeUser('u1'), makeUser('u2')],
      });
    });
    const callArg = mockCreate.mock.calls[0][0];
    expect(callArg.participantIds).toEqual(['u1', 'u2']);
  });

  it('filters out empty participant IDs', async () => {
    mockCreate.mockResolvedValueOnce({ id: 'c1' });
    const { result } = renderHook(() => useConversationCreation());
    await act(async () => {
      await result.current.createConversation({
        ...DEFAULT_PARAMS,
        selectedUsers: [makeUser('u1'), { id: '', username: 'ghost' } as any],
      });
    });
    const callArg = mockCreate.mock.calls[0][0];
    expect(callArg.participantIds).toEqual(['u1']);
  });

  it('includes identifier for non-direct conversations', async () => {
    mockCreate.mockResolvedValueOnce({ id: 'c1' });
    const { result } = renderHook(() => useConversationCreation());
    await act(async () => {
      await result.current.createConversation({
        ...DEFAULT_PARAMS,
        conversationType: 'group',
        customIdentifier: 'my-group-id',
      });
    });
    expect(mockCreate.mock.calls[0][0].identifier).toBe('my-group-id');
  });

  it('does not include identifier for direct conversations', async () => {
    mockCreate.mockResolvedValueOnce({ id: 'c1' });
    const { result } = renderHook(() => useConversationCreation());
    await act(async () => {
      await result.current.createConversation({
        ...DEFAULT_PARAMS,
        conversationType: 'direct',
        customIdentifier: 'direct-id',
      });
    });
    expect(mockCreate.mock.calls[0][0].identifier).toBeUndefined();
  });

  it('includes communityId when selectedCommunity is provided', async () => {
    mockCreate.mockResolvedValueOnce({ id: 'c1' });
    const { result } = renderHook(() => useConversationCreation());
    await act(async () => {
      await result.current.createConversation({
        ...DEFAULT_PARAMS,
        conversationType: 'public',
        selectedUsers: [],
        title: 'Channel',
        selectedCommunity: 'comm-1',
      });
    });
    expect(mockCreate.mock.calls[0][0].communityId).toBe('comm-1');
  });

  it('returns the created conversation on success', async () => {
    const conversation = { id: 'c1', title: 'Test' };
    mockCreate.mockResolvedValueOnce(conversation);
    const { result } = renderHook(() => useConversationCreation());
    let ret: unknown;
    await act(async () => {
      ret = await result.current.createConversation(DEFAULT_PARAMS);
    });
    expect(ret).toEqual(conversation);
    expect(mockToastSuccess).toHaveBeenCalled();
  });
});

// ─── isCreating state ─────────────────────────────────────────────────────────

describe('isCreating', () => {
  it('returns false after successful creation', async () => {
    mockCreate.mockResolvedValueOnce({ id: 'c1' });
    const { result } = renderHook(() => useConversationCreation());
    await act(async () => {
      await result.current.createConversation(DEFAULT_PARAMS);
    });
    expect(result.current.isCreating).toBe(false);
  });

  it('returns false after failed creation', async () => {
    mockCreate.mockRejectedValueOnce(new Error('api error'));
    const { result } = renderHook(() => useConversationCreation());
    await act(async () => {
      await result.current.createConversation(DEFAULT_PARAMS);
    });
    expect(result.current.isCreating).toBe(false);
  });
});

// ─── error handling ───────────────────────────────────────────────────────────

describe('error handling', () => {
  it('shows toast error on API failure', async () => {
    mockCreate.mockRejectedValueOnce(new Error('network error'));
    const { result } = renderHook(() => useConversationCreation());
    await act(async () => {
      await result.current.createConversation(DEFAULT_PARAMS);
    });
    expect(mockToastError).toHaveBeenCalled();
  });

  it('returns null on API failure', async () => {
    mockCreate.mockRejectedValueOnce(new Error('network error'));
    const { result } = renderHook(() => useConversationCreation());
    let ret: unknown;
    await act(async () => {
      ret = await result.current.createConversation(DEFAULT_PARAMS);
    });
    expect(ret).toBeNull();
  });

  it('shows error.data.message in toast when available', async () => {
    const err = { data: { message: 'Forbidden resource' } };
    mockCreate.mockRejectedValueOnce(err);
    const { result } = renderHook(() => useConversationCreation());
    await act(async () => {
      await result.current.createConversation(DEFAULT_PARAMS);
    });
    expect(mockToastError).toHaveBeenCalledWith(expect.stringContaining('Forbidden resource'));
  });
});
