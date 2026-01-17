/**
 * MessageComposer.tsx - Composant de composition de messages
 * Version refactorisée utilisant les hooks spécialisés
 *
 * @module components/common/message-composer
 */

'use client';

import { useRef, KeyboardEvent, forwardRef, useImperativeHandle, useEffect, useCallback, useState } from 'react';
import { Send, MapPin, X, MessageCircle, Languages, Paperclip, Loader2, Mic } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { LanguageFlagSelector } from '@/components/translation';
import { getMaxMessageLength } from '@/lib/constants/languages';
import { type LanguageChoice } from '@/lib/bubble-stream-modules';
import { useI18n } from '@/hooks/useI18n';
import { useReplyStore } from '@/stores/reply-store';
import { AttachmentCarousel } from '@/components/attachments/AttachmentCarousel';
import { AttachmentLimitModal } from '@/components/attachments/AttachmentLimitModal';
import { AttachmentPreviewReply } from '@/components/attachments/AttachmentPreviewReply';
import { useTextAttachmentDetection } from '@/hooks/useTextAttachmentDetection';
import { toast } from 'sonner';
import { AudioRecorderWithEffects } from '@/components/audio/AudioRecorderWithEffects';
import { MentionAutocomplete } from './MentionAutocomplete';
import { detectMentionAtCursor } from '@meeshy/shared/types/mention';
import { getCursorPosition, adjustPositionForViewport } from '@/lib/cursor-position';

// Hooks spécialisés
import { useAttachmentUpload, useAudioRecorder, useMentions, useTextareaAutosize } from '@/hooks/composer';

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

export interface MessageComposerRef {
  focus: () => void;
  blur: () => void;
  clearAttachments?: () => void;
  getMentionedUserIds?: () => string[];
  clearMentionedUserIds?: () => void;
  resetTextareaSize?: () => void;
}

/**
 * Fonction pour formater la date en fonction du jour
 */
function formatReplyDate(date: Date | string): string {
  const messageDate = new Date(date);
  const now = new Date();

  const messageDateOnly = new Date(messageDate.getFullYear(), messageDate.getMonth(), messageDate.getDate());
  const nowDateOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const isSameDay = messageDateOnly.getTime() === nowDateOnly.getTime();
  const isSameYear = messageDate.getFullYear() === now.getFullYear();

  if (isSameDay) {
    return messageDate.toLocaleString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit'
    });
  } else if (isSameYear) {
    return messageDate.toLocaleString('fr-FR', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  } else {
    return messageDate.toLocaleString('fr-FR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
}

/**
 * Composant modulaire pour la saisie et l'envoi de messages
 */
export const MessageComposer = forwardRef<MessageComposerRef, MessageComposerProps>(({
  value,
  onChange,
  onSend,
  selectedLanguage,
  onLanguageChange,
  location,
  isComposingEnabled = true,
  placeholder,
  onKeyPress,
  className = "",
  choices,
  onAttachmentsChange,
  token,
  userRole,
  conversationId
}, ref) => {
  const { t } = useI18n('conversations');
  const { replyingTo, clearReply } = useReplyStore();
  const maxMessageLength = getMaxMessageLength(userRole);
  const finalPlaceholder = placeholder || t('writeMessage');

  // Détection mobile
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Hook: Textarea autosize
  const {
    textareaRef,
    handleTextareaChange: handleAutosize,
    resetTextareaSize,
    focus,
    blur,
  } = useTextareaAutosize({ minHeight: 80, maxHeight: 160, isMobile });

  // Hook: Attachments
  const {
    selectedFiles,
    uploadedAttachments,
    isUploading,
    isCompressing,
    isDragOver,
    uploadProgress,
    compressionProgress,
    showAttachmentLimitModal,
    attemptedCount,
    handleFilesSelected,
    handleRemoveFile,
    clearAttachments: clearAttachmentsBase,
    handleCreateTextAttachment,
    handleDragEnter,
    handleDragLeave,
    handleDragOver,
    handleDrop,
    handleFileInputChange,
    closeAttachmentLimitModal,
    fileInputRef,
    handleAttachmentClick,
  } = useAttachmentUpload({
    token,
    maxAttachments: 50,
    onAttachmentsChange,
    t,
  });

  // Hook: Audio recorder
  const {
    showAudioRecorder,
    audioRecorderKey,
    isRecording,
    audioRecorderRef,
    handleRecordingStateChange,
    handleAudioRecordingComplete,
    handleRemoveAudioRecording,
    handleBeforeStop,
    handleMicrophoneClick,
    resetAudioState,
  } = useAudioRecorder({
    onAudioReady: handleFilesSelected,
  });

  // Hook: Mentions
  const {
    showMentionAutocomplete,
    mentionQuery,
    mentionPosition,
    mentionedUserIds,
    handleTextChange: handleMentionDetection,
    handleMentionSelect: handleMentionSelectBase,
    closeMentionAutocomplete,
    clearMentionedUserIds,
    getMentionedUserIds,
  } = useMentions({ conversationId });

  // Clear all (attachments + audio)
  const clearAttachments = useCallback(() => {
    clearAttachmentsBase();
    resetAudioState();
  }, [clearAttachmentsBase, resetAudioState]);

  // Combined textarea change handler
  const handleTextareaChangeComplete = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;

    // Update parent value
    onChange(newValue);

    // Handle autosize
    handleAutosize(e);

    // Handle mention detection
    const cursorPosition = e.target.selectionStart;
    handleMentionDetection(newValue, cursorPosition, textareaRef.current);
  }, [onChange, handleAutosize, handleMentionDetection, textareaRef]);

  // Mention select handler (adapted for our interface)
  const handleMentionSelect = useCallback((username: string, userId: string) => {
    handleMentionSelectBase(username, userId, textareaRef.current, value, onChange);
  }, [handleMentionSelectBase, textareaRef, value, onChange]);

  // Handle paste of long text (convert to .txt file)
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const handlePaste = async (e: ClipboardEvent) => {
      const text = e.clipboardData?.getData('text');
      if (text && text.length > maxMessageLength) {
        e.preventDefault();
        const encoder = new TextEncoder();
        const utf8Text = encoder.encode(text);
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        const fileName = `presspaper-content-${year}${month}${day}-${hours}${minutes}${seconds}.txt`;
        const textFile = new File([utf8Text], fileName, { type: 'text/plain;charset=utf-8' });
        await handleFilesSelected([textFile]);
        toast.info(t('conversations.pasteTooLongTxtCreated'));
      }
    };

    textarea.addEventListener('paste', handlePaste as any);
    return () => textarea.removeEventListener('paste', handlePaste as any);
  }, [maxMessageLength, t, handleFilesSelected, textareaRef]);

  // Text attachment detection hook
  useTextAttachmentDetection(textareaRef as React.RefObject<HTMLTextAreaElement>, {
    enabled: true,
    threshold: maxMessageLength,
    onTextDetected: handleCreateTextAttachment,
  });

  // Handle key press
  const handleKeyPress = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (onKeyPress) {
      onKeyPress(e);
    }
  }, [onKeyPress]);

  // Handle blur for mobile
  const handleBlur = useCallback(() => {
    if (isMobile && textareaRef.current) {
      textareaRef.current.blur();
      setTimeout(() => {
        window.scrollTo(0, window.scrollY);
      }, 100);
    }
  }, [isMobile, textareaRef]);

  // Handle send message
  const handleSendMessage = useCallback(() => {
    onSend();
    resetTextareaSize();
  }, [onSend, resetTextareaSize]);

  // Expose methods via ref
  useImperativeHandle(ref, () => ({
    focus,
    blur,
    clearAttachments,
    getMentionedUserIds,
    clearMentionedUserIds,
    resetTextareaSize,
  }));

  // Computed values
  const hasContent = value.trim() || selectedFiles.length > 0 || uploadedAttachments.length > 0;
  const isOverLimit = value.length > maxMessageLength;
  const isOverAttachmentLimit = (selectedFiles.length + uploadedAttachments.length) > 50;
  const canSend = hasContent && !isOverLimit && isComposingEnabled && !isUploading && !isCompressing && !isRecording && !isOverAttachmentLimit;

  return (
    <div
      className={`relative ${className} ${isDragOver ? 'ring-2 ring-blue-500 bg-blue-50/20' : ''}`}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Reply preview */}
      {replyingTo && (
        <div className="p-3 bg-gradient-to-r from-blue-50/90 to-indigo-50/90 dark:from-blue-900/30 dark:to-indigo-900/30 border-l-4 border-blue-400 dark:border-blue-500 rounded-t-lg backdrop-blur-sm">
          <div className="flex items-start justify-between space-x-2">
            <div className="flex items-start space-x-2 flex-1 min-w-0">
              <MessageCircle className="h-4 w-4 text-blue-500 dark:text-blue-400 mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center space-x-2 mb-1">
                  <span className="text-xs font-medium text-blue-700 dark:text-blue-300">
                    {t('replyingTo')} {replyingTo.sender?.displayName || replyingTo.sender?.username || t('unknownUser')}
                  </span>
                  <span className="text-xs text-blue-600/60 dark:text-blue-400/60">
                    {formatReplyDate(replyingTo.createdAt)}
                  </span>
                </div>
                <p className="text-sm text-gray-700 dark:text-gray-300 line-clamp-2 italic">
                  {replyingTo.content}
                </p>
                {replyingTo.attachments && replyingTo.attachments.length > 0 && (
                  <AttachmentPreviewReply
                    attachments={replyingTo.attachments}
                    isOwnMessage={false}
                  />
                )}
                {replyingTo.translations && replyingTo.translations.length > 0 && (
                  <div className="mt-1 flex items-center space-x-1">
                    <Languages className="h-3 w-3 text-blue-500/60 dark:text-blue-400/60" />
                    <span className="text-xs text-blue-600/60 dark:text-blue-400/60">
                      {replyingTo.translations.length} {t('translations')}
                    </span>
                  </div>
                )}
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={clearReply}
              className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 p-1 h-6 w-6"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Compression indicator */}
      {isCompressing && Object.keys(compressionProgress).length > 0 && (
        <div className="mb-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
            <span className="text-sm font-medium text-blue-900">Compression en cours...</span>
          </div>
          <div className="space-y-1">
            {Object.entries(compressionProgress).map(([fileIndex, { progress, status }]) => (
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
      )}

      {/* Attachment carousel */}
      {((selectedFiles.length > 0 || showAudioRecorder) || showAttachmentLimitModal) && (
        <div className="relative min-h-[120px] mb-2">
          {(selectedFiles.length > 0 || showAudioRecorder) && (
            <AttachmentCarousel
              files={selectedFiles}
              onRemove={handleRemoveFile}
              uploadProgress={uploadProgress}
              disabled={isUploading}
              audioRecorderSlot={
                showAudioRecorder ? (
                  <AudioRecorderWithEffects
                    key={audioRecorderKey}
                    ref={audioRecorderRef}
                    onRecordingComplete={handleAudioRecordingComplete}
                    onRecordingStateChange={handleRecordingStateChange}
                    onRemove={handleRemoveAudioRecording}
                    onStop={handleBeforeStop}
                    maxDuration={600}
                  />
                ) : undefined
              }
            />
          )}

          {/* Attachment limit modal */}
          {showAttachmentLimitModal && (
            <AttachmentLimitModal
              isOpen={showAttachmentLimitModal}
              onClose={closeAttachmentLimitModal}
              currentCount={attemptedCount > 0 ? attemptedCount : selectedFiles.length + uploadedAttachments.length}
              maxCount={50}
              remainingSlots={Math.max(0, 50 - (selectedFiles.length + uploadedAttachments.length))}
            />
          )}
        </div>
      )}

      {/* Textarea */}
      <Textarea
        ref={textareaRef}
        value={value}
        onChange={handleTextareaChangeComplete}
        onKeyPress={handleKeyPress}
        onBlur={handleBlur}
        placeholder={finalPlaceholder}
        className={`expandable-textarea min-h-[60px] sm:min-h-[80px] max-h-40 resize-none pr-20 sm:pr-28 pb-12 pt-3 pl-3 border-blue-200/60 bg-white/90 backdrop-blur-sm focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30 focus:bg-white/95 placeholder:text-gray-600 scroll-hidden transition-all duration-200 ${
          replyingTo || selectedFiles.length > 0 || showAudioRecorder
            ? 'rounded-b-2xl rounded-t-none border-t-0'
            : 'rounded-2xl'
        } ${isMobile ? 'text-base' : 'text-sm sm:text-base'}`}
        maxLength={maxMessageLength}
        disabled={!isComposingEnabled}
        style={{
          borderRadius: replyingTo || selectedFiles.length > 0 || showAudioRecorder ? '0 0 16px 16px' : '16px',
          boxShadow: '0 4px 20px rgba(59, 130, 246, 0.15)',
          fontSize: isMobile ? '16px' : undefined
        }}
      />

      {/* Mention autocomplete */}
      {showMentionAutocomplete && conversationId && (
        <MentionAutocomplete
          conversationId={conversationId}
          query={mentionQuery}
          onSelect={handleMentionSelect}
          onClose={closeMentionAutocomplete}
          position={mentionPosition}
        />
      )}

      {/* Left side: Language selector, Audio, Attachment, Location */}
      <div className="absolute bottom-2 sm:bottom-3 left-3 flex items-center space-x-1 text-xs sm:text-sm text-gray-600 pointer-events-auto">
        {/* Language selector */}
        <div className="scale-100 sm:scale-100 origin-left">
          <LanguageFlagSelector
            value={selectedLanguage}
            onValueChange={onLanguageChange}
            choices={choices}
            popoverSide="top"
            popoverAlign="start"
            popoverSideOffset={8}
            showLanguageName={false}
          />
        </div>

        {/* Microphone button */}
        <Button
          onClick={handleMicrophoneClick}
          disabled={!isComposingEnabled}
          size="sm"
          variant="ghost"
          className="h-[30px] w-[30px] sm:h-[32px] sm:w-[32px] p-0 rounded-full hover:bg-gray-100 relative min-w-0 min-h-0 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          aria-label="Enregistrer un message vocal"
        >
          <Mic className={`h-[20px] w-[20px] sm:h-[22px] sm:w-[22px] ${showAudioRecorder ? 'text-blue-600' : 'text-gray-600'}`} aria-hidden="true" />
        </Button>

        {/* Attachment button */}
        <Button
          onClick={handleAttachmentClick}
          disabled={!isComposingEnabled || isUploading || isCompressing}
          size="sm"
          variant="ghost"
          className="h-[30px] w-[30px] sm:h-[32px] sm:w-[32px] p-0 rounded-full hover:bg-gray-100 relative min-w-0 min-h-0 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          aria-label={isCompressing ? 'Compression en cours' : isUploading ? 'Upload en cours' : 'Ajouter des fichiers'}
        >
          {isCompressing || isUploading ? (
            <Loader2 className="h-[20px] w-[20px] sm:h-[22px] sm:w-[22px] text-blue-600 animate-spin" aria-hidden="true" />
          ) : (
            <Paperclip className="h-[20px] w-[20px] sm:h-[22px] sm:w-[22px] text-gray-600" aria-hidden="true" />
          )}
          {selectedFiles.length > 0 && (
            <span className="absolute -top-1 -right-1 bg-blue-600 text-white text-[10px] rounded-full h-3.5 w-3.5 flex items-center justify-center" aria-label={`${selectedFiles.length} fichiers sélectionnés`}>
              {selectedFiles.length}
            </span>
          )}
        </Button>

        {/* Location */}
        {location && (
          <div className="flex items-center space-x-1">
            <MapPin className="h-[22px] w-[22px] sm:h-[22px] sm:w-[22px]" />
            <span className="hidden sm:inline">{location}</span>
          </div>
        )}
      </div>

      {/* Right side: Character counter and send button */}
      <div className="absolute bottom-2 sm:bottom-3 right-3 sm:right-4 flex items-center space-x-2 pointer-events-auto">
        {/* Character counter */}
        {value.length > maxMessageLength * 0.9 && (
          <span className={`hidden sm:inline text-xs ${value.length > maxMessageLength ? 'text-red-500' : 'text-orange-500'}`}>
            {value.length}/{maxMessageLength}
          </span>
        )}

        {/* Attachment counter */}
        {(selectedFiles.length + uploadedAttachments.length) > 40 && (
          <span className={`hidden sm:inline text-xs ${(selectedFiles.length + uploadedAttachments.length) > 50 ? 'text-red-500' : 'text-orange-500'}`}>
            {selectedFiles.length + uploadedAttachments.length}/50
          </span>
        )}

        {/* Send button */}
        <Button
          onClick={handleSendMessage}
          disabled={!canSend}
          size="sm"
          className="bg-blue-600 hover:bg-blue-700 text-white h-6 w-6 sm:h-9 sm:w-9 p-0 rounded-full shadow-lg hover:shadow-xl transition-all duration-200 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          aria-label={isCompressing ? "Compression en cours" : isRecording ? "Arrêtez l'enregistrement avant d'envoyer" : "Envoyer le message"}
        >
          <Send className="h-3 w-3 sm:h-5 sm:w-5" aria-hidden="true" />
        </Button>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFileInputChange}
        accept="image/*,video/*,audio/*,application/pdf,text/plain,.doc,.docx,.ppt,.pptx,.md,.sh,.js,.ts,.py,.zip"
        capture={undefined}
        aria-label="Sélectionner des fichiers à joindre (images, vidéos, audio, PDF, documents)"
      />
    </div>
  );
});

MessageComposer.displayName = 'MessageComposer';
