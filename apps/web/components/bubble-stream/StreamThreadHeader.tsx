'use client';

import { memo } from 'react';
import { Loader2, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LensSwitcher } from '@/components/conversations/reading/LensSwitcher';
import { useI18n } from '@/hooks/useI18n';
import { cn } from '@/lib/utils';
import type { ReadingMode } from '@/lib/conversations/reading-mode';

/**
 * L'en-tête d'identité de la conversation partagée (`/chat/:linkId`).
 *
 * C'est l'ancre visuelle de la vue anonyme, visible à TOUS les breakpoints —
 * là où le `StreamHeader` du feed n'était qu'une pilule d'état masquée sous
 * `md`. Trois responsabilités, une ligne :
 *
 *   - l'identité : pastille à l'accent de la conversation (`--conv-accent`,
 *     règle produit CLAUDE.md § Conversation Accent Color) + titre ;
 *   - l'état vivant : participants, connexion (point vert/orange), frappe —
 *     la frappe REMPLACE le sous-titre, elle ne s'empile pas ;
 *   - la Lentille : Focal / Script / Bulles + densité `Aa`, les mêmes modes
 *     que la vue applicative (`ConversationView`), servis aux anonymes.
 */
interface TypingUser {
  id: string;
  displayName: string;
}

interface StreamThreadHeaderProps {
  title: string;
  participantCount: number;
  isConnected: boolean;
  typingUsers: TypingUser[];
  readingMode: ReadingMode;
  onReadingModeChange: (mode: ReadingMode) => void;
  onToggleDensity: () => void;
  onReconnect: () => void;
}

export const StreamThreadHeader = memo(function StreamThreadHeader({
  title,
  participantCount,
  isConnected,
  typingUsers,
  readingMode,
  onReadingModeChange,
  onToggleDensity,
  onReconnect,
}: StreamThreadHeaderProps) {
  const { t } = useI18n('chat');
  const isTyping = typingUsers.length > 0;

  return (
    <header
      role="banner"
      className={cn(
        'row-start-1 flex-shrink-0 border-b-2 border-gray-200 dark:border-gray-700',
        'bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800',
        'shadow-md'
      )}
    >
      <div className="flex w-full items-center gap-3 px-3 py-2.5 sm:px-4">
        <span
          data-testid="thread-header-avatar"
          aria-hidden="true"
          className="flex h-10 w-10 flex-none items-center justify-center rounded-full text-sm font-bold text-white shadow-sm"
          style={{
            background:
              'linear-gradient(135deg, var(--conv-accent, hsl(var(--primary))), var(--conv-accent-secondary, hsl(var(--primary))))',
          }}
        >
          {(title || '?').slice(0, 1).toUpperCase()}
        </span>

        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-semibold text-gray-900 dark:text-gray-100">
            {title}
          </h1>
          <p
            data-testid="thread-header-subtitle"
            className="flex items-center gap-1.5 truncate text-xs text-gray-500 dark:text-gray-400"
            aria-live="polite"
          >
            {isTyping ? (
              <>
                <Loader2 className="h-3 w-3 flex-none animate-spin" aria-hidden="true" />
                <span className="truncate" style={{ color: 'var(--conv-accent, inherit)' }}>
                  {typingUsers.length === 1
                    ? t('thread.typingOne', { name: typingUsers[0].displayName })
                    : t('thread.typingMany', { count: typingUsers.length })}
                </span>
              </>
            ) : (
              <>
                <Users className="h-3 w-3 flex-none" aria-hidden="true" />
                <span className="truncate">
                  {t('thread.participants', { count: participantCount })}
                </span>
                <span aria-hidden="true">·</span>
                <span
                  className={cn(
                    'h-1.5 w-1.5 flex-none rounded-full',
                    isConnected
                      ? 'animate-pulse bg-emerald-500'
                      : 'bg-orange-500'
                  )}
                  aria-hidden="true"
                />
                <span className="flex-none">
                  {isConnected
                    ? t('thread.live', 'En direct')
                    : t('thread.connecting', 'Connexion…')}
                </span>
                {!isConnected && (
                  <Button
                    data-testid="thread-header-reconnect"
                    size="sm"
                    variant="ghost"
                    onClick={onReconnect}
                    className="h-auto flex-none px-1.5 py-0.5 text-xs"
                  >
                    {t('thread.reconnect', 'Reconnecter')}
                  </Button>
                )}
              </>
            )}
          </p>
        </div>

        <LensSwitcher
          mode={readingMode}
          onModeChange={onReadingModeChange}
          onToggleDensity={onToggleDensity}
          className="flex-none"
        />
      </div>
    </header>
  );
});

StreamThreadHeader.displayName = 'StreamThreadHeader';
