/**
 * Tests for hooks/use-participant-management.ts
 */

const mockRemoveParticipant = jest.fn();
jest.mock('@/services/conversations.service', () => ({
  conversationsService: {
    removeParticipant: (...args: unknown[]) => mockRemoveParticipant(...args),
  },
}));

const mockToastSuccess = jest.fn();
const mockToastError = jest.fn();
jest.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
  },
}));

jest.mock('@/hooks/use-i18n', () => ({
  useI18n: () => ({ t: (key: string) => `t:${key}` }),
}));

jest.mock('@meeshy/shared/types/role-types', () => ({
  isGlobalAdmin: (role: string) => role === 'ADMIN' || role === 'BIGBOSS',
  hasMinimumMemberRole: (role: string, minRole: string) => {
    const hierarchy = ['member', 'moderator', 'admin'];
    return hierarchy.indexOf(role) >= hierarchy.indexOf(minRole);
  },
  MemberRole: { MODERATOR: 'moderator', ADMIN: 'admin', MEMBER: 'member' },
}));

import { renderHook, act } from '@testing-library/react';
import { useParticipantManagement } from '@/hooks/use-participant-management';
import type { Conversation, User } from '@meeshy/shared/types';

const makeConversation = (overrides?: Partial<Conversation>): Conversation => ({
  id: 'conv-1',
  type: 'group',
  participants: [],
  ...overrides,
} as unknown as Conversation);

const makeUser = (id: string, role = 'USER'): User => ({ id, username: `u_${id}`, role } as User);

const makeParticipant = (userId: string, memberRole = 'member') => ({
  id: userId,
  userId,
  role: memberRole,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockRemoveParticipant.mockResolvedValue({});
});

// ─── isAdmin ──────────────────────────────────────────────────────────────────

describe('isAdmin', () => {
  it('isAdmin=true when currentUser is global admin', () => {
    const { result } = renderHook(() =>
      useParticipantManagement(makeConversation(), makeUser('me', 'ADMIN'))
    );
    expect(result.current.isAdmin).toBe(true);
  });

  it('isAdmin=false for regular user with member role', () => {
    const conv = makeConversation({
      participants: [makeParticipant('me', 'member')] as any,
    });
    const { result } = renderHook(() =>
      useParticipantManagement(conv, makeUser('me', 'USER'))
    );
    expect(result.current.isAdmin).toBe(false);
  });

  it('isAdmin=true for moderator role in conversation', () => {
    const conv = makeConversation({
      participants: [makeParticipant('me', 'moderator')] as any,
    });
    const { result } = renderHook(() =>
      useParticipantManagement(conv, makeUser('me', 'USER'))
    );
    expect(result.current.isAdmin).toBe(true);
  });
});

// ─── canModifyImage ───────────────────────────────────────────────────────────

describe('canModifyImage', () => {
  it('canModifyImage=false for direct conversations even if admin', () => {
    const conv = makeConversation({ type: 'direct' });
    const { result } = renderHook(() =>
      useParticipantManagement(conv, makeUser('me', 'ADMIN'))
    );
    expect(result.current.canModifyImage).toBe(false);
  });

  it('canModifyImage=true for group conversation with admin rights', () => {
    const conv = makeConversation({ type: 'group' });
    const { result } = renderHook(() =>
      useParticipantManagement(conv, makeUser('me', 'ADMIN'))
    );
    expect(result.current.canModifyImage).toBe(true);
  });
});

// ─── handleRemoveParticipant ──────────────────────────────────────────────────

describe('handleRemoveParticipant', () => {
  it('does nothing when not admin', async () => {
    const conv = makeConversation({
      participants: [makeParticipant('me', 'member')] as any,
    });
    const { result } = renderHook(() =>
      useParticipantManagement(conv, makeUser('me', 'USER'))
    );
    await act(async () => { await result.current.handleRemoveParticipant('u2'); });
    expect(mockRemoveParticipant).not.toHaveBeenCalled();
  });

  it('calls removeParticipant with conversationId and userId when admin', async () => {
    const { result } = renderHook(() =>
      useParticipantManagement(makeConversation(), makeUser('me', 'ADMIN'))
    );
    await act(async () => { await result.current.handleRemoveParticipant('u2'); });
    expect(mockRemoveParticipant).toHaveBeenCalledWith('conv-1', 'u2');
  });

  it('shows success toast on successful removal', async () => {
    const { result } = renderHook(() =>
      useParticipantManagement(makeConversation(), makeUser('me', 'ADMIN'))
    );
    await act(async () => { await result.current.handleRemoveParticipant('u2'); });
    expect(mockToastSuccess).toHaveBeenCalled();
  });

  it('shows error toast on removal failure', async () => {
    mockRemoveParticipant.mockRejectedValue(new Error('network'));
    const { result } = renderHook(() =>
      useParticipantManagement(makeConversation(), makeUser('me', 'ADMIN'))
    );
    await act(async () => { await result.current.handleRemoveParticipant('u2'); });
    expect(mockToastError).toHaveBeenCalled();
  });

  it('isLoading returns to false after completion', async () => {
    const { result } = renderHook(() =>
      useParticipantManagement(makeConversation(), makeUser('me', 'ADMIN'))
    );
    await act(async () => { await result.current.handleRemoveParticipant('u2'); });
    expect(result.current.isLoading).toBe(false);
  });
});
