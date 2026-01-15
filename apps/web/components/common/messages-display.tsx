'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import { toast } from 'sonner';
import { MessageSquare } from 'lucide-react';
import { BubbleMessage } from './BubbleMessage';
import { messageTranslationService } from '@/services/message-translation.service';
import { useFixRadixZIndex } from '@/hooks/use-fix-z-index';
import { useI18n } from '@/hooks/useI18n';
import type { User, Message, MessageWithTranslations } from '@meeshy/shared/types';

interface MessagesDisplayProps {
  messages: Message[];
  translatedMessages: MessageWithTranslations[];
  isLoadingMessages: boolean;
  currentUser: User;
  userLanguage: string;
  usedLanguages: string[];
  emptyStateMessage?: string;
  emptyStateDescription?: string;
  reverseOrder?: boolean;
  className?: string;
  onTranslation?: (messageId: string, translations: any[]) => void;
  onEditMessage?: (messageId: string, newContent: string) => Promise<void>;
  onDeleteMessage?: (messageId: string) => Promise<void>;
  onReplyMessage?: (message: Message) => void;
  onNavigateToMessage?: (messageId: string) => void;
  onImageClick?: (attachmentId: string) => void;
  conversationType?: 'direct' | 'group' | 'public' | 'global';
  userRole?: 'USER' | 'MEMBER' | 'MODERATOR' | 'ADMIN' | 'CREATOR' | 'AUDIT' | 'ANALYST' | 'BIGBOSS';
  conversationId?: string; // Add conversationId prop for reactions
  isAnonymous?: boolean; // Add isAnonymous for anonymous reactions
  currentAnonymousUserId?: string; // Add anonymous user ID for reactions
  
  // Additional props for unified handling
  addTranslatingState?: (messageId: string, targetLanguage: string) => void;
  isTranslating?: (messageId: string, targetLanguage: string) => boolean;
  containerRef?: React.RefObject<HTMLDivElement | null>;
  onLoadMore?: () => void;
  hasMore?: boolean;
  isLoadingMore?: boolean;
}

export function MessagesDisplay({
  messages,
  translatedMessages,
  isLoadingMessages,
  currentUser,
  userLanguage,
  usedLanguages,
  emptyStateMessage = "Aucun message pour le moment",
  emptyStateDescription = "Soyez le premier à publier !",
  reverseOrder = false,
  className = "",
  onTranslation,
  onEditMessage,
  onDeleteMessage,
  onReplyMessage,
  onNavigateToMessage,
  onImageClick,
  conversationType = 'direct',
  userRole = 'USER',
  conversationId,
  isAnonymous = false,
  currentAnonymousUserId,
  addTranslatingState,
  isTranslating,
  containerRef,
  onLoadMore,
  hasMore = false,
  isLoadingMore = false
}: MessagesDisplayProps) {

  // Hook pour fixer les z-index des popovers Radix UI
  useFixRadixZIndex();
  
  // Hook pour les traductions
  const { t } = useI18n('bubbleStream');

  // États pour contrôler l'affichage des messages depuis le parent
  const [messageDisplayStates, setMessageDisplayStates] = useState<Record<string, {
    currentDisplayLanguage: string;
    isTranslating: boolean;
    translationError?: string;
  }>>({});

  // États des traductions en cours (fallback si pas fourni par le parent)
  const [localTranslatingStates, setLocalTranslatingStates] = useState<Set<string>>(new Set());

  // Fonction pour déterminer la langue d'affichage préférée pour un message
  const getPreferredDisplayLanguage = useCallback((message: any): string => {
    
    // Si le message est dans la langue de l'utilisateur, l'afficher tel quel
    if (message.originalLanguage === userLanguage) {
      return message.originalLanguage;
    }
    
    // Chercher une traduction dans la langue de l'utilisateur
    const userLanguageTranslation = message.translations?.find((t: any) => 
      (t.language || t.targetLanguage) === userLanguage
    );
    
    if (userLanguageTranslation) {
      return userLanguage;
    }
    
    // Sinon, afficher dans la langue originale
    return message.originalLanguage || 'fr';
  }, [userLanguage]);

  // Fonction pour forcer la traduction
  const handleForceTranslation = useCallback(async (messageId: string, targetLanguage: string, model?: 'basic' | 'medium' | 'premium') => {
    try {
      // Vérifier si cette traduction spécifique (même message + même langue) est déjà en cours
      const translationKey = `${messageId}-${targetLanguage}`;
      const isAlreadyTranslating = addTranslatingState 
        ? isTranslating?.(messageId, targetLanguage)
        : localTranslatingStates.has(translationKey);

      // Bloquer UNIQUEMENT si c'est la MÊME traduction (même message + même langue)
      if (isAlreadyTranslating) {
        toast.info(t('translation.translationAlreadyInProgress'));
        return;
      }

      // Marquer comme en cours de traduction
      setMessageDisplayStates(prev => ({
        ...prev,
        [messageId]: {
          ...prev[messageId],
          isTranslating: true,
          translationError: undefined
        }
      }));

      // Utiliser le callback du parent si disponible, sinon gérer localement
      if (addTranslatingState) {
        addTranslatingState(messageId, targetLanguage);
      } else {
        setLocalTranslatingStates(prev => new Set(prev).add(translationKey));
      }

      const message = messages.find(m => m.id === messageId);
      const sourceLanguage = message?.originalLanguage || 'fr';


      // Utiliser 'basic' comme modèle par défaut si non spécifié
      const result = await messageTranslationService.requestTranslation({
        messageId,
        targetLanguage,
        sourceLanguage,
        model: model || 'basic' // Par défaut, commencer avec le modèle basic
      });

      // NOTE: Ne pas simuler de traduction !
      // La vraie traduction sera reçue via WebSocket (événement MESSAGE_TRANSLATION)
      // et traitée par le callback onTranslation du composant parent
      
      
      // Garder l'état "isTranslating" actif jusqu'à réception de la vraie traduction via WebSocket
      // L'état sera désactivé dans le callback onTranslation quand la traduction arrivera

    } catch (error) {
      console.error('Erreur traduction forcée:', error);
      
      // Marquer l'erreur
      setMessageDisplayStates(prev => ({
        ...prev,
        [messageId]: {
          ...prev[messageId],
          isTranslating: false,
          translationError: t('translation.translationError')
        }
      }));

      // Nettoyer l'état local
      if (!addTranslatingState) {
        setLocalTranslatingStates(prev => {
          const newSet = new Set(prev);
          newSet.delete(`${messageId}-${targetLanguage}`);
          return newSet;
        });
      }

      toast.error(t('translation.translationRequestError'));
    }
  }, [messages, addTranslatingState, onTranslation]);

  // Gérer le changement de langue d'affichage
  const handleLanguageSwitch = useCallback((messageId: string, language: string) => {
    setMessageDisplayStates(prev => {
      const newState = {
        ...prev,
        [messageId]: {
          currentDisplayLanguage: language,
          isTranslating: prev[messageId]?.isTranslating || false,
          translationError: prev[messageId]?.translationError
        }
      };
      return newState;
    });
  }, []);

  // Fonction pour vérifier si un message est en cours de traduction
  const checkIsTranslating = useCallback((messageId: string, targetLanguage: string): boolean => {
    if (isTranslating) {
      return isTranslating(messageId, targetLanguage);
    }
    return localTranslatingStates.has(`${messageId}-${targetLanguage}`);
  }, [isTranslating, localTranslatingStates]);

  // Messages à afficher - transformer les messages pour BubbleMessage
  const displayMessages = useMemo(() => {
    const messagesToUse = translatedMessages.length > 0 ? translatedMessages : messages;

    // Transform messages to match BubbleMessage expected format
    // Filtrer les messages sans ID valide pour éviter les warnings React key
    const transformedMessages = messagesToUse
      .filter(message => message && message.id)  // Exclure les messages sans ID
      .map(message => ({
        ...message,
        originalContent: message.content, // BubbleMessage expects originalContent
        originalLanguage: message.originalLanguage || 'fr', // Ensure originalLanguage exists
        translations: message.translations || [], // Ensure translations array exists
        readStatus: (message as any).status || [] // Map status to readStatus
      }));

    return reverseOrder ? [...transformedMessages].reverse() : transformedMessages;
  }, [messages, translatedMessages, reverseOrder]);

  // Initialiser l'état d'affichage pour les nouveaux messages
  useEffect(() => {
    setMessageDisplayStates(prev => {
      const newStates: Record<string, any> = { ...prev };
      let hasChanges = false;

      displayMessages.forEach(message => {
        if (!prev[message.id]) {
          const preferredLanguage = getPreferredDisplayLanguage(message);
          newStates[message.id] = {
            currentDisplayLanguage: preferredLanguage,
            isTranslating: false
          };
          hasChanges = true;

          if (preferredLanguage !== message.originalLanguage) {
          }
        }
      });

      return hasChanges ? newStates : prev;
    });
  }, [displayMessages, getPreferredDisplayLanguage]);

  // Effet pour détecter les nouvelles traductions et changer automatiquement l'affichage
  useEffect(() => {
    setMessageDisplayStates(prev => {
      const messagesToUpdate: { [messageId: string]: string } = {};
      
      // Parcourir tous les messages pour voir si de nouvelles traductions sont disponibles
      displayMessages.forEach(message => {
        const currentState = prev[message.id];
        if (!currentState) return;
        
        // Si le message n'est pas dans la langue utilisateur et qu'une traduction est disponible
        if (message.originalLanguage !== userLanguage) {
          const userLanguageTranslation = message.translations?.find((t: any) => 
            (t.language || t.targetLanguage) === userLanguage
          );
          
          // Si une traduction dans la langue utilisateur est disponible et qu'on ne l'affiche pas encore
          if (userLanguageTranslation && currentState.currentDisplayLanguage !== userLanguage) {
            messagesToUpdate[message.id] = userLanguage;
          }
        }
      });
      
      // Mettre à jour tous les messages qui ont de nouvelles traductions
      if (Object.keys(messagesToUpdate).length > 0) {
        
        const newState = { ...prev };
        Object.entries(messagesToUpdate).forEach(([messageId, language]) => {
          newState[messageId] = {
            ...prev[messageId],
            currentDisplayLanguage: language
          };
        });
        return newState;
      }
      
      return prev;
    });
  }, [displayMessages, userLanguage]);

  if (isLoadingMessages && displayMessages.length === 0) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!displayMessages.length) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center">
        <MessageSquare className="h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-medium mb-2">{emptyStateMessage}</h3>
        <p className="text-sm text-muted-foreground">{emptyStateDescription}</p>
      </div>
    );
  }

  return (
    <div className={`${className} bubble-message-container flex flex-col gap-2 pb-6 max-w-full overflow-visible`}>
      {displayMessages.map((message) => {
        const state = messageDisplayStates[message.id] || {
          currentDisplayLanguage: message.originalLanguage,
          isTranslating: false
        };

        return (
          <BubbleMessage
            key={message.id}
            message={message as any}
            currentUser={currentUser}
            userLanguage={userLanguage}
            usedLanguages={usedLanguages}
            onForceTranslation={handleForceTranslation}
            onEditMessage={onEditMessage}
            onDeleteMessage={onDeleteMessage}
            onReplyMessage={onReplyMessage}
            onNavigateToMessage={onNavigateToMessage}
            onImageClick={onImageClick}
            onLanguageSwitch={handleLanguageSwitch}
            currentDisplayLanguage={state.currentDisplayLanguage}
            isTranslating={checkIsTranslating(message.id, state.currentDisplayLanguage)}
            translationError={state.translationError}
            conversationType={conversationType}
            userRole={userRole}
            conversationId={conversationId}
            isAnonymous={isAnonymous}
            currentAnonymousUserId={currentAnonymousUserId}
          />
        );
      })}

      {/* Load more button for infinite scroll - EN BAS */}
      {hasMore && onLoadMore && (
        <div className="flex justify-center py-6 mt-4">
          <button
            onClick={onLoadMore}
            disabled={isLoadingMore}
            className="px-6 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed border border-border"
          >
            {isLoadingMore ? 'Chargement...' : 'Charger plus de messages'}
          </button>
        </div>
      )}
    </div>
  );
}