'use client';

import { HTMLAttributes, useState, useCallback } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { getLanguageColor } from './theme';
import { GhostIcon } from './GhostBadge';
import { getFlag } from './flags';

export interface Translation {
  languageCode: string;
  languageName: string;
  content: string;
}

export interface MessageBubbleProps extends HTMLAttributes<HTMLDivElement> {
  /** Whether this message was sent by the current user */
  isSent?: boolean;
  /** Original language code */
  languageCode: string;
  /** Language name to display */
  languageName?: string;
  /** Original message content */
  content: string;
  /** Liste des traductions disponibles */
  translations?: Translation[];
  /** Timestamp */
  timestamp?: string;
  /** Sender name */
  sender?: string;
  /** Sender username for profile link */
  senderUsername?: string;
  /** Sender avatar URL */
  senderAvatar?: string;
  /** Whether the sender is anonymous (shows ghost icon) */
  isAnonymous?: boolean;
  /** Callback when a translation is selected */
  onTranslationSelect?: (languageCode: string) => void;
  /** Translated label for "Original" tag (for i18n callers) */
  originalLabel?: string;
  /** Translated label for copy button tooltip */
  copyLabel?: string;
}

// Icône chevron
function ChevronIcon({ className = 'w-3 h-3', direction = 'down' }: { className?: string; direction?: 'down' | 'up' }) {
  return (
    <svg
      className={cn(className, direction === 'up' && 'rotate-180')}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );
}

export function MessageBubble({
  isSent = false,
  languageCode,
  languageName,
  content,
  translations = [],
  timestamp,
  sender,
  senderUsername,
  senderAvatar,
  isAnonymous = false,
  onTranslationSelect,
  originalLabel = 'Original',
  copyLabel = 'Copy message',
  className,
  ...props
}: MessageBubbleProps) {
  // État pour gérer quelle version est affichée en premier plan
  const [displayedVersion, setDisplayedVersion] = useState<{
    languageCode: string;
    languageName: string;
    content: string;
    isOriginal: boolean;
  }>({
    languageCode,
    languageName: languageName || languageCode.toUpperCase(),
    content,
    isOriginal: true,
  });

  // État pour le menu déroulant des langues
  const [showLanguageMenu, setShowLanguageMenu] = useState(false);

  const langColor = getLanguageColor(displayedVersion.languageCode);

  // Construire la liste des autres versions disponibles
  const otherVersions = [
    // Message original (si on n'affiche pas déjà l'original)
    ...(!displayedVersion.isOriginal ? [{
      languageCode,
      languageName: languageName || languageCode.toUpperCase(),
      content,
      isOriginal: true,
    }] : []),
    // Traductions (sauf celle actuellement affichée)
    ...translations
      .filter(t => t.languageCode !== displayedVersion.languageCode)
      .map(t => ({
        ...t,
        isOriginal: false,
      })),
  ];

  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(displayedVersion.content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [displayedVersion.content]);

  // Sélectionner une version
  const handleSelectVersion = useCallback((version: typeof displayedVersion) => {
    setDisplayedVersion(version);
    setShowLanguageMenu(false);
    onTranslationSelect?.(version.languageCode);
  }, [onTranslationSelect]);

  return (
    <div
      className={cn(
        'flex gap-2',
        isSent ? 'flex-row-reverse' : 'flex-row',
        className
      )}
      {...props}
    >
      {/* Avatar (for received messages) */}
      {!isSent && sender && (() => {
        const avatarContent = (
          <div className="flex-shrink-0 relative">
            {senderAvatar ? (
              <Image
                src={senderAvatar}
                alt={sender}
                width={32}
                height={32}
                className="w-8 h-8 rounded-full object-cover"
              />
            ) : (
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium text-white transition-colors duration-300"
                style={{ background: langColor }}
              >
                {sender.charAt(0).toUpperCase()}
              </div>
            )}
            {/* Ghost badge for anonymous users */}
            {isAnonymous && (
              <div
                className="absolute -top-1 -left-1 w-4 h-4 rounded-full flex items-center justify-center transition-colors duration-300"
                style={{ background: 'var(--gp-parchment)', border: '1.5px solid var(--gp-text-muted)' }}
              >
                <GhostIcon className="w-2.5 h-2.5" />
              </div>
            )}
          </div>
        );
        return senderUsername ? (
          <Link href={`/u/${senderUsername}`} onClick={(e) => e.stopPropagation()}>
            {avatarContent}
          </Link>
        ) : avatarContent;
      })()}

      {/* Message bubble */}
      <div
        className={cn(
          'max-w-[75%] rounded-2xl p-4 relative transition-colors duration-300',
          isSent
            ? 'bg-[var(--gp-terracotta)] text-white rounded-br-md'
            : 'bg-[var(--gp-surface)] border border-[var(--gp-border)] rounded-bl-md'
        )}
      >
        {/* Sender name + Language selector on same line */}
        <div className={cn('flex items-center justify-between gap-2 mb-2', isSent && 'flex-row-reverse')}>
          {/* Sender name (received messages only) */}
          {sender && !isSent && (
            senderUsername ? (
              <Link
                href={`/u/${senderUsername}`}
                className="text-xs font-semibold text-[var(--gp-text-primary)] hover:text-blue-600 dark:hover:text-blue-400 transition-colors duration-300 cursor-pointer"
                onClick={(e) => e.stopPropagation()}
              >
                {sender}
              </Link>
            ) : (
              <span className="text-xs font-semibold text-[var(--gp-text-primary)] transition-colors duration-300">
                {sender}
              </span>
            )
          )}

          {/* Language selector */}
          <div className="relative">
            <button
              onClick={() => otherVersions.length > 0 && setShowLanguageMenu(!showLanguageMenu)}
              aria-label={`${displayedVersion.languageName}${displayedVersion.isOriginal ? ` (${originalLabel})` : ''} — ${otherVersions.length > 0 ? 'select language' : 'no other versions'}`}
              aria-expanded={showLanguageMenu}
              aria-haspopup={otherVersions.length > 0 ? 'listbox' : undefined}
              className={cn(
                'inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full transition-opacity duration-300',
                otherVersions.length > 0 && 'hover:opacity-80 cursor-pointer',
                isSent
                  ? 'bg-white/20 text-white'
                  : 'text-[var(--gp-deep-teal)]'
              )}
              style={{
                backgroundColor: isSent ? undefined : `${langColor}15`,
                color: isSent ? undefined : langColor,
              }}
              disabled={otherVersions.length === 0}
            >
              <span>{getFlag(displayedVersion.languageCode)}</span>
              <span>{displayedVersion.languageName}</span>
              {displayedVersion.isOriginal && (
                <span className="text-[10px] opacity-70">({originalLabel})</span>
              )}
              {otherVersions.length > 0 && (
                <ChevronIcon className="w-3 h-3 ml-0.5" direction={showLanguageMenu ? 'up' : 'down'} />
              )}
            </button>

            {/* Language menu dropdown */}
            {showLanguageMenu && otherVersions.length > 0 && (
              <div
                className={cn(
                  'absolute top-full mt-1 z-20 rounded-lg overflow-hidden transition-colors duration-300',
                  'min-w-[180px] max-h-[140px] overflow-y-auto',
                  isSent ? 'right-0' : 'left-0'
                )}
                style={{
                  background: isSent ? 'rgba(255,255,255,0.95)' : 'var(--gp-surface)',
                  border: '1px solid var(--gp-parchment)',
                  boxShadow: 'var(--gp-shadow-lg)',
                }}
              >
                {otherVersions.slice(0, 3).map((version, index) => (
                  <button
                    key={`${version.languageCode}-${index}`}
                    onClick={() => handleSelectVersion(version)}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-[var(--gp-hover)] flex items-center gap-2 transition-colors duration-300"
                    style={{ color: 'var(--gp-text-primary)' }}
                  >
                    <span>{getFlag(version.languageCode)}</span>
                    <span className="flex-1">{version.languageName}</span>
                    {version.isOriginal && (
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded-full transition-colors duration-300"
                        style={{ background: 'var(--gp-parchment)', color: 'var(--gp-text-muted)' }}
                      >
                        {originalLabel}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Message content */}
        <div className="relative group">
          <p className="text-[0.95rem] leading-relaxed pr-6">{displayedVersion.content}</p>
          <button
            onClick={handleCopy}
            aria-label={copyLabel}
            className={cn(
              'absolute top-0 right-0 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity duration-200 p-1 rounded',
              isSent ? 'hover:bg-white/10' : 'hover:bg-[var(--gp-hover)]'
            )}
          >
            {copied ? (
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            )}
          </button>
        </div>

        {/* Translations list (scrollable, max 3 visible) */}
        {otherVersions.length > 0 && (
          <div
            className={cn(
              'mt-3 pt-3 max-h-[120px] overflow-y-auto transition-colors duration-300',
              isSent
                ? 'border-t border-white/20'
                : 'border-t border-dashed border-[var(--gp-border)]'
            )}
            style={{
              scrollbarWidth: 'thin',
            }}
          >
            {otherVersions.slice(0, 3).map((version, index) => (
              <button
                key={`translation-${version.languageCode}-${index}`}
                onClick={() => handleSelectVersion(version)}
                className={cn(
                  'w-full text-left mb-2 last:mb-0 p-2 rounded-lg transition-colors duration-300',
                  isSent
                    ? 'hover:bg-white/10'
                    : 'hover:bg-[var(--gp-hover)]'
                )}
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-sm">{getFlag(version.languageCode)}</span>
                  {version.isOriginal && (
                    <span
                      className={cn(
                        'text-[10px] px-1.5 py-0.5 rounded-full transition-colors duration-300',
                        isSent ? 'bg-white/20' : ''
                      )}
                      style={!isSent ? { background: 'var(--gp-parchment)', color: 'var(--gp-text-muted)' } : {}}
                    >
                      Original
                    </span>
                  )}
                </div>
                <p
                  className={cn(
                    'text-sm italic line-clamp-2 transition-colors duration-300',
                    isSent ? 'text-white/80' : 'text-[var(--gp-text-secondary)]'
                  )}
                >
                  {version.content}
                </p>
              </button>
            ))}
          </div>
        )}

        {/* Timestamp */}
        {timestamp && (
          <div
            className={cn(
              'text-xs mt-2 transition-colors duration-300',
              isSent ? 'text-white/60' : 'text-[var(--gp-text-muted)]'
            )}
          >
            {timestamp}
          </div>
        )}
      </div>

      {/* Click outside to close menu */}
      {showLanguageMenu && (
        <div
          className="fixed inset-0 z-10"
          onClick={() => setShowLanguageMenu(false)}
        />
      )}
    </div>
  );
}
