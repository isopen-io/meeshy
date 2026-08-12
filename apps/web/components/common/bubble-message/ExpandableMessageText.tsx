'use client';

import { memo, useState } from 'react';
import { useI18n } from '@/hooks/useI18n';
import { cn } from '@/lib/utils';
import { MarkdownMessage } from '@/components/messages/MarkdownMessage';

/** Seuil « message long » — identique à iOS (`BubbleExpandableText.truncateLimit`). */
export const MESSAGE_TRUNCATE_LIMIT = 512;

/** `true` ssi `text` dépasse `limit` caractères. Miroir de `BubbleExpandableText.exceeds`. */
export function exceedsLimit(text: string, limit: number = MESSAGE_TRUNCATE_LIMIT): boolean {
  return text.length > limit;
}

/**
 * Tronque au dernier espace avant `limit` (sinon coupe net).
 * Miroir de `BubbleExpandableText.truncateAtWord` côté iOS.
 */
export function truncateAtWord(text: string, limit: number = MESSAGE_TRUNCATE_LIMIT): string {
  if (!exceedsLimit(text, limit)) return text;
  const prefix = text.slice(0, limit);
  const lastSpace = prefix.lastIndexOf(' ');
  return lastSpace >= 0 ? prefix.slice(0, lastSpace) : prefix;
}

interface ExpandableMessageTextProps {
  content: string;
  className?: string;
  isOwnMessage?: boolean;
}

/**
 * Texte de message avec dépliage « Voir plus » à sens unique.
 *
 * Au-delà de {@link MESSAGE_TRUNCATE_LIMIT} caractères, le contenu est tronqué
 * au mot et un bouton « Voir plus » (i18n `common.showMore`) apparaît en bas à
 * droite. Le clic déplie définitivement — pas de repli (« déplier une fois »).
 *
 * L'état `isExpanded` est un `useState` LOCAL : chaque message rendu possède sa
 * propre instance, donc déplier une bulle n'affecte jamais les autres.
 */
export const ExpandableMessageText = memo(function ExpandableMessageText({
  content,
  className,
  isOwnMessage = false,
}: ExpandableMessageTextProps) {
  const { t } = useI18n('common');
  const [isExpanded, setIsExpanded] = useState(false);

  const needsTruncation = !isExpanded && exceedsLimit(content);
  const displayed = needsTruncation ? `${truncateAtWord(content)}...` : content;

  return (
    <>
      <MarkdownMessage
        content={displayed}
        className={className}
        enableTracking
        isOwnMessage={isOwnMessage}
        onLinkClick={() => {}}
      />
      {needsTruncation && (
        <div className="flex justify-end mt-0.5">
          <button
            type="button"
            onClick={() => setIsExpanded(true)}
            className={cn(
              'text-xs font-semibold transition-colors',
              isOwnMessage
                ? 'text-white/70 hover:text-white'
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
            )}
          >
            {t('showMore')}
          </button>
        </div>
      )}
    </>
  );
});
