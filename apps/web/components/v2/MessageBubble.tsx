'use client';

import { HTMLAttributes, useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { getLanguageColor, theme } from './theme';
import { GhostIcon } from './GhostBadge';

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
  /** Sender avatar URL */
  senderAvatar?: string;
  /** Whether the sender is anonymous (shows ghost icon) */
  isAnonymous?: boolean;
  /** Callback when a translation is selected */
  onTranslationSelect?: (languageCode: string) => void;
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
  ko: '\u{1F1F0}\u{1F1F7}',
  it: '\u{1F1EE}\u{1F1F9}',
  ru: '\u{1F1F7}\u{1F1FA}',
  hi: '\u{1F1EE}\u{1F1F3}',
  nl: '\u{1F1F3}\u{1F1F1}',
  pl: '\u{1F1F5}\u{1F1F1}',
  tr: '\u{1F1F9}\u{1F1F7}',
  vi: '\u{1F1FB}\u{1F1F3}',
  th: '\u{1F1F9}\u{1F1ED}',
  id: '\u{1F1EE}\u{1F1E9}',
  sv: '\u{1F1F8}\u{1F1EA}',
  uk: '\u{1F1FA}\u{1F1E6}',
};

function getFlag(code: string | undefined | null): string {
  if (!code) return '\u{1F310}'; // Return globe emoji if no code
  const normalized = code.toLowerCase().slice(0, 2);
  return FLAG_MAP[normalized] || '\u{1F310}';
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
  senderAvatar,
  isAnonymous = false,
  onTranslationSelect,
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
      {!isSent && sender && (
        <div className="flex-shrink-0 relative">
          {senderAvatar ? (
            <img
              src={senderAvatar}
              alt={sender}
              width={32}
              height={32}
              loading="eager"
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
      )}

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
            <span className="text-xs font-semibold text-[var(--gp-text-primary)] transition-colors duration-300">
              {sender}
            </span>
          )}

          {/* Language selector */}
          <div className="relative">
            <button
              onClick={() => otherVersions.length > 0 && setShowLanguageMenu(!showLanguageMenu)}
              className={cn(
                'inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full transition-all duration-300',
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
                <span className="text-[10px] opacity-70">(Original)</span>
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
                        Original
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Message content */}
        <p className="text-[0.95rem] leading-relaxed">{displayedVersion.content}</p>

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
