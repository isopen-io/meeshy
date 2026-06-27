jest.mock('@/services/conversations.service', () => ({
  conversationsService: {
    updateConversation: jest.fn(),
    uploadConversationImage: jest.fn(),
  },
}));

jest.mock('sonner', () => ({
  toast: { error: jest.fn(), success: jest.fn() },
}));

jest.mock('@/hooks/use-i18n', () => ({
  useI18n: jest.fn(),
}));

import { renderHook, act, waitFor } from '@testing-library/react';
import { useConversationDetails } from '@/hooks/use-conversation-details';
import { conversationsService } from '@/services/conversations.service';
import { toast } from 'sonner';
import { useI18n } from '@/hooks/use-i18n';

const mockUseI18n = useI18n as jest.MockedFunction<typeof useI18n>;

const mockUpdateConversation = conversationsService.updateConversation as jest.MockedFunction<
  typeof conversationsService.updateConversation
>;

const makeConv = (overrides: Record<string, unknown> = {}) =>
  ({
    id: 'conv-1',
    title: 'Test Group',
    description: 'A description',
    type: 'group',
    participants: [],
    ...overrides,
  } as any);

const makeUser = (overrides: Record<string, unknown> = {}) =>
  ({
    id: 'user-1',
    role: 'USER',
    ...overrides,
  } as any);

describe('useConversationDetails', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockUseI18n.mockReturnValue({ t: (key: string) => key } as any);
  });

  describe('handleSaveName', () => {
    it('shows toast.error and does not call updateConversation when name is empty', async () => {
      const conv = makeConv({ title: 'Test Group' });
      const user = makeUser();

      const { result } = renderHook(() => useConversationDetails(conv, user));

      act(() => {
        result.current.setConversationName('');
      });

      await act(async () => {
        await result.current.handleSaveName();
      });

      expect(toast.error).toHaveBeenCalledWith('conversationDetails.nameCannotBeEmpty');
      expect(mockUpdateConversation).not.toHaveBeenCalled();
    });

    it('closes edit mode without API call when name is unchanged', async () => {
      const conv = makeConv({ title: 'Test Group' });
      const user = makeUser();

      const { result } = renderHook(() => useConversationDetails(conv, user));

      await act(async () => {
        await result.current.handleSaveName();
      });

      expect(mockUpdateConversation).not.toHaveBeenCalled();
      expect(result.current.isEditingName).toBe(false);
    });

    it('calls updateConversation with new title when name changes', async () => {
      mockUpdateConversation.mockResolvedValue(undefined as never);
      const conv = makeConv({ title: 'Test Group' });
      const user = makeUser();

      const { result } = renderHook(() => useConversationDetails(conv, user));

      act(() => {
        result.current.setConversationName('New Name');
      });

      await act(async () => {
        await result.current.handleSaveName();
      });

      expect(mockUpdateConversation).toHaveBeenCalledWith('conv-1', { title: 'New Name' });
    });

    it('calls toast.success and closes edit mode on success', async () => {
      mockUpdateConversation.mockResolvedValue(undefined as never);
      const conv = makeConv({ title: 'Test Group' });
      const user = makeUser();

      const { result } = renderHook(() => useConversationDetails(conv, user));

      act(() => {
        result.current.setConversationName('New Name');
      });

      await act(async () => {
        await result.current.handleSaveName();
      });

      expect(toast.success).toHaveBeenCalledWith('conversationDetails.nameUpdated');
      expect(result.current.isEditingName).toBe(false);
    });

    it('shows 409 error message when API returns status 409', async () => {
      const error409 = Object.assign(new Error('Conflict'), { status: 409 });
      mockUpdateConversation.mockRejectedValue(error409);
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const conv = makeConv({ title: 'Test Group' });
      const user = makeUser();

      const { result } = renderHook(() => useConversationDetails(conv, user));

      act(() => {
        result.current.setConversationName('New Name');
      });

      await act(async () => {
        await result.current.handleSaveName();
      });

      expect(toast.error).toHaveBeenCalledWith('conversationDetails.conversationExists');
      consoleSpy.mockRestore();
    });

    it('shows 403 error message when API returns status 403', async () => {
      const error403 = Object.assign(new Error('Forbidden'), { status: 403 });
      mockUpdateConversation.mockRejectedValue(error403);
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const conv = makeConv({ title: 'Test Group' });
      const user = makeUser();

      const { result } = renderHook(() => useConversationDetails(conv, user));

      act(() => {
        result.current.setConversationName('New Name');
      });

      await act(async () => {
        await result.current.handleSaveName();
      });

      expect(toast.error).toHaveBeenCalledWith('conversationDetails.noPermissionToModify');
      consoleSpy.mockRestore();
    });

    it('shows generic error message on unknown error', async () => {
      mockUpdateConversation.mockRejectedValue(new Error('Network error'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const conv = makeConv({ title: 'Test Group' });
      const user = makeUser();

      const { result } = renderHook(() => useConversationDetails(conv, user));

      act(() => {
        result.current.setConversationName('New Name');
      });

      await act(async () => {
        await result.current.handleSaveName();
      });

      expect(toast.error).toHaveBeenCalledWith('conversationDetails.updateError');
      consoleSpy.mockRestore();
    });

    it('sets isLoading to true during call and false after', async () => {
      let resolveUpdate!: () => void;
      mockUpdateConversation.mockReturnValue(
        new Promise<void>((resolve) => {
          resolveUpdate = resolve;
        }) as never
      );

      const conv = makeConv({ title: 'Test Group' });
      const user = makeUser();

      const { result } = renderHook(() => useConversationDetails(conv, user));

      act(() => {
        result.current.setConversationName('New Name');
      });

      expect(result.current.isLoading).toBe(false);

      act(() => {
        result.current.handleSaveName();
      });

      await waitFor(() => expect(result.current.isLoading).toBe(true));

      await act(async () => {
        resolveUpdate();
      });

      expect(result.current.isLoading).toBe(false);
    });
  });

  describe('handleSaveDescription', () => {
    it('closes edit mode without API call when description is unchanged', async () => {
      const conv = makeConv({ description: 'A description' });
      const user = makeUser();

      const { result } = renderHook(() => useConversationDetails(conv, user));

      await act(async () => {
        await result.current.handleSaveDescription();
      });

      expect(mockUpdateConversation).not.toHaveBeenCalled();
      expect(result.current.isEditingDescription).toBe(false);
    });

    it('calls updateConversation with new description when description changes', async () => {
      mockUpdateConversation.mockResolvedValue(undefined as never);
      const conv = makeConv({ description: 'A description' });
      const user = makeUser();

      const { result } = renderHook(() => useConversationDetails(conv, user));

      act(() => {
        result.current.setConversationDescription('New description');
      });

      await act(async () => {
        await result.current.handleSaveDescription();
      });

      expect(mockUpdateConversation).toHaveBeenCalledWith('conv-1', { description: 'New description' });
    });

    it('shows toast.success and closes edit mode on success', async () => {
      mockUpdateConversation.mockResolvedValue(undefined as never);
      const conv = makeConv({ description: 'A description' });
      const user = makeUser();

      const { result } = renderHook(() => useConversationDetails(conv, user));

      act(() => {
        result.current.setConversationDescription('New description');
      });

      await act(async () => {
        await result.current.handleSaveDescription();
      });

      expect(toast.success).toHaveBeenCalled();
      expect(result.current.isEditingDescription).toBe(false);
    });

    it('shows toast.error and resets to original description on error', async () => {
      mockUpdateConversation.mockRejectedValue(new Error('Server error'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const conv = makeConv({ description: 'A description' });
      const user = makeUser();

      const { result } = renderHook(() => useConversationDetails(conv, user));

      act(() => {
        result.current.setConversationDescription('New description');
      });

      await act(async () => {
        await result.current.handleSaveDescription();
      });

      expect(toast.error).toHaveBeenCalled();
      expect(result.current.conversationDescription).toBe('A description');
      consoleSpy.mockRestore();
    });
  });

  describe('conversation title/description sync via useEffect', () => {
    it('updates conversationName when conversation.title changes externally', () => {
      const conv = makeConv({ title: 'Original Title' });
      const user = makeUser();

      const { result, rerender } = renderHook(
        ({ c }: { c: ReturnType<typeof makeConv> }) => useConversationDetails(c, user),
        { initialProps: { c: conv } }
      );

      expect(result.current.conversationName).toBe('Original Title');

      const updatedConv = makeConv({ title: 'Updated Title' });

      act(() => {
        rerender({ c: updatedConv });
      });

      expect(result.current.conversationName).toBe('Updated Title');
    });
  });

  describe('isImageUploadDialogOpen', () => {
    it('exposes setIsImageUploadDialogOpen and it updates the state', () => {
      const conv = makeConv();
      const user = makeUser();

      const { result } = renderHook(() => useConversationDetails(conv, user));

      expect(result.current.isImageUploadDialogOpen).toBe(false);

      act(() => {
        result.current.setIsImageUploadDialogOpen(true);
      });

      expect(result.current.isImageUploadDialogOpen).toBe(true);
    });
  });
});
