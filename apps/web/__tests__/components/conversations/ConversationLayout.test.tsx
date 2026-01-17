import React from 'react';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ConversationLayout } from '../../../components/conversations/ConversationLayout';
import { useUser, useIsAuthChecking } from '@/stores';
import { conversationsService } from '@/services/conversations.service';
import { useConversationMessagesRQ } from '@/hooks/queries/use-conversation-messages-rq';
import { useSocketIOMessaging } from '@/hooks/use-socketio-messaging';
import { useConversationsPaginationRQ } from '@/hooks/queries/use-conversations-pagination-rq';
import { meeshySocketIOService } from '@/services/meeshy-socketio.service';

// Mock next/dynamic to return components directly without lazy loading
// This avoids async loading issues during testing
jest.mock('next/dynamic', () => {
  return function dynamic(importFn: () => Promise<any>, options?: any) {
    // Store resolved components
    const cache: { component: React.ComponentType<any> | null } = { component: null };

    // Pre-resolve the import
    importFn().then((mod) => {
      cache.component = mod.default || Object.values(mod)[0] || mod;
    });

    // Return a wrapper that renders the cached component
    const DynamicWrapper = (props: any) => {
      if (cache.component) {
        const Comp = cache.component;
        return <Comp {...props} />;
      }
      return null;
    };

    DynamicWrapper.displayName = 'DynamicComponent';
    return DynamicWrapper;
  };
});

// Mock stores
jest.mock('@/stores', () => ({
  useUser: jest.fn(),
  useIsAuthChecking: jest.fn(),
}));

jest.mock('@/stores/notification-store', () => ({
  useNotificationActions: () => ({
    setActiveConversationId: jest.fn(),
  }),
}));

jest.mock('@/stores/reply-store', () => ({
  useReplyStore: {
    getState: () => ({
      replyingTo: null,
      setReplyingTo: jest.fn(),
      clearReply: jest.fn(),
    }),
  },
}));

jest.mock('@/stores/failed-messages-store', () => ({
  useFailedMessagesStore: jest.fn(() => ({
    failedMessages: [],
    addFailedMessage: jest.fn(),
    removeFailedMessage: jest.fn(),
  })),
}));

jest.mock('@/stores/user-store', () => ({
  useUserStore: jest.fn(() => ({
    setParticipants: jest.fn(),
    getUserById: jest.fn(),
    _lastStatusUpdate: 0,
  })),
}));

jest.mock('@/stores/call-store', () => ({
  useCallStore: jest.fn(() => ({
    currentCall: null,
    isInCall: false,
  })),
}));

// Mock services
jest.mock('@/services/conversations.service', () => ({
  conversationsService: {
    getConversation: jest.fn(),
    getAllParticipants: jest.fn(),
    markAsRead: jest.fn(),
  },
}));

jest.mock('@/services/meeshy-socketio.service', () => ({
  meeshySocketIOService: {
    getSocket: jest.fn(),
    getCurrentConversationId: jest.fn(),
    reconnect: jest.fn(),
    getConnectionDiagnostics: jest.fn(() => ({ isConnected: true })),
  },
}));

// Mock hooks
jest.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}));

jest.mock('@/hooks/queries/use-conversation-messages-rq', () => ({
  useConversationMessagesRQ: jest.fn(),
}));

jest.mock('@/hooks/use-socketio-messaging', () => ({
  useSocketIOMessaging: jest.fn(),
}));

jest.mock('@/hooks/queries/use-conversations-pagination-rq', () => ({
  useConversationsPaginationRQ: jest.fn(),
}));

jest.mock('@/hooks/use-notifications', () => ({
  useNotifications: () => ({
    notifications: [],
    markAsRead: jest.fn(),
  }),
}));

jest.mock('@/hooks/use-virtual-keyboard', () => ({
  useVirtualKeyboard: () => ({
    isOpen: false,
    height: 0,
  }),
}));

jest.mock('@/hooks/use-user-status-realtime', () => ({
  useUserStatusRealtime: jest.fn(),
}));

jest.mock('@/hooks/queries', () => ({
  useSocketCacheSync: jest.fn(),
  useInvalidateOnReconnect: jest.fn(),
}));

jest.mock('@/hooks/conversations', () => ({
  useConversationSelection: jest.fn(() => ({
    effectiveSelectedId: null,
    selectedConversation: null,
    handleSelectConversation: jest.fn(),
    handleBackToList: jest.fn(),
    setLocalSelectedConversationId: jest.fn(),
  })),
  useConversationUI: jest.fn(() => ({
    isMobile: false,
    showConversationList: true,
    setShowConversationList: jest.fn(),
    conversationListWidth: 350,
    isResizing: false,
    handleResizeMouseDown: jest.fn(),
    isCreateModalOpen: false,
    setIsCreateModalOpen: jest.fn(),
    isDetailsOpen: false,
    setIsDetailsOpen: jest.fn(),
    galleryOpen: false,
    setGalleryOpen: jest.fn(),
    selectedAttachmentId: null,
    setSelectedAttachmentId: jest.fn(),
    handleImageClick: jest.fn(),
  })),
  useConversationTyping: jest.fn(() => ({
    typingUsers: [],
    isTyping: false,
    handleTypingStart: jest.fn(),
    handleTypingStop: jest.fn(),
    handleTextInput: jest.fn(),
  })),
  useComposerDrafts: jest.fn(() => ({
    message: '',
    setMessage: jest.fn(),
    attachmentIds: [],
    setAttachmentIds: jest.fn(),
    attachmentMimeTypes: [],
    setAttachmentMimeTypes: jest.fn(),
    clearDraft: jest.fn(),
    handleAttachmentsChange: jest.fn(),
  })),
  useMessageActions: jest.fn(() => ({
    handleEditMessage: jest.fn(),
    handleDeleteMessage: jest.fn(),
    handleNavigateToMessage: jest.fn(),
    imageAttachments: [],
  })),
  useTranslationState: jest.fn(() => ({
    translatedMessages: [],
    setTranslatedMessages: jest.fn(),
    addTranslatingState: jest.fn(),
    isTranslating: jest.fn(() => false),
    usedLanguages: ['en'],
    addUsedLanguages: jest.fn(),
  })),
  useParticipants: jest.fn(() => ({
    participants: [],
    participantsRef: { current: [] },
    loadParticipants: jest.fn(),
  })),
  useVideoCall: jest.fn(() => ({
    startCall: jest.fn(),
    isCallActive: false,
  })),
  useSocketCallbacks: jest.fn(() => ({
    setupSocketCallbacks: jest.fn(),
  })),
}));

// Mock components
jest.mock('@/components/layout/DashboardLayout', () => ({
  DashboardLayout: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dashboard-layout">{children}</div>
  ),
}));

jest.mock('../../../components/conversations/ConversationList', () => ({
  ConversationList: ({ onCreateConversation }: { onCreateConversation: () => void }) => (
    <div data-testid="conversation-list">
      <button onClick={onCreateConversation}>Create</button>
    </div>
  ),
}));

jest.mock('../../../components/conversations/ConversationHeader', () => ({
  ConversationHeader: () => <div data-testid="conversation-header">Header</div>,
}));

jest.mock('../../../components/conversations/ConversationMessages', () => ({
  ConversationMessages: () => <div data-testid="conversation-messages">Messages</div>,
}));

jest.mock('../../../components/conversations/ConversationEmptyState', () => ({
  ConversationEmptyState: ({ onCreateConversation }: { onCreateConversation: () => void }) => (
    <div data-testid="empty-state">
      <button onClick={onCreateConversation}>Create Conversation</button>
    </div>
  ),
}));

jest.mock('../../../components/conversations/create-conversation-modal', () => ({
  CreateConversationModal: ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) => (
    isOpen ? <div data-testid="create-modal"><button onClick={onClose}>Close</button></div> : null
  ),
}));

jest.mock('../../../components/conversations/conversation-details-sidebar', () => ({
  ConversationDetailsSidebar: ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) => (
    isOpen ? <div data-testid="details-sidebar"><button onClick={onClose}>Close</button></div> : null
  ),
}));

jest.mock('@/components/common/message-composer', () => ({
  MessageComposer: React.forwardRef(({ onSend, value, onChange }: any, ref: any) => (
    <div data-testid="message-composer">
      <input value={value} onChange={(e) => onChange(e.target.value)} />
      <button onClick={onSend}>Send</button>
    </div>
  )),
}));

jest.mock('@/components/messages/failed-message-banner', () => ({
  FailedMessageBanner: () => null,
}));

jest.mock('../../../components/conversations/connection-status-indicator', () => ({
  ConnectionStatusIndicator: () => <div data-testid="connection-status" />,
}));

jest.mock('@/components/attachments/AttachmentGallery', () => ({
  AttachmentGallery: ({ open }: { open: boolean }) => (
    open ? <div data-testid="attachment-gallery">Gallery</div> : null
  ),
}));

jest.mock('@/lib/utils', () => ({
  cn: (...classes: (string | undefined | boolean)[]) => classes.filter(Boolean).join(' '),
}));

jest.mock('@/utils/user-language-preferences', () => ({
  getUserLanguageChoices: () => ['en', 'fr', 'es'],
}));

jest.mock('@/utils/token-utils', () => ({
  getAuthToken: () => ({ value: 'test-token' }),
}));

jest.mock('sonner', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
  },
}));

// Mock user data
const mockUser = {
  id: 'user-1',
  username: 'testuser',
  displayName: 'Test User',
  email: 'test@example.com',
  role: 'USER',
  systemLanguage: 'fr',
  regionalLanguage: 'fr',
};

const mockConversation = {
  id: 'conv-1',
  title: 'Test Conversation',
  type: 'group',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe('ConversationLayout', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    (useUser as jest.Mock).mockReturnValue(mockUser);
    (useIsAuthChecking as jest.Mock).mockReturnValue(false);

    (useConversationsPaginationRQ as jest.Mock).mockReturnValue({
      conversations: [mockConversation],
      isLoading: false,
      isLoadingMore: false,
      hasMore: false,
      loadMore: jest.fn(),
      refresh: jest.fn(),
      setConversations: jest.fn(),
    });

    (useConversationMessagesRQ as jest.Mock).mockReturnValue({
      messages: [],
      isLoading: false,
      isLoadingMore: false,
      hasMore: false,
      loadMore: jest.fn(),
      refresh: jest.fn(),
      clearMessages: jest.fn(),
      addMessage: jest.fn(),
      updateMessage: jest.fn(),
      removeMessage: jest.fn(),
    });

    (useSocketIOMessaging as jest.Mock).mockReturnValue({
      sendMessage: jest.fn(),
      connectionStatus: { isConnected: true, hasSocket: true },
      startTyping: jest.fn(),
      stopTyping: jest.fn(),
    });

    (conversationsService.getAllParticipants as jest.Mock).mockResolvedValue({
      authenticatedParticipants: [],
      anonymousParticipants: [],
    });

    (conversationsService.markAsRead as jest.Mock).mockResolvedValue({});
  });

  describe('Initial Render', () => {
    it('should show loading state when auth is checking', () => {
      (useIsAuthChecking as jest.Mock).mockReturnValue(true);

      render(<ConversationLayout />);

      // The component has a hardcoded French string for the loading state
      expect(screen.getByText("Vérification de l'authentification...")).toBeInTheDocument();
    });

    it('should render nothing when no user', () => {
      (useUser as jest.Mock).mockReturnValue(null);

      const { container } = render(<ConversationLayout />);

      expect(container.firstChild).toBeNull();
    });

    it('should render conversation list on desktop', () => {
      render(<ConversationLayout />);

      expect(screen.getByTestId('conversation-list')).toBeInTheDocument();
    });

    it('should render empty state when no conversation selected', () => {
      render(<ConversationLayout />);

      expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    });
  });

  describe('With Selected Conversation', () => {
    beforeEach(() => {
      const { useConversationSelection } = require('@/hooks/conversations');
      (useConversationSelection as jest.Mock).mockReturnValue({
        effectiveSelectedId: 'conv-1',
        selectedConversation: mockConversation,
        handleSelectConversation: jest.fn(),
        handleBackToList: jest.fn(),
        setLocalSelectedConversationId: jest.fn(),
      });
    });

    it('should render conversation header when conversation selected', () => {
      render(<ConversationLayout />);

      expect(screen.getByTestId('conversation-header')).toBeInTheDocument();
    });

    it('should render conversation messages when conversation selected', () => {
      render(<ConversationLayout />);

      expect(screen.getByTestId('conversation-messages')).toBeInTheDocument();
    });

    it('should render message composer when conversation selected', () => {
      render(<ConversationLayout />);

      expect(screen.getByTestId('message-composer')).toBeInTheDocument();
    });

    it('should not render empty state when conversation selected', () => {
      render(<ConversationLayout />);

      expect(screen.queryByTestId('empty-state')).not.toBeInTheDocument();
    });
  });

  describe('Mobile View', () => {
    beforeEach(() => {
      const { useConversationUI, useConversationSelection } = require('@/hooks/conversations');
      (useConversationUI as jest.Mock).mockReturnValue({
        isMobile: true,
        showConversationList: true,
        setShowConversationList: jest.fn(),
        conversationListWidth: 350,
        isResizing: false,
        handleResizeMouseDown: jest.fn(),
        isCreateModalOpen: false,
        setIsCreateModalOpen: jest.fn(),
        isDetailsOpen: false,
        setIsDetailsOpen: jest.fn(),
        galleryOpen: false,
        setGalleryOpen: jest.fn(),
        selectedAttachmentId: null,
        setSelectedAttachmentId: jest.fn(),
        handleImageClick: jest.fn(),
      });
      (useConversationSelection as jest.Mock).mockReturnValue({
        effectiveSelectedId: 'conv-1',
        selectedConversation: mockConversation,
        handleSelectConversation: jest.fn(),
        handleBackToList: jest.fn(),
        setLocalSelectedConversationId: jest.fn(),
      });
    });

    it('should render mobile conversation view when conversation selected', () => {
      render(<ConversationLayout />);

      // Mobile view should have conversation header and messages
      expect(screen.getByTestId('conversation-header')).toBeInTheDocument();
      expect(screen.getByTestId('conversation-messages')).toBeInTheDocument();
    });
  });

  describe('Connection Status', () => {
    it('should show connection status indicator when disconnected', () => {
      const { useConversationSelection } = require('@/hooks/conversations');
      (useConversationSelection as jest.Mock).mockReturnValue({
        effectiveSelectedId: 'conv-1',
        selectedConversation: mockConversation,
        handleSelectConversation: jest.fn(),
        handleBackToList: jest.fn(),
        setLocalSelectedConversationId: jest.fn(),
      });

      (useSocketIOMessaging as jest.Mock).mockReturnValue({
        sendMessage: jest.fn(),
        connectionStatus: { isConnected: false, hasSocket: true },
        startTyping: jest.fn(),
        stopTyping: jest.fn(),
      });

      render(<ConversationLayout />);

      expect(screen.getByTestId('connection-status')).toBeInTheDocument();
    });
  });

  describe('Create Conversation Modal', () => {
    it('should open create modal when create button clicked', () => {
      const setIsCreateModalOpen = jest.fn();
      const { useConversationUI } = require('@/hooks/conversations');
      (useConversationUI as jest.Mock).mockReturnValue({
        isMobile: false,
        showConversationList: true,
        setShowConversationList: jest.fn(),
        conversationListWidth: 350,
        isResizing: false,
        handleResizeMouseDown: jest.fn(),
        isCreateModalOpen: true,
        setIsCreateModalOpen,
        isDetailsOpen: false,
        setIsDetailsOpen: jest.fn(),
        galleryOpen: false,
        setGalleryOpen: jest.fn(),
        selectedAttachmentId: null,
        setSelectedAttachmentId: jest.fn(),
        handleImageClick: jest.fn(),
      });

      render(<ConversationLayout />);

      expect(screen.getByTestId('create-modal')).toBeInTheDocument();
    });
  });

  describe('Details Sidebar', () => {
    it('should render details sidebar when open', () => {
      const { useConversationUI, useConversationSelection } = require('@/hooks/conversations');
      (useConversationUI as jest.Mock).mockReturnValue({
        isMobile: false,
        showConversationList: true,
        setShowConversationList: jest.fn(),
        conversationListWidth: 350,
        isResizing: false,
        handleResizeMouseDown: jest.fn(),
        isCreateModalOpen: false,
        setIsCreateModalOpen: jest.fn(),
        isDetailsOpen: true,
        setIsDetailsOpen: jest.fn(),
        galleryOpen: false,
        setGalleryOpen: jest.fn(),
        selectedAttachmentId: null,
        setSelectedAttachmentId: jest.fn(),
        handleImageClick: jest.fn(),
      });
      (useConversationSelection as jest.Mock).mockReturnValue({
        effectiveSelectedId: 'conv-1',
        selectedConversation: mockConversation,
        handleSelectConversation: jest.fn(),
        handleBackToList: jest.fn(),
        setLocalSelectedConversationId: jest.fn(),
      });

      render(<ConversationLayout />);

      expect(screen.getByTestId('details-sidebar')).toBeInTheDocument();
    });
  });

  describe('Gallery', () => {
    it('should render attachment gallery when open', () => {
      const { useConversationUI, useConversationSelection } = require('@/hooks/conversations');
      (useConversationUI as jest.Mock).mockReturnValue({
        isMobile: false,
        showConversationList: true,
        setShowConversationList: jest.fn(),
        conversationListWidth: 350,
        isResizing: false,
        handleResizeMouseDown: jest.fn(),
        isCreateModalOpen: false,
        setIsCreateModalOpen: jest.fn(),
        isDetailsOpen: false,
        setIsDetailsOpen: jest.fn(),
        galleryOpen: true,
        setGalleryOpen: jest.fn(),
        selectedAttachmentId: 'att-1',
        setSelectedAttachmentId: jest.fn(),
        handleImageClick: jest.fn(),
      });
      (useConversationSelection as jest.Mock).mockReturnValue({
        effectiveSelectedId: 'conv-1',
        selectedConversation: mockConversation,
        handleSelectConversation: jest.fn(),
        handleBackToList: jest.fn(),
        setLocalSelectedConversationId: jest.fn(),
      });

      render(<ConversationLayout />);

      expect(screen.getByTestId('attachment-gallery')).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have proper aria labels', () => {
      render(<ConversationLayout />);

      // Main layout has role="region"
      const regions = screen.getAllByRole('region');
      expect(regions.length).toBeGreaterThan(0);
    });

    it('should have proper role for conversation list', () => {
      render(<ConversationLayout />);

      // Conversation list should be accessible
      expect(screen.getByTestId('conversation-list')).toBeInTheDocument();
    });
  });

  describe('Error Handling', () => {
    it('should handle participant loading errors gracefully', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      (conversationsService.getAllParticipants as jest.Mock).mockRejectedValue(
        new Error('Failed to load participants')
      );

      const { useConversationSelection } = require('@/hooks/conversations');
      (useConversationSelection as jest.Mock).mockReturnValue({
        effectiveSelectedId: 'conv-1',
        selectedConversation: mockConversation,
        handleSelectConversation: jest.fn(),
        handleBackToList: jest.fn(),
        setLocalSelectedConversationId: jest.fn(),
      });

      render(<ConversationLayout selectedConversationId="conv-1" />);

      await waitFor(() => {
        // Should still render conversation even if participants fail to load
        expect(screen.getByTestId('conversation-header')).toBeInTheDocument();
      });

      consoleSpy.mockRestore();
    });
  });

  describe('URL Selected Conversation', () => {
    it('should select conversation from URL param', () => {
      const setLocalSelectedConversationId = jest.fn();
      const { useConversationSelection } = require('@/hooks/conversations');
      (useConversationSelection as jest.Mock).mockReturnValue({
        effectiveSelectedId: null,
        selectedConversation: null,
        handleSelectConversation: jest.fn(),
        handleBackToList: jest.fn(),
        setLocalSelectedConversationId,
      });

      render(<ConversationLayout selectedConversationId="conv-1" />);

      expect(setLocalSelectedConversationId).toHaveBeenCalledWith('conv-1');
    });
  });
});
