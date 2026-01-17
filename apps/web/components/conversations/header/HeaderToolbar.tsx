'use client';

import { memo } from 'react';
import { Video, Link2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { ConversationParticipantsDrawer } from '../conversation-participants-drawer';
import { CreateLinkButton } from '../create-link-button';
import { HeaderActions } from './HeaderActions';
import type { Conversation, SocketIOUser as User, ThreadMember } from '@meeshy/shared/types';
import type { UserRoleEnum } from '@meeshy/shared/types';

interface HeaderToolbarProps {
  conversation: Conversation;
  currentUser: User;
  conversationParticipants: ThreadMember[];
  currentUserRole: UserRoleEnum;
  canUseVideoCalls: boolean;
  isPinned: boolean;
  isMuted: boolean;
  isArchived: boolean;
  isLoadingPreferences: boolean;
  onStartCall?: () => void;
  onOpenDetails: () => void;
  onOpenGallery?: () => void;
  onOpenSettings: () => void;
  onParticipantRemoved: (userId: string) => void;
  onParticipantAdded: (userId: string) => void;
  onLinkCreated: (link: any) => void;
  onTogglePin: () => void;
  onToggleMute: () => void;
  onToggleArchive: () => void;
  onShareConversation: () => void;
  t: (key: string) => string;
}

export const HeaderToolbar = memo(function HeaderToolbar({
  conversation,
  currentUser,
  conversationParticipants,
  currentUserRole,
  canUseVideoCalls,
  isPinned,
  isMuted,
  isArchived,
  isLoadingPreferences,
  onStartCall,
  onOpenDetails,
  onOpenGallery,
  onOpenSettings,
  onParticipantRemoved,
  onParticipantAdded,
  onLinkCreated,
  onTogglePin,
  onToggleMute,
  onToggleArchive,
  onShareConversation,
  t
}: HeaderToolbarProps) {
  const showCreateLink =
    conversation.type !== 'direct' &&
    !(conversation.type === 'global' && currentUser.role !== 'BIGBOSS' && currentUser.role !== 'ADMIN');

  return (
    <div className="flex items-center gap-0.5 sm:gap-1 flex-shrink-0 self-center">
      {conversation.type === 'direct' && onStartCall && canUseVideoCalls && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                onClick={onStartCall}
                className="h-8 w-8 sm:h-9 sm:w-9 hover:bg-blue-500 hover:text-white transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                aria-label={t('conversationHeader.startVideoCall') || 'Démarrer un appel vidéo'}
              >
                <Video className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{t('conversationHeader.startVideoCall') || 'Démarrer un appel vidéo'}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}

      {conversation.type !== 'direct' && (
        <ConversationParticipantsDrawer
          conversationId={conversation.id}
          participants={conversationParticipants}
          currentUser={currentUser}
          isGroup={conversation.type !== 'direct'}
          conversationType={conversation.type}
          userConversationRole={currentUserRole}
          onParticipantRemoved={onParticipantRemoved}
          onParticipantAdded={onParticipantAdded}
          onLinkCreated={onLinkCreated}
        />
      )}

      {showCreateLink && (
        <CreateLinkButton
          conversationId={conversation.id}
          currentUser={currentUser}
          disableSummaryModal={false}
          onLinkCreated={() => {
            onLinkCreated?.('');
          }}
          variant="ghost"
          size="sm"
          className="h-10 w-10 p-0 rounded-full hover:bg-accent/50"
        >
          <Link2 className="h-5 w-5" />
        </CreateLinkButton>
      )}

      <HeaderActions
        isPinned={isPinned}
        isMuted={isMuted}
        isArchived={isArchived}
        isLoadingPreferences={isLoadingPreferences}
        onOpenDetails={onOpenDetails}
        onOpenGallery={onOpenGallery}
        onOpenSettings={onOpenSettings}
        onTogglePin={onTogglePin}
        onToggleMute={onToggleMute}
        onToggleArchive={onToggleArchive}
        onShareConversation={onShareConversation}
        t={t}
      />
    </div>
  );
});
