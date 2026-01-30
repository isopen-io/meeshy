'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { theme } from './theme';

export interface Attachment {
  id: string;
  type: 'image' | 'file' | 'voice' | 'location';
  name: string;
  url?: string;
  size?: number;
  duration?: number; // Pour les messages vocaux (en secondes)
  coordinates?: { lat: number; lng: number }; // Pour la localisation
  preview?: string; // URL de prévisualisation pour les images
}

export interface MessageComposerProps {
  /** Valeur du message */
  value?: string;
  /** Callback quand le message change */
  onChange?: (value: string) => void;
  /** Callback quand le message est envoyé */
  onSend?: (message: string, attachments: Attachment[]) => void;
  /** Placeholder du champ de texte */
  placeholder?: string;
  /** Désactiver l'envoi */
  disabled?: boolean;
  /** Afficher le bouton vocal */
  showVoice?: boolean;
  /** Afficher le bouton localisation */
  showLocation?: boolean;
  /** Afficher le bouton pièce jointe */
  showAttachment?: boolean;
  /** Callback pour les pièces jointes */
  onAttachmentClick?: () => void;
  /** Callback pour l'enregistrement vocal */
  onVoiceRecord?: (blob: Blob, duration: number) => void;
  /** Callback pour la localisation */
  onLocationRequest?: () => void;
  /** Nombre max de caractères */
  maxLength?: number;
  /** Langue de l'utilisateur (pour l'indicateur) */
  userLanguage?: string;
  /** Classe CSS additionnelle */
  className?: string;
}

// Icône microphone
function MicIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
    </svg>
  );
}

// Icône localisation
function LocationIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

// Icône pièce jointe
function AttachmentIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
    </svg>
  );
}

// Icône envoi
function SendIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
    </svg>
  );
}

// Icône stop
function StopIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  );
}

// Icône emoji
function EmojiIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

// Icône fermer
function CloseIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
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

export function MessageComposer({
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
  userLanguage,
  className = '',
}: MessageComposerProps) {
  const [message, setMessage] = useState(value);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [isFocused, setIsFocused] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Sync avec value externe
  useEffect(() => {
    setMessage(value);
  }, [value]);

  // Auto-resize du textarea
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

  // Gestion du changement de message
  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = maxLength ? e.target.value.slice(0, maxLength) : e.target.value;
    setMessage(newValue);
    onChange?.(newValue);
  }, [onChange, maxLength]);

  // Envoi du message
  const handleSend = useCallback(() => {
    if ((!message.trim() && attachments.length === 0) || disabled) return;

    onSend?.(message.trim(), attachments);
    setMessage('');
    setAttachments([]);
    onChange?.('');

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [message, attachments, disabled, onSend, onChange]);

  // Gestion des touches
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  // Démarrer l'enregistrement vocal
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

        // Ajouter comme attachment
        const voiceAttachment: Attachment = {
          id: `voice-${Date.now()}`,
          type: 'voice',
          name: `Message vocal (${formatDuration(duration)})`,
          duration,
          url: URL.createObjectURL(audioBlob),
        };
        setAttachments((prev) => [...prev, voiceAttachment]);

        onVoiceRecord?.(audioBlob, duration);

        // Arrêter les tracks
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingDuration(0);

      // Timer pour la durée
      recordingIntervalRef.current = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);
    } catch (error) {
      console.error('Erreur accès microphone:', error);
    }
  }, [recordingDuration, onVoiceRecord]);

  // Arrêter l'enregistrement vocal
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

  // Demander la localisation
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

  // Supprimer un attachment
  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const hasContent = message.trim().length > 0 || attachments.length > 0;

  return (
    <div
      className={`
        border-t transition-all
        ${className}
      `}
      style={{
        borderColor: theme.colors.parchment,
        background: 'white',
      }}
    >
      {/* Attachments preview */}
      {attachments.length > 0 && (
        <div className="px-4 pt-3 flex flex-wrap gap-2">
          {attachments.map((attachment) => (
            <div
              key={attachment.id}
              className="relative group flex items-center gap-2 px-3 py-2 rounded-lg text-sm"
              style={{
                background: theme.colors.parchment,
                color: theme.colors.charcoal,
              }}
            >
              {/* Icône selon le type */}
              {attachment.type === 'voice' && (
                <MicIcon className="w-4 h-4" style={{ color: theme.colors.terracotta } as React.CSSProperties} />
              )}
              {attachment.type === 'location' && (
                <LocationIcon className="w-4 h-4" style={{ color: theme.colors.jadeGreen } as React.CSSProperties} />
              )}
              {attachment.type === 'image' && (
                <span>🖼️</span>
              )}
              {attachment.type === 'file' && (
                <AttachmentIcon className="w-4 h-4" />
              )}

              <span className="max-w-[150px] truncate">{attachment.name}</span>

              {attachment.size && (
                <span className="text-xs opacity-60">
                  {formatFileSize(attachment.size)}
                </span>
              )}

              {/* Bouton supprimer */}
              <button
                onClick={() => removeAttachment(attachment.id)}
                className="ml-1 p-0.5 rounded-full hover:bg-black/10 transition-colors"
              >
                <CloseIcon className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Zone de saisie */}
      <div className="p-3 flex items-end gap-2">
        {/* Boutons gauche */}
        <div className="flex items-center gap-1">
          {/* Pièce jointe */}
          {showAttachment && (
            <button
              onClick={onAttachmentClick}
              disabled={disabled || isRecording}
              className="p-2 rounded-full hover:bg-gray-100 transition-colors disabled:opacity-40"
              style={{ color: theme.colors.textMuted }}
              title="Ajouter une pièce jointe"
            >
              <AttachmentIcon />
            </button>
          )}
        </div>

        {/* Zone de texte */}
        <div
          className={`
            flex-1 relative rounded-2xl border transition-all
            ${isFocused ? 'border-terracotta ring-2 ring-terracotta/20' : ''}
          `}
          style={{
            borderColor: isFocused ? theme.colors.terracotta : theme.colors.parchment,
            background: theme.colors.warmCanvas,
          }}
        >
          {/* Indicateur de langue */}
          {userLanguage && (
            <div
              className="absolute top-2 right-2 text-[10px] px-1.5 py-0.5 rounded-full font-medium"
              style={{
                background: `${theme.colors.deepTeal}15`,
                color: theme.colors.deepTeal,
              }}
            >
              {userLanguage.toUpperCase()}
            </div>
          )}

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
            className={`
              w-full px-4 py-3 pr-10 bg-transparent resize-none outline-none
              text-[15px] leading-relaxed
              placeholder:text-gray-400
              disabled:opacity-50
            `}
            style={{
              color: theme.colors.charcoal,
              minHeight: '44px',
              maxHeight: '150px',
            }}
          />

          {/* Bouton emoji */}
          <button
            className="absolute right-2 bottom-2 p-1.5 rounded-full hover:bg-black/5 transition-colors"
            style={{ color: theme.colors.textMuted }}
            title="Ajouter un emoji"
          >
            <EmojiIcon className="w-5 h-5" />
          </button>

          {/* Compteur de caractères */}
          {maxLength && message.length > maxLength * 0.8 && (
            <div
              className="absolute bottom-1 left-3 text-[10px]"
              style={{
                color: message.length >= maxLength ? '#EF4444' : theme.colors.textMuted,
              }}
            >
              {message.length}/{maxLength}
            </div>
          )}
        </div>

        {/* Boutons droite */}
        <div className="flex items-center gap-1">
          {/* Localisation */}
          {showLocation && !isRecording && (
            <button
              onClick={requestLocation}
              disabled={disabled}
              className="p-2 rounded-full hover:bg-gray-100 transition-colors disabled:opacity-40"
              style={{ color: theme.colors.textMuted }}
              title="Partager ma position"
            >
              <LocationIcon />
            </button>
          )}

          {/* Enregistrement vocal */}
          {showVoice && (
            isRecording ? (
              <button
                onClick={stopRecording}
                className="p-2 rounded-full transition-colors animate-pulse"
                style={{
                  background: '#EF4444',
                  color: 'white',
                }}
                title="Arrêter l'enregistrement"
              >
                <StopIcon />
              </button>
            ) : (
              <button
                onClick={startRecording}
                disabled={disabled || hasContent}
                className="p-2 rounded-full hover:bg-gray-100 transition-colors disabled:opacity-40"
                style={{ color: theme.colors.textMuted }}
                title="Enregistrer un message vocal"
              >
                <MicIcon />
              </button>
            )
          )}

          {/* Durée d'enregistrement */}
          {isRecording && (
            <span
              className="text-sm font-medium tabular-nums min-w-[45px]"
              style={{ color: '#EF4444' }}
            >
              {formatDuration(recordingDuration)}
            </span>
          )}

          {/* Bouton envoyer */}
          <button
            onClick={handleSend}
            disabled={disabled || (!hasContent && !isRecording)}
            className={`
              p-2.5 rounded-full transition-all
              disabled:opacity-40 disabled:cursor-not-allowed
              ${hasContent ? 'scale-100' : 'scale-90'}
            `}
            style={{
              background: hasContent ? theme.colors.terracotta : theme.colors.parchment,
              color: hasContent ? 'white' : theme.colors.textMuted,
            }}
            title="Envoyer"
          >
            <SendIcon />
          </button>
        </div>
      </div>
    </div>
  );
}
