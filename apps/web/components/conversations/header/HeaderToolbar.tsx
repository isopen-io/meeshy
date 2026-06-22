'use client';

import { memo } from 'react';
import { motion } from 'framer-motion';
import { Phone, Video, Link2, Search } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ConversationParticipantsDrawer } from '../conversation-participants-drawer';
import { CreateLinkButton } from '../create-link-button';
import { HeaderActions } from './HeaderActions';
import type { Conversation, SocketIOUser as User } from '@meeshy/shared/types';
import type { Participant } from '@meeshy/shared/types/participant';
import type { UserRoleEnum } from '@meeshy/shared/types';
import { isGlobalAdmin, hasMinimumMemberRole, MemberRole } from '@meeshy/shared/types/role-types';

interface HeaderToolbarProps {
  conversation: Conversation;
  currentUser: User;
  conversationParticipants: Participant[];
  currentUserRole: UserRoleEnum;
  canUseVideoCalls: boolean;
  isPinned: boolean;
  isMuted: boolean;
  isArchived: boolean;
  isLoadingPreferences: boolean;
  onStartCall?: (type?: 'audio' | 'video') => void;
  onOpenGallery?: () => void;
  onOpenSettings: () => void;
  onParticipantRemoved: (userId: string) => void;
  onParticipantAdded: (userId: string) => void;
  onLinkCreated: (link: unknown) => void;
  onTogglePin: () => void;
  onToggleMute: () => void;
  onToggleArchive: () => void;
  onShareConversation: () => void;
  onOpenSearch?: () => void;
  t: (key: string, fallback?: string) => string;
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
  onOpenGallery,
  onOpenSettings,
  onParticipantRemoved,
  onParticipantAdded,
  onLinkCreated,
  onTogglePin,
  onToggleMute,
  onToggleArchive,
  onShareConversation,
  onOpenSearch,
  t
}: HeaderToolbarProps) {
  const userIsGlobalAdmin = isGlobalAdmin(currentUser.role);
  const userIsConversationAdmin = hasMinimumMemberRole(
    (currentUserRole || 'member').toLowerCase(),
    MemberRole.ADMIN,
  );

  const showCreateLink =
    conversation.type !== 'direct' &&
    !(conversation.type === 'global' && !userIsGlobalAdmin);

  const showParticipantsDrawer =
    conversation.type !== 'direct' &&
    !(conversation.type === 'global' && !userIsGlobalAdmin && !userIsConversationAdmin);

  return (
    <div className="flex items-center gap-0.5 sm:gap-1 flex-shrink-0 self-center">
      {conversation.type === 'direct' && onStartCall && canUseVideoCalls && (
        <DropdownMenu>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <motion.button
                    type="button"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className="inline-flex items-center justify-center rounded-full h-10 w-10 p-0 hover:bg-gradient-to-br hover:from-blue-500/10 hover:to-indigo-500/10 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    aria-label={t('conversationHeader.startCall', 'Call')}
                  >
                    <Phone className="h-5 w-5" aria-hidden="true" />
                  </motion.button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>
                <p>{t('conversationHeader.startCall', 'Call')}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => onStartCall('audio')}>
              <Phone className="h-4 w-4 mr-2" aria-hidden="true" />
              {t('conversationHeader.startAudioCall', 'Start audio call')}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onStartCall('video')}>
              <Video className="h-4 w-4 mr-2" aria-hidden="true" />
              {t('conversationHeader.startVideoCall', 'Start video call')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {showParticipantsDrawer && (
        <ConversationParticipantsDrawer
          conversationId={conversation.id}
          participants={conversationParticipants}
          currentUser={currentUser}
          isGroup={(conversation.type as string) !== 'direct'}
          conversationType={conversation.type}
          userConversationRole={currentUserRole}
          memberCount={conversation.memberCount}
          onParticipantRemoved={onParticipantRemoved}
          onParticipantAdded={onParticipantAdded}
          onLinkCreated={onLinkCreated}
          onOpenSettings={onOpenSettings}
        />
      )}

      {showCreateLink && (
        <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
          <CreateLinkButton
            conversationId={conversation.id}
            currentUser={currentUser}
            disableSummaryModal={false}
            onLinkCreated={() => {
              onLinkCreated?.('');
            }}
            variant="ghost"
            size="sm"
            className="rounded-full h-10 w-10 p-0 hover:bg-gradient-to-br hover:from-blue-500/10 hover:to-indigo-500/10 transition-colors duration-200"
          >
            <Link2 className="h-5 w-5" />
          </CreateLinkButton>
        </motion.div>
      )}

      {onOpenSearch && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <motion.button
                type="button"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={onOpenSearch}
                className="inline-flex items-center justify-center rounded-full h-10 w-10 p-0 hover:bg-gradient-to-br hover:from-blue-500/10 hover:to-indigo-500/10 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                aria-label={t('conversationHeader.searchMessages', 'Search in conversation')}
              >
                <Search className="h-5 w-5" aria-hidden="true" />
              </motion.button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{t('conversationHeader.searchMessages', 'Search in conversation')}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}

      <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
      <HeaderActions
        isPinned={isPinned}
        isMuted={isMuted}
        isArchived={isArchived}
        isLoadingPreferences={isLoadingPreferences}
        onOpenGallery={onOpenGallery}
        onOpenSettings={onOpenSettings}
        onTogglePin={onTogglePin}
        onToggleMute={onToggleMute}
        onToggleArchive={onToggleArchive}
        onShareConversation={onShareConversation}
        t={t}
      />
      </motion.div>
    </div>
  );
});
