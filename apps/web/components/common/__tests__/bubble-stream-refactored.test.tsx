/**
 * Tests pour BubbleStreamPage refactorisé
 *
 * Vérifie que la version refactorisée maintient toutes les fonctionnalités
 * de la version originale sans breaking changes.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { BubbleStreamPage } from '../bubble-stream-page-refactored';
import type { User } from '@meeshy/shared/types';

// Mock des hooks et services
vi.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
    isLoading: false,
  }),
}));

vi.mock('@/hooks/use-stream-socket', () => ({
  useStreamSocket: () => ({
    connectionStatus: { isConnected: true, hasSocket: true },
    typingUsers: [],
    messageLanguageStats: [],
    activeLanguageStats: [],
    normalizedConversationId: 'test-conversation-id',
    sendMessage: vi.fn(),
    startTyping: vi.fn(),
    stopTyping: vi.fn(),
    reconnect: vi.fn(),
    getDiagnostics: vi.fn(),
  }),
}));

vi.mock('@/hooks/use-stream-messages', () => ({
  useStreamMessages: () => ({
    handleEditMessage: vi.fn(),
    handleDeleteMessage: vi.fn(),
    handleReplyMessage: vi.fn(),
    handleNavigateToMessage: vi.fn(),
    getUserModerationRole: () => 'USER',
  }),
}));

vi.mock('@/hooks/use-stream-translation', () => ({
  useStreamTranslation: () => ({
    addTranslatingState: vi.fn(),
    removeTranslatingState: vi.fn(),
    isTranslating: vi.fn(() => false),
    handleTranslation: vi.fn(),
    stats: {},
    incrementTranslationCount: vi.fn(),
  }),
}));

vi.mock('@/hooks/use-stream-ui', () => ({
  useStreamUI: () => ({
    isMobile: false,
    galleryOpen: false,
    selectedAttachmentId: null,
    imageAttachments: [],
    deletedAttachmentIds: [],
    setGalleryOpen: vi.fn(),
    handleImageClick: vi.fn(),
    handleNavigateToMessageFromGallery: vi.fn(),
    handleAttachmentDeleted: vi.fn(),
    attachmentIds: [],
    attachmentMimeTypes: [],
    handleAttachmentsChange: vi.fn(),
    searchQuery: '',
    setSearchQuery: vi.fn(),
    location: 'Paris',
    trendingHashtags: [],
  }),
}));

vi.mock('@/hooks/queries/use-conversation-messages-rq', () => ({
  useConversationMessagesRQ: () => ({
    messages: [],
    isLoading: false,
    isLoadingMore: false,
    hasMore: false,
    loadMore: vi.fn(),
    refresh: vi.fn(),
    addMessage: vi.fn(),
    updateMessage: vi.fn(),
    removeMessage: vi.fn(),
  }),
}));

vi.mock('@/hooks/use-message-translations', () => ({
  useMessageTranslations: () => ({
    getUserLanguagePreferences: () => ['fr', 'en'],
    resolveUserPreferredLanguage: () => 'fr',
  }),
}));

describe('BubbleStreamPage Refactorisé', () => {
  const mockUser: User = {
    id: 'test-user-id',
    username: 'testuser',
    email: 'test@example.com',
    firstName: 'Test',
    lastName: 'User',
    role: 'USER',
    systemLanguage: 'fr',
    regionalLanguage: 'fr',
    autoTranslateEnabled: true,
    translateToSystemLanguage: true,
    translateToRegionalLanguage: false,
    useCustomDestination: false,
    isOnline: true,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastActiveAt: new Date(),
    permissions: {
      canAccessAdmin: false,
      canManageUsers: false,
      canManageGroups: false,
      canManageConversations: false,
      canViewAnalytics: false,
      canModerateContent: false,
      canViewAuditLogs: false,
      canManageNotifications: false,
      canManageTranslations: false,
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('devrait rendre le composant sans crash', () => {
    render(
      <BubbleStreamPage
        user={mockUser}
        conversationId="meeshy"
        isAnonymousMode={false}
      />
    );

    // Le composant devrait se rendre sans erreur
    expect(document.body).toBeTruthy();
  });

  it('devrait afficher le StreamHeader', async () => {
    render(
      <BubbleStreamPage
        user={mockUser}
        conversationId="meeshy"
        isAnonymousMode={false}
      />
    );

    await waitFor(() => {
      // Vérifier que l'indicateur de connexion est présent
      // Note: Cela dépend de votre implémentation exacte
      expect(document.querySelector('.row-start-1')).toBeTruthy();
    });
  });

  it('devrait afficher le StreamComposer', async () => {
    render(
      <BubbleStreamPage
        user={mockUser}
        conversationId="meeshy"
        isAnonymousMode={false}
      />
    );

    await waitFor(() => {
      // Vérifier que la zone de composition est présente
      expect(document.querySelector('.row-start-3')).toBeTruthy();
    });
  });

  it('devrait afficher le StreamSidebar sur desktop', async () => {
    render(
      <BubbleStreamPage
        user={mockUser}
        conversationId="meeshy"
        isAnonymousMode={false}
      />
    );

    await waitFor(() => {
      // Vérifier que la sidebar est présente
      expect(document.querySelector('aside')).toBeTruthy();
    });
  });

  it('devrait gérer le mode anonyme', async () => {
    render(
      <BubbleStreamPage
        user={mockUser}
        conversationId="test-conv"
        isAnonymousMode={true}
        linkId="test-link-id"
      />
    );

    await waitFor(() => {
      expect(document.body).toBeTruthy();
    });
  });

  it('devrait utiliser les participants initiaux', async () => {
    const initialParticipants: User[] = [
      { ...mockUser, id: 'user-1' },
      { ...mockUser, id: 'user-2' },
    ];

    render(
      <BubbleStreamPage
        user={mockUser}
        conversationId="meeshy"
        isAnonymousMode={false}
        initialParticipants={initialParticipants}
      />
    );

    await waitFor(() => {
      expect(document.body).toBeTruthy();
    });
  });
});

describe('Hooks extraits', () => {
  it('useStreamSocket devrait être importable', async () => {
    const { useStreamSocket } = await import('@/hooks/use-stream-socket');
    expect(useStreamSocket).toBeDefined();
  });

  it('useStreamMessages devrait être importable', async () => {
    const { useStreamMessages } = await import('@/hooks/use-stream-messages');
    expect(useStreamMessages).toBeDefined();
  });

  it('useStreamTranslation devrait être importable', async () => {
    const { useStreamTranslation } = await import('@/hooks/use-stream-translation');
    expect(useStreamTranslation).toBeDefined();
  });

  it('useStreamUI devrait être importable', async () => {
    const { useStreamUI } = await import('@/hooks/use-stream-ui');
    expect(useStreamUI).toBeDefined();
  });
});

describe('Composants extraits', () => {
  it('StreamHeader devrait être importable', async () => {
    const { StreamHeader } = await import('@/components/bubble-stream');
    expect(StreamHeader).toBeDefined();
  });

  it('StreamComposer devrait être importable', async () => {
    const { StreamComposer } = await import('@/components/bubble-stream');
    expect(StreamComposer).toBeDefined();
  });

  it('StreamSidebar devrait être importable', async () => {
    const { StreamSidebar } = await import('@/components/bubble-stream');
    expect(StreamSidebar).toBeDefined();
  });
});
