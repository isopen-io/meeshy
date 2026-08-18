'use client';

import { memo } from 'react';
import Link from 'next/link';
import { Ghost } from 'lucide-react';
import { getUserDisplayName } from '@/utils/user-display-name';
import { isAnonymousSender } from '@meeshy/shared/utils/sender-identity';
import { formatRelativeDate } from '@/utils/date-format';
import { useCurrentInterfaceLanguage } from '@/stores/language-store';
import { cn } from '@/lib/utils';
import type { MessageSender } from './types';

interface MessageNameDateProps {
  message: {
    createdAt: Date | string;
    sender?: MessageSender;
  };
  isOwnMessage: boolean;
  t: (key: string) => string;
}

export const MessageNameDate = memo(function MessageNameDate({
  message,
  isOwnMessage,
  t,
}: MessageNameDateProps) {
  const locale = useCurrentInterfaceLanguage();
  const user = message.sender;
  const username = message.sender?.username;
  const displayName = getUserDisplayName(user, t('anonymous'));
  // Était `const isAnonymous = false` — un littéral, donc une branche `<Ghost />`
  // écrite et jamais rendue. Ce n'était pas un oubli de câblage : le
  // discriminant n'arrivait pas jusqu'ici, `Participant.type` étant retiré à la
  // sérialisation REST faute d'être déclaré dans `userMinimalSchema`.
  // `isAnonymousSender` est la seule lecture autorisée — elle arbitre entre
  // `type` (qui fait foi) et les drapeaux hérités des routes de lien.
  const isAnonymous = isAnonymousSender(user as Record<string, unknown> | null | undefined);

  return (
    <div className={cn(
      "flex items-center gap-1 mb-0.5 px-1",
      isOwnMessage && "flex-row-reverse"
    )}>
      {isAnonymous ? (
        <span className="text-xs sm:text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-1">
          <Ghost className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400" />
          {displayName}
        </span>
      ) : username ? (
        <Link
          href={`/u/${username}`}
          className="text-xs sm:text-sm font-semibold text-gray-700 dark:text-gray-300 hover:text-indigo-500 dark:hover:text-indigo-400 transition-colors cursor-pointer"
          onClick={(e) => e.stopPropagation()}
        >
          {displayName}
        </Link>
      ) : (
        <span className="text-xs sm:text-sm font-semibold text-gray-700 dark:text-gray-300">
          {displayName}
        </span>
      )}
      <span className="text-gray-400 dark:text-gray-500">•</span>
      <time className="text-xs text-gray-500 dark:text-gray-400">
        {formatRelativeDate(message.createdAt, { t, locale })}
      </time>
    </div>
  );
});
