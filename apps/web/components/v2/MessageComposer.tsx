'use client';

import { useState, useRef, useCallback, useEffect, forwardRef, useImperativeHandle } from 'react';
import { theme } from './theme';

export interface Attachment {
  id: string;
  type: 'image' | 'file' | 'voice' | 'location';
  name: string;
  url?: string;
  size?: number;
  duration?: number;
  coordinates?: { lat: number; lng: number };
  preview?: string;
}

export interface LanguageOption {
  code: string;
  name: string;
  flag: string;
}

export interface MessageComposerProps {
  value?: string;
  onChange?: (value: string) => void;
  onSend?: (message: string, attachments: Attachment[], languageCode: string) => void;
  placeholder?: string;
  disabled?: boolean;
  showVoice?: boolean;
  showLocation?: boolean;
  showAttachment?: boolean;
  onAttachmentClick?: () => void;
  onVoiceRecord?: (blob: Blob, duration: number) => void;
  onLocationRequest?: () => void;
  maxLength?: number;
  /** Langue sélectionnée */
  selectedLanguage?: string;
  /** Liste des langues disponibles */
  availableLanguages?: LanguageOption[];
  /** Callback quand la langue change */
  onLanguageChange?: (code: string) => void;
  className?: string;
}

const DEFAULT_LANGUAGES: LanguageOption[] = [
  { code: 'fr', name: 'Français', flag: '🇫🇷' },
  { code: 'en', name: 'English', flag: '🇬🇧' },
  { code: 'es', name: 'Español', flag: '🇪🇸' },
  { code: 'de', name: 'Deutsch', flag: '🇩🇪' },
  { code: 'it', name: 'Italiano', flag: '🇮🇹' },
  { code: 'pt', name: 'Português', flag: '🇧🇷' },
  { code: 'ja', name: '日本語', flag: '🇯🇵' },
  { code: 'zh', name: '中文', flag: '🇨🇳' },
  { code: 'ko', name: '한국어', flag: '🇰🇷' },
  { code: 'ar', name: 'العربية', flag: '🇸🇦' },
];

// Icônes
function MicIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
    </svg>
  );
}

function LocationIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function AttachmentIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
    </svg>
  );
}

function SendIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
    </svg>
  );
}

function StopIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  );
}

function EmojiIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function CloseIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function ChevronIcon({ className = 'w-3 h-3' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const MessageComposer = forwardRef<
  {
    focus: () => void;
    blur: () => void;
    getMentionedUserIds?: () => string[];
    clearAttachments?: () => void;
    clearMentionedUserIds?: () => void;
  },
  MessageComposerProps
>(function MessageComposerForward({
  value = '',
  onChange,
  onSend,
  placeholder = 'Écrivez votre message...',
  disabled = false,
  showVoice = true,
  showLocation = true,
  showAttachment = true,
  onAttachmentClick,
  onVoiceRecord,
  onLocationRequest,
  maxLength,
  selectedLanguage = 'fr',
  availableLanguages = DEFAULT_LANGUAGES,
  onLanguageChange,
  className = '',
}: MessageComposerProps, ref) {
  const [message, setMessage] = useState(value);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [isFocused, setIsFocused] = useState(false);
  const [showLanguageMenu, setShowLanguageMenu] = useState(false);
  const [currentLanguage, setCurrentLanguage] = useState(selectedLanguage);
  const [menuDirection, setMenuDirection] = useState<'up' | 'down'>('up');

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const languageButtonRef = useRef<HTMLButtonElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const currentLangOption = availableLanguages.find(l => l.code === currentLanguage) || availableLanguages[0];

  // Exposer les méthodes publiques au parent via useImperativeHandle
  useImperativeHandle(ref, () => ({
    focus: () => {
      textareaRef.current?.focus();
    },
    blur: () => {
      textareaRef.current?.blur();
    },
    getMentionedUserIds: () => [],
    clearAttachments: () => {
      setAttachments([]);
    },
    clearMentionedUserIds: () => {
      // À implémenter si les mentions sont supportées
    }
  }), []);

  useEffect(() => {
    setMessage(value);
  }, [value]);

  useEffect(() => {
    setCurrentLanguage(selectedLanguage);
  }, [selectedLanguage]);

  const adjustTextareaHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 150)}px`;
    }
  }, []);

  useEffect(() => {
    adjustTextareaHeight();
  }, [message, adjustTextareaHeight]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = maxLength ? e.target.value.slice(0, maxLength) : e.target.value;
    setMessage(newValue);
    onChange?.(newValue);
  }, [onChange, maxLength]);

  const handleSend = useCallback(() => {
    if ((!message.trim() && attachments.length === 0) || disabled) return;

    onSend?.(message.trim(), attachments, currentLanguage);
    setMessage('');
    setAttachments([]);
    onChange?.('');

    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [message, attachments, disabled, onSend, onChange, currentLanguage]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const duration = recordingDuration;

        const voiceAttachment: Attachment = {
          id: `voice-${Date.now()}`,
          type: 'voice',
          name: `Message vocal (${formatDuration(duration)})`,
          duration,
          url: URL.createObjectURL(audioBlob),
        };
        setAttachments((prev) => [...prev, voiceAttachment]);

        onVoiceRecord?.(audioBlob, duration);
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingDuration(0);

      recordingIntervalRef.current = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);
    } catch (error) {
      console.error('Erreur accès microphone:', error);
    }
  }, [recordingDuration, onVoiceRecord]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);

      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
        recordingIntervalRef.current = null;
      }
    }
  }, [isRecording]);

  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) {
      console.error('Géolocalisation non supportée');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const locationAttachment: Attachment = {
          id: `location-${Date.now()}`,
          type: 'location',
          name: 'Position actuelle',
          coordinates: {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          },
        };
        setAttachments((prev) => [...prev, locationAttachment]);
        onLocationRequest?.();
      },
      (error) => {
        console.error('Erreur géolocalisation:', error);
      }
    );
  }, [onLocationRequest]);

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const handleLanguageSelect = useCallback((code: string) => {
    setCurrentLanguage(code);
    setShowLanguageMenu(false);
    onLanguageChange?.(code);
  }, [onLanguageChange]);

  const toggleLanguageMenu = useCallback(() => {
    if (!showLanguageMenu && languageButtonRef.current) {
      const rect = languageButtonRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const menuHeight = 200; // max-h-[200px]
      setMenuDirection(spaceBelow < menuHeight ? 'up' : 'down');
    }
    setShowLanguageMenu(!showLanguageMenu);
  }, [showLanguageMenu]);

  const hasContent = message.trim().length > 0 || attachments.length > 0;

  return (
    <div
      className={`border-t transition-colors duration-300 ${className}`}
      style={{
        borderColor: 'var(--gp-parchment)',
        background: 'var(--gp-surface)',
      }}
    >
      {/* Attachments preview */}
      {attachments.length > 0 && (
        <div className="px-4 pt-3 flex flex-wrap gap-2">
          {attachments.map((attachment) => (
            <div
              key={attachment.id}
              className="relative group flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors duration-300"
              style={{
                background: 'var(--gp-parchment)',
                color: 'var(--gp-text-primary)',
              }}
            >
              {attachment.type === 'voice' && (
                <MicIcon className="w-4 h-4" style={{ color: 'var(--gp-terracotta)' } as React.CSSProperties} />
              )}
              {attachment.type === 'location' && (
                <LocationIcon className="w-4 h-4" style={{ color: 'var(--gp-deep-teal)' } as React.CSSProperties} />
              )}
              {attachment.type === 'image' && <span>🖼️</span>}
              {attachment.type === 'file' && <AttachmentIcon className="w-4 h-4" />}

              <span className="max-w-[150px] truncate">{attachment.name}</span>

              {attachment.size && (
                <span className="text-xs opacity-60">{formatFileSize(attachment.size)}</span>
              )}

              <button
                onClick={() => removeAttachment(attachment.id)}
                className="ml-1 p-0.5 rounded-full hover:bg-black/10 transition-colors"
                aria-label="Supprimer la pièce jointe"
              >
                <CloseIcon className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Zone de saisie */}
      <div className="p-3">
        {/* Zone de texte */}
        <div
          className={`
            relative rounded-2xl border transition-[border-color,box-shadow] duration-300
            ${isFocused ? 'ring-2 ring-[var(--gp-terracotta)]/20' : ''}
          `}
          style={{
            borderColor: isFocused ? 'var(--gp-terracotta)' : 'var(--gp-parchment)',
            background: 'var(--gp-surface-elevated)',
          }}
        >
          {/* Barre d'outils en haut: Langue + Icônes d'action */}
          <div className="absolute top-2 left-3 right-3 z-10 flex items-center gap-0.5 md:gap-1">
            {/* Sélecteur de langue */}
            <div className="relative">
              <button
                ref={languageButtonRef}
                onClick={toggleLanguageMenu}
                className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-full font-medium hover:opacity-80 transition-opacity duration-300"
                style={{
                  background: 'color-mix(in srgb, var(--gp-deep-teal) 15%, transparent)',
                  color: 'var(--gp-deep-teal)',
                }}
              >
                <span>{currentLangOption?.flag}</span>
                <span>{currentLangOption?.code.toUpperCase()}</span>
                <ChevronIcon className={`w-3 h-3 transition-transform ${showLanguageMenu ? (menuDirection === 'up' ? '' : 'rotate-180') : ''}`} />
              </button>

              {/* Menu déroulant des langues */}
              {showLanguageMenu && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setShowLanguageMenu(false)}
                  />
                  <div
                    className={`absolute left-0 z-20 rounded-lg overflow-hidden max-h-[200px] overflow-y-auto transition-colors duration-300 ${
                      menuDirection === 'up' ? 'bottom-full mb-1' : 'top-full mt-1'
                    }`}
                    style={{
                      background: 'var(--gp-surface)',
                      border: '1px solid var(--gp-parchment)',
                      boxShadow: 'var(--gp-shadow-lg)',
                      minWidth: '150px',
                    }}
                  >
                    {availableLanguages.map((lang) => (
                      <button
                        key={lang.code}
                        onClick={() => handleLanguageSelect(lang.code)}
                        className={`
                          w-full px-3 py-2 text-left text-sm flex items-center gap-2 transition-colors duration-300
                          ${lang.code === currentLanguage ? 'bg-[var(--gp-active)]' : 'hover:bg-[var(--gp-hover)]'}
                        `}
                        style={{ color: 'var(--gp-text-primary)' }}
                      >
                        <span>{lang.flag}</span>
                        <span className="flex-1">{lang.name}</span>
                        {lang.code === currentLanguage && (
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24" style={{ color: 'var(--gp-deep-teal)' }}>
                            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
                          </svg>
                        )}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Icônes d'action à droite du sélecteur de langue */}
            {showAttachment && (
              <button
                onClick={onAttachmentClick}
                disabled={disabled || isRecording}
                className="p-2 md:p-1.5 rounded-full hover:bg-[var(--gp-hover)] transition-colors duration-300 disabled:opacity-40"
                style={{ color: 'var(--gp-text-muted)' }}
                title="Pièce jointe"
                aria-label="Ajouter une pièce jointe"
              >
                <AttachmentIcon className="w-5 h-5 md:w-4 md:h-4" />
              </button>
            )}

            <button
              disabled={disabled || isRecording}
              className="p-2 md:p-1.5 rounded-full hover:bg-[var(--gp-hover)] transition-colors duration-300 disabled:opacity-40"
              style={{ color: 'var(--gp-text-muted)' }}
              title="Emoji"
              aria-label="Ajouter un emoji"
            >
              <EmojiIcon className="w-5 h-5 md:w-4 md:h-4" />
            </button>

            {showVoice && (
              isRecording ? (
                <button
                  onClick={stopRecording}
                  className="p-2 md:p-1.5 rounded-full transition-colors duration-300 animate-pulse"
                  style={{ background: '#EF4444', color: 'white' }}
                  title="Arrêter"
                  aria-label="Arrêter l'enregistrement"
                >
                  <StopIcon className="w-5 h-5 md:w-4 md:h-4" />
                </button>
              ) : (
                <button
                  onClick={startRecording}
                  disabled={disabled}
                  className="p-2 md:p-1.5 rounded-full hover:bg-[var(--gp-hover)] transition-colors duration-300 disabled:opacity-40"
                  style={{ color: 'var(--gp-text-muted)' }}
                  title="Message vocal"
                  aria-label="Enregistrer un message vocal"
                >
                  <MicIcon className="w-5 h-5 md:w-4 md:h-4" />
                </button>
              )
            )}

            {showLocation && !isRecording && (
              <button
                onClick={requestLocation}
                disabled={disabled}
                className="p-2 md:p-1.5 rounded-full hover:bg-[var(--gp-hover)] transition-colors duration-300 disabled:opacity-40"
                style={{ color: 'var(--gp-text-muted)' }}
                title="Position"
                aria-label="Partager ma position"
              >
                <LocationIcon className="w-5 h-5 md:w-4 md:h-4" />
              </button>
            )}

            {isRecording && (
              <span className="text-xs font-medium tabular-nums ml-1" style={{ color: '#EF4444' }}>
                {formatDuration(recordingDuration)}
              </span>
            )}
          </div>

          <textarea
            ref={textareaRef}
            value={message}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder={isRecording ? 'Enregistrement en cours...' : placeholder}
            disabled={disabled || isRecording}
            rows={1}
            className="w-full pl-4 pr-12 pt-10 pb-3 bg-transparent resize-none outline-none text-[15px] leading-relaxed placeholder:text-[var(--gp-text-muted)] disabled:opacity-50 transition-colors duration-300"
            style={{
              color: 'var(--gp-text-primary)',
              minHeight: '70px',
              maxHeight: '150px',
            }}
          />

          {/* Bouton envoyer - à droite dans le textarea (visible seulement s'il y a du contenu) */}
          {hasContent && (
            <button
              onClick={handleSend}
              disabled={disabled}
              className="absolute right-2 bottom-2 p-2 rounded-full transition-transform duration-300 hover:scale-105 active:scale-95"
              style={{
                background: 'var(--gp-terracotta)',
                color: 'white',
              }}
              title="Envoyer"
              aria-label="Envoyer le message"
            >
              <SendIcon className="w-5 h-5" />
            </button>
          )}

          {/* Compteur de caractères */}
          {maxLength && message.length > maxLength * 0.8 && (
            <div
              className="absolute bottom-1 left-3 text-[10px] transition-colors duration-300"
              style={{
                color: message.length >= maxLength ? '#EF4444' : 'var(--gp-text-muted)',
              }}
            >
              {message.length}/{maxLength}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

MessageComposer.displayName = 'MessageComposer';
