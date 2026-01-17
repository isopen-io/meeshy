'use client';

import { memo } from 'react';
import { Loader2 } from 'lucide-react';

interface TypingIndicatorProps {
  typingUserName: string;
  t: (key: string) => string;
}

export const TypingIndicator = memo(function TypingIndicator({
  typingUserName,
  t
}: TypingIndicatorProps) {
  return (
    <div className="flex items-center gap-1.5">
      <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
      <span className="text-sm font-medium">
        {typingUserName} {t('conversationParticipants.typing') || 'est en train d\'écrire...'}
      </span>
    </div>
  );
});
