'use client';

import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { OngoingCallBanner } from '@/components/video-calls/OngoingCallBanner';
import { ConversationImageUploadDialog } from './conversation-image-upload-dialog';
import { ConversationSettingsModal } from './ConversationSettingsModal';
import { HeaderTagsBar } from './header/HeaderTagsBar';
import { HeaderAvatar } from './header/HeaderAvatar';
import { ParticipantsDisplay } from './header/ParticipantsDisplay';
import { HeaderToolbar } from './header/HeaderToolbar';
import { useHeaderPreferences } from './header/use-header-preferences';
import { useParticipantInfo } from './header/use-participant-info';
import { useHeaderActions } from './header/use-header-actions';
import { useCallBanner } from './header/use-call-banner';
import { useEncryptionInfo } from './header/use-encryption-info';
import { usePermissions } from './header/use-permissions';
import type { ConversationHeaderProps } from './header/types';

export function ConversationHeader({
  conversation,
  currentUser,
  conversationParticipants,
  typingUsers,
  isMobile,
  onBackToList,
  onParticipantRemoved,
  onParticipantAdded,
  onLinkCreated,
  onStartCall,
  onOpenGallery,
  t,
  showBackButton = false
}: ConversationHeaderProps) {
  const { preferences, togglePin, toggleMute, toggleArchive } = useHeaderPreferences(
    conversation.id,
    currentUser,
    t
  );

  const { participantInfo, getCurrentUserRole } = useParticipantInfo(
    conversation,
    currentUser,
    conversationParticipants
  );

  const {
    isImageUploadDialogOpen,
    setIsImageUploadDialogOpen,
    isUploadingImage,
    isSettingsModalOpen,
    setIsSettingsModalOpen,
    handleImageUpload,
    handleShareConversation,
  } = useHeaderActions(conversation.id, t);

  const {
    currentCall,
    callDuration,
    showCallBanner,
    handleJoinCall,
    handleDismissCallBanner,
  } = useCallBanner(conversation.id, onStartCall);

  const { encryptionInfo } = useEncryptionInfo(conversation.encryptionMode, t);

  const { canUseVideoCalls, canModifyConversationImage } = usePermissions(
    conversation,
    participantInfo.role,
    currentUser
  );

  const displayName = preferences.customName
    ? `${preferences.customName} (${participantInfo.name})`
    : participantInfo.name;

  return (
    <>
      {showCallBanner && currentCall && (
        <OngoingCallBanner
          callId={currentCall.id}
          participantCount={currentCall.participants?.length || 0}
          duration={callDuration}
          onJoin={handleJoinCall}
          onDismiss={handleDismissCallBanner}
        />
      )}

      <div className="border-b border-border bg-card">
        <HeaderTagsBar
          categoryName={preferences.categoryName}
          tags={preferences.tags}
          isLoading={preferences.isLoading}
        />

        <div className="flex items-center justify-between px-4 py-3 min-h-[80px]">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            {(isMobile || showBackButton) && (
              <Button
                size="icon"
                variant="ghost"
                onClick={onBackToList}
                className="flex-shrink-0 h-9 w-9 mt-0.5 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                aria-label={t('conversationHeader.backToList') || 'Retour à la liste'}
              >
                <ArrowLeft className="h-5 w-5" aria-hidden="true" />
              </Button>
            )}

            <HeaderAvatar
              isDirect={conversation.type === 'direct'}
              isAnonymous={participantInfo.isAnonymous}
              canModifyImage={canModifyConversationImage()}
              avatarUrl={participantInfo.avatarUrl}
              avatar={participantInfo.avatar}
              name={participantInfo.name}
              status={participantInfo.status}
              encryptionInfo={encryptionInfo}
              onImageUploadClick={() => setIsImageUploadDialogOpen(true)}
              t={t}
            />

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 min-w-0">
                <h2
                  className="font-semibold text-base truncate"
                  id="conversation-title"
                  aria-label={`Conversation: ${participantInfo.name}`}
                >
                  {preferences.customName ? (
                    <>
                      {preferences.customName}{' '}
                      <span className="text-muted-foreground font-normal">
                        ({participantInfo.name})
                      </span>
                    </>
                  ) : (
                    participantInfo.name
                  )}
                </h2>
              </div>

              <ParticipantsDisplay
                conversation={conversation}
                currentUser={currentUser}
                conversationParticipants={conversationParticipants}
                typingUsers={typingUsers}
                participantInfo={participantInfo}
                customName={preferences.customName}
                tags={preferences.tags}
                categoryName={preferences.categoryName}
                t={t}
              />
            </div>
          </div>

          <HeaderToolbar
            conversation={conversation}
            currentUser={currentUser}
            conversationParticipants={conversationParticipants}
            currentUserRole={participantInfo.role}
            canUseVideoCalls={canUseVideoCalls()}
            isPinned={preferences.isPinned}
            isMuted={preferences.isMuted}
            isArchived={preferences.isArchived}
            isLoadingPreferences={preferences.isLoading}
            onStartCall={onStartCall}
            onOpenGallery={onOpenGallery}
            onOpenSettings={() => setIsSettingsModalOpen(true)}
            onParticipantRemoved={onParticipantRemoved}
            onParticipantAdded={onParticipantAdded}
            onLinkCreated={onLinkCreated}
            onTogglePin={togglePin}
            onToggleMute={toggleMute}
            onToggleArchive={toggleArchive}
            onShareConversation={handleShareConversation}
            t={t}
          />

          <ConversationImageUploadDialog
            open={isImageUploadDialogOpen}
            onClose={() => setIsImageUploadDialogOpen(false)}
            onImageUploaded={handleImageUpload}
            isUploading={isUploadingImage}
            conversationTitle={conversation.title || conversation.id}
          />

          <ConversationSettingsModal
            open={isSettingsModalOpen}
            onOpenChange={setIsSettingsModalOpen}
            conversation={conversation}
            currentUser={currentUser}
            conversationParticipants={conversationParticipants}
            currentUserRole={getCurrentUserRole()}
            onConversationUpdate={() => {
              window.location.reload();
            }}
          />
        </div>
      </div>
    </>
  );
}
