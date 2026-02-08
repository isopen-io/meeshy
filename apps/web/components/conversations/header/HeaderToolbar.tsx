'use client';

import { memo } from 'react';
import { motion } from 'framer-motion';
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

  const showParticipantsDrawer =
    conversation.type !== 'direct' &&
    !(conversation.type === 'global' &&
      currentUser.role !== 'BIGBOSS' &&
      currentUser.role !== 'ADMIN' &&
      currentUserRole !== 'ADMIN' &&
      currentUserRole !== 'CREATOR');

  return (
    <div className="flex items-center gap-0.5 sm:gap-1 flex-shrink-0 self-center">
      {conversation.type === 'direct' && onStartCall && canUseVideoCalls && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={onStartCall}
                  className="rounded-full h-10 w-10 p-0 hover:bg-gradient-to-br hover:from-blue-500/10 hover:to-indigo-500/10 transition-all duration-200"
                  aria-label={t('conversationHeader.startVideoCall') || 'Démarrer un appel vidéo'}
                >
                  <Video className="h-5 w-5" aria-hidden="true" />
                </Button>
              </motion.div>
            </TooltipTrigger>
            <TooltipContent>
              <p>{t('conversationHeader.startVideoCall') || 'Démarrer un appel vidéo'}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}

      {showParticipantsDrawer && (
        <ConversationParticipantsDrawer
          conversationId={conversation.id}
          participants={conversationParticipants}
          currentUser={currentUser}
          isGroup={conversation.type !== 'direct'}
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
            className="rounded-full h-10 w-10 p-0 hover:bg-gradient-to-br hover:from-blue-500/10 hover:to-indigo-500/10 transition-all duration-200"
          >
            <Link2 className="h-5 w-5" />
          </CreateLinkButton>
        </motion.div>
      )}

      <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
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
      </motion.div>
    </div>
  );
});
