/**
 * MessageComposer/index.tsx - Point d'entrée principal du composer refactorisé
 * Intègre tous les hooks testés : usePerformanceProfile, useComposerState, useClipboardPaste, useUploadRetry
 *
 * @module components/common/message-composer
 */

'use client';

import { forwardRef, useImperativeHandle, useEffect, KeyboardEvent, useMemo, useCallback } from 'react';
import { Send, MapPin, X, MessageCircle, Languages, Paperclip, Loader2, Mic } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { LanguageFlagSelector } from '@/components/translation';
import { type LanguageChoice } from '@/lib/bubble-stream-modules';
import { AttachmentCarousel } from '@/components/attachments/AttachmentCarousel';
import { AttachmentLimitModal } from '@/components/attachments/AttachmentLimitModal';
import { AttachmentPreviewReply } from '@/components/attachments/AttachmentPreviewReply';
import { AudioRecorderWithEffects } from '@/components/audio/AudioRecorderWithEffects';
import { MentionAutocomplete } from '../MentionAutocomplete';

// Hooks intégrés (Phase 1-3)
import { usePerformanceProfile } from '@/hooks/usePerformanceProfile';
import { getAnimationConfig } from '@/constants/animations';
import { useComposerState } from '@/hooks/composer/useComposerState';
import { useClipboardPaste } from '@/hooks/composer/useClipboardPaste';
import { useUploadRetry } from '@/hooks/composer/useUploadRetry';
import { useI18n } from '@/hooks/useI18n';

// Components testés (Phase 3)
import { SendButton } from './SendButton';

export interface MessageComposerRef {
  focus: () => void;
  blur: () => void;
  clearAttachments?: () => void;
  getMentionedUserIds?: () => string[];
  clearMentionedUserIds?: () => void;
  resetTextareaSize?: () => void;
}

interface MessageComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  selectedLanguage: string;
  onLanguageChange: (language: string) => void;
  location?: string;
  isComposingEnabled?: boolean;
  placeholder?: string;
  onKeyPress?: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
  className?: string;
  choices?: LanguageChoice[];
  onAttachmentsChange?: (attachmentIds: string[], mimeTypes: string[]) => void;
  token?: string;
  userRole?: string;
  conversationId?: string;
}

/**
 * Fonction pour formater la date en fonction du jour
 */
function formatReplyDate(date: Date | string, locale: string = 'fr-FR'): string {
  const messageDate = new Date(date);
  const now = new Date();

  const messageDateOnly = new Date(messageDate.getFullYear(), messageDate.getMonth(), messageDate.getDate());
  const nowDateOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const isSameDay = messageDateOnly.getTime() === nowDateOnly.getTime();
  const isSameYear = messageDate.getFullYear() === now.getFullYear();

  if (isSameDay) {
    return messageDate.toLocaleString(locale, {
      hour: '2-digit',
      minute: '2-digit'
    });
  } else if (isSameYear) {
    return messageDate.toLocaleString(locale, {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  } else {
    return messageDate.toLocaleString(locale, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
}

/**
 * Composant MessageComposer refactorisé avec intégration des hooks testés
 */
export const MessageComposer = forwardRef<MessageComposerRef, MessageComposerProps>(
  (props, ref) => {
    // Récupérer la locale de l'utilisateur
    const { locale } = useI18n('conversations');

    // Performance profile (Phase 1)
    const performanceProfile = usePerformanceProfile();
    const animConfig = getAnimationConfig(performanceProfile);

    // État centralisé (Phase 2)
    const composerState = useComposerState(props);

    // Upload retry logic (Phase 1)
    const { uploadWithRetry, retryStatus } = useUploadRetry({ maxRetries: 3 });

    // Clipboard paste handler (Phase 3)
    const { handlePaste } = useClipboardPaste({
      onImagesPasted: composerState.handleFilesSelected,
      enabled: props.isComposingEnabled,
    });

    // Setup paste listener on textarea
    useEffect(() => {
      const textarea = composerState.textareaRef.current;
      if (!textarea) return;

      textarea.addEventListener('paste', handlePaste as any);
      return () => textarea.removeEventListener('paste', handlePaste as any);
    }, [handlePaste, composerState.textareaRef]);

    // Expose methods via ref
    useImperativeHandle(ref, () => ({
      focus: composerState.focus,
      blur: composerState.blur,
      clearAttachments: composerState.clearAttachments,
      getMentionedUserIds: composerState.getMentionedUserIds,
      clearMentionedUserIds: composerState.clearMentionedUserIds,
      resetTextareaSize: composerState.resetTextareaSize,
    }));

    // Memoize className computation
    const containerClassName = useMemo(() =>
      `relative ${props.className || ''} ${composerState.isDragOver ? 'ring-2 ring-blue-500 bg-blue-50/20' : ''}`,
      [props.className, composerState.isDragOver]
    );

    // Memoize textarea className
    const textareaClassName = useMemo(() => {
      const baseClasses = 'expandable-textarea min-h-[60px] sm:min-h-[80px] max-h-40 resize-none pr-20 sm:pr-28 pb-12 pt-3 pl-3 border-blue-200/60 bg-white/90 backdrop-blur-sm focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30 focus:bg-white/95 placeholder:text-gray-600 scroll-hidden transition-all duration-200';
      const roundingClasses = composerState.replyingTo || composerState.selectedFiles.length > 0 || composerState.showAudioRecorder
        ? 'rounded-b-2xl rounded-t-none border-t-0'
        : 'rounded-2xl';
      const sizeClasses = composerState.isMobile ? 'text-base' : 'text-sm sm:text-base';
      return `${baseClasses} ${roundingClasses} ${sizeClasses}`;
    }, [composerState.replyingTo, composerState.selectedFiles.length, composerState.showAudioRecorder, composerState.isMobile]);

    // Memoize textarea style
    const textareaStyle = useMemo(() => ({
      borderRadius: composerState.replyingTo || composerState.selectedFiles.length > 0 || composerState.showAudioRecorder ? '0 0 16px 16px' : '16px',
      boxShadow: '0 4px 20px rgba(59, 130, 246, 0.15)',
      fontSize: composerState.isMobile ? '16px' : undefined
    }), [composerState.replyingTo, composerState.selectedFiles.length, composerState.showAudioRecorder, composerState.isMobile]);

    // useCallback pour onSelect handler
    const handleMentionSelect = useCallback((username: string, userId: string) => {
      composerState.handleMentionSelect(
        username,
        userId,
        composerState.textareaRef.current,
        props.value,
        props.onChange
      );
    }, [composerState, props.value, props.onChange]);

    return (
      <div
        className={containerClassName}
        onDragEnter={composerState.handleDragEnter}
        onDragOver={composerState.handleDragOver}
        onDragLeave={composerState.handleDragLeave}
        onDrop={composerState.handleDrop}
      >
        {/* Reply preview */}
        {composerState.replyingTo ? (
          <div className="p-3 bg-gradient-to-r from-blue-50/90 to-indigo-50/90 dark:from-blue-900/30 dark:to-indigo-900/30 border-l-4 border-blue-400 dark:border-blue-500 rounded-t-lg backdrop-blur-sm">
            <div className="flex items-start justify-between space-x-2">
              <div className="flex items-start space-x-2 flex-1 min-w-0">
                <MessageCircle className="h-4 w-4 text-blue-500 dark:text-blue-400 mt-0.5 flex-shrink-0" aria-hidden="true" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-2 mb-1">
                    <span className="text-xs font-medium text-blue-700 dark:text-blue-300">
                      Réponse à {composerState.replyingTo.sender?.displayName || composerState.replyingTo.sender?.username || 'Utilisateur inconnu'}
                    </span>
                    <span className="text-xs text-blue-600/60 dark:text-blue-400/60">
                      {formatReplyDate(composerState.replyingTo.createdAt, locale)}
                    </span>
                  </div>
                  <p className="text-sm text-gray-700 dark:text-gray-300 line-clamp-2 italic">
                    {composerState.replyingTo.content}
                  </p>
                  {composerState.replyingTo.attachments && composerState.replyingTo.attachments.length > 0 ? (
                    <AttachmentPreviewReply
                      attachments={composerState.replyingTo.attachments}
                      isOwnMessage={false}
                    />
                  ) : null}
                  {composerState.replyingTo.translations && composerState.replyingTo.translations.length > 0 ? (
                    <div className="mt-1 flex items-center space-x-1">
                      <Languages className="h-3 w-3 text-blue-500/60 dark:text-blue-400/60" aria-hidden="true" />
                      <span className="text-xs text-blue-600/60 dark:text-blue-400/60">
                        {composerState.replyingTo.translations.length} traductions
                      </span>
                    </div>
                  ) : null}
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={composerState.clearReply}
                className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 p-1 h-6 w-6"
                aria-label="Annuler la réponse"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          </div>
        ) : null}

        {/* Compression indicator */}
        {composerState.isCompressing && Object.keys(composerState.compressionProgress).length > 0 ? (
          <div className="mb-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Loader2 className="h-4 w-4 animate-spin text-blue-600" aria-hidden="true" />
              <span className="text-sm font-medium text-blue-900">Compression en cours...</span>
            </div>
            <div className="space-y-1">
              {Object.entries(composerState.compressionProgress).map(([fileIndex, { progress, status }]) => (
                <div key={fileIndex} className="text-xs text-blue-700">
                  <div className="flex justify-between items-center mb-1">
                    <span className="truncate">{status}</span>
                    <span className="ml-2 font-medium">{progress}%</span>
                  </div>
                  <div className="w-full bg-blue-200 rounded-full h-1.5">
                    <div
                      className="bg-blue-600 h-1.5 rounded-full transition-all duration-300"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {/* Attachment carousel */}
        {((composerState.selectedFiles.length > 0 || composerState.showAudioRecorder) || composerState.showAttachmentLimitModal) ? (
          <div className="relative min-h-[120px] mb-2">
            {(composerState.selectedFiles.length > 0 || composerState.showAudioRecorder) ? (
              <AttachmentCarousel
                files={composerState.selectedFiles}
                onRemove={composerState.handleRemoveFile}
                uploadProgress={composerState.uploadProgress}
                disabled={composerState.isUploading}
                audioRecorderSlot={
                  composerState.showAudioRecorder ? (
                    <AudioRecorderWithEffects
                      key={composerState.audioRecorderKey}
                      ref={composerState.audioRecorderRef}
                      onRecordingComplete={composerState.handleAudioRecordingComplete}
                      onRecordingStateChange={composerState.handleRecordingStateChange}
                      onRemove={composerState.handleRemoveAudioRecording}
                      onStop={composerState.handleBeforeStop}
                      maxDuration={600}
                    />
                  ) : undefined
                }
              />
            ) : null}

            {/* Attachment limit modal */}
            {composerState.showAttachmentLimitModal ? (
              <AttachmentLimitModal
                isOpen={composerState.showAttachmentLimitModal}
                onClose={composerState.closeAttachmentLimitModal}
                currentCount={composerState.attemptedCount > 0 ? composerState.attemptedCount : composerState.selectedFiles.length + composerState.uploadedAttachments.length}
                maxCount={50}
                remainingSlots={Math.max(0, 50 - (composerState.selectedFiles.length + composerState.uploadedAttachments.length))}
              />
            ) : null}
          </div>
        ) : null}

        {/* Textarea */}
        <Textarea
          ref={composerState.textareaRef}
          value={props.value}
          onChange={composerState.handleTextareaChangeComplete}
          onKeyPress={props.onKeyPress}
          placeholder={composerState.finalPlaceholder}
          className={textareaClassName}
          maxLength={composerState.maxMessageLength}
          disabled={!props.isComposingEnabled}
          style={textareaStyle}
        />

        {/* Mention autocomplete */}
        {composerState.showMentionAutocomplete && props.conversationId ? (
          <MentionAutocomplete
            conversationId={props.conversationId}
            query={composerState.mentionQuery}
            onSelect={handleMentionSelect}
            onClose={composerState.closeMentionAutocomplete}
            position={composerState.mentionPosition}
          />
        ) : null}

        {/* Left side: Language selector, Audio, Attachment, Location */}
        <div className="absolute bottom-2 sm:bottom-3 left-3 flex items-center space-x-1 text-xs sm:text-sm text-gray-600 pointer-events-auto">
          {/* Language selector */}
          <div className="scale-100 sm:scale-100 origin-left">
            <LanguageFlagSelector
              value={props.selectedLanguage}
              onValueChange={props.onLanguageChange}
              choices={props.choices}
              popoverSide="top"
              popoverAlign="start"
              popoverSideOffset={8}
              showLanguageName={false}
            />
          </div>

          {/* Microphone button */}
          <Button
            onClick={composerState.handleMicrophoneClick}
            disabled={!props.isComposingEnabled}
            size="sm"
            variant="ghost"
            className="h-[30px] w-[30px] sm:h-[32px] sm:w-[32px] p-0 rounded-full hover:bg-gray-100 relative min-w-0 min-h-0 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            aria-label="Enregistrer un message vocal"
          >
            <Mic className={`h-[20px] w-[20px] sm:h-[22px] sm:w-[22px] ${composerState.showAudioRecorder ? 'text-blue-600' : 'text-gray-600'}`} aria-hidden="true" />
          </Button>

          {/* Attachment button */}
          <Button
            onClick={composerState.handleAttachmentClick}
            disabled={!props.isComposingEnabled || composerState.isUploading || composerState.isCompressing}
            size="sm"
            variant="ghost"
            className="h-[30px] w-[30px] sm:h-[32px] sm:w-[32px] p-0 rounded-full hover:bg-gray-100 relative min-w-0 min-h-0 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            aria-label={composerState.isCompressing ? 'Compression en cours' : composerState.isUploading ? 'Upload en cours' : 'Ajouter des fichiers'}
          >
            {composerState.isCompressing || composerState.isUploading ? (
              <Loader2 className="h-[20px] w-[20px] sm:h-[22px] sm:w-[22px] text-blue-600 animate-spin" aria-hidden="true" />
            ) : (
              <Paperclip className="h-[20px] w-[20px] sm:h-[22px] sm:w-[22px] text-gray-600" aria-hidden="true" />
            )}
            {composerState.selectedFiles.length > 0 ? (
              <span className="absolute -top-1 -right-1 bg-blue-600 text-white text-[10px] rounded-full h-3.5 w-3.5 flex items-center justify-center" aria-label={`${composerState.selectedFiles.length} fichiers sélectionnés`}>
                {composerState.selectedFiles.length}
              </span>
            ) : null}
          </Button>

          {/* Location */}
          {props.location ? (
            <div className="flex items-center space-x-1">
              <MapPin className="h-[22px] w-[22px] sm:h-[22px] sm:w-[22px]" aria-hidden="true" />
              <span className="hidden sm:inline">{props.location}</span>
            </div>
          ) : null}
        </div>

        {/* Right side: Character counter and send button */}
        <div className="absolute bottom-2 sm:bottom-3 right-3 sm:right-4 flex items-center space-x-2 pointer-events-auto">
          {/* Character counter */}
          {props.value.length > composerState.maxMessageLength * 0.9 ? (
            <span className={`hidden sm:inline text-xs ${props.value.length > composerState.maxMessageLength ? 'text-red-500' : 'text-orange-500'}`}>
              {props.value.length}/{composerState.maxMessageLength}
            </span>
          ) : null}

          {/* Attachment counter */}
          {(composerState.selectedFiles.length + composerState.uploadedAttachments.length) > 40 ? (
            <span className={`hidden sm:inline text-xs ${(composerState.selectedFiles.length + composerState.uploadedAttachments.length) > 50 ? 'text-red-500' : 'text-orange-500'}`}>
              {composerState.selectedFiles.length + composerState.uploadedAttachments.length}/50
            </span>
          ) : null}

          {/* Send button (Phase 3 component) */}
          <SendButton
            isVisible={composerState.hasContent}
            canSend={composerState.canSend}
            onClick={composerState.handleSendMessage}
            isCompressing={composerState.isCompressing}
            isRecording={composerState.isRecording}
            isUploading={composerState.isUploading}
            performanceProfile={performanceProfile}
            animConfig={animConfig}
          />
        </div>

        {/* Hidden file input */}
        <input
          ref={composerState.fileInputRef}
          type="file"
          multiple
          id="message-composer-file-input"
          className="hidden"
          onChange={composerState.handleFileInputChange}
          accept="image/*,video/*,audio/*,application/pdf,text/plain,.doc,.docx,.ppt,.pptx,.md,.sh,.js,.ts,.py,.zip"
          capture={undefined}
          aria-label="Sélectionner des fichiers à joindre (images, vidéos, audio, PDF, documents)"
        />
      </div>
    );
  }
);

MessageComposer.displayName = 'MessageComposer';
