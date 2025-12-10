'use client';

import { memo, useMemo, useCallback, useRef, useState, useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import type { User, BubbleTranslation } from '@meeshy/shared/types';
import type { Message } from '@meeshy/shared/types/conversation';
import { useI18n } from '@/hooks/useI18n';
import { useMessageView } from '@/hooks/use-message-view-state';
import { reportService } from '@/services/report.service';
import { BubbleMessageNormalView } from './bubble-message/BubbleMessageNormalView';
import { ReactionSelectionMessageView } from './bubble-message/ReactionSelectionMessageView';
import { LanguageSelectionMessageView } from './bubble-message/LanguageSelectionMessageView';
import { EditMessageView } from './bubble-message/EditMessageView';
import { DeleteConfirmationView } from './bubble-message/DeleteConfirmationView';
import { ReportMessageView } from './bubble-message/ReportMessageView';
import { formatRelativeDate } from '@/utils/date-format';

interface BubbleMessageProps {
  message: Message & {
    location?: string;
    originalLanguage: string;
    translations: BubbleTranslation[];
    originalContent: string;
    readStatus?: Array<{ userId: string; readAt: Date }>;
    attachments?: any[];
  };
  currentUser: User;
  userLanguage: string;
  usedLanguages: string[];
  
  // Actions remontées au parent (AUCUN CHANGEMENT)
  onForceTranslation?: (messageId: string, targetLanguage: string, model?: 'basic' | 'medium' | 'premium') => void;
  onEditMessage?: (messageId: string, newContent: string) => Promise<void> | void;
  onDeleteMessage?: (messageId: string) => Promise<void> | void;
  onLanguageSwitch?: (messageId: string, language: string) => void;
  onReplyMessage?: (message: Message) => void;
  onNavigateToMessage?: (messageId: string) => void;
  onImageClick?: (attachmentId: string) => void;
  
  // États contrôlés depuis le parent (AUCUN CHANGEMENT)
  currentDisplayLanguage: string;
  isTranslating?: boolean;
  translationError?: string;
  conversationType?: 'direct' | 'group' | 'public' | 'global';
  userRole?: 'USER' | 'MEMBER' | 'MODERATOR' | 'ADMIN' | 'CREATOR' | 'AUDIT' | 'ANALYST' | 'BIGBOSS';
  conversationId?: string;
  isAnonymous?: boolean;
  currentAnonymousUserId?: string;
}

const BubbleMessageInner = memo(function BubbleMessageInner({
  message,
  currentUser,
  userLanguage,
  usedLanguages,
  onForceTranslation,
  onEditMessage,
  onDeleteMessage,
  onLanguageSwitch,
  onReplyMessage,
  onNavigateToMessage,
  onImageClick,
  currentDisplayLanguage,
  isTranslating = false,
  translationError,
  conversationType = 'global',
  userRole = 'USER',
  conversationId,
  isAnonymous = false,
  currentAnonymousUserId
}: BubbleMessageProps) {
  
  const { t } = useI18n();
  const contentRef = useRef<HTMLDivElement>(null);

  // State local pour la langue d'affichage (permet la mise à jour immédiate du contenu)
  const [localDisplayLanguage, setLocalDisplayLanguage] = useState<string | null>(null);
  const effectiveDisplayLanguage = localDisplayLanguage || currentDisplayLanguage;

  // Synchroniser localDisplayLanguage avec currentDisplayLanguage quand il change depuis le parent
  // Cela permet au bouton de langue originale de fonctionner correctement
  useEffect(() => {
    setLocalDisplayLanguage(currentDisplayLanguage);
  }, [currentDisplayLanguage]);

  // Hook de virtualization pour ce message spécifique
  const {
    currentMode,
    currentData,
    isActive,
    enterReactionMode,
    enterLanguageMode,
    enterEditMode,
    enterDeleteMode,
    enterReportMode,
    exitMode
  } = useMessageView(message.id);

  // Déterminer si c'est notre message
  const isOwnMessage = useMemo(() => {
    if (!currentUser) return false;
    if (isAnonymous && currentAnonymousUserId) {
      return message.anonymousSender?.id === currentAnonymousUserId;
    }
    return message.sender?.id === currentUser.id;
  }, [message.sender?.id, message.anonymousSender?.id, currentUser, isAnonymous, currentAnonymousUserId]);

  // Permissions
  const canEdit = useMemo(() => {
    if (isOwnMessage) return true;
    if (userRole && ['MODERATOR', 'ADMIN', 'CREATOR', 'BIGBOSS'].includes(userRole)) return true;
    return false;
  }, [isOwnMessage, userRole]);

  const canDelete = useMemo(() => {
    if (isOwnMessage) return true;
    if (userRole && ['MODERATOR', 'ADMIN', 'CREATOR', 'BIGBOSS'].includes(userRole)) return true;
    return false;
  }, [isOwnMessage, userRole]);

  // Contenu affiché actuellement (utilise effectiveDisplayLanguage pour mise à jour immédiate)
  const currentContent = useMemo(() => {
    if (effectiveDisplayLanguage === (message.originalLanguage || 'fr')) {
      return message.originalContent || message.content;
    }
    
    const translation = message.translations.find((t: any) => 
      (t.language || t.targetLanguage) === effectiveDisplayLanguage
    );
    return translation ? ((translation as any).content || (translation as any).translatedContent || message.content) : message.content;
  }, [effectiveDisplayLanguage, message.originalLanguage, message.originalContent, message.content, message.translations]);

  // Contenu de réponse (pour les messages parents - utilise effectiveDisplayLanguage)
  const replyToContent = useMemo(() => {
    if (!message.replyTo) return undefined;
    
    const replyMessage = message.replyTo as any;
    if (effectiveDisplayLanguage === (replyMessage.originalLanguage || 'fr')) {
      return replyMessage.originalContent || replyMessage.content;
    }
    
    const translation = replyMessage.translations?.find((t: any) => 
      (t.language || t.targetLanguage) === effectiveDisplayLanguage
    );
    return translation ? (translation.content || translation.translatedContent || replyMessage.content) : replyMessage.content;
  }, [message.replyTo, effectiveDisplayLanguage]);

  // Format de date pour les réponses - utilise la fonction utilitaire factorisée
  const formatReplyDate = useCallback((date: Date | string) => {
    return formatRelativeDate(date, { t });
  }, [t]);

  // Actions des vues spécialisées
  const handleReactionSelect = useCallback((emoji: string) => {
    // L'ajout de réaction se fait via MessageReactions existant
    // La vue se ferme automatiquement
    exitMode();
  }, [exitMode]);

  const handleLanguageSelect = useCallback((language: string) => {
    // Mise à jour immédiate du state local pour changer le contenu affiché
    setLocalDisplayLanguage(language);
    onLanguageSwitch?.(message.id, language);
    exitMode();
  }, [onLanguageSwitch, message.id, exitMode]);

  const handleRequestTranslation = useCallback((language: string, model?: 'basic' | 'medium' | 'premium') => {
    onForceTranslation?.(message.id, language, model);
    exitMode();
  }, [onForceTranslation, message.id, exitMode]);

  const handleSaveEdit = useCallback(async (messageId: string, newContent: string) => {
    try {
      await onEditMessage?.(messageId, newContent);
      exitMode();
      // Note: Le toast de succès est géré par le composant parent (bubble-stream-page)
    } catch (error) {
      toast.error(t('failedToUpdateMessage'));
      throw error; // Re-throw pour que la vue puisse afficher l'erreur
    }
  }, [onEditMessage, exitMode, t]);

  const handleConfirmDelete = useCallback(async (messageId: string) => {
    try {
      await onDeleteMessage?.(messageId);
      exitMode();
      toast.success(t('messageDeleted'));
    } catch (error) {
      toast.error(t('failedToDeleteMessage'));
      throw error; // Re-throw pour que la vue puisse afficher l'erreur
    }
  }, [onDeleteMessage, exitMode, t]);

  const handleCopyMessage = useCallback(() => {
    navigator.clipboard.writeText(currentContent);
    toast.success(t('messageCopied'));
  }, [currentContent, t]);

  const handleReportMessage = useCallback(async (messageId: string, reportType: string, reason: string) => {
    try {
      await reportService.reportMessage(messageId, reportType, reason);
      toast.success(t('reportSuccess'));
      exitMode();
    } catch (error) {
      console.error('Erreur lors du signalement:', error);
      toast.error(t('reportError'));
    }
  }, [exitMode, t]);

  // Emojis récents (dummy data pour l'instant)
  const recentEmojis = ['❤️', '😀', '👍', '😂', '🔥', '🎉', '💯', '✨'];

  // VIRTUALIZATION SMART: Rendu conditionnel selon le mode
  return (
    <AnimatePresence mode="wait" initial={false}>
      {currentMode === 'normal' && (
        <BubbleMessageNormalView
          key={`normal-${message.id}`}
          message={message}
          currentUser={currentUser}
          userLanguage={userLanguage}
          usedLanguages={usedLanguages}
          currentDisplayLanguage={effectiveDisplayLanguage}
          isTranslating={isTranslating}
          translationError={translationError}
          conversationType={conversationType}
          userRole={userRole}
          conversationId={conversationId}
          isAnonymous={isAnonymous}
          currentAnonymousUserId={currentAnonymousUserId}
          onReplyMessage={onReplyMessage}
          onNavigateToMessage={onNavigateToMessage}
          onImageClick={onImageClick}
          onLanguageSwitch={onLanguageSwitch}
          onEnterReactionMode={enterReactionMode}
          onEnterLanguageMode={enterLanguageMode}
          onEnterEditMode={canEdit ? enterEditMode : undefined}
          onEnterDeleteMode={canDelete ? enterDeleteMode : undefined}
          onEnterReportMode={!isOwnMessage && !isAnonymous ? enterReportMode : undefined}
          onEditMessage={canEdit ? onEditMessage : undefined}
          onDeleteMessage={canDelete ? onDeleteMessage : undefined}
        />
      )}

      {currentMode === 'reaction' && (
        <ReactionSelectionMessageView
          key={`reaction-${message.id}`}
          message={message}
          isOwnMessage={isOwnMessage}
          onSelectReaction={handleReactionSelect}
          onClose={exitMode}
          recentEmojis={recentEmojis}
          conversationId={conversationId || message.conversationId}
          currentUserId={currentUser?.id || ''}
          currentAnonymousUserId={currentAnonymousUserId}
          isAnonymous={isAnonymous}
        />
      )}

      {currentMode === 'language' && (
        <LanguageSelectionMessageView
          key={`language-${message.id}`}
          message={message}
          currentDisplayLanguage={effectiveDisplayLanguage}
          isTranslating={isTranslating}
          onSelectLanguage={handleLanguageSelect}
          onRequestTranslation={handleRequestTranslation}
          onClose={exitMode}
        />
      )}

      {currentMode === 'edit' && (
        <EditMessageView
          key={`edit-${message.id}`}
          message={message}
          isOwnMessage={isOwnMessage}
          onSave={handleSaveEdit}
          onCancel={exitMode}
          conversationId={conversationId}
        />
      )}

      {currentMode === 'delete' && (
        <DeleteConfirmationView
          key={`delete-${message.id}`}
          message={message}
          isOwnMessage={isOwnMessage}
          onConfirm={handleConfirmDelete}
          onCancel={exitMode}
        />
      )}

      {currentMode === 'report' && (
        <ReportMessageView
          key={`report-${message.id}`}
          message={message}
          isOwnMessage={isOwnMessage}
          onReport={handleReportMessage}
          onCancel={exitMode}
        />
      )}
    </AnimatePresence>
  );
});

export const BubbleMessage = BubbleMessageInner;