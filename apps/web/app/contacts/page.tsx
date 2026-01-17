'use client';

import { useState, useEffect, useMemo, lazy, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Footer } from '@/components/layout/Footer';
import { toast } from 'sonner';
import { buildApiUrl } from '@/lib/config';
import { Users, UserCheck, Share2, Clock, UserX, Zap } from 'lucide-react';
import { useUser } from '@/stores';
import { useI18n } from '@/hooks/useI18n';
import { authManager } from '@/services/auth-manager.service';
import { ShareAffiliateModal } from '@/components/affiliate/share-affiliate-modal';

// Custom hooks
import { useContactsData } from '@/hooks/use-contacts-data';
import { useContactsFiltering } from '@/hooks/use-contacts-filtering';
import { useContactsActions } from '@/hooks/use-contacts-actions';

// Utils
import { formatLastSeen } from '@/lib/contacts-utils';

// Lazy-loaded components with bundle-dynamic-imports optimization
const ContactsList = lazy(() => import('@/components/contacts/ContactsList'));
const ContactsSearch = lazy(() => import('@/components/contacts/ContactsSearch'));
const ContactsStats = lazy(() => import('@/components/contacts/ContactsStats'));
const ConnectedContactsTab = lazy(() => import('@/components/contacts/tabs/ConnectedContactsTab'));
const PendingRequestsTab = lazy(() => import('@/components/contacts/tabs/PendingRequestsTab'));
const RefusedRequestsTab = lazy(() => import('@/components/contacts/tabs/RefusedRequestsTab'));
const AffiliatesTab = lazy(() => import('@/components/contacts/tabs/AffiliatesTab'));

// Loading component for Suspense fallbacks
const LoadingCard = () => (
  <Card className="border-2 bg-white dark:bg-gray-950 dark:border-gray-800">
    <CardContent className="flex flex-col items-center justify-center py-16">
      <div className="relative">
        <div className="animate-spin rounded-full h-16 w-16 border-4 border-gray-200 dark:border-gray-700 border-t-primary dark:border-t-primary"></div>
        <Zap className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 h-6 w-6 text-primary" />
      </div>
    </CardContent>
  </Card>
);

export default function ContactsPage() {
  const router = useRouter();
  const user = useUser();
  const { t } = useI18n('contacts');
  const [activeTab, setActiveTab] = useState<'all' | 'connected' | 'pending' | 'refused' | 'affiliates'>('all');
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);

  // Custom hooks for data management
  const {
    contacts,
    friendRequests,
    affiliateRelations,
    loading,
    loadFriendRequests,
    refreshAllData
  } = useContactsData(t);

  // Custom hook for filtering and search
  const {
    searchQuery,
    setSearchQuery,
    displayedUsers,
    stats,
    filteredRequests,
    getUserDisplayName
  } = useContactsFiltering(contacts, friendRequests, affiliateRelations, t);

  // Custom hook for actions
  const {
    startConversation,
    handleFriendRequest,
    sendFriendRequest,
    cancelFriendRequest
  } = useContactsActions(t, getUserDisplayName, refreshAllData);

  // Helper function to get pending request
  const getPendingRequestWithUser = useMemo(() => {
    return (userId: string) => {
      return friendRequests.find(
        (req) =>
          req.status === 'pending' &&
          ((req.senderId === user?.id && req.receiverId === userId) ||
            (req.senderId === userId && req.receiverId === user?.id))
      );
    };
  }, [friendRequests, user?.id]);

  // Helper function for formatting last seen
  const formatLastSeenWithT = useMemo(() => {
    return (userToFormat: any) => formatLastSeen(userToFormat, t);
  }, [t]);

  // Authentication check with parallel data fetching (server-parallel-fetching)
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const token = authManager.getAuthToken();
        if (!token) {
          router.push('/login');
          return;
        }

        const response = await fetch(buildApiUrl('/auth/me'), {
          headers: { Authorization: `Bearer ${token}` }
        });

        if (!response.ok) {
          authManager.clearAllSessions();
          toast.error(t('errors.sessionExpired'));
          router.push('/login');
          return;
        }

        // Parallel data fetching optimization
        await refreshAllData();
      } catch (error) {
        console.error('Erreur vérification auth:', error);
        toast.error(t('errors.connectionError'));
        router.push('/login');
      }
    };

    checkAuth();
  }, [router, refreshAllData, t]);

  // URL hash handling for tab navigation
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    const validTabs: Array<typeof activeTab> = ['all', 'connected', 'pending', 'refused', 'affiliates'];

    if (hash && validTabs.includes(hash as typeof activeTab)) {
      setActiveTab(hash as typeof activeTab);
    }
  }, []);

  // Action handlers with refresh
  const handleSendRequest = async (userId: string) => {
    await sendFriendRequest(userId, loadFriendRequests);
  };

  const handleCancelRequest = async (requestId: string) => {
    await cancelFriendRequest(requestId, loadFriendRequests);
  };

  const handleStartConversation = (userId: string) => {
    startConversation(userId, displayedUsers);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex flex-col">
      <DashboardLayout title={t('title')} className="!bg-none !bg-transparent !h-auto !max-w-none !px-0">
        <div className="relative z-10 space-y-8 pb-8 w-full py-8 px-4 md:px-8">
          {/* Hero Section */}
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-700 dark:from-blue-700 dark:via-indigo-700 dark:to-purple-800 p-8 md:p-12 text-white shadow-2xl">
            <div className="absolute inset-0 bg-black/10"></div>
            <div className="relative z-10">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-3 bg-white/20 backdrop-blur-sm rounded-2xl">
                  <Users className="h-8 w-8" />
                </div>
                <h1 className="text-4xl md:text-5xl font-bold">{t('title')}</h1>
              </div>
              <p className="text-lg md:text-xl text-blue-100 max-w-2xl">
                {t('subtitle')}
              </p>
            </div>
            <div className="absolute -right-12 -bottom-12 w-48 h-48 bg-white/10 rounded-full blur-3xl"></div>
            <div className="absolute -left-12 -top-12 w-64 h-64 bg-purple-500/20 rounded-full blur-3xl"></div>
          </div>

          {/* Main Content Card */}
          <Card className="border-2 shadow-lg bg-white dark:bg-gray-950 dark:border-gray-800">
            <CardContent className="p-6 space-y-6">
              {/* Tabs */}
              <Tabs value={activeTab} onValueChange={(value) => {
                const newTab = value as typeof activeTab;
                setActiveTab(newTab);
                window.history.replaceState(null, '', `#${newTab}`);
              }}>
                <TabsList className="w-full grid grid-cols-5 h-auto p-1.5 bg-gray-100 dark:bg-gray-800 dark:border-gray-700">
                  <TabsTrigger
                    value="all"
                    className="data-[state=active]:bg-blue-500 data-[state=active]:text-white dark:text-gray-300 dark:data-[state=active]:text-white py-2 md:py-3 px-2 md:px-6 rounded-lg font-medium transition-all flex flex-col md:flex-row items-center justify-center gap-1 md:gap-2"
                  >
                    <Users className="h-4 w-4" />
                    <span className="text-xs md:text-sm">{t('tabs.all')}</span>
                  </TabsTrigger>
                  <TabsTrigger
                    value="connected"
                    className="data-[state=active]:bg-purple-500 data-[state=active]:text-white dark:text-gray-300 dark:data-[state=active]:text-white py-2 md:py-3 px-2 md:px-6 rounded-lg font-medium transition-all flex flex-col md:flex-row items-center justify-center gap-1 md:gap-2"
                  >
                    <UserCheck className="h-4 w-4" />
                    <span className="text-xs md:text-sm">{t('tabs.connected')}</span>
                  </TabsTrigger>
                  <TabsTrigger
                    value="pending"
                    className="data-[state=active]:bg-orange-500 data-[state=active]:text-white dark:text-gray-300 dark:data-[state=active]:text-white py-2 md:py-3 px-2 md:px-6 rounded-lg font-medium transition-all flex flex-col md:flex-row items-center justify-center gap-1 md:gap-2"
                  >
                    <Clock className="h-4 w-4" />
                    <span className="text-xs md:text-sm">{t('tabs.pending')}</span>
                  </TabsTrigger>
                  <TabsTrigger
                    value="refused"
                    className="data-[state=active]:bg-red-500 data-[state=active]:text-white dark:text-gray-300 dark:data-[state=active]:text-white py-2 md:py-3 px-2 md:px-6 rounded-lg font-medium transition-all flex flex-col md:flex-row items-center justify-center gap-1 md:gap-2"
                  >
                    <UserX className="h-4 w-4" />
                    <span className="text-xs md:text-sm">{t('tabs.refused')}</span>
                  </TabsTrigger>
                  <TabsTrigger
                    value="affiliates"
                    className="data-[state=active]:bg-cyan-500 data-[state=active]:text-white dark:text-gray-300 dark:data-[state=active]:text-white py-2 md:py-3 px-2 md:px-6 rounded-lg font-medium transition-all flex flex-col md:flex-row items-center justify-center gap-1 md:gap-2"
                  >
                    <Share2 className="h-4 w-4" />
                    <span className="text-xs md:text-sm">{t('tabs.affiliates')}</span>
                  </TabsTrigger>
                </TabsList>
              </Tabs>

              {/* Stats */}
              <Suspense fallback={<div className="h-32 bg-gray-50 dark:bg-gray-900/50 rounded-lg animate-pulse" />}>
                <ContactsStats stats={stats} t={t} />
              </Suspense>

              {/* Search and Actions */}
              <Suspense fallback={<div className="h-12 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />}>
                <ContactsSearch
                  searchQuery={searchQuery}
                  onSearchChange={setSearchQuery}
                  onInviteClick={() => setIsShareModalOpen(true)}
                  t={t}
                />
              </Suspense>
            </CardContent>
          </Card>

          {/* Tab Content with rerender-memo optimization */}
          <div className="space-y-6">
            <Suspense fallback={<LoadingCard />}>
              {activeTab === 'all' && (
                <ContactsList
                  users={displayedUsers}
                  searchQuery={searchQuery}
                  getUserDisplayName={getUserDisplayName}
                  formatLastSeen={formatLastSeenWithT}
                  getPendingRequestWithUser={getPendingRequestWithUser}
                  onSendRequest={handleSendRequest}
                  onCancelRequest={handleCancelRequest}
                  onStartConversation={handleStartConversation}
                  t={t}
                />
              )}
              {activeTab === 'connected' && (
                <ConnectedContactsTab
                  friendRequests={filteredRequests.connected}
                  currentUserId={user?.id}
                  getUserDisplayName={getUserDisplayName}
                  onStartConversation={handleStartConversation}
                  t={t}
                />
              )}
              {activeTab === 'pending' && (
                <PendingRequestsTab
                  friendRequests={filteredRequests.pending}
                  currentUserId={user?.id}
                  getUserDisplayName={getUserDisplayName}
                  onHandleRequest={handleFriendRequest}
                  t={t}
                />
              )}
              {activeTab === 'refused' && (
                <RefusedRequestsTab
                  friendRequests={filteredRequests.refused}
                  currentUserId={user?.id}
                  getUserDisplayName={getUserDisplayName}
                  onSendRequest={handleSendRequest}
                  t={t}
                />
              )}
              {activeTab === 'affiliates' && (
                <AffiliatesTab
                  affiliateRelations={affiliateRelations}
                  getUserDisplayName={getUserDisplayName}
                  t={t}
                />
              )}
            </Suspense>
          </div>

          {/* Affiliate Modal */}
          <ShareAffiliateModal
            isOpen={isShareModalOpen}
            onClose={() => setIsShareModalOpen(false)}
            userLanguage={user?.systemLanguage || 'fr'}
          />
        </div>
      </DashboardLayout>

      {/* Footer */}
      <div className="w-screen relative left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] mt-16">
        <Footer />
      </div>
    </div>
  );
}
