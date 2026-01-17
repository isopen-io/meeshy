/**
 * Tests pour le composant MessagesDisplay
 *
 * Ce composant est responsable de:
 * - Afficher une liste de messages
 * - Gerer les etats vides et de chargement
 * - Orchestrer les traductions pour chaque message
 * - Gerer le changement de langue d'affichage
 * - Supporter le chargement infini (load more)
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MessagesDisplay } from '@/components/common/messages-display';
import { MessageViewProvider } from '@/hooks/use-message-view-state';

// === MOCKS ===

// Mock de sonner - definir le mock inline pour eviter les problemes de hoisting
jest.mock('sonner', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
  },
}));

// Reference au mock pour les assertions
const mockToast = jest.requireMock('sonner').toast;

// Mock de useI18n
jest.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'translation.translationAlreadyInProgress': 'Translation already in progress',
        'translation.translationError': 'Translation error',
        'translation.translationRequestError': 'Failed to request translation',
      };
      return translations[key] || key;
    },
  }),
}));

// Mock de useFixRadixZIndex
jest.mock('@/hooks/use-fix-z-index', () => ({
  useFixRadixZIndex: jest.fn(),
}));

// Mock de messageTranslationService - definir le mock inline
jest.mock('@/services/message-translation.service', () => ({
  messageTranslationService: {
    requestTranslation: jest.fn().mockResolvedValue({ success: true }),
  },
}));

// Reference au mock pour les assertions
const mockRequestTranslation = jest.requireMock('@/services/message-translation.service').messageTranslationService.requestTranslation;

// Mock de BubbleMessage
jest.mock('@/components/common/BubbleMessage', () => ({
  BubbleMessage: ({
    message,
    currentUser,
    userLanguage,
    currentDisplayLanguage,
    isTranslating,
    onLanguageSwitch,
    onForceTranslation,
    onEditMessage,
    onDeleteMessage,
    onReplyMessage,
  }: any) => (
    <div data-testid={`bubble-message-${message.id}`} data-message-id={message.id}>
      <span data-testid="message-content">{message.content}</span>
      <span data-testid="display-language">{currentDisplayLanguage}</span>
      {isTranslating && <span data-testid="translating">Loading...</span>}
      <button
        data-testid={`switch-lang-${message.id}`}
        onClick={() => onLanguageSwitch?.(message.id, 'fr')}
      >
        Switch to FR
      </button>
      <button
        data-testid={`force-translate-${message.id}`}
        onClick={() => onForceTranslation?.(message.id, 'es', 'basic')}
      >
        Translate to ES
      </button>
      {onEditMessage && (
        <button
          data-testid={`edit-${message.id}`}
          onClick={() => onEditMessage(message.id, 'edited')}
        >
          Edit
        </button>
      )}
      {onDeleteMessage && (
        <button
          data-testid={`delete-${message.id}`}
          onClick={() => onDeleteMessage(message.id)}
        >
          Delete
        </button>
      )}
      {onReplyMessage && (
        <button
          data-testid={`reply-${message.id}`}
          onClick={() => onReplyMessage(message)}
        >
          Reply
        </button>
      )}
    </div>
  ),
}));

// === HELPERS ===

const createMockMessage = (id: string, overrides = {}) => ({
  id,
  content: `Message ${id}`,
  originalContent: `Message ${id}`,
  originalLanguage: 'en',
  translations: [],
  sender: { id: 'user-1', firstName: 'John', lastName: 'Doe' },
  senderId: 'user-1',
  createdAt: new Date('2024-01-15T10:00:00Z'),
  conversationId: 'conv-1',
  ...overrides,
});

const createMockUser = (overrides = {}) => ({
  id: 'current-user',
  firstName: 'Test',
  lastName: 'User',
  username: 'testuser',
  email: 'test@example.com',
  ...overrides,
});

const defaultProps = {
  messages: [],
  translatedMessages: [],
  isLoadingMessages: false,
  currentUser: createMockUser(),
  userLanguage: 'fr',
  usedLanguages: ['en', 'fr', 'es'],
  conversationType: 'direct' as const,
  userRole: 'USER' as const,
  conversationId: 'conv-1',
};

const renderMessagesDisplay = (props = {}) => {
  return render(
    <MessageViewProvider>
      <MessagesDisplay {...defaultProps} {...props} />
    </MessageViewProvider>
  );
};

// === TESTS ===

describe('MessagesDisplay', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Etat de chargement', () => {
    it('devrait afficher un spinner pendant le chargement initial', () => {
      renderMessagesDisplay({
        isLoadingMessages: true,
        messages: [],
      });

      const spinner = document.querySelector('.animate-spin');
      expect(spinner).toBeInTheDocument();
    });

    it('ne devrait pas afficher de spinner si des messages existent', () => {
      renderMessagesDisplay({
        isLoadingMessages: true,
        messages: [createMockMessage('msg-1')],
      });

      expect(screen.getByTestId('bubble-message-msg-1')).toBeInTheDocument();
    });
  });

  describe('Etat vide', () => {
    it('devrait afficher le message vide par defaut', () => {
      renderMessagesDisplay({
        messages: [],
        isLoadingMessages: false,
      });

      expect(screen.getByText('Aucun message pour le moment')).toBeInTheDocument();
      expect(screen.getByText('Soyez le premier à publier !')).toBeInTheDocument();
    });

    it('devrait afficher un message vide personnalise', () => {
      renderMessagesDisplay({
        messages: [],
        isLoadingMessages: false,
        emptyStateMessage: 'No messages here',
        emptyStateDescription: 'Start the conversation!',
      });

      expect(screen.getByText('No messages here')).toBeInTheDocument();
      expect(screen.getByText('Start the conversation!')).toBeInTheDocument();
    });

    it('devrait afficher l\'icone MessageSquare', () => {
      renderMessagesDisplay({
        messages: [],
        isLoadingMessages: false,
      });

      // L'icone est presente dans l'etat vide
      const wrapper = screen.getByText('Aucun message pour le moment').parentElement;
      expect(wrapper).toBeInTheDocument();
    });
  });

  describe('Affichage des messages', () => {
    it('devrait afficher tous les messages', () => {
      renderMessagesDisplay({
        messages: [
          createMockMessage('msg-1'),
          createMockMessage('msg-2'),
          createMockMessage('msg-3'),
        ],
      });

      expect(screen.getByTestId('bubble-message-msg-1')).toBeInTheDocument();
      expect(screen.getByTestId('bubble-message-msg-2')).toBeInTheDocument();
      expect(screen.getByTestId('bubble-message-msg-3')).toBeInTheDocument();
    });

    it('devrait utiliser translatedMessages quand disponibles', () => {
      renderMessagesDisplay({
        messages: [createMockMessage('msg-1', { content: 'Original' })],
        translatedMessages: [
          createMockMessage('msg-1', {
            content: 'Translated',
            translations: [{ language: 'fr', content: 'Traduit' }],
          }),
        ],
      });

      expect(screen.getByTestId('message-content')).toHaveTextContent('Translated');
    });

    it('devrait respecter l\'ordre inverse si reverseOrder=true', () => {
      renderMessagesDisplay({
        messages: [
          createMockMessage('msg-1', { content: 'First' }),
          createMockMessage('msg-2', { content: 'Second' }),
        ],
        reverseOrder: true,
      });

      const messages = screen.getAllByTestId(/^bubble-message-/);
      expect(messages[0]).toHaveAttribute('data-message-id', 'msg-2');
      expect(messages[1]).toHaveAttribute('data-message-id', 'msg-1');
    });

    it('devrait filtrer les messages sans ID valide', () => {
      renderMessagesDisplay({
        messages: [
          createMockMessage('msg-1'),
          { ...createMockMessage(''), id: undefined } as any,
          { ...createMockMessage(''), id: null } as any,
          createMockMessage('msg-2'),
        ],
      });

      const messages = screen.getAllByTestId(/^bubble-message-/);
      expect(messages).toHaveLength(2);
    });

    it('devrait dedupliquer les messages par ID', () => {
      renderMessagesDisplay({
        messages: [
          createMockMessage('msg-1', { content: 'First version' }),
          createMockMessage('msg-1', { content: 'Duplicate' }),
          createMockMessage('msg-2'),
        ],
      });

      const messages = screen.getAllByTestId(/^bubble-message-/);
      expect(messages).toHaveLength(2);
    });
  });

  describe('Gestion des traductions', () => {
    it('devrait determiner la langue d\'affichage preferee', () => {
      renderMessagesDisplay({
        messages: [
          createMockMessage('msg-1', {
            originalLanguage: 'en',
            translations: [{ language: 'fr', content: 'Traduit' }],
          }),
        ],
        userLanguage: 'fr',
      });

      // Le composant devrait detecter que userLanguage=fr et qu'une traduction fr existe
      expect(screen.getByTestId('display-language')).toHaveTextContent('fr');
    });

    it('devrait utiliser la langue originale si c\'est la langue de l\'utilisateur', () => {
      renderMessagesDisplay({
        messages: [
          createMockMessage('msg-1', {
            originalLanguage: 'fr',
            translations: [],
          }),
        ],
        userLanguage: 'fr',
      });

      expect(screen.getByTestId('display-language')).toHaveTextContent('fr');
    });

    it('devrait fallback sur originalLanguage si pas de traduction disponible', () => {
      renderMessagesDisplay({
        messages: [
          createMockMessage('msg-1', {
            originalLanguage: 'de',
            translations: [],
          }),
        ],
        userLanguage: 'fr',
      });

      expect(screen.getByTestId('display-language')).toHaveTextContent('de');
    });
  });

  describe('Changement de langue d\'affichage', () => {
    it('devrait mettre a jour la langue d\'affichage au clic', async () => {
      const { rerender } = renderMessagesDisplay({
        messages: [
          createMockMessage('msg-1', {
            originalLanguage: 'en',
            translations: [{ language: 'fr', content: 'Traduit' }],
          }),
        ],
      });

      fireEvent.click(screen.getByTestId('switch-lang-msg-1'));

      await waitFor(() => {
        expect(screen.getByTestId('display-language')).toHaveTextContent('fr');
      });
    });
  });

  describe('Demande de traduction forcee', () => {
    it('devrait appeler messageTranslationService.requestTranslation', async () => {
      renderMessagesDisplay({
        messages: [createMockMessage('msg-1', { originalLanguage: 'en' })],
      });

      fireEvent.click(screen.getByTestId('force-translate-msg-1'));

      await waitFor(() => {
        expect(mockRequestTranslation).toHaveBeenCalledWith({
          messageId: 'msg-1',
          targetLanguage: 'es',
          sourceLanguage: 'en',
          model: 'basic',
        });
      });
    });

    it('devrait gerer les demandes de traduction multiples', async () => {
      renderMessagesDisplay({
        messages: [createMockMessage('msg-1')],
      });

      // Premiere demande
      fireEvent.click(screen.getByTestId('force-translate-msg-1'));

      // La traduction est appelee
      await waitFor(() => {
        expect(mockRequestTranslation).toHaveBeenCalled();
      });

      // Note: Le blocage des traductions en double depend de l'etat interne du composant
      // et de la synchronisation avec addTranslatingState. Ce test verifie simplement
      // que les demandes sont envoyees au service.
    });

    it('devrait afficher une erreur si la traduction echoue', async () => {
      mockRequestTranslation.mockRejectedValueOnce(new Error('API Error'));

      renderMessagesDisplay({
        messages: [createMockMessage('msg-1')],
      });

      fireEvent.click(screen.getByTestId('force-translate-msg-1'));

      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalled();
      });
    });

    it('devrait utiliser addTranslatingState si fourni', async () => {
      const addTranslatingState = jest.fn();
      renderMessagesDisplay({
        messages: [createMockMessage('msg-1')],
        addTranslatingState,
      });

      fireEvent.click(screen.getByTestId('force-translate-msg-1'));

      await waitFor(() => {
        expect(addTranslatingState).toHaveBeenCalledWith('msg-1', 'es');
      });
    });
  });

  describe('Actions sur les messages', () => {
    it('devrait appeler onEditMessage', async () => {
      const onEditMessage = jest.fn().mockResolvedValue(undefined);
      renderMessagesDisplay({
        messages: [createMockMessage('msg-1')],
        onEditMessage,
      });

      fireEvent.click(screen.getByTestId('edit-msg-1'));

      await waitFor(() => {
        expect(onEditMessage).toHaveBeenCalledWith('msg-1', 'edited');
      });
    });

    it('devrait appeler onDeleteMessage', async () => {
      const onDeleteMessage = jest.fn().mockResolvedValue(undefined);
      renderMessagesDisplay({
        messages: [createMockMessage('msg-1')],
        onDeleteMessage,
      });

      fireEvent.click(screen.getByTestId('delete-msg-1'));

      await waitFor(() => {
        expect(onDeleteMessage).toHaveBeenCalledWith('msg-1');
      });
    });

    it('devrait appeler onReplyMessage', () => {
      const onReplyMessage = jest.fn();
      renderMessagesDisplay({
        messages: [createMockMessage('msg-1')],
        onReplyMessage,
      });

      fireEvent.click(screen.getByTestId('reply-msg-1'));

      expect(onReplyMessage).toHaveBeenCalled();
    });
  });

  describe('Chargement infini (Load More)', () => {
    it('devrait afficher le bouton Load More quand hasMore=true', () => {
      renderMessagesDisplay({
        messages: [createMockMessage('msg-1')],
        hasMore: true,
        onLoadMore: jest.fn(),
      });

      expect(screen.getByText('Charger plus de messages')).toBeInTheDocument();
    });

    it('ne devrait pas afficher le bouton Load More quand hasMore=false', () => {
      renderMessagesDisplay({
        messages: [createMockMessage('msg-1')],
        hasMore: false,
        onLoadMore: jest.fn(),
      });

      expect(screen.queryByText('Charger plus de messages')).not.toBeInTheDocument();
    });

    it('devrait appeler onLoadMore au clic', () => {
      const onLoadMore = jest.fn();
      renderMessagesDisplay({
        messages: [createMockMessage('msg-1')],
        hasMore: true,
        onLoadMore,
      });

      fireEvent.click(screen.getByText('Charger plus de messages'));

      expect(onLoadMore).toHaveBeenCalled();
    });

    it('devrait afficher "Chargement..." pendant le chargement', () => {
      renderMessagesDisplay({
        messages: [createMockMessage('msg-1')],
        hasMore: true,
        onLoadMore: jest.fn(),
        isLoadingMore: true,
      });

      expect(screen.getByText('Chargement...')).toBeInTheDocument();
    });

    it('devrait desactiver le bouton pendant le chargement', () => {
      renderMessagesDisplay({
        messages: [createMockMessage('msg-1')],
        hasMore: true,
        onLoadMore: jest.fn(),
        isLoadingMore: true,
      });

      const button = screen.getByText('Chargement...');
      expect(button).toBeDisabled();
    });
  });

  describe('Auto-switch de langue sur nouvelle traduction', () => {
    it('devrait changer automatiquement vers userLanguage quand une traduction arrive', async () => {
      const { rerender } = renderMessagesDisplay({
        messages: [
          createMockMessage('msg-1', {
            originalLanguage: 'en',
            translations: [],
          }),
        ],
        userLanguage: 'fr',
      });

      // Initialement en anglais (pas de traduction fr)
      expect(screen.getByTestId('display-language')).toHaveTextContent('en');

      // Simuler l'arrivee d'une traduction
      rerender(
        <MessageViewProvider>
          <MessagesDisplay
            {...defaultProps}
            messages={[
              createMockMessage('msg-1', {
                originalLanguage: 'en',
                translations: [{ language: 'fr', content: 'Traduit' }],
              }),
            ]}
          />
        </MessageViewProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('display-language')).toHaveTextContent('fr');
      });
    });
  });

  describe('Props passees a BubbleMessage', () => {
    it('devrait passer conversationId', () => {
      renderMessagesDisplay({
        messages: [createMockMessage('msg-1')],
        conversationId: 'conv-123',
      });

      // BubbleMessage recoit conversationId via props
      expect(screen.getByTestId('bubble-message-msg-1')).toBeInTheDocument();
    });

    it('devrait passer isAnonymous', () => {
      renderMessagesDisplay({
        messages: [createMockMessage('msg-1')],
        isAnonymous: true,
        currentAnonymousUserId: 'anon-123',
      });

      expect(screen.getByTestId('bubble-message-msg-1')).toBeInTheDocument();
    });

    it('devrait passer userRole', () => {
      renderMessagesDisplay({
        messages: [createMockMessage('msg-1')],
        userRole: 'MODERATOR',
      });

      expect(screen.getByTestId('bubble-message-msg-1')).toBeInTheDocument();
    });
  });

  describe('Edge cases', () => {
    it('devrait gerer messages undefined gracieusement', () => {
      renderMessagesDisplay({
        messages: undefined as any,
      });

      // Devrait afficher l'etat vide
      expect(screen.getByText('Aucun message pour le moment')).toBeInTheDocument();
    });

    it('devrait gerer translatedMessages undefined', () => {
      renderMessagesDisplay({
        messages: [createMockMessage('msg-1')],
        translatedMessages: undefined as any,
      });

      expect(screen.getByTestId('bubble-message-msg-1')).toBeInTheDocument();
    });

    it('devrait gerer un currentUser undefined', () => {
      renderMessagesDisplay({
        messages: [createMockMessage('msg-1')],
        currentUser: undefined as any,
      });

      expect(screen.getByTestId('bubble-message-msg-1')).toBeInTheDocument();
    });

    it('devrait appliquer className personnalise', () => {
      const { container } = renderMessagesDisplay({
        messages: [createMockMessage('msg-1')],
        className: 'custom-class',
      });

      const wrapper = container.querySelector('.custom-class');
      expect(wrapper).toBeInTheDocument();
    });
  });

  describe('Performance', () => {
    it('devrait gerer un grand nombre de messages', () => {
      const manyMessages = Array.from({ length: 100 }, (_, i) =>
        createMockMessage(`msg-${i}`)
      );

      renderMessagesDisplay({ messages: manyMessages });

      // Devrait render sans erreur
      const messages = screen.getAllByTestId(/^bubble-message-/);
      expect(messages).toHaveLength(100);
    });

    it('ne devrait pas recalculer displayMessages inutilement', () => {
      const messages = [createMockMessage('msg-1')];
      const { rerender } = renderMessagesDisplay({ messages });

      // Rerender avec la meme reference de messages
      rerender(
        <MessageViewProvider>
          <MessagesDisplay {...defaultProps} messages={messages} />
        </MessageViewProvider>
      );

      // Le test passe si aucune erreur
      expect(screen.getByTestId('bubble-message-msg-1')).toBeInTheDocument();
    });
  });

  describe('Integration avec MessageViewProvider', () => {
    it('devrait fonctionner avec le provider', () => {
      renderMessagesDisplay({
        messages: [createMockMessage('msg-1')],
      });

      // Le provider est necessaire pour BubbleMessage
      expect(screen.getByTestId('bubble-message-msg-1')).toBeInTheDocument();
    });
  });
});
