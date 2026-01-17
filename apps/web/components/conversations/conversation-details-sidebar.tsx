'use client';

import { lazy, Suspense } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { X, Check, Copy, Languages, Users, Link2, Info } from 'lucide-react';
import type { Conversation, User, Message } from '@meeshy/shared/types';
import { useI18n } from '@/hooks/use-i18n';
import { copyToClipboard } from '@/lib/clipboard';
import { toast } from 'sonner';
import { AttachmentService } from '@/services/attachmentService';
import { conversationsService } from '@/services/conversations.service';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  FoldableSection,
  LanguageIndicators,
  SidebarLanguageHeader,
} from '@/lib/bubble-stream-modules';

// Hooks
import { useConversationDetails } from '@/hooks/use-conversation-details';
import { useParticipantManagement } from '@/hooks/use-participant-management';
import { useConversationStats } from '@/hooks/use-conversation-stats';

// Eager-loaded components (critical path)
import { DetailsHeader } from './details-sidebar/DetailsHeader';
import { DescriptionSection } from './details-sidebar/DescriptionSection';
import { ConversationImageUploadDialog } from './conversation-image-upload-dialog';

// Lazy-loaded components (below the fold)
const ActiveUsersSection = lazy(() =>
  import('./details-sidebar/ActiveUsersSection').then(m => ({ default: m.ActiveUsersSection }))
);
const ShareLinksSection = lazy(() =>
  import('./details-sidebar/ShareLinksSection').then(m => ({ default: m.ShareLinksSection }))
);
const TagsManager = lazy(() =>
  import('./details-sidebar/TagsManager').then(m => ({ default: m.TagsManager }))
);
const CategorySelector = lazy(() =>
  import('./details-sidebar/CategorySelector').then(m => ({ default: m.CategorySelector }))
);
const CustomizationManager = lazy(() =>
  import('./details-sidebar/CustomizationManager').then(m => ({ default: m.CustomizationManager }))
);

interface ConversationDetailsSidebarProps {
  conversation: Conversation;
  currentUser: User;
  messages: Message[];
  isOpen: boolean;
  onClose: () => void;
  onConversationUpdated?: (updatedConversation: Partial<Conversation>) => void;
}

/**
 * Refactored Conversation Details Sidebar
 *
 * Performance optimizations:
 * - Split into smaller, focused components
 * - Custom hooks for state management
 * - Lazy loading for below-the-fold sections
 * - Optimized bundle size
 *
 * File size: ~400 lines (down from 1576)
 */
export function ConversationDetailsSidebar({
  conversation,
  currentUser,
  messages,
  isOpen,
  onClose,
  onConversationUpdated
}: ConversationDetailsSidebarProps) {
  const { t } = useI18n('conversations');

  // Custom hooks
  const {
    isEditingName,
    setIsEditingName,
    conversationName,
    setConversationName,
    handleSaveName,
    isEditingDescription,
    setIsEditingDescription,
    conversationDescription,
    setConversationDescription,
    handleSaveDescription,
    isLoading,
    isCopied,
    setIsCopied,
    isImageUploadDialogOpen,
    setIsImageUploadDialogOpen,
    isUploadingImage,
    setIsUploadingImage,
  } = useConversationDetails(conversation, currentUser, onConversationUpdated);

  const { isAdmin, canModifyImage } = useParticipantManagement(conversation, currentUser);

  const { messageLanguageStats, activeLanguageStats, activeUsers } = useConversationStats(
    conversation,
    messages,
    currentUser
  );

  // Helper functions
  const getConversationDisplayName = (conv: Conversation) => {
    if (conv.type !== 'direct') {
      return conv.title || t('conversationDetails.groupConversation');
    }

    const otherParticipant = conv.participants?.find(p => p.userId !== currentUser.id);
    const otherUser = (otherParticipant as any)?.user;
    if (otherParticipant && otherUser) {
      return (
        otherUser.displayName ||
        `${otherUser.firstName || ''} ${otherUser.lastName || ''}`.trim() ||
        otherUser.username
      );
    }

    return conv.title || t('conversationDetails.conversation');
  };

  const getConversationAvatarUrl = (conv: Conversation) => {
    if (conv.type === 'direct') {
      const otherParticipant = conv.participants?.find(p => p.userId !== currentUser.id);
      const participantUser = (otherParticipant as any)?.user;
      return participantUser?.avatar;
    }
    return conv.image || conv.avatar;
  };

  const handleCopyConversationLink = async () => {
    const conversationUrl = `${window.location.origin}/conversations/${conversation.id}`;
    const result = await copyToClipboard(conversationUrl);

    if (result.success) {
      setIsCopied(true);
      toast.success(t('conversationDetails.linkCopied'));
      setTimeout(() => setIsCopied(false), 2000);
    } else {
      toast.error(result.message || t('conversationDetails.copyError'));
    }
  };

  const handleImageUpload = async (file: File) => {
    setIsUploadingImage(true);
    try {
      const uploadResult = await AttachmentService.uploadFiles([file]);

      if (uploadResult.success && uploadResult.attachments.length > 0) {
        const imageUrl = uploadResult.attachments[0].fileUrl;
        const updatedData = { image: imageUrl, avatar: imageUrl };
        await conversationsService.updateConversation(conversation.id, updatedData);

        onConversationUpdated?.(updatedData);
        toast.success(t('conversationDetails.imageUpdated') || 'Image updated');
        setIsImageUploadDialogOpen(false);
      } else {
        throw new Error('Upload failed');
      }
    } catch (error) {
      console.error('Error uploading image:', error);
      toast.error(t('conversationDetails.imageUploadError') || 'Error uploading image');
    } finally {
      setIsUploadingImage(false);
    }
  };

  if (!isOpen) return null;

  const displayName = getConversationDisplayName(conversation);
  const avatarUrl = getConversationAvatarUrl(conversation);

  return (
    <>
      <div className="absolute inset-y-0 left-0 w-80 bg-card dark:bg-card border-r border-border z-[120] shadow-2xl animate-in slide-in-from-left duration-300">
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex-shrink-0 flex items-center justify-between p-4 border-b border-border bg-card dark:bg-card">
            <h2 className="text-lg font-semibold">{t('conversationDetails.title')}</h2>
            <Button
              size="sm"
              variant="ghost"
              onClick={onClose}
              className="h-8 w-8 p-0 rounded-full hover:bg-accent"
              aria-label={t('conversationDetails.close')}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Scrollable content */}
          <ScrollArea className="flex-1 overflow-y-auto">
            <div className="p-4 space-y-6">
              {/* Main info */}
              <DetailsHeader
                conversation={conversation}
                currentUser={currentUser}
                canModifyImage={canModifyImage}
                displayName={displayName}
                avatarUrl={avatarUrl}
                isEditingName={isEditingName}
                conversationName={conversationName}
                isLoading={isLoading}
                onEditNameChange={setConversationName}
                onSaveName={handleSaveName}
                onCancelNameEdit={() => {
                  setIsEditingName(false);
                  setConversationName(conversation.title || '');
                }}
                onStartNameEdit={() => {
                  setIsEditingName(true);
                  setConversationName(conversation.title || displayName);
                }}
                onOpenImageUpload={() => setIsImageUploadDialogOpen(true)}
              />

              <Separator />

              {/* Conversation ID with copy button */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-800">
                <span className="text-xs font-mono text-gray-600 dark:text-gray-400 truncate">
                  {conversation.id}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleCopyConversationLink}
                  className="h-8 w-8 p-0 flex-shrink-0"
                >
                  {isCopied ? (
                    <Check className="h-4 w-4 text-green-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>

              {/* Description section - Group conversations only */}
              {conversation.type !== 'direct' && (
                <>
                  <DescriptionSection
                    description={conversation.description}
                    isEditing={isEditingDescription}
                    editValue={conversationDescription}
                    isLoading={isLoading}
                    isAdmin={isAdmin}
                    onEditChange={setConversationDescription}
                    onSave={handleSaveDescription}
                    onStartEdit={() => {
                      setIsEditingDescription(true);
                      setConversationDescription(conversation.description || '');
                    }}
                    onCancelEdit={() => {
                      setIsEditingDescription(false);
                      setConversationDescription(conversation.description || '');
                    }}
                  />
                  <Separator />
                </>
              )}

              {/* User Preferences - Lazy loaded */}
              <Suspense fallback={<div className="text-xs text-muted-foreground italic">Loading...</div>}>
                <div className="space-y-4">
                  {/* Tags Section */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <label className="text-sm font-medium text-muted-foreground">
                        {t('conversationDetails.personalTags')}
                      </label>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info className="h-3.5 w-3.5 text-muted-foreground/60 cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent side="right" className="max-w-xs">
                            <p className="text-xs">{t('conversationDetails.tagsTooltip')}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <TagsManager conversationId={conversation.id} currentUser={currentUser} />
                  </div>

                  {/* Category Section */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <label className="text-sm font-medium text-muted-foreground">
                        {t('conversationDetails.category')}
                      </label>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info className="h-3.5 w-3.5 text-muted-foreground/60 cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent side="right" className="max-w-xs">
                            <p className="text-xs">{t('conversationDetails.categoryTooltip')}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <CategorySelector conversationId={conversation.id} currentUser={currentUser} />
                  </div>

                  {/* Customization Section */}
                  <div className="space-y-2">
                    <CustomizationManager conversationId={conversation.id} currentUser={currentUser} />
                  </div>
                </div>
              </Suspense>

              <Separator />

              {/* Language stats header */}
              <SidebarLanguageHeader
                languageStats={messageLanguageStats}
                userLanguage={currentUser.systemLanguage}
              />

              {/* Active Languages - Foldable */}
              <FoldableSection
                title={t('conversationDetails.activeLanguages')}
                icon={<Languages className="h-4 w-4 mr-2" />}
                defaultExpanded={true}
              >
                <LanguageIndicators languageStats={activeLanguageStats} />
              </FoldableSection>

              {/* Active Users - Lazy loaded */}
              <Suspense fallback={<div className="text-xs text-muted-foreground italic">Loading...</div>}>
                <FoldableSection
                  title={`${t('conversationDetails.activeUsers')} (${activeUsers.length})`}
                  icon={<Users className="h-4 w-4 mr-2" />}
                  defaultExpanded={true}
                >
                  <ActiveUsersSection activeUsers={activeUsers} />
                </FoldableSection>
              </Suspense>

              {/* Share Links - Lazy loaded, group conversations only */}
              {conversation.type !== 'direct' && (
                <Suspense fallback={<div className="text-xs text-muted-foreground italic">Loading...</div>}>
                  <FoldableSection
                    title={t('conversationDetails.shareLinks')}
                    icon={<Link2 className="h-4 w-4 mr-2" />}
                    defaultExpanded={false}
                  >
                    <ShareLinksSection conversationId={conversation.id} />
                  </FoldableSection>
                </Suspense>
              )}
            </div>
          </ScrollArea>
        </div>
      </div>

      {/* Image upload dialog */}
      <ConversationImageUploadDialog
        open={isImageUploadDialogOpen}
        onClose={() => setIsImageUploadDialogOpen(false)}
        onImageUploaded={handleImageUpload}
        isUploading={isUploadingImage}
        conversationTitle={conversation.title || conversation.id}
      />
    </>
  );
}
