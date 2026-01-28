// apps/web/hooks/composer/useComposerState.ts
import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useI18n } from '@/hooks/useI18n';
import { useReplyStore } from '@/stores/reply-store';
import { getMaxMessageLength } from '@/lib/constants/languages';
import { useTextareaAutosize } from '@/hooks/composer/useTextareaAutosize';
import { useAttachmentUpload } from '@/hooks/composer/useAttachmentUpload';
import { useAudioRecorder } from '@/hooks/composer/useAudioRecorder';
import { useMentions } from '@/hooks/composer/useMentions';
import { useDraftAutosave } from '@/hooks/composer/useDraftAutosave';

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
  choices?: any[];
  onAttachmentsChange?: (attachmentIds: string[], mimeTypes: string[]) => void;
  token?: string;
  userRole?: string;
  conversationId?: string;
}

export const useComposerState = (props: MessageComposerProps) => {
  const { t } = useI18n('conversations');
  const { replyingTo, clearReply } = useReplyStore();
  const maxMessageLength = getMaxMessageLength(props.userRole);

  // Mobile detection
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Textarea autosize
  const {
    textareaRef,
    handleTextareaChange: handleAutosize,
    resetTextareaSize,
    focus,
    blur,
  } = useTextareaAutosize({ minHeight: 80, maxHeight: 160, isMobile });

  // Attachments
  const attachmentState = useAttachmentUpload({
    token: props.token,
    maxAttachments: 50,
    onAttachmentsChange: props.onAttachmentsChange,
    t,
  });

  // Audio recorder
  const audioState = useAudioRecorder({
    onAudioReady: attachmentState.handleFilesSelected,
  });

  // Mentions
  const mentionState = useMentions({
    conversationId: props.conversationId
  });

  // Draft autosave
  const { saveDraft, clearDraft } = useDraftAutosave({
    conversationId: props.conversationId,
    enabled: true,
  });

  // Typing state & glow color
  const [isTyping, setIsTyping] = useState(false);
  const typingTimeoutRef = useRef<NodeJS.Timeout>();

  const glowColor = useMemo(() => {
    const percentage = (props.value.length / maxMessageLength) * 100;
    if (percentage < 50) return 'rgba(59, 130, 246, 0.4)';
    if (percentage < 90) return 'rgba(139, 92, 246, 0.4)';
    if (percentage < 100) return 'rgba(236, 72, 153, 0.4)';
    return 'rgba(239, 68, 68, 0.5)';
  }, [props.value.length, maxMessageLength]);

  // Toolbar visibility
  const [toolbarVisible, setToolbarVisible] = useState(false);

  // Computed values
  const hasContent = useMemo(() => {
    return !!props.value.trim() ||
           attachmentState.selectedFiles.length > 0 ||
           attachmentState.uploadedAttachments.length > 0;
  }, [props.value, attachmentState.selectedFiles.length, attachmentState.uploadedAttachments.length]);

  const activeSections = useMemo(() => ({
    hasReply: !!replyingTo,
    hasAttachments: attachmentState.selectedFiles.length > 0 || audioState.showAudioRecorder,
    hasCompression: attachmentState.isCompressing && Object.keys(attachmentState.compressionProgress).length > 0,
  }), [replyingTo, attachmentState.selectedFiles.length, audioState.showAudioRecorder, attachmentState.isCompressing, attachmentState.compressionProgress]);

  const canSend = useMemo(() => {
    return hasContent &&
           props.value.length <= maxMessageLength &&
           props.isComposingEnabled &&
           !attachmentState.isUploading &&
           !attachmentState.isCompressing &&
           !audioState.isRecording &&
           (attachmentState.selectedFiles.length + attachmentState.uploadedAttachments.length) <= 50;
  }, [hasContent, props.value.length, maxMessageLength, props.isComposingEnabled, attachmentState.isUploading, attachmentState.isCompressing, audioState.isRecording, attachmentState.selectedFiles.length, attachmentState.uploadedAttachments.length]);

  // Handlers
  const handleTextareaChangeComplete = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    props.onChange(newValue);
    handleAutosize(e);

    // Save draft
    saveDraft(newValue);

    // Typing state
    setIsTyping(true);
    clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => setIsTyping(false), 1000);

    // Mention detection
    const cursorPosition = e.target.selectionStart;
    mentionState.handleTextChange(newValue, cursorPosition, textareaRef.current);
  }, [props.onChange, handleAutosize, saveDraft, mentionState.handleTextChange]);

  const handleSendMessage = useCallback(() => {
    props.onSend();
    resetTextareaSize();
    mentionState.clearMentionedUserIds();
    clearDraft();
    setIsTyping(false);
  }, [props.onSend, resetTextareaSize, mentionState.clearMentionedUserIds, clearDraft]);

  const clearAttachments = useCallback(() => {
    attachmentState.clearAttachments();
    audioState.resetAudioState();
  }, [attachmentState.clearAttachments, audioState.resetAudioState]);

  return {
    // Refs
    textareaRef,

    // State
    isMobile,
    isTyping,
    toolbarVisible,
    setToolbarVisible,
    hasContent,
    canSend,
    glowColor,
    maxMessageLength,
    finalPlaceholder: props.placeholder || t('writeMessage'),
    activeSections,
    replyingTo,

    // Attachments
    ...attachmentState,

    // Audio
    ...audioState,

    // Mentions
    ...mentionState,

    // Methods
    focus,
    blur,
    handleTextareaChangeComplete,
    handleSendMessage,
    clearAttachments,
    clearReply,
    resetTextareaSize,
  };
};
