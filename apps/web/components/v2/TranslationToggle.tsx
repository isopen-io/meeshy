'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { getFlag } from './flags';

export interface TranslationItem {
  languageCode: string;
  languageName: string;
  content: string;
}

export interface TranslationToggleProps {
  originalContent: string;
  originalLanguage: string;
  originalLanguageName?: string;
  translations?: TranslationItem[];
  userLanguage?: string;
  variant?: 'inline' | 'block';
  className?: string;
}

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

function TranslationToggle({
  originalContent,
  originalLanguage,
  originalLanguageName,
  translations = [],
  userLanguage,
  variant = 'inline',
  className,
}: TranslationToggleProps) {
  const matchingTranslation = userLanguage
    ? translations.find((t) => t.languageCode.toLowerCase().startsWith(userLanguage.toLowerCase()))
    : undefined;

  const [displayedVersion, setDisplayedVersion] = useState<{
    languageCode: string;
    languageName: string;
    content: string;
    isOriginal: boolean;
  }>(() => {
    if (matchingTranslation) {
      return {
        languageCode: matchingTranslation.languageCode,
        languageName: matchingTranslation.languageName,
        content: matchingTranslation.content,
        isOriginal: false,
      };
    }
    return {
      languageCode: originalLanguage,
      languageName: originalLanguageName || originalLanguage.toUpperCase(),
      content: originalContent,
      isOriginal: true,
    };
  });

  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showMenu]);

  const otherVersions = [
    ...(!displayedVersion.isOriginal
      ? [{
          languageCode: originalLanguage,
          languageName: originalLanguageName || originalLanguage.toUpperCase(),
          content: originalContent,
          isOriginal: true,
        }]
      : []),
    ...translations
      .filter((t) => t.languageCode !== displayedVersion.languageCode)
      .map((t) => ({ ...t, isOriginal: false })),
  ];

  const handleSelect = useCallback((version: typeof displayedVersion) => {
    setDisplayedVersion(version);
    setShowMenu(false);
  }, []);

  if (variant === 'block') {
    return (
      <div className={cn('space-y-2', className)}>
        {/* Main displayed content */}
        <p className="text-[var(--gp-text-primary)]">{displayedVersion.content}</p>

        {/* Other translations in parchment zone */}
        {otherVersions.length > 0 && (
          <div className="bg-[var(--gp-parchment)] rounded-xl p-3 transition-colors duration-300">
            <div className="flex items-center gap-1 text-xs mb-2 text-[var(--gp-text-muted)]">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
              </svg>
              Traductions disponibles
            </div>
            {otherVersions.slice(0, 3).map((version, index) => (
              <button
                key={`${version.languageCode}-${index}`}
                onClick={() => handleSelect(version)}
                className="w-full text-left mb-2 last:mb-0 p-2 rounded-lg hover:bg-[var(--gp-hover)] transition-colors duration-300"
              >
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="text-sm">{getFlag(version.languageCode)}</span>
                  <span className="text-xs font-medium text-[var(--gp-text-secondary)]">
                    {version.languageName}
                  </span>
                  {version.isOriginal && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--gp-surface)] text-[var(--gp-text-muted)]">
                      Original
                    </span>
                  )}
                </div>
                <p className="text-sm italic text-[var(--gp-text-secondary)] line-clamp-2">
                  {version.content}
                </p>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // variant === 'inline'
  return (
    <div className={cn('inline-flex flex-col', className)} ref={menuRef}>
      <div className="relative inline-flex">
        <button
          onClick={() => otherVersions.length > 0 && setShowMenu(!showMenu)}
          className={cn(
            'inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full transition-all duration-300',
            otherVersions.length > 0 && 'hover:opacity-80 cursor-pointer',
            'bg-[var(--gp-parchment)] text-[var(--gp-text-secondary)]'
          )}
          disabled={otherVersions.length === 0}
        >
          <span>{getFlag(displayedVersion.languageCode)}</span>
          <span>{displayedVersion.languageName}</span>
          {displayedVersion.isOriginal && (
            <span className="text-[10px] opacity-70">(Original)</span>
          )}
          {otherVersions.length > 0 && (
            <ChevronIcon className="w-3 h-3 ml-0.5" direction={showMenu ? 'up' : 'down'} />
          )}
        </button>

        {showMenu && otherVersions.length > 0 && (
          <div
            className="absolute top-full left-0 mt-1 z-20 rounded-lg overflow-hidden min-w-[180px] max-h-[140px] overflow-y-auto"
            style={{
              background: 'var(--gp-surface)',
              border: '1px solid var(--gp-border)',
              boxShadow: 'var(--gp-shadow-lg)',
            }}
          >
            {otherVersions.slice(0, 3).map((version, index) => (
              <button
                key={`${version.languageCode}-${index}`}
                onClick={() => handleSelect(version)}
                className="w-full px-3 py-2 text-left text-sm hover:bg-[var(--gp-hover)] flex items-center gap-2 transition-colors duration-300"
                style={{ color: 'var(--gp-text-primary)' }}
              >
                <span>{getFlag(version.languageCode)}</span>
                <span className="flex-1">{version.languageName}</span>
                {version.isOriginal && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--gp-parchment)] text-[var(--gp-text-muted)]">
                    Original
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

TranslationToggle.displayName = 'TranslationToggle';

export { TranslationToggle };
