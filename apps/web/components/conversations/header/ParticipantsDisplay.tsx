'use client';

import { memo } from 'react';
import { Ghost } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { OnlineIndicator } from '@/components/ui/online-indicator';
import { ConversationParticipants } from '../conversation-participants';
import { TypingIndicator } from './TypingIndicator';
import type { Conversation, SocketIOUser as User, ThreadMember } from '@meeshy/shared/types';
import type { ParticipantInfo } from './types';

interface ParticipantsDisplayProps {
  conversation: Conversation;
  currentUser: User;
  conversationParticipants: ThreadMember[];
  typingUsers: Array<{ userId: string; username: string; conversationId: string; timestamp: number }>;
  participantInfo: ParticipantInfo;
  customName?: string;
  tags: string[];
  categoryName?: string;
  t: (key: string) => string;
}

export const ParticipantsDisplay = memo(function ParticipantsDisplay({
  conversation,
  currentUser,
  conversationParticipants,
  typingUsers,
  participantInfo,
  customName,
  tags,
  categoryName,
  t
}: ParticipantsDisplayProps) {
  if (conversation.type === 'direct') {
    const otherTypingUsers = typingUsers.filter(u => u.userId !== currentUser.id);
    const isTyping = otherTypingUsers.length > 0;
    const typingUser = otherTypingUsers[0];
    const typingUserName = typingUser?.username || participantInfo.name;

    return (
      <div className="text-sm text-muted-foreground">
        {isTyping && (
          <TypingIndicator typingUserName={typingUserName} t={t} />
        )}
      </div>
    );
  }

  return (
    <div className="text-sm text-muted-foreground">
      <ConversationParticipants
        conversationId={conversation.id}
        participants={conversationParticipants}
        currentUser={currentUser}
        isGroup={conversation.type !== 'direct'}
        conversationType={conversation.type}
        typingUsers={typingUsers.map(u => ({ userId: u.userId, conversationId: u.conversationId }))}
        conversationTitle={customName}
        conversationTags={tags}
        conversationCategory={categoryName}
        className="truncate"
      />
    </div>
  );
});
