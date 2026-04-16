'use client';

import { useRef, useEffect, useCallback, memo, useState } from 'react';
import { cn } from '@/lib/utils';
import type {
  Message,
  MessageWithTranslations,
  SocketIOUser as User,
  ConversationType
} from '@meeshy/shared/types';
import { MessagesDisplay } from '@/components/common/messages-display';
import { useFixRadixZIndex } from '@/hooks/use-fix-z-index';
import { Button } from '@/components/ui/button';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { getSenderUserId } from '@meeshy/shared/utils/sender-identity';
import { meeshySocketIOService } from '@/services/meeshy-socketio.service';

interface ConversationMessagesProps {
  messages: Message[];
  translatedMessages: MessageWithTranslations[];
  isLoadingMessages: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  currentUser: User;
  userLanguage: string;
  usedLanguages: string[];
  isMobile: boolean;
  conversationType?: ConversationType;
  userRole: string;
  conversationId?: string;
  isAnonymous?: boolean; // Add isAnonymous for anonymous reactions
  currentAnonymousUserId?: string; // Add anonymous user ID for reactions
  addTranslatingState: (messageId: string, targetLanguage: string) => void;
  isTranslating: (messageId: string, targetLanguage: string) => boolean;
  onEditMessage: (messageId: string, newContent: string, originalLanguage: string) => Promise<void>;
  onDeleteMessage: (messageId: string) => Promise<void>;
  onReplyMessage?: (message: Message) => void;
  onNavigateToMessage?: (messageId: string) => void;
  onImageClick?: (attachmentId: string) => void;
  onRetryMessage?: (tempId: string, content: string, language: string, replyToId?: string) => void;
  onCancelMessage?: (tempId: string) => void;
  onLoadMore?: () => void;
  t: (key: string) => string;
  tCommon?: (key: string) => string; // Traductions du namespace common
  reverseOrder?: boolean; // true = récent en haut (BubbleStream), false = ancien en haut (Conversations)
  scrollDirection?: 'up' | 'down'; // Direction du scroll pour charger plus: 'up' = haut (défaut), 'down' = bas
  scrollButtonDirection?: 'up' | 'down'; // Direction du bouton scroll: 'up' = ArrowUp (BubbleStream), 'down' = ArrowDown (Conversations)
  scrollContainerRef?: React.RefObject<HTMLDivElement | null>; // Ref externe du conteneur de scroll (pour BubbleStream)
}

const ConversationMessagesComponent = memo(function ConversationMessages({
  messages,
  translatedMessages,
  isLoadingMessages,
  isLoadingMore,
  hasMore,
  currentUser,
  userLanguage,
  usedLanguages,
  isMobile,
  conversationType,
  userRole,
  conversationId,
  isAnonymous = false,
  currentAnonymousUserId,
  addTranslatingState,
  isTranslating,
  onEditMessage,
  onDeleteMessage,
  onReplyMessage,
  onNavigateToMessage,
  onImageClick,
  onRetryMessage,
  onCancelMessage,
  onLoadMore,
  t,
  tCommon,
  reverseOrder = false,
  scrollDirection = 'up', // Par défaut: scroll vers le haut (comportement classique messagerie)
  scrollButtonDirection = 'down', // Par défaut: ArrowDown pour Conversations (descendre vers récent)
  scrollContainerRef // Ref externe du conteneur de scroll (optionnelle)
}: ConversationMessagesProps) {
  // Hook pour fixer les z-index des popovers Radix UI
  useFixRadixZIndex();

  // Stable ref for the getMessageById callback — identity never changes, but always reads latest translatedMessages
  const getMessageByIdRef = useRef((messageId: string) =>
    (translatedMessages as Message[]).find(msg => msg.id === messageId)
  );
  getMessageByIdRef.current = (messageId: string) =>
    (translatedMessages as Message[]).find(msg => msg.id === messageId);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      meeshySocketIOService.setGetMessageByIdCallback(
        (messageId: string) => getMessageByIdRef.current(messageId)
      );
    }
  }, []);

  // Utiliser le ref externe SI fourni, sinon créer un ref local
  const internalScrollAreaRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = scrollContainerRef || internalScrollAreaRef;
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const previousMessageCountRef = useRef(0);
  const isAutoScrollingRef = useRef(true);
  
  // Ref pour tracker si c'est le premier chargement
  const isFirstLoadRef = useRef(true);

  // Ref pour tracker l'ID du message le plus récent (détection nouveaux vs anciens)
  const lastNewestMessageIdRef = useRef<string | null>(null);
  
  // Ref pour tracker si l'utilisateur est en train de consulter l'historique
  const isUserScrollingHistoryRef = useRef(false);
  
  // État pour afficher/masquer le bouton "Scroll to bottom"
  const [showScrollButton, setShowScrollButton] = useState(false);

  // Fonction pour vérifier si l'utilisateur est en bas de la conversation
  const isUserAtBottom = useCallback(() => {
    if (!scrollAreaRef.current) return true;
    
    const container = scrollAreaRef.current;
    const { scrollTop, scrollHeight, clientHeight } = container;
    
    // Considérer l'utilisateur "en bas" s'il est à moins de 150px du bas
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    const isAtBottom = distanceFromBottom < 150;
    
    
    return isAtBottom;
  }, []);

  // Fonction pour scroller vers le bas
  const scrollToBottom = useCallback((smooth = true) => {
    const container = scrollAreaRef.current;
    if (container) {
      if (smooth) {
        container.scrollTo({
          top: container.scrollHeight,
          behavior: 'smooth',
        });
      } else {
        container.scrollTop = container.scrollHeight;
      }
    }
  }, [scrollAreaRef]);

  // Fonction pour scroller vers le haut (pour BubbleStream avec scrollDirection='down')
  const scrollToTop = useCallback((smooth = true) => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTo({
        top: 0,
        behavior: smooth ? 'smooth' : 'auto'
      });
    }
  }, []);

  // Fonction pour scroller vers un message spécifique
  const scrollToMessage = useCallback((messageId: string, smooth = true) => {
    const messageElement = document.getElementById(`message-${messageId}`);
    if (messageElement) {
      messageElement.scrollIntoView({
        behavior: smooth ? 'smooth' : 'auto',
        block: 'center'
      });
    }
  }, []);

  // Fonction pour trouver le premier message non lu
  const findFirstUnreadMessage = useCallback(() => {
    if (!currentUser) return null;
    
    // Trouver le premier message qui n'a pas été lu par l'utilisateur courant
    const firstUnread = messages.find(msg => {
      // Un message est considéré non lu si :
      // 1. Ce n'est pas un message de l'utilisateur courant
      // 2. Il n'a pas de readStatus ou l'utilisateur n'est pas dans readStatus
      const senderUserId = getSenderUserId(msg.sender as Record<string, unknown>) ?? (msg.sender as any)?.id;
      if (senderUserId === currentUser.id) return false;
      
      if (!(msg as any).readStatus || (msg as any).readStatus.length === 0) return true;
      
      const userReadStatus = (msg as any).readStatus.find((rs: any) => rs.userId === currentUser.id);
      return !userReadStatus || !userReadStatus.readAt;
    });
    
    return firstUnread || null;
  }, [messages, currentUser]);

  // Stable ref for handleScroll to prevent listener detach/reattach (#16)
  const handleScrollRef = useRef<((e: React.UIEvent<HTMLDivElement>) => void) | null>(null);

  // Gestionnaire de scroll pour le chargement infini ET le bouton flottant
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    const { scrollTop, scrollHeight, clientHeight } = target;

    // Mettre à jour le flag de consultation de l'historique
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    isUserScrollingHistoryRef.current = distanceFromBottom > 150;

    // AMÉLIORATION 2: Afficher/masquer le bouton selon la position et le mode
    let shouldShowButton = false;
    if (scrollDirection === 'down') {
      // Mode BubbleStream: messages récents EN HAUT, afficher le bouton si l'utilisateur scrolle vers le bas
      shouldShowButton = scrollTop > 200; // Afficher si scrollé de plus de 200px vers le bas
    } else {
      // Mode classique: messages récents EN BAS, afficher le bouton si l'utilisateur scrolle vers le haut
      shouldShowButton = distanceFromBottom > 200; // Afficher si plus de 200px du bas
    }
    setShowScrollButton(shouldShowButton);
    
    // Vérifier si l'utilisateur est proche du bas (auto-scroll)
    const isNearBottom = distanceFromBottom < 100;
    isAutoScrollingRef.current = isNearBottom;
    
    // Charger plus de messages selon la direction configurée
    if (onLoadMore && hasMore && !isLoadingMore) {
      const threshold = 100;
      let shouldLoadMore = false;
      
      if (scrollDirection === 'up') {
        // Mode classique : charger quand on scrolle vers le haut
        shouldLoadMore = scrollTop < threshold;
        if (shouldLoadMore) {
        }
      } else {
        // Mode BubbleStream : charger quand on scrolle vers le bas
        shouldLoadMore = distanceFromBottom < threshold;
        if (shouldLoadMore) {
        }
      }
      
      if (shouldLoadMore) {
        onLoadMore();
      }
    }
  }, [onLoadMore, hasMore, isLoadingMore, scrollDirection]);

  // Keep handleScrollRef in sync with latest handleScroll
  handleScrollRef.current = handleScroll;

  // Attacher handleScroll au conteneur externe si fourni
  // Uses handleScrollRef to avoid detach/reattach on hasMore/isLoadingMore changes (#16)
  useEffect(() => {
    if (scrollContainerRef?.current) {
      const container = scrollContainerRef.current;

      // Wrapper pour convertir Event natif en React UIEvent avec currentTarget correct
      // Delegates to handleScrollRef.current so the listener itself never changes
      const handleNativeScroll = () => {
        const syntheticEvent = {
          currentTarget: container
        } as React.UIEvent<HTMLDivElement>;
        handleScrollRef.current?.(syntheticEvent);
      };
      container.addEventListener('scroll', handleNativeScroll);

      // Vérifier la position initiale immédiatement
      handleNativeScroll();

      return () => {
        container.removeEventListener('scroll', handleNativeScroll);
      };
    } else {
      // Container will be provided by parent component
      if (process.env.NODE_ENV === 'development') {
      }
    }
  }, [scrollContainerRef, scrollDirection]);

  // Vérifier la position quand les messages changent
  useEffect(() => {
    if (scrollContainerRef?.current && messages.length > 0) {
      const container = scrollContainerRef.current;
      const { scrollTop, scrollHeight, clientHeight } = container;
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight;

      // Mettre à jour l'affichage du bouton selon la position
      if (scrollDirection === 'down') {
        setShowScrollButton(scrollTop > 200);
      } else {
        setShowScrollButton(distanceFromBottom > 200);
      }
    }
  }, [messages.length, scrollContainerRef, scrollDirection]);

  // Réinitialiser le flag de premier chargement quand la conversation change
  useEffect(() => {
    isFirstLoadRef.current = true;
    previousMessageCountRef.current = 0;
  }, [conversationId]);

  // Premier chargement - toujours scroller au dernier message
  useEffect(() => {
    if (isFirstLoadRef.current && messages.length > 0 && !isLoadingMessages) {
      isFirstLoadRef.current = false;
      // Synchroniser les refs pour empêcher l'effet "nouveaux messages" de se déclencher
      // dans le même cycle de rendu (cause principale de la boucle de scroll infinie)
      previousMessageCountRef.current = messages.length;
      lastNewestMessageIdRef.current = messages[0]?.id ?? null;

      requestAnimationFrame(() => {
        if (scrollDirection === 'down') {
          scrollToTop(false);
        } else {
          scrollToBottom(false);
        }
      });
    }
  }, [messages.length, isLoadingMessages, scrollDirection, scrollToBottom, scrollToTop]);

  // AMÉLIORATION 1b: Maintenir le scroll en bas pendant le chargement des images/contenu async
  // Polling court qui force le scroll après le premier chargement.
  // S'arrête dès que l'utilisateur interagit manuellement (wheel/touch).
  useEffect(() => {
    if (!conversationId || scrollDirection === 'down') return;

    let active = true;
    let userInteracted = false;

    const stopOnUserScroll = () => { userInteracted = true; };

    // Attacher les listeners d'interaction après un court délai (le conteneur peut être null)
    const setupDelay = setTimeout(() => {
      const container = scrollAreaRef.current;
      if (container) {
        container.addEventListener('wheel', stopOnUserScroll, { once: true, passive: true });
        container.addEventListener('touchstart', stopOnUserScroll, { once: true, passive: true });
      }
    }, 200);

    let lastKnownScrollHeight = 0;

    const interval = setInterval(() => {
      if (!active || userInteracted) return;
      const container = scrollAreaRef.current;
      if (!container || container.scrollHeight <= container.clientHeight) return;

      // Ne re-scroller que si le scrollHeight a changé (contenu async chargé)
      // Évite les snaps inutiles qui causent du jitter visuel
      if (container.scrollHeight === lastKnownScrollHeight) return;
      lastKnownScrollHeight = container.scrollHeight;

      const maxScroll = container.scrollHeight - container.clientHeight;
      if (container.scrollTop < maxScroll - 10) {
        container.scrollTop = container.scrollHeight;
        setShowScrollButton(false);
      }
    }, 150);

    // Arrêter après 3s (suffisant pour le chargement d'images)
    const timeout = setTimeout(() => {
      active = false;
      clearInterval(interval);
    }, 3000);

    return () => {
      active = false;
      clearTimeout(setupDelay);
      clearInterval(interval);
      clearTimeout(timeout);
      const container = scrollAreaRef.current;
      if (container) {
        container.removeEventListener('wheel', stopOnUserScroll);
        container.removeEventListener('touchstart', stopOnUserScroll);
      }
    };
  }, [conversationId, scrollDirection, scrollAreaRef]);

  // AMÉLIORATION 3: Nouveaux messages - Auto-scroll sur envoi/réception
  // Use messages.length as dep instead of messages array to avoid re-runs on content changes (#13)
  useEffect(() => {
    if (messages.length > 0 && !isFirstLoadRef.current) {
      const currentCount = messages.length;
      const previousCount = previousMessageCountRef.current;

      // Scénario 2 : NE PAS scroller si on est en train de charger des messages anciens
      if (isLoadingMore) {
        previousMessageCountRef.current = currentCount;
        lastNewestMessageIdRef.current = messages[0]?.id ?? null;
        return;
      }

      // Détecter si c'est un NOUVEAU message (pas un chargement d'anciens)
      // messages[0] = le plus récent (tri DESC), vérifier que son ID a changé
      const newestMessage = messages[0];
      const isNewMessageArrived = currentCount > previousCount &&
        newestMessage?.id !== lastNewestMessageIdRef.current;

      if (isNewMessageArrived) {
        const senderUserId = getSenderUserId(newestMessage?.sender as Record<string, unknown>) ?? (newestMessage?.sender as any)?.id;
        if (newestMessage && senderUserId === currentUser?.id) {
          // Toujours scroller sur NOTRE propre message (envoi)
          if (scrollDirection === 'down') {
            scrollToTop(true);
          } else {
            scrollToBottom(true);
          }
        } else {
          // Pour les messages reçus, scroller seulement si l'utilisateur est proche du bas/haut
          if (scrollDirection === 'down') {
            const container = scrollAreaRef.current;
            if (container && container.scrollTop < 300) {
              scrollToTop(true);
            }
          } else {
            const container = scrollAreaRef.current;
            if (container) {
              const { scrollTop, scrollHeight, clientHeight } = container;
              const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
              const userIsAtBottom = distanceFromBottom < 150;
              if (userIsAtBottom) {
                scrollToBottom(true);
              }
            }
          }
        }
      }

      // Mettre à jour les refs de tracking
      previousMessageCountRef.current = currentCount;
      lastNewestMessageIdRef.current = newestMessage?.id ?? null;
    }
  }, [messages.length, currentUser?.id, scrollDirection, scrollToBottom, scrollToTop, isLoadingMore, scrollAreaRef]);


  // Choisir l'action du bouton selon la direction
  const handleScrollButtonClick = useCallback(() => {
    if (scrollButtonDirection === 'up') {
      // BubbleStream: messages récents EN HAUT → remonter vers le haut
      scrollToTop(true);
    } else {
      // Conversations: messages anciens EN HAUT → descendre vers le bas (récent)
      scrollToBottom(true);
    }
  }, [scrollButtonDirection, scrollToTop, scrollToBottom]);

  // Si un ref externe est fourni, ne pas créer de conteneur de scroll
  const content = (
    <div className={cn(
      "flex flex-col",
      isMobile ? "px-3 py-4" : "px-6 py-4"
    )}>
      {/* Indicateur de chargement EN HAUT - Mode classique (scroll up = charger anciens) */}
      {scrollDirection === 'up' && isLoadingMore && hasMore && messages.length > 0 && (
        <div key="loader-up-loading" className="flex justify-center py-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary" />
            <span>{(tCommon || t)('messages.loadingOlderMessages')}</span>
          </div>
        </div>
      )}

      {/* Message "Tous les messages chargés" - Mode classique (scroll up) */}
      {scrollDirection === 'up' && !hasMore && !isLoadingMore && messages.length > 0 && (
        <div key="loader-up-all-loaded" className="flex justify-center py-4">
          <div className="text-sm text-muted-foreground">
            {(tCommon || t)('messages.allMessagesLoaded')}
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="px-2">
        {/* 
          Logique d'affichage selon reverseOrder:
          - reverseOrder=false (BubbleStream): garde [récent...ancien] = Récent EN HAUT
          - reverseOrder=true (Conversations): inverse vers [ancien...récent] = Ancien EN HAUT
          - Backend retourne toujours: orderBy createdAt DESC = [récent...ancien]
        */}
        <MessagesDisplay
          messages={messages}
          translatedMessages={translatedMessages}
          isLoadingMessages={isLoadingMessages}
          currentUser={currentUser}
          userLanguage={userLanguage}
          usedLanguages={usedLanguages}
          emptyStateMessage={t('noMessages')}
          emptyStateDescription={t('noMessagesDescription')}
          reverseOrder={reverseOrder}
          className=""
          onEditMessage={onEditMessage}
          onDeleteMessage={onDeleteMessage}
          conversationId={conversationId}
          isAnonymous={isAnonymous}
          currentAnonymousUserId={currentAnonymousUserId}
          onReplyMessage={onReplyMessage}
          onNavigateToMessage={onNavigateToMessage}
          onImageClick={onImageClick}
          conversationType={conversationType || 'direct'}
          userRole={userRole as any}
          addTranslatingState={addTranslatingState}
          isTranslating={isTranslating}
          onRetryMessage={onRetryMessage}
          onCancelMessage={onCancelMessage}
        />
      </div>

      {/* Indicateur de chargement EN BAS - Mode BubbleStream (scroll down = charger anciens) */}
      {scrollDirection === 'down' && isLoadingMore && hasMore && messages.length > 0 && (
        <div key="loader-down-loading" className="flex justify-center py-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary" />
            <span>{(tCommon || t)('messages.loadingOlderMessages')}</span>
          </div>
        </div>
      )}

      {/* Message "Tous les messages chargés" - Mode BubbleStream (scroll down) */}
      {scrollDirection === 'down' && !hasMore && !isLoadingMore && messages.length > 0 && (
        <div key="loader-down-all-loaded" className="flex justify-center py-4">
          <div className="text-sm text-muted-foreground">
            {(tCommon || t)('messages.allMessagesLoaded')}
          </div>
        </div>
      )}

      {/* Élément pour le scroll automatique */}
      <div ref={messagesEndRef} className="h-1" />
    </div>
  );

  return (
    <div className="flex-1 flex flex-col h-full relative">
      {/* Si ref externe fourni, pas de conteneur scroll. Sinon, créer un conteneur scroll local */}
      {scrollContainerRef ? (
        // Pas de conteneur scroll - le parent gère le scroll
        content
      ) : (
        // Conteneur scroll local
        <div
          ref={internalScrollAreaRef}
          className="flex-1 messages-scroll conversation-scroll h-full overflow-y-auto overflow-x-visible"
          onScroll={handleScroll}
          style={{ position: 'relative' }}
        >
          {content}
        </div>
      )}

      {/* Bouton flottant pour scroller - Direction adaptée au contexte */}
      {(() => {
        const shouldRender = showScrollButton && !isLoadingMessages && messages.length > 0;

        return shouldRender ? (
          <Button
            onClick={handleScrollButtonClick}
            className={cn(
              "fixed z-50",
              "bottom-[116px]", // Position unifiée: ~82px composer + 10px + 24px (hauteur icône)
              // Positionnement adapté: pour BubbleStream avec sidebar, ajuster la position
              scrollDirection === 'down' ? "right-6 xl:right-[360px]" : "right-6",
              "rounded-full w-6 h-6 p-0",
              "backdrop-blur-xl bg-white/60 dark:bg-gray-900/60",
              "shadow-xl shadow-black/5 dark:shadow-black/20",
              "border border-white/30 dark:border-gray-700/40",
              "hover:bg-white/80 dark:hover:bg-gray-900/80",
              "transition-[color,background-color,opacity] duration-300 ease-in-out",
              "animate-in slide-in-from-bottom-5"
            )}
            aria-label={scrollButtonDirection === 'up' ? 'Scroll to top' : 'Scroll to bottom'}
            title={scrollButtonDirection === 'up' ? 'Remonter vers les messages récents' : 'Aller au bas de la conversation'}
          >
            {scrollButtonDirection === 'up' ? (
              <ArrowUp className="h-3 w-3 text-gray-900 dark:text-gray-100" />
            ) : (
              <ArrowDown className="h-3 w-3 text-gray-900 dark:text-gray-100" />
            )}
          </Button>
        ) : null;
      })()}
    </div>
  );
});

export { ConversationMessagesComponent as ConversationMessages };
