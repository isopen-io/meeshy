/**
 * Tests for hooks/use-message-interactions.ts
 */

import { renderHook } from '@testing-library/react';
import { useMessageInteractions } from '@/hooks/use-message-interactions';

jest.mock('@/stores/language-store', () => ({
  useCurrentInterfaceLanguage: jest.fn(() => 'fr'),
}));

jest.mock('sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

const t = (key: string) => key;

const NOW = new Date();
const RECENT = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago
const OLD = new Date(Date.now() - 25 * 60 * 60 * 1000); // 25 hours ago

const makeMessage = (overrides: Record<string, unknown> = {}) => ({
  id: 'msg-1',
  content: 'Hello world',
  createdAt: RECENT,
  senderId: 'participant-1',
  ...overrides,
});

const renderInteractions = (
  messageOverrides: Record<string, unknown> = {},
  propsOverrides: Record<string, unknown> = {}
) => {
  const message = makeMessage(messageOverrides);
  return renderHook(() =>
    useMessageInteractions({
      message,
      t,
      ...propsOverrides,
    })
  ).result.current;
};

// ─── isOwnMessage ─────────────────────────────────────────────────────────────

describe('isOwnMessage', () => {
  it('returns false when no currentUserId is provided', () => {
    const { isOwnMessage } = renderInteractions();
    expect(isOwnMessage).toBe(false);
  });

  it('returns true when sender.userId matches currentUserId', () => {
    const { isOwnMessage } = renderInteractions(
      { sender: { userId: 'user-1' } },
      { currentUserId: 'user-1' }
    );
    expect(isOwnMessage).toBe(true);
  });

  it('returns false when sender.userId does not match', () => {
    const { isOwnMessage } = renderInteractions(
      { sender: { userId: 'user-2' } },
      { currentUserId: 'user-1' }
    );
    expect(isOwnMessage).toBe(false);
  });

  it('returns true for anonymous when senderId matches currentAnonymousUserId', () => {
    const { isOwnMessage } = renderInteractions(
      { senderId: 'anon-42' },
      { isAnonymous: true, currentAnonymousUserId: 'anon-42' }
    );
    expect(isOwnMessage).toBe(true);
  });

  it('returns false for anonymous when IDs do not match', () => {
    const { isOwnMessage } = renderInteractions(
      { senderId: 'anon-99' },
      { isAnonymous: true, currentAnonymousUserId: 'anon-42' }
    );
    expect(isOwnMessage).toBe(false);
  });

  it('resolves userId from nested sender.user.id', () => {
    const { isOwnMessage } = renderInteractions(
      { sender: { user: { id: 'user-1' } } },
      { currentUserId: 'user-1' }
    );
    expect(isOwnMessage).toBe(true);
  });
});

// ─── canModifyMessage ─────────────────────────────────────────────────────────

describe('canModifyMessage', () => {
  it('returns false for recent message with no special privileges and no own message', () => {
    const { canModifyMessage } = renderInteractions(
      { createdAt: RECENT },
      { userRole: 'USER' }
    );
    expect(canModifyMessage()).toBe(false);
  });

  it('returns true when onEnterEditMode is provided', () => {
    const { canModifyMessage } = renderInteractions(
      { createdAt: RECENT },
      { onEnterEditMode: jest.fn() }
    );
    expect(canModifyMessage()).toBe(true);
  });

  it('returns true for own recent message', () => {
    const { canModifyMessage } = renderInteractions(
      { createdAt: RECENT, sender: { userId: 'user-1' } },
      { currentUserId: 'user-1', userRole: 'USER' }
    );
    expect(canModifyMessage()).toBe(true);
  });

  it('returns false for own message older than 24h without special role', () => {
    const { canModifyMessage } = renderInteractions(
      { createdAt: OLD, sender: { userId: 'user-1' } },
      { currentUserId: 'user-1', userRole: 'USER' }
    );
    expect(canModifyMessage()).toBe(false);
  });

  it('returns true for old message with ADMIN role in a group conversation', () => {
    const { canModifyMessage } = renderInteractions(
      { createdAt: OLD },
      { userRole: 'ADMIN', conversationType: 'group' }
    );
    expect(canModifyMessage()).toBe(true);
  });
});

// ─── canDeleteMessage ─────────────────────────────────────────────────────────

describe('canDeleteMessage', () => {
  it('returns true when onEnterDeleteMode is provided', () => {
    const { canDeleteMessage } = renderInteractions(
      {},
      { onEnterDeleteMode: jest.fn() }
    );
    expect(canDeleteMessage()).toBe(true);
  });

  it('returns true for ADMIN role regardless of message age', () => {
    const { canDeleteMessage } = renderInteractions(
      { createdAt: OLD },
      { userRole: 'ADMIN' }
    );
    expect(canDeleteMessage()).toBe(true);
  });

  it('returns false for message older than 12h without moderator privileges', () => {
    const { canDeleteMessage } = renderInteractions(
      { createdAt: OLD, sender: { userId: 'user-1' } },
      { currentUserId: 'user-1', userRole: 'USER' }
    );
    expect(canDeleteMessage()).toBe(false);
  });

  it('returns true for own message within 12h', () => {
    const { canDeleteMessage } = renderInteractions(
      { createdAt: RECENT, sender: { userId: 'user-1' } },
      { currentUserId: 'user-1', userRole: 'USER', onEnterEditMode: jest.fn() }
    );
    expect(canDeleteMessage()).toBe(true);
  });
});

// ─── canReportMessage ─────────────────────────────────────────────────────────

describe('canReportMessage', () => {
  it('returns false when anonymous', () => {
    const { canReportMessage } = renderInteractions(
      {},
      { isAnonymous: true, onEnterReportMode: jest.fn() }
    );
    expect(canReportMessage()).toBe(false);
  });

  it('returns false when it is own message', () => {
    const { canReportMessage } = renderInteractions(
      { sender: { userId: 'user-1' } },
      { currentUserId: 'user-1', onEnterReportMode: jest.fn() }
    );
    expect(canReportMessage()).toBe(false);
  });

  it('returns false when onEnterReportMode is not provided', () => {
    const { canReportMessage } = renderInteractions(
      { sender: { userId: 'user-2' } },
      { currentUserId: 'user-1' }
    );
    expect(canReportMessage()).toBe(false);
  });

  it('returns true for non-own, non-anonymous message with report handler', () => {
    const { canReportMessage } = renderInteractions(
      { sender: { userId: 'user-2' } },
      { currentUserId: 'user-1', onEnterReportMode: jest.fn() }
    );
    expect(canReportMessage()).toBe(true);
  });
});

// ─── action handlers ──────────────────────────────────────────────────────────

describe('handleReactionClick', () => {
  it('calls onEnterReactionMode when provided', () => {
    const onEnterReactionMode = jest.fn();
    const { handleReactionClick } = renderInteractions({}, { onEnterReactionMode });
    handleReactionClick();
    expect(onEnterReactionMode).toHaveBeenCalledTimes(1);
  });

  it('does not throw when onEnterReactionMode is not provided', () => {
    const { handleReactionClick } = renderInteractions();
    expect(() => handleReactionClick()).not.toThrow();
  });
});

describe('handleReportMessage', () => {
  it('calls onEnterReportMode when provided', () => {
    const onEnterReportMode = jest.fn();
    const { handleReportMessage } = renderInteractions({}, { onEnterReportMode });
    handleReportMessage();
    expect(onEnterReportMode).toHaveBeenCalledTimes(1);
  });
});

describe('handleEditMessage', () => {
  it('calls onEnterEditMode when provided', async () => {
    const onEnterEditMode = jest.fn();
    const { handleEditMessage } = renderInteractions({}, { onEnterEditMode });
    await handleEditMessage();
    expect(onEnterEditMode).toHaveBeenCalledTimes(1);
  });
});

describe('handleDeleteMessage', () => {
  it('calls onEnterDeleteMode when provided', async () => {
    const onEnterDeleteMode = jest.fn();
    const { handleDeleteMessage } = renderInteractions({}, { onEnterDeleteMode });
    await handleDeleteMessage();
    expect(onEnterDeleteMode).toHaveBeenCalledTimes(1);
  });
});
