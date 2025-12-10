'use client';

import { useState, useEffect, useRef, memo, useMemo, useCallback } from 'react';
import Link from 'next/link';
import {
  Smile,
  Copy,
  AlertTriangle,
  Timer,
  Languages,
  MoreHorizontal,
  CheckCircle2,
  Loader2,
  ArrowUp,
  Search,
  X,
  Ghost,
  Edit,
  Trash2,
  MessageCircle,
  Flag
} from 'lucide-react';
import { getUserDisplayName } from '@/utils/user-display-name';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { formatRelativeDate, formatFullDate } from '@/utils/date-format';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import type { User, BubbleTranslation } from '@meeshy/shared/types';
import { SUPPORTED_LANGUAGES, getLanguageInfo } from '@meeshy/shared/utils/languages';
import type { Message } from '@meeshy/shared/types/conversation';
import { mentionsToLinks } from '@meeshy/shared/types/mention';
import type { BubbleStreamMessage } from '@/types/bubble-stream';
import { Z_CLASSES } from '@/lib/z-index';
import { useI18n } from '@/hooks/useI18n';
import { getMessageInitials } from '@/lib/avatar-utils';
import { cn } from '@/lib/utils';
import { useFixTranslationPopoverZIndex } from '@/hooks/use-fix-z-index';
import { MarkdownMessage } from '@/components/messages/MarkdownMessage';
import { MessageAttachments } from '@/components/attachments/MessageAttachments';
import { AttachmentPreviewReply } from '@/components/attachments/AttachmentPreviewReply';
import { MessageReactions } from '@/components/common/message-reactions';
import { EmojiPicker } from '@/components/common/emoji-picker';
import { meeshySocketIOService } from '@/services/meeshy-socketio.service';
import { CLIENT_EVENTS } from '@meeshy/shared/types/socketio-events';
import { useMessageReactions } from '@/hooks/use-message-reactions';
import { useAuth } from '@/hooks/use-auth';
import type { BubbleMessage, MessageTranslation, MessageVersion, MessageSender, AnonymousSender } from './types';
import { MessageActionsBar } from './MessageActionsBar';
import { getAttachmentType } from '@meeshy/shared/types/attachment';
import { LanguageSelectionMessageView } from './LanguageSelectionMessageView';
import { ImageLightbox } from '@/components/attachments/ImageLightbox';

interface BubbleMessageNormalViewProps {
  message: Omit<Message, 'translations'> & {
    location?: string;
    originalLanguage: string;
    translations: BubbleTranslation[];
    originalContent: string;
    readStatus?: Array<{ userId: string; readAt: Date }>;
    attachments?: any[];
  };
  currentUser?: User; // Rendre optionnel pour éviter les erreurs
  userLanguage: string;
  usedLanguages: string[];
  currentDisplayLanguage: string;
  isTranslating?: boolean;
  translationError?: string;
  conversationType?: 'direct' | 'group' | 'public' | 'global';
  userRole?: 'USER' | 'MEMBER' | 'MODERATOR' | 'ADMIN' | 'CREATOR' | 'AUDIT' | 'ANALYST' | 'BIGBOSS';
  conversationId?: string;
  isAnonymous?: boolean;
  currentAnonymousUserId?: string;
  
  // Actions du nouveau système (optionnelles pour compatibilité)
  onEnterReactionMode?: () => void;
  onEnterLanguageMode?: () => void;
  onEnterEditMode?: () => void;
  onEnterDeleteMode?: () => void;
  onEnterReportMode?: () => void;
  
  // Actions originales
  onForceTranslation?: (messageId: string, targetLanguage: string, model?: 'basic' | 'medium' | 'premium') => void;
  onEditMessage?: (messageId: string, newContent: string) => Promise<void> | void;
  onDeleteMessage?: (messageId: string) => Promise<void> | void;
  onLanguageSwitch?: (messageId: string, language: string) => void;
  onReplyMessage?: (message: Message) => void;
  onNavigateToMessage?: (messageId: string) => void;
  onImageClick?: (attachmentId: string) => void;
}

export const BubbleMessageNormalView = memo(function BubbleMessageNormalView({
  message,
  currentUser,
  userLanguage,
  usedLanguages = [],
  currentDisplayLanguage,
  isTranslating = false,
  translationError,
  conversationType = 'direct',
  userRole = 'USER',
  conversationId,
  isAnonymous = false,
  currentAnonymousUserId,
  onEnterReactionMode,
  onEnterLanguageMode,
  onEnterEditMode,
  onEnterDeleteMode,
  onEnterReportMode,
  onForceTranslation,
  onEditMessage,
  onDeleteMessage,
  onLanguageSwitch,
  onReplyMessage,
  onNavigateToMessage,
  onImageClick
}: BubbleMessageNormalViewProps) {
  const { t: tBubble } = useI18n('bubbleStream');
  const { t: tReport } = useI18n('reportMessage');

  // États locaux (copiés de l'original)
  const [hoveredEmoji, setHoveredEmoji] = useState<string | null>(null);
  const [deletedAttachmentIds, setDeletedAttachmentIds] = useState<string[]>([]);
  const messageRef = useRef<HTMLDivElement>(null);

  // État pour le lightbox de l'avatar
  const [showAvatarLightbox, setShowAvatarLightbox] = useState(false);

  // Hook centralisé pour gérer les réactions - sera partagé avec MessageReactions via props
  const messageReactionsHook = useMessageReactions({
    messageId: message.id,
    currentUserId: isAnonymous ? currentAnonymousUserId : (currentUser?.id || ''),
    isAnonymous,
    enabled: !!currentUser || !!currentAnonymousUserId
  });

  // Hook pour fixer les z-index des popovers
  useFixTranslationPopoverZIndex();

  // Obtenir le token d'authentification pour la suppression d'attachments
  const { token } = useAuth();

  // Callback appelé quand un attachment est supprimé
  const handleAttachmentDeleted = useCallback((attachmentId: string) => {
    setDeletedAttachmentIds(prev => [...prev, attachmentId]);
  }, []);

  // Filtrer les attachments pour masquer ceux qui ont été supprimés
  const visibleAttachments = useMemo(() => {
    return message.attachments?.filter(att => !deletedAttachmentIds.includes(att.id)) || [];
  }, [message.attachments, deletedAttachmentIds]);

  // Vérifier si les attachments contiennent des audios
  const hasAudioAttachments = useMemo(() => {
    return visibleAttachments.some(att => getAttachmentType(att.mimeType) === 'audio');
  }, [visibleAttachments]);

  // Utilise la fonction utilitaire factorisée pour le formatage de date
  const formatReplyDate = (date: Date | string) => {
    return formatRelativeDate(date, { t: tBubble });
  };

  // Contenu traduit (utilise les bons noms de champs du backend)
  const displayContent = useMemo(() => {
    if (currentDisplayLanguage === (message.originalLanguage || 'fr')) {
      return message.originalContent || message.content;
    }

    const translation = message.translations?.find((t: any) =>
      (t.language || t.targetLanguage) === currentDisplayLanguage
    );

    if (translation) {
      return (translation as any).content || (translation as any).translatedContent || message.content;
    }

    return message.content;
  }, [currentDisplayLanguage, message.originalLanguage, message.originalContent, message.content, message.translations]);

  // Convertir les @mentions en liens cliquables (seulement les validées)
  const displayContentWithMentions = useMemo(() => {
    // Utiliser validatedMentions - seulement ces usernames deviennent cliquables
    // Si undefined/empty → aucune mention cliquable, @fakeuser reste texte plain
    const validUsernames = message.validatedMentions || [];

    return mentionsToLinks(displayContent, '/u/{username}', validUsernames);
  }, [displayContent, message.validatedMentions]);

  // Contenu de réponse traduit
  const replyToContent = useMemo(() => {
    if (!message.replyTo) return null;
    
    if (currentDisplayLanguage === (message.replyTo.originalLanguage || 'fr')) {
      return message.replyTo.originalContent || message.replyTo.content;
    }
    
    const translation = message.replyTo.translations?.find((t: any) => 
      (t?.language || t?.targetLanguage) === currentDisplayLanguage
    );
    
    if (translation) {
      const content = (translation as MessageTranslation)?.translatedContent;
      return content || message.replyTo.content;
    }
    
    return message.replyTo.content;
  }, [currentDisplayLanguage, message.replyTo?.id, message.replyTo?.originalLanguage, message.replyTo?.content, message.replyTo?.translations]);

  // Handlers (logique copiée et adaptée)
  const handleForceTranslation = (targetLanguage: string, model?: 'basic' | 'medium' | 'premium') => {
    onForceTranslation?.(message.id, targetLanguage, model);
  };

  const handleEditMessage = async () => {
    if (onEnterEditMode) {
      // Nouveau système
      onEnterEditMode();
    } else {
      // Ancien système
      const newContent = prompt(tBubble('editMessagePrompt'), message.content);
      if (newContent && newContent.trim() !== message.content) {
        await onEditMessage?.(message.id, newContent.trim());
      }
    }
  };

  const handleDeleteMessage = async () => {
    if (onEnterDeleteMode) {
      // Nouveau système
      onEnterDeleteMode();
    } else {
      // Ancien système
      const confirmed = confirm(tBubble('deleteMessageConfirm'));
      if (confirmed) {
        await onDeleteMessage?.(message.id);
      }
    }
  };

  const handleReportMessage = () => {
    if (onEnterReportMode) {
      onEnterReportMode();
    }
  };

  const handleReactionClick = () => {
    if (onEnterReactionMode) {
      // Nouveau système - entrer en mode réaction
      onEnterReactionMode();
    }
    // Sinon, le popover normal s'ouvre
  };

  const handleQuickReaction = useCallback((emoji: string) => {
    // Ajouter la réaction directement via le hook centralisé
    messageReactionsHook.addReaction(emoji);
  }, [messageReactionsHook]);

  const handleCopyMessage = useCallback(async () => {
    try {
      // Générer l'URL du message selon le contexte actuel
      const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
      const currentPath = typeof window !== 'undefined' ? window.location.pathname : '';

      let messageUrl: string;

      if (conversationId) {
        // Si on est déjà dans /chat/, utiliser /chat/, sinon utiliser /conversations/
        if (currentPath.startsWith('/chat/')) {
          messageUrl = `${baseUrl}/chat/${conversationId}#message-${message.id}`;
        } else {
          messageUrl = `${baseUrl}/conversations/${conversationId}#message-${message.id}`;
        }
      } else {
        messageUrl = `${baseUrl}/message/${message.id}`;
      }

      // Obtenir le nom de l'expéditeur
      const senderUser = message.anonymousSender || message.sender;
      const senderName = senderUser
        ? getUserDisplayName(senderUser, tBubble('anonymous'))
        : tBubble('unknownUser');

      // Formater la date complète
      const fullDate = formatFullDate(message.createdAt);

      // Contenu à copier avec tous les détails
      const contentToCopy = `${fullDate} par ${senderName} :\n${displayContent}\n\n${messageUrl}`;

      // Copier dans le presse-papiers
      await navigator.clipboard.writeText(contentToCopy);

      // Afficher une notification de succès
      toast.success(tBubble('messageCopied'));
    } catch (error) {
      console.error('Failed to copy message:', error);
      toast.error(tBubble('copyFailed'));
    }
  }, [displayContent, conversationId, message, tBubble]);

  // Copier uniquement le lien du message (pour attachments seuls)
  const handleCopyMessageLink = useCallback(async () => {
    try {
      // Générer l'URL du message selon le contexte actuel
      const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
      const currentPath = typeof window !== 'undefined' ? window.location.pathname : '';
      
      let messageUrl: string;
      
      if (conversationId) {
        // Si on est déjà dans /chat/, utiliser /chat/, sinon utiliser /conversations/
        if (currentPath.startsWith('/chat/')) {
          messageUrl = `${baseUrl}/chat/${conversationId}#message-${message.id}`;
        } else {
          messageUrl = `${baseUrl}/conversations/${conversationId}#message-${message.id}`;
        }
      } else {
        messageUrl = `${baseUrl}/message/${message.id}`;
      }
      
      // Copier uniquement l'URL dans le presse-papiers
      await navigator.clipboard.writeText(messageUrl);
      
      // Afficher une notification de succès
      toast.success(tBubble('linkCopied') || 'Lien copié !');
    } catch (error) {
      console.error('Failed to copy message link:', error);
      toast.error(tBubble('copyFailed'));
    }
  }, [conversationId, message.id, tBubble]);

  // Logique de permissions - FIXED: Utiliser currentAnonymousUserId pour les anonymes
  const isOwnMessage = isAnonymous
    ? (currentAnonymousUserId && message.anonymousSenderId === currentAnonymousUserId)
    : (currentUser && message.senderId === currentUser.id);
  
  const canModifyMessage = () => {
    // Vérifier le délai de 24 heures pour les utilisateurs normaux
    const messageAge = Date.now() - new Date(message.createdAt).getTime();
    const twentyFourHoursInMs = 24 * 60 * 60 * 1000; // 24 heures en millisecondes

    // Vérifier si l'utilisateur a des privilèges spéciaux
    const hasSpecialPrivileges = ['MODERATOR', 'MODO', 'ADMIN', 'CREATOR', 'BIGBOSS'].includes(userRole);

    // Si le message a plus de 24 heures et que l'utilisateur n'a pas de privilèges spéciaux, interdire l'édition
    if (messageAge > twentyFourHoursInMs && !hasSpecialPrivileges) {
      return false;
    }

    // Si le parent a fourni onEnterEditMode, c'est qu'on peut éditer
    if (onEnterEditMode) return true;

    // Sinon, fallback sur la logique originale
    if (isOwnMessage) return true;
    if (conversationType === 'group' || conversationType === 'public' || conversationType === 'global') {
      return hasSpecialPrivileges;
    }
    return false;
  };

  const canDeleteMessage = () => {
    // Si le parent a fourni onEnterDeleteMode, c'est qu'on peut supprimer
    if (onEnterDeleteMode) return true;

    // Sinon, fallback sur la logique originale
    if (['BIGBOSS', 'ADMIN', 'MODERATOR', 'MODO'].includes(userRole)) return true;

    const messageAge = Date.now() - new Date(message.createdAt).getTime();
    const twelveHours = 12 * 60 * 60 * 1000;
    
    if (messageAge > twelveHours) return false;
    return canModifyMessage();
  };

  const canReportMessage = () => {
    // On ne peut pas signaler si on est anonyme
    if (isAnonymous) return false;
    // On ne peut pas signaler son propre message
    if (isOwnMessage) return false;
    // On doit avoir onEnterReportMode pour pouvoir signaler
    return !!onEnterReportMode;
  };

  // Données pour les traductions (copiées)
  const availableVersions = [
    {
      language: message.originalLanguage || 'fr',
      content: message.originalContent || message.content,
      isOriginal: true,
      confidence: 1,
      model: 'original'
    },
    ...message.translations?.map((t: any) => ({
      language: t.language || t.targetLanguage,
      content: t.content || t.translatedContent,
      isOriginal: false,
      confidence: t.confidence || t.confidenceScore || 0.9,
      model: t.model || t.translationModel || 'basic'
    })) || []
  ];

  const getMissingLanguages = () => {
    const translatedLanguages = new Set([
      message.originalLanguage || 'fr',
      ...message.translations?.map((t: any) => t?.language || t?.targetLanguage).filter(Boolean) || []
    ]);
    
    return SUPPORTED_LANGUAGES.filter(lang => !translatedLanguages.has(lang.code));
  };

  // Plus besoin de filtrage depuis la suppression de la recherche dans le popover
  const filteredVersions = availableVersions;
  const filteredMissingLanguages = getMissingLanguages();

  return (
    <TooltipProvider>
      {/* Container with 80% mobile / 60% desktop width limit */}
      <motion.div
        id={`message-${message.id}`}
        ref={messageRef}
        className={cn(
          "bubble-message group/message grid grid-cols-10 gap-1 sm:gap-1.5 mb-2 px-2 sm:px-4"
        )}
      >
        {/* Empty space for sent messages (20% mobile = 2 cols / 40% desktop = 4 cols) */}
        {isOwnMessage && <div className="col-span-2 sm:col-span-4" />}

        {/* Message content area (80% mobile = 8 cols / 60% desktop = 6 cols) with max-width 90vw */}
        <div className={cn(
          "col-span-8 sm:col-span-6 flex gap-1 sm:gap-1.5 max-w-[90vw]",
          isOwnMessage ? "flex-row-reverse" : "flex-row"
        )}>
        {/* Avatar on side - cliquable pour voir en grand */}
        <div className="flex-shrink-0 mt-1">
          <Avatar
            className={cn(
              "h-8 w-8 sm:h-9 sm:w-9",
              (message.sender as MessageSender)?.avatar && "cursor-pointer hover:ring-2 hover:ring-blue-500 transition-all"
            )}
            onClick={(e) => {
              e.stopPropagation();
              const avatarUrl = (message.sender as MessageSender)?.avatar;
              if (avatarUrl) {
                // Ouvrir l'avatar dans ImageLightbox au lieu d'une nouvelle fenêtre
                setShowAvatarLightbox(true);
              }
            }}
          >
            <AvatarImage
              src={(message.sender as MessageSender)?.avatar}
              alt={message.sender?.firstName}
            />
            <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-600 text-white text-xs sm:text-sm font-semibold">
              {getMessageInitials(message)}
            </AvatarFallback>
          </Avatar>
        </div>

        {/* Message content wrapper */}
        <div className={cn(
          "flex flex-col",
          isOwnMessage ? "items-end" : "items-start"
        )}>
          {/* Header: Nom + Date en horizontal au-dessus */}
          <div className={cn(
            "flex items-center gap-1 mb-0.5 px-1",
            isOwnMessage && "flex-row-reverse"
          )}>
            {(() => {
              const username = message.anonymousSender?.username || message.sender?.username;
              const user = message.anonymousSender || message.sender;
              const displayName = getUserDisplayName(user, tBubble('anonymous'));

              const isAnonymous = !!message.anonymousSender;

              // Les utilisateurs anonymes ne sont pas cliquables
              if (isAnonymous) {
                return (
                  <span className="text-xs sm:text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-1">
                    <Ghost className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400" />
                    {displayName}
                  </span>
                );
              }

              return username ? (
                <Link
                  href={`/u/${username}`}
                  className="text-xs sm:text-sm font-semibold text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer"
                  onClick={(e) => e.stopPropagation()}
                >
                  {displayName}
                </Link>
              ) : (
                <span className="text-xs sm:text-sm font-semibold text-gray-700 dark:text-gray-300">
                  {displayName}
                </span>
              );
            })()}
            <span className="text-gray-400 dark:text-gray-500">•</span>
            <time className="text-xs text-gray-500 dark:text-gray-400">
              {formatReplyDate(message.createdAt)}
            </time>
          </div>

          {/* Attachments EN PREMIER (hors de la bulle) - Avec réactions si pas de texte */}
          {message.attachments && message.attachments.length > 0 && (
            <>
              {(!message.content || !message.content.trim()) ? (
                // Si attachments seuls : dans le flux avec les réactions superposées
                <>
                  <div className={cn(
                    "relative mb-5 w-full max-w-full overflow-visible",
                    isOwnMessage ? "ml-auto" : "mr-auto"
                  )}>
                    <MessageAttachments
                      attachments={visibleAttachments}
                      onImageClick={onImageClick}
                      currentUserId={isAnonymous ? currentAnonymousUserId : currentUser?.id}
                      token={token || undefined}
                      onAttachmentDeleted={handleAttachmentDeleted}
                      isOwnMessage={isOwnMessage}
                    />

                    {/* Réactions - Superposées par dessus les attachments (en bas) */}
                    <div
                      className={cn(
                        "absolute z-[99999] transition-transform duration-200",
                        "group-hover/message:-translate-y-4",
                        isOwnMessage ? "right-0" : "left-0"
                      )}
                      style={{
                        pointerEvents: 'auto',
                        bottom: '-14px'
                      }}
                    >
                      <MessageReactions
                        messageId={message.id}
                        conversationId={conversationId || message.conversationId}
                        currentUserId={currentUser?.id || ''}
                        currentAnonymousUserId={currentAnonymousUserId}
                        isAnonymous={isAnonymous}
                        showAddButton={false}
                        externalReactionsHook={messageReactionsHook}
                      />
                    </div>
                  </div>
                </>
              ) : (
                // Si avec texte : pas de wrapper relative (les réactions sont sur la bulle)
                <div className={cn(
                  "mb-1 inline-flex max-w-full overflow-hidden",
                  isOwnMessage ? "ml-auto" : "mr-auto"
                )}>
                  <MessageAttachments
                    attachments={visibleAttachments}
                    onImageClick={onImageClick}
                    currentUserId={isAnonymous ? currentAnonymousUserId : currentUser?.id}
                    token={token || undefined}
                    onAttachmentDeleted={handleAttachmentDeleted}
                    isOwnMessage={isOwnMessage}
                  />
                </div>
              )}
            </>
          )}

          {/* Message bubble wrapper with reactions - Seulement si contenu textuel */}
          {message.content && message.content.trim() && (
            <div className={cn(
              "relative flex w-full max-w-full mb-1 overflow-visible",
              isOwnMessage ? "ml-auto" : "mr-auto"
            )}>
              <Card
                className={cn(
                  "relative transition-colors duration-200 border shadow-none overflow-hidden py-0 w-full",
                  isOwnMessage
                    ? 'bg-gradient-to-br from-blue-400 to-blue-500 dark:from-gray-700 dark:to-gray-800 border-blue-400 dark:border-gray-600 text-white'
                    : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'
                )}
              >
                <CardContent className="p-1 w-full break-words overflow-hidden overflow-wrap-anywhere">

                {/* Message parent si c'est une réponse */}
              {message.replyTo && (
                <motion.div
                  initial={{ opacity: 0, y: -3 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                  className="mb-1"
                >
                  <div 
                    onClick={() => {
                      if (message.replyTo?.id && onNavigateToMessage) {
                        onNavigateToMessage(message.replyTo.id);
                      }
                    }}
                    className={cn(
                      "relative overflow-hidden rounded-md border-l-2 px-2 py-1.5 cursor-pointer transition-all duration-200 group text-xs",
                      isOwnMessage 
                        ? "bg-white/20 border-white/40 backdrop-blur-sm hover:bg-white/30" 
                        : "bg-gray-50/90 dark:bg-gray-700/40 border-blue-400 dark:border-blue-500 hover:bg-gray-100/90 dark:hover:bg-gray-700/60"
                    )}
                  >
                    <div className="flex items-start justify-between gap-1">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1 mb-1">
                          {(() => {
                            const replyUsername = message.replyTo.anonymousSender?.username || message.replyTo.sender?.username;
                            const replyUser = message.replyTo.anonymousSender || message.replyTo.sender;
                            const replyDisplayName = getUserDisplayName(replyUser, tBubble('unknownUser'));

                            const isReplyAnonymous = !!message.replyTo.anonymousSender;

                            // Les utilisateurs anonymes ne sont pas cliquables
                            if (isReplyAnonymous) {
                              return (
                                <span className={cn(
                                  "text-xs font-semibold truncate flex items-center gap-1",
                                  isOwnMessage ? "text-white/90" : "text-gray-700 dark:text-gray-200"
                                )}>
                                  <Ghost className="h-3 w-3 text-purple-600 dark:text-purple-400" />
                                  {replyDisplayName}
                                </span>
                              );
                            }

                            return replyUsername ? (
                              <Link
                                href={`/u/${replyUsername}`}
                                className={cn(
                                  "text-xs font-semibold truncate hover:underline transition-colors cursor-pointer",
                                  isOwnMessage ? "text-white/90 hover:text-white" : "text-gray-700 dark:text-gray-200 hover:text-blue-600 dark:hover:text-blue-400"
                                )}
                                onClick={(e) => e.stopPropagation()}
                              >
                                {replyDisplayName}
                              </Link>
                            ) : (
                              <span className={cn(
                                "text-xs font-semibold truncate",
                                isOwnMessage ? "text-white/90" : "text-gray-700 dark:text-gray-200"
                              )}>
                                {replyDisplayName}
                              </span>
                            );
                          })()}
                          <span className={cn(
                            "text-[10px]",
                            isOwnMessage ? "text-white/60" : "text-gray-500 dark:text-gray-400"
                          )}>
                            {formatReplyDate(message.replyTo.createdAt)}
                          </span>
                        </div>
                        <p className={cn(
                          "text-xs line-clamp-2 leading-snug",
                          isOwnMessage ? "text-white/80" : "text-gray-600 dark:text-gray-300"
                        )}>
                          {replyToContent || message.replyTo.content}
                        </p>
                        {message.replyTo.attachments && message.replyTo.attachments.length > 0 && (
                          <AttachmentPreviewReply
                            attachments={message.replyTo.attachments}
                            isOwnMessage={isOwnMessage}
                          />
                        )}
                      </div>
                      <MessageCircle className={cn(
                        "h-3 w-3 flex-shrink-0 mt-0.5",
                        isOwnMessage ? "text-white/50" : "text-blue-500/50 dark:text-blue-400/50"
                      )} />
                    </div>
                  </div>
                </motion.div>
              )}

              {/* Contenu principal */}
              <div className="mb-0" style={{ position: 'relative', zIndex: 1 }}>
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={`content-${message.id}-${currentDisplayLanguage}-${displayContent.substring(0, 10)}`}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    style={{ position: 'relative', zIndex: 1 }}
                  >
                    <MarkdownMessage
                      content={displayContentWithMentions}
                      className={cn(
                        "text-sm sm:text-base break-words",
                        isOwnMessage
                          ? "text-white [&_code]:bg-white/10 [&_code]:text-white/90 [&_pre]:bg-white/10"
                          : "text-gray-800 dark:text-gray-100"
                      )}
                      enableTracking={true}
                      isOwnMessage={isOwnMessage}
                      onLinkClick={(url, isTracking) => {
                      }}
                    />
                  </motion.div>
                </AnimatePresence>
              </div>
            </CardContent>
          </Card>

          {/* Réactions - Superposées en bas de la bulle de message */}
          <div
            className={cn(
              "absolute z-[99999] transition-transform duration-200",
              "group-hover/message:-translate-y-4",
              isOwnMessage ? "right-0" : "left-0"
            )}
            style={{
              pointerEvents: 'auto',
              bottom: '-14px'
            }}
          >
            <MessageReactions
              messageId={message.id}
              conversationId={conversationId || message.conversationId}
              currentUserId={currentUser?.id || ''}
              currentAnonymousUserId={currentAnonymousUserId}
              isAnonymous={isAnonymous}
              showAddButton={false}
              externalReactionsHook={messageReactionsHook}
            />
          </div>
        </div>
          )}

          {/* Actions Bar */}
          <MessageActionsBar
            message={message}
            isOwnMessage={isOwnMessage}
            canReportMessage={canReportMessage()}
            canEditMessage={canModifyMessage()}
            canDeleteMessage={canDeleteMessage()}
            onReply={onReplyMessage ? () => onReplyMessage(message) : undefined}
            onReaction={handleReactionClick}
            onQuickReaction={handleQuickReaction}
            onCopy={handleCopyMessage}
            onReport={canReportMessage() ? handleReportMessage : undefined}
            onEdit={canModifyMessage() ? handleEditMessage : undefined}
            onDelete={canDeleteMessage() ? handleDeleteMessage : undefined}
            t={tBubble}
            tReport={tReport}
            translationError={translationError}
            currentDisplayLanguage={currentDisplayLanguage}
            originalLanguage={message.originalLanguage || 'fr'}
            userLanguage={userLanguage}
            availableVersions={availableVersions}
            onLanguageSwitch={onLanguageSwitch ? (lang: string) => onLanguageSwitch(message.id, lang) : () => {}}
            onEnterLanguageMode={onEnterLanguageMode}
            getLanguageInfo={getLanguageInfo}
          />
        </div>
        </div>

        {/* Empty space for received messages (30% = 3 columns) */}
        {!isOwnMessage && <div className="col-span-3" />}
      </motion.div>

      {/* Lightbox pour afficher l'avatar en grand */}
      {showAvatarLightbox && (message.sender as MessageSender)?.avatar && (
        <ImageLightbox
          images={[{
            id: `avatar-${message.sender?.id}`,
            messageId: message.id,
            fileName: 'avatar.jpg',
            fileUrl: (message.sender as MessageSender).avatar!,
            originalName: `Avatar de ${message.sender?.firstName || message.sender?.username || 'Utilisateur'}`,
            mimeType: 'image/jpeg',
            fileSize: 0,
            uploadedAt: new Date(),
            uploadedBy: message.sender?.id || '',
            conversationId: message.conversationId || ''
          }]}
          initialIndex={0}
          isOpen={showAvatarLightbox}
          onClose={() => setShowAvatarLightbox(false)}
        />
      )}
    </TooltipProvider>
  );
});