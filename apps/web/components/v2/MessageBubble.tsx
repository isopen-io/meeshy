'use client';

import { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';
import { getLanguageColor, theme } from './theme';
import { GhostIcon } from './GhostBadge';

export interface MessageBubbleProps extends HTMLAttributes<HTMLDivElement> {
  /** Whether this message was sent by the current user */
  isSent?: boolean;
  /** Original language code */
  languageCode: string;
  /** Language name to display */
  languageName?: string;
  /** Original message content */
  content: string;
  /** Translated content (if available) */
  translation?: string;
  /** Translation target language */
  translationLanguage?: string;
  /** Timestamp */
  timestamp?: string;
  /** Sender name */
  sender?: string;
  /** Sender avatar URL */
  senderAvatar?: string;
  /** Whether the sender is anonymous (shows ghost icon) */
  isAnonymous?: boolean;
}

const FLAG_MAP: Record<string, string> = {
  fr: '\u{1F1EB}\u{1F1F7}',
  en: '\u{1F1EC}\u{1F1E7}',
  es: '\u{1F1EA}\u{1F1F8}',
  zh: '\u{1F1E8}\u{1F1F3}',
  ja: '\u{1F1EF}\u{1F1F5}',
  ar: '\u{1F1F8}\u{1F1E6}',
  de: '\u{1F1E9}\u{1F1EA}',
  pt: '\u{1F1E7}\u{1F1F7}',
};

export function MessageBubble({
  isSent = false,
  languageCode,
  languageName,
  content,
  translation,
  translationLanguage,
  timestamp,
  sender,
  senderAvatar,
  isAnonymous = false,
  className,
  ...props
}: MessageBubbleProps) {
  const normalizedCode = languageCode.toLowerCase().slice(0, 2);
  const flag = FLAG_MAP[normalizedCode] || '\u{1F310}';
  const langColor = getLanguageColor(languageCode);

  return (
    <div
      className={cn(
        'flex gap-2',
        isSent ? 'flex-row-reverse' : 'flex-row',
        className
      )}
      {...props}
    >
      {/* Avatar (for received messages in group) */}
      {!isSent && sender && (
        <div className="flex-shrink-0 relative">
          {senderAvatar ? (
            <img
              src={senderAvatar}
              alt={sender}
              className="w-8 h-8 rounded-full object-cover"
            />
          ) : (
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium text-white"
              style={{ background: langColor }}
            >
              {sender.charAt(0).toUpperCase()}
            </div>
          )}
          {/* Ghost badge for anonymous users */}
          {isAnonymous && (
            <div
              className="absolute -top-1 -left-1 w-4 h-4 rounded-full flex items-center justify-center"
              style={{ background: theme.colors.parchment, border: `1.5px solid ${theme.colors.textMuted}` }}
            >
              <GhostIcon className="w-2.5 h-2.5" />
            </div>
          )}
        </div>
      )}

      {/* Message bubble */}
      <div
        className={cn(
          'max-w-[75%] rounded-2xl p-4 relative',
          isSent
            ? 'bg-[#E76F51] text-white rounded-br-md'
            : 'bg-white border border-[#E5E5E5] rounded-bl-md'
        )}
      >
        {/* Language indicator */}
        <div
          className={cn(
            'inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full mb-2',
            isSent
              ? 'bg-white/20 text-white'
              : 'text-[#264653]'
          )}
          style={{
            backgroundColor: isSent ? undefined : `${langColor}15`,
            color: isSent ? undefined : langColor,
          }}
        >
          <span>{flag}</span>
          <span>{languageName || languageCode.toUpperCase()}</span>
        </div>

        {/* Sender name with ghost indicator */}
        {sender && !isSent && (
          <div className="flex items-center gap-1.5 mb-1">
            <span className="text-xs font-semibold text-[#2B2D42]">
              {sender}
            </span>
            {isAnonymous && (
              <span
                className="text-[10px] px-1.5 py-0.5 rounded-full flex items-center gap-1"
                style={{
                  background: theme.colors.parchment,
                  color: theme.colors.textMuted,
                }}
              >
                <GhostIcon className="w-3 h-3" />
                <span>Anonyme</span>
              </span>
            )}
          </div>
        )}

        {/* Message content */}
        <p className="text-[0.95rem] leading-relaxed">{content}</p>

        {/* Translation */}
        {translation && (
          <div
            className={cn(
              'mt-3 pt-3 text-sm',
              isSent
                ? 'border-t border-white/20 text-white/80'
                : 'border-t border-dashed border-[#E5E5E5] text-[#6B7280]'
            )}
          >
            <div className="flex items-center gap-1 text-xs mb-1 opacity-70">
              <svg
                className="w-3 h-3"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              <span>Traduit en {translationLanguage || 'votre langue'}</span>
            </div>
            <p className="italic">{translation}</p>
          </div>
        )}

        {/* Timestamp */}
        {timestamp && (
          <div
            className={cn(
              'text-xs mt-2',
              isSent ? 'text-white/60' : 'text-[#9CA3AF]'
            )}
          >
            {timestamp}
          </div>
        )}
      </div>
    </div>
  );
}
