'use client';

import { memo, useState, useCallback, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { X, Save, AlertTriangle, Check, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { getLanguageInfo, SUPPORTED_LANGUAGES } from '@meeshy/shared/types';
import type { Message } from '@meeshy/shared/types';
import { useI18n } from '@/hooks/useI18n';
import { MentionAutocomplete } from '@/components/common/MentionAutocomplete';
import { detectMentionAtCursor } from '@meeshy/shared/types/mention';
import { getCursorPosition, adjustPositionForViewport } from '@/lib/cursor-position';

const DEFAULT_LANGUAGE = 'fr';
const TRANSLATION_LANGUAGES = SUPPORTED_LANGUAGES.filter(l => l.supportsTranslation);

interface EditMessageViewProps {
  message: Message & {
    originalLanguage: string;
    translations?: any[];
    originalContent: string;
  };
  isOwnMessage: boolean;
  onSave: (messageId: string, newContent: string, originalLanguage: string) => Promise<void> | void;
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
  const [selectedLanguage, setSelectedLanguage] = useState(message.originalLanguage || DEFAULT_LANGUAGE);
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
    const hasContentChanges = content.trim() !== originalContent.trim();
    const hasLanguageChanges = selectedLanguage !== (message.originalLanguage || DEFAULT_LANGUAGE);
    setHasChanges(hasContentChanges || hasLanguageChanges);
  }, [content, message.originalContent, message.content, selectedLanguage, message.originalLanguage]);

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
      await onSave(message.id, content.trim(), selectedLanguage);
    } catch (error) {
      // Error handled by parent component
      console.error('Failed to save message:', error);
    }
  }, [hasChanges, content, onSave, message.id, selectedLanguage]);

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

  const selectedLanguageInfo = getLanguageInfo(selectedLanguage);
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
            ? "bg-indigo-50 dark:bg-indigo-950 border-indigo-300 dark:border-indigo-700"
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
              ? "bg-indigo-50 dark:bg-indigo-950 text-gray-900 dark:text-gray-100"
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
          "flex items-center justify-between gap-3 p-4 border-t",
          isOwnMessage
            ? "border-indigo-200 dark:border-indigo-800 bg-indigo-100/50 dark:bg-indigo-900/30"
            : "border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900"
        )}>
          {/* Language selector mobile */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className={cn(
                "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border cursor-pointer transition-colors hover:bg-black/5 dark:hover:bg-white/10",
                isOwnMessage
                  ? "border-indigo-700 dark:border-indigo-300 text-indigo-900 dark:text-indigo-100 bg-white/50 dark:bg-white/10"
                  : "border-gray-300 text-gray-600 dark:border-gray-600 dark:text-gray-400"
              )}>
                <span>{selectedLanguageInfo.flag}</span>
                {selectedLanguageInfo.code.toUpperCase()}
                <ChevronDown className="h-3 w-3 opacity-50" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto w-48">
              {TRANSLATION_LANGUAGES.map(lang => (
                <DropdownMenuItem
                  key={lang.code}
                  onClick={() => setSelectedLanguage(lang.code)}
                  className={cn(selectedLanguage === lang.code && "bg-accent")}
                >
                  <span className="mr-2">{lang.flag}</span>
                  <span className="flex-1 truncate">{lang.nativeName || lang.name}</span>
                  <span className="text-xs text-muted-foreground ml-1">{lang.code.toUpperCase()}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="flex items-center gap-3">
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
                  ? "bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600"
                  : "bg-green-600 hover:bg-green-700"
              )}
            >
              <Check className="h-6 w-6" />
            </Button>
          </div>
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
          ? "bg-gradient-to-br from-indigo-500/95 to-indigo-700/95 dark:from-indigo-600/90 dark:to-indigo-700/90 border-indigo-400 dark:border-indigo-500 backdrop-blur-sm"
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
            isOwnMessage ? "text-indigo-900 dark:text-indigo-100" : "text-gray-800 dark:text-gray-100"
          )}>
            {t('editMessage')}
          </h3>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className={cn(
                "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border cursor-pointer transition-colors hover:bg-black/5 dark:hover:bg-white/10",
                isOwnMessage
                  ? "border-indigo-700 dark:border-indigo-300 text-indigo-900 dark:text-indigo-100 bg-white/50 dark:bg-white/10"
                  : "border-gray-300 text-gray-600 dark:border-gray-600 dark:text-gray-400"
              )}>
                <span>{selectedLanguageInfo.flag}</span>
                {selectedLanguageInfo.code.toUpperCase()}
                <ChevronDown className="h-3 w-3 opacity-50" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto w-48">
              {TRANSLATION_LANGUAGES.map(lang => (
                <DropdownMenuItem
                  key={lang.code}
                  onClick={() => setSelectedLanguage(lang.code)}
                  className={cn(selectedLanguage === lang.code && "bg-accent")}
                >
                  <span className="mr-2">{lang.flag}</span>
                  <span className="flex-1 truncate">{lang.nativeName || lang.name}</span>
                  <span className="text-xs text-muted-foreground ml-1">{lang.code.toUpperCase()}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={onCancel}
          disabled={isSaving}
          className={cn(
            "h-6 w-6 p-0 rounded-full",
            isOwnMessage
              ? "text-indigo-900 dark:text-indigo-100 hover:text-indigo-950 dark:hover:text-white hover:bg-indigo-900/20 dark:hover:bg-white/20"
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
              isOwnMessage ? "text-indigo-900 dark:text-indigo-100" : "text-gray-700 dark:text-gray-300"
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
                  ? "bg-white dark:bg-gray-800 border-indigo-300 dark:border-indigo-400 text-gray-900 dark:text-gray-100 placeholder:text-gray-500 dark:placeholder:text-gray-400 focus:bg-white dark:focus:bg-gray-800 focus:border-indigo-500 dark:focus:border-indigo-300"
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
        "flex items-center justify-end px-4 py-3 border-t",
        isOwnMessage
          ? "border-white/20 dark:border-white/10 bg-white/5 dark:bg-white/5"
          : "border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50"
      )}>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onCancel}
            disabled={isSaving}
            className={cn(
              "h-8 px-3 text-xs",
              isOwnMessage
                ? "border-indigo-700 dark:border-indigo-400 bg-white dark:bg-gray-800 text-indigo-900 dark:text-indigo-100 hover:bg-indigo-50 dark:hover:bg-gray-700"
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
                ? "bg-indigo-700 dark:bg-indigo-600 hover:bg-indigo-800 dark:hover:bg-indigo-500 text-white border-indigo-800 dark:border-indigo-500"
                : "bg-indigo-600 hover:bg-indigo-700 text-white"
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