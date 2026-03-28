'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Button,
  Card,
  Input,
  Badge,
  Skeleton,
  PageHeader,
  EmptyState,
  Dialog,
  DialogHeader,
  DialogBody,
  DialogFooter,
  ContactCard,
  FriendRequestCard,
  BlockedUserCard,
} from '@/components/v2';
import { useContactsV2, useFriendRequestsV2, useBlockedUsersV2 } from '@/hooks/v2';
import { useUser } from '@/stores';
import { useI18n } from '@/hooks/useI18n';
import { apiService } from '@/services/api.service';
import {
  Users,
  UserCheck,
  Clock,
  UserX,
  ShieldBan,
  Share2,
  Search,
  SortAsc,
  RefreshCw,
  ArrowUpDown,
} from 'lucide-react';
import type { ContactTab, ContactSortOption } from '@/types/contacts';
import type { ContactAction } from '@/components/v2/ContactCard';
import type { FriendRequestAction } from '@/components/v2/FriendRequestCard';

const TABS: { key: ContactTab; icon: React.ElementType; colorVar: string }[] = [
  { key: 'all', icon: Users, colorVar: '--gp-terracotta' },
  { key: 'connected', icon: UserCheck, colorVar: '--gp-deep-teal' },
  { key: 'pending', icon: Clock, colorVar: '--gp-golden' },
  { key: 'refused', icon: UserX, colorVar: '--gp-error' },
  { key: 'blocked', icon: ShieldBan, colorVar: '--gp-text-muted' },
  { key: 'affiliates', icon: Share2, colorVar: '--gp-deep-teal' },
];

const SORT_OPTIONS: { key: ContactSortOption; labelKey: string }[] = [
  { key: 'name', labelKey: 'sort.alphabetical' },
  { key: 'lastSeen', labelKey: 'sort.lastSeen' },
  { key: 'recentlyAdded', labelKey: 'sort.recentlyAdded' },
];

function ContactSkeleton() {
  return (
    <div className="p-4 flex items-center gap-4">
      <Skeleton variant="circular" className="w-12 h-12" />
      <div className="flex-1">
        <Skeleton className="h-4 w-32 mb-2" />
        <Skeleton className="h-3 w-24" />
      </div>
    </div>
  );
}

export default function V2ContactsPage() {
  const router = useRouter();
  const user = useUser();
  const { t } = useI18n('contacts');
  const [activeTab, setActiveTab] = useState<ContactTab>('all');
  const [showSortMenu, setShowSortMenu] = useState(false);

  const {
    contacts,
    onlineContacts,
    offlineContacts,
    searchQuery,
    setSearchQuery,
    searchResults,
    isSearching,
    isLoading: isLoadingContacts,
    sortBy,
    setSortBy,
    refreshContacts,
    error: contactsError,
  } = useContactsV2();

  const {
    connected,
    pending,
    refused,
    stats: requestStats,
    isLoading: isLoadingRequests,
    sendRequest,
    acceptRequest,
    rejectRequest,
    cancelRequest,
    getPendingRequestWithUser,
    refresh: refreshRequests,
  } = useFriendRequestsV2({ currentUserId: user?.id });

  const {
    blockedUsers,
    isLoading: isLoadingBlocked,
    blockUser,
    unblockUser,
    isBlocked,
    refresh: refreshBlocked,
  } = useBlockedUsersV2();

  const isLoading = isLoadingContacts || isLoadingRequests || isLoadingBlocked;

  const handleRefreshAll = useCallback(async () => {
    await Promise.all([refreshContacts(), refreshRequests(), refreshBlocked()]);
  }, [refreshContacts, refreshRequests, refreshBlocked]);

  const handleContactAction = useCallback(
    async (action: ContactAction, contactId: string, requestId?: string) => {
      switch (action) {
        case 'add':
          await sendRequest(contactId);
          break;
        case 'cancel':
          if (requestId) await cancelRequest(requestId);
          break;
        case 'message': {
          try {
            const response = await apiService.post<{ id: string }>('/conversations', {
              type: 'direct',
              participantIds: [contactId],
            });
            const data = response as { data?: { success?: boolean; data?: { id: string } } };
            if (data?.data?.data?.id) {
              router.push(`/v2/chats/${data.data.data.id}`);
            }
          } catch {
            // toast handled by apiService
          }
          break;
        }
        case 'block':
          await blockUser(contactId);
          break;
        case 'viewProfile':
          router.push(`/v2/profile/${contactId}`);
          break;
        case 'call':
          // Future: implement calling
          break;
      }
    },
    [sendRequest, cancelRequest, blockUser, router]
  );

  const handleFriendRequestAction = useCallback(
    async (action: FriendRequestAction, requestId: string, userId?: string) => {
      switch (action) {
        case 'accept':
          await acceptRequest(requestId);
          break;
        case 'reject':
          await rejectRequest(requestId);
          break;
        case 'cancel':
          await cancelRequest(requestId);
          break;
        case 'resend':
          if (userId) await sendRequest(userId);
          break;
      }
    },
    [acceptRequest, rejectRequest, cancelRequest, sendRequest]
  );

  const connectedUserIds = new Set(
    connected.map((r) =>
      r.senderId === user?.id ? r.receiverId : r.senderId
    )
  );

  const displayContacts = searchQuery.length >= 2 ? searchResults : contacts;

  const tabCounts: Record<ContactTab, number> = {
    all: displayContacts.length,
    connected: requestStats.connected,
    pending: requestStats.pending,
    refused: requestStats.refused,
    blocked: blockedUsers.length,
    affiliates: 0,
  };

  return (
    <div className="h-full overflow-auto bg-[var(--gp-background)] transition-colors duration-300">
      <PageHeader
        title={t('title')}
        actionButtons={
          <div className="flex items-center gap-2">
            <div className="relative">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowSortMenu(!showSortMenu)}
                aria-label={t('sort.label') || 'Sort'}
              >
                <ArrowUpDown className="w-4 h-4" />
              </Button>
              {showSortMenu && (
                <>
                  <div
                    role="presentation"
                    className="fixed inset-0 z-40"
                    onClick={() => setShowSortMenu(false)}
                  />
                  <div className="absolute right-0 top-full mt-1 z-50 min-w-[180px] rounded-lg py-1 bg-[var(--gp-surface-elevated)] border border-[var(--gp-border)] shadow-lg">
                    {SORT_OPTIONS.map((opt) => (
                      <button
                        key={opt.key}
                        className={`w-full px-4 py-2.5 text-sm text-left flex items-center gap-2 hover:bg-[var(--gp-hover)] ${
                          sortBy === opt.key
                            ? 'text-[var(--gp-terracotta)] font-medium'
                            : 'text-[var(--gp-text-primary)]'
                        }`}
                        onClick={() => {
                          setSortBy(opt.key);
                          setShowSortMenu(false);
                        }}
                      >
                        <SortAsc className="w-4 h-4" />
                        {t(opt.labelKey)}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
            <Button variant="ghost" size="sm" onClick={handleRefreshAll}>
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
        }
      >
        <div className="mt-4">
          <Input
            placeholder={t('searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            icon={<Search className="w-4 h-4" />}
          />
        </div>

        {/* Tabs */}
        <div className="mt-4 flex gap-1 overflow-x-auto pb-1 scrollbar-none">
          {TABS.map(({ key, icon: Icon }) => (
            <button
              key={key}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                activeTab === key
                  ? 'bg-[var(--gp-terracotta)] text-white'
                  : 'text-[var(--gp-text-muted)] hover:bg-[var(--gp-hover)]'
              }`}
              onClick={() => setActiveTab(key)}
            >
              <Icon className="w-4 h-4" />
              {t(`tabs.${key}`)}
              {tabCounts[key] > 0 && (
                <span
                  className={`ml-1 text-xs px-1.5 py-0.5 rounded-full ${
                    activeTab === key
                      ? 'bg-white/20'
                      : 'bg-[var(--gp-parchment)]'
                  }`}
                >
                  {tabCounts[key]}
                </span>
              )}
            </button>
          ))}
        </div>
      </PageHeader>

      <main className="max-w-2xl mx-auto px-6 py-6">
        {/* Error */}
        {contactsError && (
          <div
            className="p-4 mb-4 rounded-xl"
            style={{
              background: 'color-mix(in srgb, var(--gp-error) 15%, transparent)',
            }}
          >
            <p style={{ color: 'var(--gp-error)' }}>{contactsError}</p>
          </div>
        )}

        {/* Loading */}
        {isLoading && (
          <Card variant="outlined" hover={false} className="divide-y divide-[var(--gp-border)]">
            <ContactSkeleton />
            <ContactSkeleton />
            <ContactSkeleton />
          </Card>
        )}

        {/* ===== TAB: ALL ===== */}
        {!isLoading && activeTab === 'all' && (
          <>
            {displayContacts.length === 0 ? (
              searchQuery ? (
                <EmptyState
                  icon="🔍"
                  title={t('messages.noContactsFound')}
                  description={t('messages.noContactsFoundDescription')}
                />
              ) : (
                <EmptyState
                  icon="👥"
                  title={t('messages.noContacts')}
                  description={t('messages.noContactsDescription')}
                />
              )
            ) : (
              <>
                {/* Online contacts */}
                {onlineContacts.length > 0 && !searchQuery && (
                  <section className="mb-6">
                    <h2 className="text-sm font-semibold mb-3 px-1 text-[var(--gp-text-muted)] uppercase tracking-wider">
                      {t('sections.online')} ({onlineContacts.length})
                    </h2>
                    <Card
                      variant="outlined"
                      hover={false}
                      className="divide-y divide-[var(--gp-border)]"
                    >
                      {onlineContacts.map((contact) => {
                        const pendingReq = getPendingRequestWithUser(contact.id);
                        return (
                          <ContactCard
                            key={contact.id}
                            contact={contact}
                            hasPendingRequest={!!pendingReq}
                            pendingRequestId={pendingReq?.id}
                            isFriend={connectedUserIds.has(contact.id)}
                            onAction={handleContactAction}
                            t={t}
                          />
                        );
                      })}
                    </Card>
                  </section>
                )}

                {/* Offline contacts / All when searching */}
                <section>
                  {!searchQuery && offlineContacts.length > 0 && (
                    <h2 className="text-sm font-semibold mb-3 px-1 text-[var(--gp-text-muted)] uppercase tracking-wider">
                      {t('sections.offline')} ({offlineContacts.length})
                    </h2>
                  )}
                  <Card
                    variant="outlined"
                    hover={false}
                    className="divide-y divide-[var(--gp-border)]"
                  >
                    {(searchQuery ? displayContacts : offlineContacts).map((contact) => {
                      const pendingReq = getPendingRequestWithUser(contact.id);
                      return (
                        <ContactCard
                          key={contact.id}
                          contact={contact}
                          hasPendingRequest={!!pendingReq}
                          pendingRequestId={pendingReq?.id}
                          isFriend={connectedUserIds.has(contact.id)}
                          onAction={handleContactAction}
                          t={t}
                        />
                      );
                    })}
                  </Card>
                </section>
              </>
            )}
          </>
        )}

        {/* ===== TAB: CONNECTED ===== */}
        {!isLoading && activeTab === 'connected' && (
          <>
            {connected.length === 0 ? (
              <EmptyState
                icon="🤝"
                title={t('messages.noConnectedContacts')}
                description={t('messages.noConnectedContactsDescription')}
              />
            ) : (
              <Card
                variant="outlined"
                hover={false}
                className="divide-y divide-[var(--gp-border)]"
              >
                {connected.map((request) => (
                  <FriendRequestCard
                    key={request.id}
                    request={request}
                    currentUserId={user?.id}
                    onAction={handleFriendRequestAction}
                    t={t}
                  />
                ))}
              </Card>
            )}
          </>
        )}

        {/* ===== TAB: PENDING ===== */}
        {!isLoading && activeTab === 'pending' && (
          <>
            {pending.length === 0 ? (
              <EmptyState
                icon="⏳"
                title={t('messages.noPendingRequests')}
                description={t('messages.noPendingRequestsDescription')}
              />
            ) : (
              <Card
                variant="outlined"
                hover={false}
                className="divide-y divide-[var(--gp-border)]"
              >
                {pending.map((request) => (
                  <FriendRequestCard
                    key={request.id}
                    request={request}
                    currentUserId={user?.id}
                    onAction={handleFriendRequestAction}
                    t={t}
                  />
                ))}
              </Card>
            )}
          </>
        )}

        {/* ===== TAB: REFUSED ===== */}
        {!isLoading && activeTab === 'refused' && (
          <>
            {refused.length === 0 ? (
              <EmptyState
                icon="❌"
                title={t('messages.noRefusedRequests')}
                description={t('messages.noRefusedRequestsDescription')}
              />
            ) : (
              <Card
                variant="outlined"
                hover={false}
                className="divide-y divide-[var(--gp-border)]"
              >
                {refused.map((request) => (
                  <FriendRequestCard
                    key={request.id}
                    request={request}
                    currentUserId={user?.id}
                    onAction={handleFriendRequestAction}
                    t={t}
                  />
                ))}
              </Card>
            )}
          </>
        )}

        {/* ===== TAB: BLOCKED ===== */}
        {!isLoading && activeTab === 'blocked' && (
          <>
            {blockedUsers.length === 0 ? (
              <EmptyState
                icon="🛡️"
                title={t('messages.noBlockedUsers')}
                description={t('messages.noBlockedUsersDescription')}
              />
            ) : (
              <Card
                variant="outlined"
                hover={false}
                className="divide-y divide-[var(--gp-border)]"
              >
                {blockedUsers.map((blockedUser) => (
                  <BlockedUserCard
                    key={blockedUser.id}
                    user={blockedUser}
                    onUnblock={unblockUser}
                    t={t}
                  />
                ))}
              </Card>
            )}
          </>
        )}

        {/* ===== TAB: AFFILIATES ===== */}
        {!isLoading && activeTab === 'affiliates' && (
          <EmptyState
            icon="🔗"
            title={t('messages.noAffiliateContacts')}
            description={t('messages.noAffiliateContactsDescription')}
          />
        )}

        {/* Loading search indicator */}
        {isSearching && (
          <div className="flex justify-center py-4">
            <div className="animate-spin rounded-full h-6 w-6 border-2 border-[var(--gp-terracotta)] border-t-transparent" />
          </div>
        )}
      </main>
    </div>
  );
}
