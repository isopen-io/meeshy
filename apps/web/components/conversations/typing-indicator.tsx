'use client';

import { memo } from 'react';
import { User } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';
import { useI18n } from '@/hooks/useI18n';

interface TypingIndicatorProps {
  typingUsers: Array<{
    userId: string;
    username: string;
    conversationId: string;
    timestamp: number;
  }>;
  chatId: string;
  currentUserId?: string;
  users?: User[];
  className?: string;
}

function TypingDots() {
  return (
    <span className="inline-flex items-end gap-[3px] h-3" aria-hidden>
      <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce [animation-delay:0ms]" />
      <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce [animation-delay:150ms]" />
      <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce [animation-delay:300ms]" />
    </span>
  );
}

export const TypingIndicator = memo(function TypingIndicator({
  typingUsers,
  chatId,
  currentUserId,
  users = [],
  className = ""
}: TypingIndicatorProps) {
  const usersTypingInChat = typingUsers.filter(typingUser =>
    typingUser.conversationId === chatId &&
    typingUser.userId !== currentUserId
  );

  if (usersTypingInChat.length === 0) return null;

  const typingUserNames = usersTypingInChat.map(typingUser => {
    const user = users.find(u => u.id === typingUser.userId);
    return user?.username || typingUser.username;
  });

  const label =
    typingUserNames.length === 1
      ? `${typingUserNames[0]} écrit`
      : typingUserNames.length === 2
        ? `${typingUserNames[0]} et ${typingUserNames[1]} écrivent`
        : `${typingUserNames.length} personnes écrivent`;

  return (
    <div
      className={`flex items-center gap-2 text-sm text-muted-foreground ${className}`}
      aria-live="polite"
      aria-label={`${label}...`}
    >
      <TypingDots />
      <span>{label}</span>
    </div>
  );
})

// Composant plus simple pour afficher juste un badge
export function TypingBadge({ 
  typingUsers,
  userId, 
  chatId, 
  className = "" 
}: { 
  typingUsers: Array<{
    userId: string;
    username: string;
    conversationId: string;
    timestamp: number;
  }>;
  userId: string; 
  chatId: string; 
  className?: string; 
}) {
  const { t } = useI18n('typingIndicator');

  const isUserTyping = typingUsers.some(user => user.userId === userId && user.conversationId === chatId);

  if (!isUserTyping) {
    return null;
  }

  return (
    <Badge variant="secondary" className={`gap-1 ${className}`}>
      <Loader2 className="h-3 w-3 animate-spin" />
      {t('typingIndicator.typing')}
    </Badge>
  );
}
