'use client';

import { memo, useState, useCallback, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { X, Save, AlertTriangle, Globe, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { getLanguageInfo } from '@meeshy/shared/types';
import type { Message } from '@meeshy/shared/types';
import { useI18n } from '@/hooks/useI18n';
import { MentionAutocomplete } from '@/components/common/MentionAutocomplete';
import { detectMentionAtCursor } from '@meeshy/shared/types/mention';
import { getCursorPosition, adjustPositionForViewport } from '@/lib/cursor-position';

interface EditMessageViewProps {
  message: Message & {
    originalLanguage: string;
    translations?: any[];
    originalContent: string;
  };
  isOwnMessage: boolean;
  onSave: (messageId: string, newContent: string) => Promise<void> | void;
  onCancel: () => void;
  isSaving?: boolean;
  saveError?: string;
  conversationId?: string; // Pour les suggestions de mentions
}

export const EditMessageView = memo(function EditMessageView({
  message,
  isOwnMessage,
  onSave,
  onCancel,
  isSaving = false,
  saveError,
  conversationId
}: EditMessageViewProps) {
  const { t } = useI18n('editMessage');
  const [content, setContent] = useState(message.originalContent || message.content);
  const [hasChanges, setHasChanges] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isMobile, setIsMobile] = useState(false);

  // IMPORTANT: Priorité à message.conversationId (toujours un ObjectId valide du backend)
  // Fallback vers conversationId prop seulement si message.conversationId n'existe pas
  const effectiveConversationId = (message as any).conversationId || conversationId;

  // Debug: Log conversationId availability
  useEffect(() => {
    console.log('[EditMessageView] conversationId sources:', {
      fromProp: conversationId,
      fromMessage: (message as any).conversationId,
      effective: effectiveConversationId,
      messageId: message.id,
      isValidObjectId: effectiveConversationId && /^[a-f\d]{24}$/i.test(effectiveConversationId)
    });
  }, [conversationId, message.id, effectiveConversationId]);

  // États pour le système de mentions @username
  const [showMentionAutocomplete, setShowMentionAutocomplete] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionPosition, setMentionPosition] = useState<{ top?: number; bottom?: number; left: number }>({ left: 0 });
  const [mentionCursorStart, setMentionCursorStart] = useState(0);

  // Détection mobile
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Focus sur le textarea au mount
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.focus();
      // Placer le curseur à la fin
      textareaRef.current.setSelectionRange(content.length, content.length);
    }
  }, []);

  // Détection des changements
  useEffect(() => {
    const originalContent = message.originalContent || message.content;
    setHasChanges(content.trim() !== originalContent.trim());
  }, [content, message.originalContent, message.content]);

  const handleContentChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setContent(newValue);

    // Détection des mentions @username
    const textarea = e.target;
    const cursorPosition = textarea.selectionStart;
    const mentionDetection = detectMentionAtCursor(newValue, cursorPosition);

    // Vérifier que conversationId est un ObjectId MongoDB valide (24 caractères hexadécimaux)
    const isValidObjectId = effectiveConversationId && /^[a-f\d]{24}$/i.test(effectiveConversationId);

    // Debug: log detection result
    if (mentionDetection) {
      if (!isValidObjectId) {
        console.warn('[EditMessageView] Mention detected but conversationId invalid:', {
          conversationId: effectiveConversationId,
          isValid: isValidObjectId,
          messageId: message.id,
          query: mentionDetection.query
        });
      } else {
        console.log('[EditMessageView] Mention detected with valid conversationId:', {
          conversationId: effectiveConversationId,
          query: mentionDetection.query,
          messageId: message.id
        });
      }
    }

    if (mentionDetection && isValidObjectId) {
      // Valider que la query est un username valide (lettres, chiffres, underscore, max 30 caractères)
      const isValidQuery = /^\w{0,30}$/.test(mentionDetection.query);

      if (isValidQuery) {
        // Calculer la position de l'autocomplete AU NIVEAU DU CURSEUR
        if (textareaRef.current) {
          // Obtenir la position exacte du curseur dans le textarea
          const cursorPos = getCursorPosition(textareaRef.current, cursorPosition);

          // Get lineHeight from textarea computed styles
          const computed = window.getComputedStyle(textareaRef.current);
          const lineHeight = parseFloat(computed.lineHeight) || parseFloat(computed.fontSize) * 1.2;

          // Ajuster la position pour qu'elle reste visible dans le viewport
          const adjustedPosition = adjustPositionForViewport(cursorPos.x, cursorPos.y, 224, 256, lineHeight);

          setMentionPosition(adjustedPosition);
        }

        setMentionQuery(mentionDetection.query);
        setMentionCursorStart(mentionDetection.start);
        setShowMentionAutocomplete(true);
        console.log('[EditMessageView] Opening autocomplete for query:', mentionDetection.query);
      } else {
        // Query invalide (caractères spéciaux ou trop longue) → fermer l'autocomplete
        console.log('[EditMessageView] Invalid query, closing autocomplete:', mentionDetection.query);
        setShowMentionAutocomplete(false);
        setMentionQuery('');
      }
    } else {
      setShowMentionAutocomplete(false);
      setMentionQuery('');
    }
  }, [effectiveConversationId, message.id]);

  const handleSave = useCallback(async () => {
    if (!hasChanges || !content.trim()) return;
    
    try {
      await onSave(message.id, content.trim());
    } catch (error) {
      // Error handled by parent component
      console.error('Failed to save message:', error);
    }
  }, [hasChanges, content, onSave, message.id]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      // Si l'autocomplete est ouvert, le fermer d'abord
      if (showMentionAutocomplete) {
        setShowMentionAutocomplete(false);
        setMentionQuery('');
        e.preventDefault();
        return;
      }
      onCancel();
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSave();
    }
  }, [onCancel, handleSave, showMentionAutocomplete]);

  // Handler pour la sélection d'une mention
  const handleMentionSelect = useCallback((username: string) => {
    if (!textareaRef.current) return;

    const currentValue = content;
    const beforeMention = currentValue.substring(0, mentionCursorStart);
    const afterCursor = currentValue.substring(textareaRef.current.selectionStart);
    const newValue = `${beforeMention}@${username} ${afterCursor}`;

    setContent(newValue);
    setShowMentionAutocomplete(false);
    setMentionQuery('');

    // Placer le curseur après la mention insérée
    setTimeout(() => {
      if (textareaRef.current) {
        const newCursorPos = mentionCursorStart + username.length + 2; // +2 pour @ et espace
        textareaRef.current.selectionStart = newCursorPos;
        textareaRef.current.selectionEnd = newCursorPos;
        textareaRef.current.focus();
      }
    }, 0);
  }, [content, mentionCursorStart]);

  const originalLanguageInfo = getLanguageInfo(message.originalLanguage || 'fr');
  const hasTranslations = message.translations && message.translations.length > 0;

  // Version mobile épurée
  if (isMobile) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        transition={{ duration: 0.15 }}
        className={cn(
          "relative w-full rounded-xl border-2 overflow-hidden shadow-xl",
          isOwnMessage
            ? "bg-blue-50 dark:bg-blue-950 border-blue-300 dark:border-blue-700"
            : "bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600"
        )}
        onKeyDown={handleKeyDown}
      >
        {/* Textarea épuré sans titre */}
        <Textarea
          ref={textareaRef}
          value={content}
          onChange={handleContentChange}
          placeholder={t('enterMessageContent')}
          className={cn(
            "min-h-[120px] resize-none text-base border-0 focus-visible:ring-0 p-4",
            isOwnMessage
              ? "bg-blue-50 dark:bg-blue-950 text-gray-900 dark:text-gray-100"
              : "bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
          )}
          disabled={isSaving}
          style={{ fontSize: '16px' }} // Éviter le zoom iOS
        />

        {/* Erreur si présente */}
        {saveError && (
          <div className="px-4 pb-2">
            <p className="text-xs text-red-600 dark:text-red-400">{saveError}</p>
          </div>
        )}

        {/* Boutons simples en bas */}
        <div className={cn(
          "flex items-center justify-end gap-3 p-4 border-t",
          isOwnMessage
            ? "border-blue-200 dark:border-blue-800 bg-blue-100/50 dark:bg-blue-900/30"
            : "border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900"
        )}>
          {/* Bouton Annuler (X) */}
          <Button
            onClick={onCancel}
            disabled={isSaving}
            size="lg"
            variant="ghost"
            className="h-12 w-12 p-0 rounded-full"
          >
            <X className="h-6 w-6" />
          </Button>

          {/* Bouton Valider (Check) */}
          <Button
            onClick={handleSave}
            disabled={!hasChanges || !content.trim() || isSaving}
            size="lg"
            className={cn(
              "h-12 w-12 p-0 rounded-full",
              isOwnMessage
                ? "bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
                : "bg-green-600 hover:bg-green-700"
            )}
          >
            <Check className="h-6 w-6" />
          </Button>
        </div>

        {/* Autocomplete des mentions */}
        {showMentionAutocomplete && effectiveConversationId && (
          <MentionAutocomplete
            conversationId={effectiveConversationId}
            query={mentionQuery}
            onSelect={handleMentionSelect}
            onClose={() => {
              setShowMentionAutocomplete(false);
              setMentionQuery('');
            }}
            position={mentionPosition}
          />
        )}
      </motion.div>
    );
  }

  // Version desktop complète
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95, y: -10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: 10 }}
      transition={{ duration: 0.2, ease: 'easeInOut' }}
      className={cn(
        "relative w-full max-w-2xl mx-auto rounded-lg border shadow-lg overflow-visible",
        isOwnMessage
          ? "bg-gradient-to-br from-blue-400/95 to-blue-500/95 dark:from-blue-600/90 dark:to-blue-700/90 border-blue-400 dark:border-blue-500 backdrop-blur-sm"
          : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700"
      )}
      onKeyDown={handleKeyDown}
    >
      {/* Header */}
      <div className={cn(
        "flex items-center justify-between px-4 py-3 border-b",
        isOwnMessage
          ? "border-white/20 dark:border-white/10 bg-white/10 dark:bg-white/5"
          : "border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50"
      )}>
        <div className="flex items-center gap-2">
          <h3 className={cn(
            "text-sm font-semibold",
            isOwnMessage ? "text-blue-900 dark:text-blue-100" : "text-gray-800 dark:text-gray-100"
          )}>
            {t('editMessage')}
          </h3>
          <Badge variant="outline" className={cn(
            "text-xs h-5",
            isOwnMessage
              ? "border-blue-700 dark:border-blue-300 text-blue-900 dark:text-blue-100 bg-white/50 dark:bg-white/10"
              : "border-gray-300 text-gray-600 dark:border-gray-600 dark:text-gray-400"
          )}>
            <span className="mr-1">{originalLanguageInfo.flag}</span>
            {originalLanguageInfo.code.toUpperCase()}
          </Badge>
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={onCancel}
          disabled={isSaving}
          className={cn(
            "h-6 w-6 p-0 rounded-full",
            isOwnMessage
              ? "text-blue-900 dark:text-blue-100 hover:text-blue-950 dark:hover:text-white hover:bg-blue-900/20 dark:hover:bg-white/20"
              : "text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-gray-300 dark:hover:bg-gray-700"
          )}
          aria-label={t('cancel')}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Content Editor */}
      <div className="p-4">
        <div className="space-y-3">
          <div>
            <label className={cn(
              "block text-sm font-medium mb-2",
              isOwnMessage ? "text-blue-900 dark:text-blue-100" : "text-gray-700 dark:text-gray-300"
            )}>
              {t('messageContent')}:
            </label>
            <Textarea
              ref={textareaRef}
              value={content}
              onChange={handleContentChange}
              placeholder={t('enterMessageContent')}
              className={cn(
                "min-h-[120px] resize-none text-sm leading-relaxed",
                isOwnMessage
                  ? "bg-white dark:bg-gray-800 border-blue-300 dark:border-blue-400 text-gray-900 dark:text-gray-100 placeholder:text-gray-500 dark:placeholder:text-gray-400 focus:bg-white dark:focus:bg-gray-800 focus:border-blue-500 dark:focus:border-blue-300"
                  : "bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600"
              )}
              disabled={isSaving}
            />
          </div>

          {/* Translation Warning - Afficher seulement si le message a des traductions */}
          {hasTranslations && (
            <div className={cn(
              "flex items-start gap-2 p-3 rounded-md border",
              isOwnMessage
                ? "bg-white/10 dark:bg-white/5 border-white/20 dark:border-white/10"
                : "bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800"
            )}>
              <AlertTriangle className={cn(
                "h-4 w-4 mt-0.5 flex-shrink-0",
                isOwnMessage ? "text-amber-700 dark:text-amber-300" : "text-amber-600 dark:text-amber-400"
              )} />
              <div>
                <p className={cn(
                  "text-xs font-medium mb-1",
                  isOwnMessage ? "text-amber-900 dark:text-amber-200" : "text-amber-800 dark:text-amber-200"
                )}>
                  {t('translationWarning')}
                </p>
                <p className={cn(
                  "text-xs",
                  isOwnMessage ? "text-amber-800 dark:text-amber-300" : "text-amber-700 dark:text-amber-300"
                )}>
                  {t('translationWillBeRegenerated')}
                </p>
              </div>
            </div>
          )}

          {/* Save Error */}
          {saveError && (
            <div className={cn(
              "flex items-start gap-2 p-3 rounded-md border",
              isOwnMessage
                ? "bg-red-900/30 dark:bg-red-900/40 border-red-700 dark:border-red-600"
                : "bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800"
            )}>
              <AlertTriangle className={cn(
                "h-4 w-4 mt-0.5 flex-shrink-0",
                isOwnMessage ? "text-red-200 dark:text-red-300" : "text-red-600 dark:text-red-400"
              )} />
              <p className={cn(
                "text-xs",
                isOwnMessage ? "text-red-200 dark:text-red-300" : "text-red-700 dark:text-red-300"
              )}>
                {saveError}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Footer Actions */}
      <div className={cn(
        "flex items-center justify-between px-4 py-3 border-t",
        isOwnMessage
          ? "border-white/20 dark:border-white/10 bg-white/5 dark:bg-white/5"
          : "border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50"
      )}>
        <div className="flex items-center gap-2">
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onCancel}
            disabled={isSaving}
            className={cn(
              "h-8 px-3 text-xs",
              isOwnMessage
                ? "border-blue-700 dark:border-blue-400 bg-white dark:bg-gray-800 text-blue-900 dark:text-blue-100 hover:bg-blue-50 dark:hover:bg-gray-700"
                : "border-gray-300 text-gray-600 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-700"
            )}
          >
            {t('cancel')}
          </Button>

          <Button
            size="sm"
            onClick={handleSave}
            disabled={!hasChanges || !content.trim() || isSaving}
            className={cn(
              "h-8 px-3 text-xs",
              isOwnMessage
                ? "bg-blue-700 dark:bg-blue-600 hover:bg-blue-800 dark:hover:bg-blue-500 text-white border-blue-800 dark:border-blue-500"
                : "bg-blue-600 hover:bg-blue-700 text-white"
            )}
          >
            {isSaving ? (
              <>
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  className="mr-1"
                >
                  <Save className="h-3 w-3" />
                </motion.div>
                {t('saving')}...
              </>
            ) : (
              <>
                <Save className="h-3 w-3 mr-1" />
                {t('save')}
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Autocomplete des mentions @username */}
      {showMentionAutocomplete && effectiveConversationId && (
        <MentionAutocomplete
          conversationId={effectiveConversationId}
          query={mentionQuery}
          onSelect={handleMentionSelect}
          onClose={() => {
            setShowMentionAutocomplete(false);
            setMentionQuery('');
          }}
          position={mentionPosition}
        />
      )}
    </motion.div>
  );
});