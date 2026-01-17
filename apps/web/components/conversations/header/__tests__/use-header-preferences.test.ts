import { renderHook, waitFor } from '@testing-library/react';
import { act } from 'react';
import { useHeaderPreferences } from '../use-header-preferences';
import { userPreferencesService } from '@/services/user-preferences.service';

jest.mock('@/services/user-preferences.service');

describe('useHeaderPreferences', () => {
  const mockT = (key: string) => key;
  const mockConversationId = 'conv-123';
  const mockUser = { id: 'user-1', username: 'testuser' };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should load preferences on mount for authenticated users', async () => {
    const mockPrefs = {
      isPinned: true,
      isMuted: false,
      isArchived: false,
      customName: 'Custom Name',
      tags: ['tag1', 'tag2'],
      categoryId: 'cat-1'
    };

    const mockCategory = { id: 'cat-1', name: 'Work' };

    (userPreferencesService.getPreferences as jest.Mock).mockResolvedValue(mockPrefs);
    (userPreferencesService.getCategory as jest.Mock).mockResolvedValue(mockCategory);

    const { result } = renderHook(() =>
      useHeaderPreferences(mockConversationId, mockUser, mockT)
    );

    expect(result.current.preferences.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.preferences.isLoading).toBe(false);
    });

    expect(result.current.preferences.isPinned).toBe(true);
    expect(result.current.preferences.customName).toBe('Custom Name');
    expect(result.current.preferences.tags).toEqual(['tag1', 'tag2']);
    expect(result.current.preferences.categoryName).toBe('Work');
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
    expect(userPreferencesService.getPreferences).not.toHaveBeenCalled();
  });

  it('should toggle pin preference', async () => {
    (userPreferencesService.getPreferences as jest.Mock).mockResolvedValue(null);
    (userPreferencesService.togglePin as jest.Mock).mockResolvedValue(undefined);

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
    expect(userPreferencesService.togglePin).toHaveBeenCalledWith(mockConversationId, true);
  });
});
