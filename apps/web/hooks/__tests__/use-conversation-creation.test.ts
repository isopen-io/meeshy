import { renderHook, waitFor } from '@testing-library/react';
import { useConversationCreation } from '../use-conversation-creation';
import { conversationsService } from '@/services/conversations.service';
import { toast } from 'sonner';

// Mock dependencies
jest.mock('@/services/conversations.service');
jest.mock('sonner');
jest.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({
    t: (key: string) => key
  })
}));

describe('useConversationCreation', () => {
  const mockConversationsService = conversationsService as jest.Mocked<typeof conversationsService>;
  const mockToast = toast as jest.Mocked<typeof toast>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should create a direct conversation successfully', async () => {
    const mockConversation = {
      id: 'conv-123',
      title: 'Direct with John',
      type: 'direct'
    };

    mockConversationsService.createConversation.mockResolvedValueOnce(mockConversation as any);

    const { result } = renderHook(() => useConversationCreation());

    expect(result.current.isCreating).toBe(false);

    const promise = result.current.createConversation({
      title: 'Direct with John',
      conversationType: 'direct',
      selectedUsers: [{ id: 'user-1', username: 'john' } as any],
      customIdentifier: '',
      selectedCommunity: undefined
    });

    expect(result.current.isCreating).toBe(true);

    const conversation = await promise;

    await waitFor(() => {
      expect(result.current.isCreating).toBe(false);
    });

    expect(conversation).toEqual(mockConversation);
    expect(mockToast.success).toHaveBeenCalledWith('createConversationModal.success.conversationCreated');
  });

  it('should create a group conversation with identifier', async () => {
    const mockConversation = {
      id: 'conv-456',
      title: 'Team Discussion',
      type: 'group',
      identifier: 'team-discussion-abc123'
    };

    mockConversationsService.createConversation.mockResolvedValueOnce(mockConversation as any);

    const { result } = renderHook(() => useConversationCreation());

    const conversation = await result.current.createConversation({
      title: 'Team Discussion',
      conversationType: 'group',
      selectedUsers: [
        { id: 'user-1', username: 'john' } as any,
        { id: 'user-2', username: 'jane' } as any
      ],
      customIdentifier: 'team-discussion-abc123',
      selectedCommunity: undefined
    });

    expect(conversation).toEqual(mockConversation);
    expect(mockConversationsService.createConversation).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Team Discussion',
        type: 'group',
        identifier: 'team-discussion-abc123',
        participantIds: ['user-1', 'user-2']
      })
    );
  });

  it('should validate participants for non-public conversations', async () => {
    const { result } = renderHook(() => useConversationCreation());

    const conversation = await result.current.createConversation({
      title: 'Empty Group',
      conversationType: 'group',
      selectedUsers: [],
      customIdentifier: 'empty-group',
      selectedCommunity: undefined
    });

    expect(conversation).toBeNull();
    expect(mockToast.error).toHaveBeenCalledWith('createConversationModal.errors.selectAtLeastOneUser');
    expect(mockConversationsService.createConversation).not.toHaveBeenCalled();
  });

  it('should handle API errors gracefully', async () => {
    const mockError = {
      message: 'Network error',
      data: { message: 'Failed to create conversation' }
    };

    mockConversationsService.createConversation.mockRejectedValueOnce(mockError);

    const { result } = renderHook(() => useConversationCreation());

    const conversation = await result.current.createConversation({
      title: 'Test',
      conversationType: 'direct',
      selectedUsers: [{ id: 'user-1', username: 'john' } as any],
      customIdentifier: '',
      selectedCommunity: undefined
    });

    expect(conversation).toBeNull();
    expect(mockToast.error).toHaveBeenCalledWith('Erreur: Failed to create conversation');
  });

  it('should include community ID when provided', async () => {
    const mockConversation = {
      id: 'conv-789',
      title: 'Community Chat',
      type: 'group'
    };

    mockConversationsService.createConversation.mockResolvedValueOnce(mockConversation as any);

    const { result } = renderHook(() => useConversationCreation());

    await result.current.createConversation({
      title: 'Community Chat',
      conversationType: 'group',
      selectedUsers: [{ id: 'user-1', username: 'john' } as any],
      customIdentifier: 'community-chat-xyz',
      selectedCommunity: 'community-123'
    });

    expect(mockConversationsService.createConversation).toHaveBeenCalledWith(
      expect.objectContaining({
        communityId: 'community-123'
      })
    );
  });
});
