/**
 * Tests for hooks/use-conversation-details.ts
 */

const mockUpdateConversation = jest.fn();

jest.mock('@/services/conversations.service', () => ({
  conversationsService: {
    updateConversation: (...args: unknown[]) => mockUpdateConversation(...args),
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

import { renderHook, act } from '@testing-library/react';
import { useConversationDetails } from '@/hooks/use-conversation-details';
import type { Conversation, User } from '@meeshy/shared/types';

const makeConversation = (overrides?: Partial<Conversation>): Conversation => ({
  id: 'conv-1',
  type: 'group',
  title: 'My Group',
  description: 'A description',
  participants: [],
  ...overrides,
} as unknown as Conversation);

const currentUser: User = { id: 'user-1', username: 'alice' } as User;

beforeEach(() => {
  jest.clearAllMocks();
  mockUpdateConversation.mockResolvedValue({});
});

// ─── initial state ────────────────────────────────────────────────────────────

describe('initial state', () => {
  it('conversationName matches conversation.title', () => {
    const { result } = renderHook(() =>
      useConversationDetails(makeConversation({ title: 'Chat' }), currentUser)
    );
    expect(result.current.conversationName).toBe('Chat');
  });

  it('conversationDescription matches conversation.description', () => {
    const { result } = renderHook(() =>
      useConversationDetails(makeConversation({ description: 'A desc' }), currentUser)
    );
    expect(result.current.conversationDescription).toBe('A desc');
  });

  it('isEditingName starts as false', () => {
    const { result } = renderHook(() =>
      useConversationDetails(makeConversation(), currentUser)
    );
    expect(result.current.isEditingName).toBe(false);
  });

  it('isLoading starts as false', () => {
    const { result } = renderHook(() =>
      useConversationDetails(makeConversation(), currentUser)
    );
    expect(result.current.isLoading).toBe(false);
  });
});

// ─── handleSaveName ───────────────────────────────────────────────────────────

describe('handleSaveName', () => {
  it('shows error and does not call service when name is empty', async () => {
    const { result } = renderHook(() =>
      useConversationDetails(makeConversation(), currentUser)
    );
    act(() => { result.current.setConversationName(''); });
    await act(async () => { await result.current.handleSaveName(); });
    expect(mockToastError).toHaveBeenCalled();
    expect(mockUpdateConversation).not.toHaveBeenCalled();
  });

  it('exits edit mode without calling service when name is unchanged', async () => {
    const { result } = renderHook(() =>
      useConversationDetails(makeConversation({ title: 'My Group' }), currentUser)
    );
    act(() => { result.current.setIsEditingName(true); });
    await act(async () => { await result.current.handleSaveName(); });
    expect(mockUpdateConversation).not.toHaveBeenCalled();
    expect(result.current.isEditingName).toBe(false);
  });

  it('calls updateConversation with new title', async () => {
    const { result } = renderHook(() =>
      useConversationDetails(makeConversation({ title: 'Old Name' }), currentUser)
    );
    act(() => { result.current.setConversationName('New Name'); });
    await act(async () => { await result.current.handleSaveName(); });
    expect(mockUpdateConversation).toHaveBeenCalledWith('conv-1', { title: 'New Name' });
  });

  it('calls onConversationUpdated with new title', async () => {
    const onUpdate = jest.fn();
    const { result } = renderHook(() =>
      useConversationDetails(makeConversation({ title: 'Old' }), currentUser, onUpdate)
    );
    act(() => { result.current.setConversationName('New'); });
    await act(async () => { await result.current.handleSaveName(); });
    expect(onUpdate).toHaveBeenCalledWith({ title: 'New' });
  });

  it('shows success toast after successful update', async () => {
    const { result } = renderHook(() =>
      useConversationDetails(makeConversation({ title: 'Old' }), currentUser)
    );
    act(() => { result.current.setConversationName('New'); });
    await act(async () => { await result.current.handleSaveName(); });
    expect(mockToastSuccess).toHaveBeenCalled();
  });

  it('shows error toast on service failure', async () => {
    mockUpdateConversation.mockRejectedValue(new Error('network'));
    const { result } = renderHook(() =>
      useConversationDetails(makeConversation({ title: 'Old' }), currentUser)
    );
    act(() => { result.current.setConversationName('New'); });
    await act(async () => { await result.current.handleSaveName(); });
    expect(mockToastError).toHaveBeenCalled();
  });

  it('reverts name to original on failure', async () => {
    mockUpdateConversation.mockRejectedValue(new Error('oops'));
    const { result } = renderHook(() =>
      useConversationDetails(makeConversation({ title: 'Original' }), currentUser)
    );
    act(() => { result.current.setConversationName('Changed'); });
    await act(async () => { await result.current.handleSaveName(); });
    expect(result.current.conversationName).toBe('Original');
  });

  it('isLoading returns to false after completion', async () => {
    const { result } = renderHook(() =>
      useConversationDetails(makeConversation({ title: 'Old' }), currentUser)
    );
    act(() => { result.current.setConversationName('New'); });
    await act(async () => { await result.current.handleSaveName(); });
    expect(result.current.isLoading).toBe(false);
  });
});

// ─── handleSaveDescription ────────────────────────────────────────────────────

describe('handleSaveDescription', () => {
  it('exits edit mode without API call when description is unchanged', async () => {
    const { result } = renderHook(() =>
      useConversationDetails(makeConversation({ description: 'Same' }), currentUser)
    );
    act(() => { result.current.setIsEditingDescription(true); });
    await act(async () => { await result.current.handleSaveDescription(); });
    expect(mockUpdateConversation).not.toHaveBeenCalled();
    expect(result.current.isEditingDescription).toBe(false);
  });

  it('calls updateConversation with new description', async () => {
    const { result } = renderHook(() =>
      useConversationDetails(makeConversation({ description: 'Old desc' }), currentUser)
    );
    act(() => { result.current.setConversationDescription('New desc'); });
    await act(async () => { await result.current.handleSaveDescription(); });
    expect(mockUpdateConversation).toHaveBeenCalledWith('conv-1', { description: 'New desc' });
  });

  it('reverts description on failure', async () => {
    mockUpdateConversation.mockRejectedValue(new Error('fail'));
    const { result } = renderHook(() =>
      useConversationDetails(makeConversation({ description: 'Original' }), currentUser)
    );
    act(() => { result.current.setConversationDescription('Changed'); });
    await act(async () => { await result.current.handleSaveDescription(); });
    expect(result.current.conversationDescription).toBe('Original');
  });
});

// ─── UI state toggles ────────────────────────────────────────────────────────

describe('UI state toggles', () => {
  it('isCopied can be set to true', () => {
    const { result } = renderHook(() =>
      useConversationDetails(makeConversation(), currentUser)
    );
    act(() => { result.current.setIsCopied(true); });
    expect(result.current.isCopied).toBe(true);
  });

  it('isImageUploadDialogOpen can be toggled', () => {
    const { result } = renderHook(() =>
      useConversationDetails(makeConversation(), currentUser)
    );
    act(() => { result.current.setIsImageUploadDialogOpen(true); });
    expect(result.current.isImageUploadDialogOpen).toBe(true);
  });
});
