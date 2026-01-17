'use client';

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useState, useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import { RefreshCw } from 'lucide-react';

// Core imports
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Footer } from '@/components/layout/Footer';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { Button } from '@/components/ui/button';

// Hooks
import { useI18n } from '@/hooks/useI18n';
import { usePrefetch } from '@/hooks/use-prefetch';
import { useDashboardData } from '@/hooks/use-dashboard-data';
import { useDashboardStats } from '@/hooks/use-dashboard-stats';
import { useGroupModal } from '@/hooks/use-group-modal';
import { useUser } from '@/stores';

// Dashboard components (non-lazy)
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { DashboardStats } from '@/components/dashboard/DashboardStats';
import { ConversationsWidget } from '@/components/dashboard/ConversationsWidget';
import { CommunitiesWidget } from '@/components/dashboard/CommunitiesWidget';
import { QuickActionsWidget } from '@/components/dashboard/QuickActionsWidget';
import { CreateGroupModal } from '@/components/dashboard/CreateGroupModal';

// Dynamic imports for modals (reduce initial bundle ~30-80KB)
const CreateLinkModalV2 = dynamic(
  () => import('@/components/conversations/create-link-modal').then((m) => ({ default: m.CreateLinkModalV2 })),
  { ssr: false }
);

const CreateConversationModal = dynamic(
  () =>
    import('@/components/conversations/create-conversation-modal').then((m) => ({
      default: m.CreateConversationModal,
    })),
  { ssr: false }
);

const ShareAffiliateModal = dynamic(
  () => import('@/components/affiliate/share-affiliate-modal').then((m) => ({ default: m.ShareAffiliateModal })),
  { ssr: false }
);

function DashboardPageContent() {
  const router = useRouter();
  const user = useUser();
  const { t, currentLanguage } = useI18n('dashboard');

  // Dashboard data with parallel fetching
  const { data: dashboardData, isLoading, error, refetch } = useDashboardData();
  const { stats, recentConversations, recentCommunities } = useDashboardStats(dashboardData);

  // Modal states
  const [isCreateLinkModalOpen, setIsCreateLinkModalOpen] = useState(false);
  const [isCreateConversationModalOpen, setIsCreateConversationModalOpen] = useState(false);
  const [isCreateGroupModalOpen, setIsCreateGroupModalOpen] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);

  // Group modal logic
  const groupModal = useGroupModal(user?.id);

  // Prefetch hooks for modal optimization
  const prefetchCreateLink = usePrefetch(() => import('@/components/conversations/create-link-modal'), {
    delay: 100,
  });
  const prefetchCreateConversation = usePrefetch(
    () => import('@/components/conversations/create-conversation-modal'),
    { delay: 100 }
  );
  const prefetchShareAffiliate = usePrefetch(() => import('@/components/affiliate/share-affiliate-modal'), {
    delay: 100,
  });

  // Modal handlers
  const handleConversationCreated = useCallback(
    (conversationId: string) => {
      toast.success(t('success.conversationCreated'));
      setIsCreateConversationModalOpen(false);
      router.push(`/conversations/${conversationId}`);
      refetch();
    },
    [t, router, refetch]
  );

  const handleLinkCreated = useCallback(() => {
    toast.success(t('success.linkCreated'));
    setIsCreateLinkModalOpen(false);
    refetch();
  }, [t, refetch]);

  const handleGroupCreated = useCallback(
    async (groupId: string) => {
      toast.success(t('success.groupCreated'));
      setIsCreateGroupModalOpen(false);
      router.push(`/groups/${groupId}`);
      refetch();
    },
    [t, router, refetch]
  );

  const handleCreateGroup = useCallback(async () => {
    const groupId = await groupModal.createGroup();
    if (groupId) {
      await handleGroupCreated(groupId);
    }
  }, [groupModal, handleGroupCreated]);

  // Load users when group modal opens
  useEffect(() => {
    if (isCreateGroupModalOpen) {
      groupModal.loadUsers();
    }
  }, [isCreateGroupModalOpen, groupModal.loadUsers]);

  // Debounced search effect for group users
  useEffect(() => {
    if (isCreateGroupModalOpen && groupModal.groupSearchQuery.trim()) {
      const timer = setTimeout(() => {
        groupModal.loadUsers(groupModal.groupSearchQuery);
      }, 300);
      return () => clearTimeout(timer);
    } else if (isCreateGroupModalOpen && !groupModal.groupSearchQuery.trim()) {
      groupModal.loadUsers();
    }
  }, [groupModal.groupSearchQuery, isCreateGroupModalOpen, groupModal.loadUsers]);

  // Handle group modal close
  const handleGroupModalClose = useCallback(() => {
    groupModal.resetForm();
    setIsCreateGroupModalOpen(false);
  }, [groupModal]);

  // Error state
  if (error) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
          <div className="text-red-500">{t('errorLoading', { message: error.message })}</div>
          <Button onClick={refetch} variant="outline">
            <RefreshCw className="h-4 w-4 mr-2" />
            {t('retry')}
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center space-y-3">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 dark:border-blue-400 mx-auto"></div>
            <p className="text-sm text-muted-foreground">{t('loading')}</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const userName = user?.firstName || user?.username || t('greetingFallback');

  return (
    <div className="flex flex-col min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <DashboardLayout className="!bg-none !bg-transparent !h-auto">
        {/* Header with greeting and quick actions */}
        <DashboardHeader
          userName={userName}
          t={t}
          onShareApp={() => setIsShareModalOpen(true)}
          onCreateLink={() => router.push('/links')}
          onCreateConversation={() => router.push('/conversations?new=true')}
          onCreateCommunity={() => router.push('/groups?new=true')}
          prefetchShareAffiliate={prefetchShareAffiliate}
        />

        {/* Statistics cards */}
        <DashboardStats stats={stats} t={t} />

        {/* Main content grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <ConversationsWidget
            conversations={recentConversations}
            currentLanguage={currentLanguage}
            t={t}
            onConversationClick={(id) => router.push(`/conversations/${id}`)}
            onViewAll={() => router.push('/conversations')}
            onStartConversation={() => router.push('/conversations?new=true')}
          />

          <CommunitiesWidget
            communities={recentCommunities}
            t={t}
            onCommunityClick={(id) => router.push(`/groups/${id}`)}
            onViewAll={() => router.push('/groups')}
            onCreateCommunity={() => router.push('/groups?new=true')}
          />
        </div>

        {/* Quick actions at bottom */}
        <div className="mt-8">
          <QuickActionsWidget
            onCreateConversation={() => setIsCreateConversationModalOpen(true)}
            onCreateLink={() => setIsCreateLinkModalOpen(true)}
            onCreateGroup={() => setIsCreateGroupModalOpen(true)}
            onShare={() => setIsShareModalOpen(true)}
            onSettings={() => router.push('/settings')}
            t={t}
            prefetchCreateConversation={prefetchCreateConversation}
            prefetchCreateLink={prefetchCreateLink}
            prefetchShareAffiliate={prefetchShareAffiliate}
          />
        </div>

        {/* Modals */}
        <CreateConversationModal
          isOpen={isCreateConversationModalOpen}
          onClose={() => setIsCreateConversationModalOpen(false)}
          currentUser={user!}
          onConversationCreated={handleConversationCreated}
        />

        <CreateLinkModalV2
          isOpen={isCreateLinkModalOpen}
          onClose={() => setIsCreateLinkModalOpen(false)}
          onLinkCreated={handleLinkCreated}
        />

        <CreateGroupModal
          isOpen={isCreateGroupModalOpen}
          onClose={handleGroupModalClose}
          groupName={groupModal.groupName}
          setGroupName={groupModal.setGroupName}
          groupDescription={groupModal.groupDescription}
          setGroupDescription={groupModal.setGroupDescription}
          isGroupPrivate={groupModal.isGroupPrivate}
          setIsGroupPrivate={groupModal.setIsGroupPrivate}
          availableUsers={groupModal.availableUsers}
          selectedUsers={groupModal.selectedUsers}
          groupSearchQuery={groupModal.groupSearchQuery}
          setGroupSearchQuery={groupModal.setGroupSearchQuery}
          isLoadingUsers={groupModal.isLoadingUsers}
          isCreatingGroup={groupModal.isCreatingGroup}
          currentUser={user || undefined}
          toggleUserSelection={groupModal.toggleUserSelection}
          onCreateGroup={handleCreateGroup}
        />

        <ShareAffiliateModal
          isOpen={isShareModalOpen}
          onClose={() => setIsShareModalOpen(false)}
          userLanguage={user?.systemLanguage || 'fr'}
        />
      </DashboardLayout>

      {/* Footer */}
      <Footer />
    </div>
  );
}

export default function DashboardPage() {
  return (
    <AuthGuard>
      <DashboardPageContent />
    </AuthGuard>
  );
}
