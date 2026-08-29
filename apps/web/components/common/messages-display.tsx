'use client';

import { useState, useCallback, useMemo, useEffect, useRef, memo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { toast } from 'sonner';
import { MessageSquare } from 'lucide-react';
import { BubbleMessage } from './BubbleMessage';
import { FailedMessageBar } from '@/components/messages/FailedMessageBar';
import { DateSticker } from '@/components/conversations/reading/DateSticker';
import { messageTranslationService } from '@/services/message-translation.service';
import { useI18n } from '@/hooks/useI18n';
import { useCurrentInterfaceLanguage } from '@/stores/language-store';
import { formatDayLabel } from '@/utils/date-format';
import {
  isFirstInGroup as computeIsFirstInGroup,
  isLastInGroup as computeIsLastInGroup,
} from '@/utils/message-grouping';
import {
  useFocalScroller,
  FOCAL_ROW_ATTRIBUTE,
  FOCAL_SCALE_ATTRIBUTE,
} from '@/hooks/conversations/use-focal-scroller';
import { DEFAULT_READING_MODE, isFlatReadingMode, type ReadingMode } from '@/lib/conversations/reading-mode';
import { calendarDayDiff } from '@meeshy/shared/utils/calendar-date';
import { resolvePrismTranslation } from '@meeshy/shared/utils/conversation-helpers';
import { normalizeLanguageForDedup } from '@meeshy/shared/utils/language-normalize';
import type { User, Message, MessageWithTranslations, ConversationType, TranslationModel } from '@meeshy/shared/types';

/**
 * Égalité de langue conforme au Prisme : `currentDisplayLanguage`, `originalLanguage`
 * et les clés de traduction sont verbatim et peuvent être région-tagués (`en-US`),
 * 3-lettres (`fra`) ou legacy (`iw`). Miroir de `useMessageDisplay.sameLanguage` —
 * SSOT `normalizeLanguageForDedup` (packages/shared/utils/language-normalize.ts).
 */
const sameLanguage = (a?: string, b?: string): boolean =>
  !!a && !!b && normalizeLanguageForDedup(a) === normalizeLanguageForDedup(b);

type PrismMessageShape = {
  readonly originalLanguage?: string;
  readonly translations?: unknown;
};

/**
 * Dépouille la carte des traductions d'un message (`{ language|targetLanguage,
 * content|translatedContent }[]`) en `Record<langue → texte>` keyé par la langue
 * STOCKÉE — la forme qu'attend `resolvePrismTranslation`. La clé rendue plus tard
 * est comparée par `sameLanguage` (normalisée), donc verbatim suffit ici.
 */
const buildTranslationRecord = (translations: unknown): Record<string, string> => {
  const record: Record<string, string> = {};
  if (!Array.isArray(translations)) return record;
  for (const entry of translations as ReadonlyArray<{
    language?: string;
    targetLanguage?: string;
    content?: string;
    translatedContent?: string;
  }>) {
    const key = entry?.language || entry?.targetLanguage;
    const text = entry?.content ?? entry?.translatedContent;
    if (typeof key === 'string' && key.trim() !== '' && typeof text === 'string' && text.trim() !== '') {
      record[key] = text;
    }
  }
  return record;
};

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
  onEditMessage?: (messageId: string, newContent: string, originalLanguage: string) => Promise<void>;
  onDeleteMessage?: (messageId: string) => Promise<void>;
  onReplyMessage?: (message: Message) => void;
  onForwardMessage?: (message: Message) => void;
  onNavigateToMessage?: (messageId: string) => void;
  onImageClick?: (attachmentId: string) => void;
  conversationType?: ConversationType;
  userRole?: 'USER' | 'MEMBER' | 'MODERATOR' | 'ADMIN' | 'CREATOR' | 'AUDIT' | 'ANALYST' | 'BIGBOSS';
  conversationId?: string; // Add conversationId prop for reactions
  isAnonymous?: boolean; // Add isAnonymous for anonymous reactions
  currentAnonymousUserId?: string; // Add anonymous user ID for reactions
  
  // Optimistic message handlers
  onRetryMessage?: (tempId: string, content: string, language: string, replyToId?: string) => void;
  onCancelMessage?: (tempId: string) => void;

  // Additional props for unified handling
  addTranslatingState?: (messageId: string, targetLanguage: string) => void;
  isTranslating?: (messageId: string, targetLanguage: string) => boolean;
  containerRef?: React.RefObject<HTMLDivElement | null>;
  onLoadMore?: () => void;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  /** Lentille de lecture — `DEFAULT_READING_MODE` par défaut (`bubble` depuis le 2026-08-20). */
  readingMode?: ReadingMode;
}

export const MessagesDisplay = memo(function MessagesDisplay({
  messages,
  translatedMessages,
  isLoadingMessages,
  currentUser,
  userLanguage,
  usedLanguages,
  emptyStateMessage,
  emptyStateDescription,
  reverseOrder = false,
  className = "",
  onEditMessage,
  onDeleteMessage,
  onReplyMessage,
  onForwardMessage,
  onNavigateToMessage,
  onImageClick,
  conversationType = 'direct',
  userRole = 'USER',
  conversationId,
  isAnonymous = false,
  currentAnonymousUserId,
  onRetryMessage,
  onCancelMessage,
  addTranslatingState,
  isTranslating,
  containerRef,
  onLoadMore,
  hasMore = false,
  isLoadingMore = false,
  readingMode = DEFAULT_READING_MODE
}: MessagesDisplayProps) {

  // Hook pour les traductions
  const { t } = useI18n('bubbleStream');
  const { t: tConversations } = useI18n('conversations');
  const locale = useCurrentInterfaceLanguage();

  const isFlat = isFlatReadingMode(readingMode);

  // Ref de repli STABLE : passer un `{ current: null }` fraîchement construit à
  // chaque rendu ferait retomber l'effet du scroller dans une boucle.
  const fallbackContainerRef = useRef<HTMLDivElement | null>(null);

  // La perspective n'existe qu'en Focal : en Script la MÊME rangée plate est
  // rendue uniforme (volume 4, bouton `Aa`).
  useFocalScroller({
    containerRef: containerRef ?? fallbackContainerRef,
    enabled: readingMode === 'focal' && Boolean(containerRef),
  });

  // États pour contrôler l'affichage des messages depuis le parent
  const [messageDisplayStates, setMessageDisplayStates] = useState<Record<string, {
    currentDisplayLanguage: string;
    isTranslating: boolean;
    translationError?: string;
  }>>({});

  // États des traductions en cours (fallback si pas fourni par le parent)
  const [localTranslatingStates, setLocalTranslatingStates] = useState<Set<string>>(new Set());

  // Prisme ORDONNÉ du lecteur (rangs 1→4 + repli rang 1). `usedLanguages` est
  // reconstruit en ligne par certains hôtes (`bubble-stream-page`) donc son
  // IDENTITÉ change à chaque rendu ; on referme la boucle à la source en le
  // mémoïsant sur ses PRIMITIVES jointes, jamais sur l'objet qui les porte
  // (cf. CLAUDE.md § TranslationToggle). `SharedConversationPreview` passe `[]` :
  // le repli garde le rang 1 (`userLanguage`) comme prisme minimal.
  const usedLanguagesKey = usedLanguages.join(',');
  const orderedLanguages = useMemo(
    () => (usedLanguages.length > 0 ? usedLanguages : [userLanguage]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [usedLanguagesKey, userLanguage]
  );

  // Langue d'affichage préférée d'un message : on DESCEND le prisme ordonné et on
  // rend la première langue SERVIE — par une traduction, ou l'original si celui-ci
  // gagne à son rang / si aucune langue du lecteur n'est servie. La descente n'est
  // pas réécrite ici : elle délègue à `resolvePrismTranslation` (SSOT du Prisme de
  // contenu, `@meeshy/shared`), jumelle de `usePostTranslation`. L'ancienne
  // implémentation ne consultait que le rang 1 (`userLanguage`) : un francophone
  // dont le navigateur est en anglais (locale appareil au rang 4) voyait un message
  // espagnol EN espagnol alors qu'une traduction anglaise existait — la violation
  // du Prisme #3 sur la surface la plus importante (le corps du message).
  const getPreferredDisplayLanguage = useCallback((message: unknown): string => {
    const { originalLanguage, translations } = (message ?? {}) as PrismMessageShape;
    const original = originalLanguage || 'fr';

    const resolved = resolvePrismTranslation({
      translations: buildTranslationRecord(translations),
      originalLanguage: original,
      preferredLanguages: orderedLanguages,
    });

    return resolved ? resolved.language : original;
  }, [orderedLanguages]);

  // Fonction pour forcer la traduction
  const handleForceTranslation = useCallback(async (messageId: string, targetLanguage: string, model?: TranslationModel) => {
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
      const _result = await messageTranslationService.requestTranslation({
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
  }, [messages, addTranslatingState, isTranslating, localTranslatingStates, t]);

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
    // S'assurer que messages et translatedMessages sont des tableaux
    const safeMessages = Array.isArray(messages) ? messages : [];
    const safeTranslatedMessages = Array.isArray(translatedMessages) ? translatedMessages : [];
    
    const messagesToUse = safeTranslatedMessages.length > 0 ? safeTranslatedMessages : safeMessages;

    // Transform messages to match BubbleMessage expected format
    // Single-pass: filter invalid/duplicate IDs and transform in one loop
    const seenIds = new Set<string>();
    const transformedMessages: typeof messagesToUse extends (infer T)[] ? (T & { id: string; originalContent: unknown; originalLanguage: string; translations: unknown[]; readStatus: unknown[] })[] : never = [];
    for (const message of messagesToUse) {
      if (!message || message.id === undefined || message.id === null) continue;
      const idStr = String(message.id).trim();
      if (idStr === '' || seenIds.has(idStr)) continue;
      seenIds.add(idStr);
      transformedMessages.push({
        ...message,
        id: idStr,
        originalContent: (message as unknown).content,
        originalLanguage: (message as unknown).originalLanguage || 'fr',
        translations: (message as unknown).translations || [],
        readStatus: (message as unknown).readStatus || (message as unknown).status || [],
      });
    }

    return reverseOrder ? [...transformedMessages].reverse() : transformedMessages;
  }, [messages, translatedMessages, reverseOrder]);

  // Initialiser l'état d'affichage pour les nouveaux messages
  useEffect(() => {
    setMessageDisplayStates(prev => {
      const newStates: Record<string, unknown> = { ...prev };
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

  // Effet pour détecter les nouvelles traductions et changer automatiquement
  // l'affichage. Comme l'init, il DESCEND le prisme ordonné (via le même
  // `getPreferredDisplayLanguage`) : quand une traduction d'un rang QUELCONQUE
  // (1→4) arrive par socket, la bulle bascule vers elle. L'ancienne version ne
  // basculait que sur une traduction du rang 1 (`userLanguage`), laissant un
  // message affiché dans sa langue d'origine dès que seule une traduction de rang
  // inférieur était servie.
  useEffect(() => {
    setMessageDisplayStates(prev => {
      const messagesToUpdate: { [messageId: string]: string } = {};

      displayMessages.forEach(message => {
        const currentState = prev[message.id];
        if (!currentState) return;

        const preferred = getPreferredDisplayLanguage(message);
        const original = message.originalLanguage || 'fr';

        // On n'auto-bascule que vers une TRADUCTION nouvellement servie par le
        // prisme (jamais un retour forcé à l'original), et seulement si on ne
        // l'affiche pas déjà. Comparaison normalisée (région/casse) comme dans
        // `useMessageDisplay` : un état `en` et un préféré `en-US` sont la même
        // langue et ne doivent pas provoquer de bascule.
        if (
          !sameLanguage(preferred, original) &&
          !sameLanguage(preferred, currentState.currentDisplayLanguage)
        ) {
          messagesToUpdate[message.id] = preferred;
        }
      });

      if (Object.keys(messagesToUpdate).length === 0) return prev;

      const newState = { ...prev };
      Object.entries(messagesToUpdate).forEach(([messageId, language]) => {
        newState[messageId] = {
          ...prev[messageId],
          currentDisplayLanguage: language
        };
      });
      return newState;
    });
  }, [displayMessages, getPreferredDisplayLanguage]);

  /**
   * Le « data sticker » de catégorisation : un libellé de jour collant en tête
   * de chaque journée. Le repère est le message PRÉCÉDENT dans l'ordre de
   * rendu — ce qui reste juste que la liste soit ancienne-en-haut ou
   * récente-en-haut (`reverseOrder`).
   */
  const dayLabelAt = useCallback(
    (index: number): string | null => {
      const message = displayMessages[index];
      if (!message?.createdAt) return null;

      const createdAt = message.createdAt as unknown as string | Date;
      const previous = index > 0 ? displayMessages[index - 1] : null;
      if (!previous?.createdAt) {
        return formatDayLabel(createdAt, { t: tConversations, locale });
      }

      const previousCreatedAt = previous.createdAt as unknown as string | Date;
      const sameDay =
        calendarDayDiff(
          new Date(createdAt).getTime(),
          new Date(previousCreatedAt).getTime()
        ) === 0;

      return sameDay ? null : formatDayLabel(createdAt, { t: tConversations, locale });
    },
    [displayMessages, tConversations, locale]
  );

  const useVirtual = Boolean(containerRef);

  const virtualizer = useVirtualizer({
    count: useVirtual ? displayMessages.length : 0,
    getScrollElement: () => containerRef?.current ?? null,
    estimateSize: () => 80,
    overscan: 5,
    measureElement: (el) => el.getBoundingClientRect().height,
  });

  const virtualItems = virtualizer.getVirtualItems();

  const loadMoreTriggeredRef = useRef(false);

  useEffect(() => {
    if (!useVirtual || !hasMore || !onLoadMore || isLoadingMore) {
      loadMoreTriggeredRef.current = false;
      return;
    }
    if (virtualItems.length === 0) return;
    const firstVisible = virtualItems[0];
    if (firstVisible && firstVisible.index === 0 && !loadMoreTriggeredRef.current) {
      loadMoreTriggeredRef.current = true;
      onLoadMore();
    } else if (firstVisible && firstVisible.index > 0) {
      loadMoreTriggeredRef.current = false;
    }
  }, [virtualItems, hasMore, onLoadMore, isLoadingMore, useVirtual]);

  if (isLoadingMessages && displayMessages.length === 0) {
    return (
      <div className="flex flex-col gap-4 p-6 animate-pulse">
        {Array.from({ length: 5 }).map((_, i) => {
          const isRight = i % 3 === 0;
          return (
            <div key={i} className={`flex gap-2 ${isRight ? 'flex-row-reverse' : ''}`}>
              <div className="h-8 w-8 rounded-full bg-muted shrink-0" />
              <div className={`flex flex-col gap-1.5 ${isRight ? 'items-end' : ''}`}>
                <div className="h-3 bg-muted rounded w-20" />
                <div className={`rounded-2xl bg-muted/60 p-3 space-y-1.5`} style={{ width: `${120 + (i * 40) % 160}px` }}>
                  <div className="h-3 bg-muted/40 rounded w-full" />
                  {i % 2 === 0 && <div className="h-3 bg-muted/40 rounded w-2/3" />}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  if (!displayMessages.length) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center">
        <MessageSquare className="h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-medium mb-2">{emptyStateMessage ?? t('emptyStateMessage')}</h3>
        <p className="text-sm text-muted-foreground">{emptyStateDescription ?? t('emptyStateDescription')}</p>
      </div>
    );
  }

  if (!useVirtual) {
    return (
      <div className={`${className} bubble-message-container flex flex-col pb-6 max-w-full overflow-visible`}>
        {displayMessages.map((message, index) => {
          const state = messageDisplayStates[message.id] ?? {
            currentDisplayLanguage: message.originalLanguage,
            isTranslating: false,
          };
          const prevMsg = index > 0 ? displayMessages[index - 1] : null;
          const nextMsg = index < displayMessages.length - 1 ? displayMessages[index + 1] : null;
          const isFirstInGroup = computeIsFirstInGroup(prevMsg, message);
          const isLastInGroup = computeIsLastInGroup(nextMsg, message);
          const localStatus = (message as unknown as Record<string, unknown>)._localStatus as string | undefined;
          const tempId = (message as unknown as Record<string, unknown>)._tempId as string | undefined;
          const isSending = localStatus === 'sending';
          const isFailed = localStatus === 'failed';
          const dayLabel = dayLabelAt(index);
          return (
            <div
              key={message.id}
              className={isSending || isFailed ? 'opacity-70' : undefined}
              {...(isFlat ? { [FOCAL_ROW_ATTRIBUTE]: message.id } : {})}
            >
              {/* Le sticker reste HORS de l'élément transformé : une
                  `transform` crée un bloc conteneur et casserait `sticky`. */}
              {dayLabel && <DateSticker label={dayLabel} />}
              <div {...(isFlat ? { [FOCAL_SCALE_ATTRIBUTE]: 'true' } : {})}>
                <BubbleMessage
                  message={message as unknown}
                  readingMode={readingMode}
                  currentUser={currentUser}
                  userLanguage={userLanguage}
                  usedLanguages={usedLanguages}
                  onForceTranslation={handleForceTranslation}
                  onEditMessage={onEditMessage}
                  onDeleteMessage={onDeleteMessage}
                  onReplyMessage={onReplyMessage}
                  onForwardMessage={onForwardMessage}
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
                  isFirstInGroup={isFirstInGroup}
                  isLastInGroup={isLastInGroup}
                />
              </div>
              {isFailed && tempId && onRetryMessage && onCancelMessage && (
                <FailedMessageBar
                  tempId={tempId}
                  content={message.content || (message as unknown as Record<string, unknown>).originalContent as string || ''}
                  originalLanguage={message.originalLanguage || 'fr'}
                  replyToId={(message as unknown as Record<string, unknown>).replyToId as string | undefined}
                  onRetry={onRetryMessage}
                  onCancel={onCancelMessage}
                  t={t}
                />
              )}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div
      className={`${className} bubble-message-container max-w-full overflow-visible`}
      style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}
    >
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          transform: `translateY(${virtualItems[0]?.start ?? 0}px)`,
        }}
      >
        {virtualItems.map((virtualRow) => {
          const message = displayMessages[virtualRow.index];
          if (!message) return null;
          const state = messageDisplayStates[message.id] ?? {
            currentDisplayLanguage: message.originalLanguage,
            isTranslating: false,
          };
          const prevMsg = virtualRow.index > 0 ? displayMessages[virtualRow.index - 1] : null;
          const nextMsg = virtualRow.index < displayMessages.length - 1 ? displayMessages[virtualRow.index + 1] : null;
          const isFirstInGroup = computeIsFirstInGroup(prevMsg, message);
          const isLastInGroup = computeIsLastInGroup(nextMsg, message);
          const localStatus = (message as unknown as Record<string, unknown>)._localStatus as string | undefined;
          const tempId = (message as unknown as Record<string, unknown>)._tempId as string | undefined;
          const isSending = localStatus === 'sending';
          const isFailed = localStatus === 'failed';
          const dayLabel = dayLabelAt(virtualRow.index);
          return (
            <div
              key={message.id}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              className={isSending || isFailed ? 'opacity-70' : undefined}
              {...(isFlat ? { [FOCAL_ROW_ATTRIBUTE]: message.id } : {})}
            >
              {dayLabel && <DateSticker label={dayLabel} />}
              <div {...(isFlat ? { [FOCAL_SCALE_ATTRIBUTE]: 'true' } : {})}>
                <BubbleMessage
                  message={message as unknown}
                  readingMode={readingMode}
                  currentUser={currentUser}
                  userLanguage={userLanguage}
                  usedLanguages={usedLanguages}
                  onForceTranslation={handleForceTranslation}
                  onEditMessage={onEditMessage}
                  onDeleteMessage={onDeleteMessage}
                  onReplyMessage={onReplyMessage}
                  onForwardMessage={onForwardMessage}
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
                  isFirstInGroup={isFirstInGroup}
                  isLastInGroup={isLastInGroup}
                />
              </div>
              {isFailed && tempId && onRetryMessage && onCancelMessage && (
                <FailedMessageBar
                  tempId={tempId}
                  content={message.content || (message as unknown as Record<string, unknown>).originalContent as string || ''}
                  originalLanguage={message.originalLanguage || 'fr'}
                  replyToId={(message as unknown as Record<string, unknown>).replyToId as string | undefined}
                  onRetry={onRetryMessage}
                  onCancel={onCancelMessage}
                  t={t}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
});