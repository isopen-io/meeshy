import { renderHook, waitFor } from '@testing-library/react';
import { act } from 'react';
import { useHeaderPreferences } from '../use-header-preferences';
import { useConversationPreferencesStore } from '@/stores/conversation-preferences-store';
import { userPreferencesService } from '@/services/user-preferences.service';

jest.mock('@/services/user-preferences.service');

describe('useHeaderPreferences', () => {
  const mockT = (key: string) => key;
  const mockConversationId = 'conv-123';
  const mockUser = { id: 'user-1', username: 'testuser' };

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset the store state
    useConversationPreferencesStore.setState({
      preferencesMap: new Map(),
      categories: [],
      isLoading: false,
      isInitialized: false,
      error: null,
    });
  });

  it('should load preferences from store for authenticated users', async () => {
    // Pre-populate the store with preferences
    const prefsMap = new Map();
    prefsMap.set(mockConversationId, {
      id: 'pref-1',
      userId: 'user-1',
      conversationId: mockConversationId,
      isPinned: true,
      isMuted: false,
      isArchived: false,
      customName: 'Custom Name',
      tags: ['tag1', 'tag2'],
      categoryId: 'cat-1',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    (userPreferencesService.getCategory as jest.Mock).mockResolvedValue({ id: 'cat-1', name: 'Work' });

    useConversationPreferencesStore.setState({
      preferencesMap: prefsMap,
      isInitialized: true,
      isLoading: false,
    });

    const { result } = renderHook(() =>
      useHeaderPreferences(mockConversationId, mockUser, mockT)
    );

    await waitFor(() => {
      expect(result.current.preferences.isLoading).toBe(false);
    });

    expect(result.current.preferences.isPinned).toBe(true);
    expect(result.current.preferences.customName).toBe('Custom Name');
    expect(result.current.preferences.tags).toEqual(['tag1', 'tag2']);
  });

  it('should return default preferences for anonymous users', async () => {
    const mockAnonymousUser = { sessionToken: 'token-123' };

    const { result } = renderHook(() =>
      useHeaderPreferences(mockConversationId, mockAnonymousUser, mockT)
    );

    await waitFor(() => {
      expect(result.current.preferences.isLoading).toBe(false);
    });

    expect(result.current.preferences.isPinned).toBe(false);
    expect(result.current.preferences.isMuted).toBe(false);
  });

  it('should toggle pin preference', async () => {
    (userPreferencesService.togglePin as jest.Mock).mockResolvedValue({
      id: 'pref-1',
      userId: 'user-1',
      conversationId: mockConversationId,
      isPinned: true,
      isMuted: false,
      isArchived: false,
      tags: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    useConversationPreferencesStore.setState({
      preferencesMap: new Map(),
      isInitialized: true,
      isLoading: false,
    });

    const { result } = renderHook(() =>
      useHeaderPreferences(mockConversationId, mockUser, mockT)
    );

    await waitFor(() => {
      expect(result.current.preferences.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.togglePin();
    });

    expect(result.current.preferences.isPinned).toBe(true);
  });
});
