'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Footer } from '@/components/layout/Footer';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { OnlineIndicator } from '@/components/ui/online-indicator';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';

import { getInitials } from '@/utils/initials';
import { useLiveUserStatus } from '@/hooks/use-live-user-status';
import { useContactsV2, useFriendRequestsV2, useBlockedUsersV2 } from '@/hooks/v2';
import type { ContactV2 } from '@/hooks/v2/use-contacts-v2';
import { useUser } from '@/stores';
import { useI18n } from '@/hooks/useI18n';
import { apiService } from '@/services/api.service';
import type { ContactTab, ContactSortOption, FriendRequest } from '@/types/contacts';
import type { BlockedUser, User } from '@meeshy/shared/types';
import { getUserDisplayName } from '@/utils/user-display-name';
import { formatLastSeenLabel } from '@/utils/presence-format';
import {
  Users,
  UserCheck,
  Clock,
  UserX,
  ShieldBan,
  Share2,
  Search,
  RefreshCw,
  ArrowUpDown,
  MoreVertical,
  MessageSquare,
  Eye,
  UserPlus,
  X,
  Ban,
  CheckCircle,
} from 'lucide-react';

// ─── Row primitives (links dashboard-v1 aesthetic) ─────────────────────────

function RowShell({
  avatar,
  name,
  username,
  meta,
  userId,
  isOnline,
  lastActiveAt,
  actions,
}: {
  avatar?: string | null;
  name: string;
  username?: string;
  meta?: string;
  userId?: string;
  isOnline?: boolean;
  lastActiveAt?: Date | string | null;
  actions?: React.ReactNode;
}) {
  const status = useLiveUserStatus(
    userId,
    typeof isOnline === 'boolean' ? { isOnline, lastActiveAt } : null
  );
  return (
    <li className="flex items-center gap-4 p-4">
      <div className="relative flex-shrink-0">
        <Avatar className="h-12 w-12">
          {avatar ? <AvatarImage src={avatar} alt="" /> : null}
          <AvatarFallback>{getInitials(name || username || '?')}</AvatarFallback>
        </Avatar>
        {typeof isOnline === 'boolean' && (
          <span className="absolute -bottom-0.5 -right-0.5 rounded-full ring-2 ring-white dark:ring-gray-950">
            <OnlineIndicator isOnline={status === 'online'} status={status} size="md" />
          </span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-foreground truncate">{name}</p>
        {username && <p className="text-sm text-muted-foreground truncate">{username}</p>}
        {meta && <p className="text-xs text-muted-foreground/80 truncate">{meta}</p>}
      </div>
      {actions && <div className="flex-shrink-0">{actions}</div>}
    </li>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────

export default function ContactsPage() {
  const router = useRouter();
  const user = useUser();
  const { t, locale } = useI18n('contacts');
  const [activeTab, setActiveTab] = useState<ContactTab>('all');

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
    refresh: refreshBlocked,
  } = useBlockedUsersV2();

  const isLoading = isLoadingContacts || isLoadingRequests || isLoadingBlocked;

  const handleRefreshAll = useCallback(async () => {
    await Promise.all([refreshContacts(), refreshRequests(), refreshBlocked()]);
  }, [refreshContacts, refreshRequests, refreshBlocked]);

  const messageContact = useCallback(
    async (contactId: string) => {
      try {
        const response = await apiService.post<{ id: string }>('/conversations', {
          type: 'direct',
          participantIds: [contactId],
        });
        const data = response as { data?: { success?: boolean; data?: { id: string } } };
        if (data?.data?.data?.id) router.push(`/conversations/${data.data.data.id}`);
      } catch {
        // toast handled by apiService
      }
    },
    [router]
  );

  const connectedUserIds = useMemo(
    () =>
      new Set(connected.map((r) => (r.senderId === user?.id ? r.receiverId : r.senderId))),
    [connected, user?.id]
  );

  const displayContacts = searchQuery.length >= 2 ? searchResults : contacts;

  const stats = useMemo(
    () => ({
      total: contacts.length,
      online: onlineContacts.length,
      connected: requestStats.connected,
      pending: requestStats.pending,
      blocked: blockedUsers.length,
    }),
    [contacts.length, onlineContacts.length, requestStats, blockedUsers.length]
  );

  const TABS: { key: ContactTab; icon: React.ElementType; count: number; activeClass: string }[] = [
    { key: 'all', icon: Users, count: displayContacts.length, activeClass: 'data-[state=active]:bg-blue-500' },
    { key: 'connected', icon: UserCheck, count: requestStats.connected, activeClass: 'data-[state=active]:bg-emerald-500' },
    { key: 'pending', icon: Clock, count: requestStats.pending, activeClass: 'data-[state=active]:bg-amber-500' },
    { key: 'refused', icon: UserX, count: requestStats.refused, activeClass: 'data-[state=active]:bg-rose-500' },
    { key: 'blocked', icon: ShieldBan, count: blockedUsers.length, activeClass: 'data-[state=active]:bg-gray-600' },
    { key: 'affiliates', icon: Share2, count: 0, activeClass: 'data-[state=active]:bg-indigo-500' },
  ];

  const SORT_OPTIONS: { key: ContactSortOption; labelKey: string }[] = [
    { key: 'name', labelKey: 'sort.alphabetical' },
    { key: 'lastSeen', labelKey: 'sort.lastSeen' },
    { key: 'recentlyAdded', labelKey: 'sort.recentlyAdded' },
  ];

  // ─── Row renderers ───────────────────────────────────────────────────────

  const renderContactRow = useCallback(
    (contact: ContactV2) => {
      const pendingReq = getPendingRequestWithUser(contact.id);
      const isFriend = connectedUserIds.has(contact.id);
      return (
        <RowShell
          key={contact.id}
          avatar={contact.avatar}
          name={contact.name}
          username={contact.username}
          meta={formatLastSeenLabel({ isOnline: contact.isOnline, lastActiveAt: contact.lastActiveAt, t, locale })}
          userId={contact.id}
          isOnline={contact.isOnline}
          lastActiveAt={contact.lastActiveAt}
          actions={
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label={t('actions.menu')}>
                  <MoreVertical className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => messageContact(contact.id)}>
                  <MessageSquare className="mr-2 h-4 w-4" />
                  {t('actions.message')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => router.push(`/u/${contact.id}`)}>
                  <Eye className="mr-2 h-4 w-4" />
                  {t('actions.viewProfile')}
                </DropdownMenuItem>
                {!isFriend &&
                  (pendingReq ? (
                    <DropdownMenuItem onClick={() => cancelRequest(pendingReq.id)}>
                      <X className="mr-2 h-4 w-4" />
                      {t('actions.cancel')}
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem onClick={() => sendRequest(contact.id)}>
                      <UserPlus className="mr-2 h-4 w-4" />
                      {t('actions.add')}
                    </DropdownMenuItem>
                  ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => blockUser(contact.id)}
                  className="text-rose-600 focus:text-rose-600"
                >
                  <Ban className="mr-2 h-4 w-4" />
                  {t('actions.block')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          }
        />
      );
    },
    [t, locale, getPendingRequestWithUser, connectedUserIds, messageContact, router, cancelRequest, sendRequest, blockUser]
  );

  const renderRequestRow = useCallback(
    (request: FriendRequest, variant: 'connected' | 'pending' | 'refused') => {
      const isIncoming = request.receiverId === user?.id;
      const other: User | undefined = isIncoming ? request.sender : request.receiver;
      const otherId = isIncoming ? request.senderId : request.receiverId;
      const name = getUserDisplayName(other, '') || otherId;
      return (
        <RowShell
          key={request.id}
          avatar={other?.avatar}
          name={name}
          username={other?.username ? `@${other.username}` : undefined}
          userId={otherId}
          isOnline={other?.isOnline}
          lastActiveAt={other?.lastActiveAt}
          actions={
            <div className="flex items-center gap-2">
              {variant === 'pending' && isIncoming && (
                <>
                  <Button
                    size="sm"
                    onClick={() => acceptRequest(request.id)}
                    className="bg-emerald-600 hover:bg-emerald-700"
                  >
                    <CheckCircle className="mr-1 h-4 w-4" />
                    {t('actions.accept')}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => rejectRequest(request.id)}>
                    {t('actions.reject')}
                  </Button>
                </>
              )}
              {variant === 'pending' && !isIncoming && (
                <Button size="sm" variant="outline" onClick={() => cancelRequest(request.id)}>
                  <X className="mr-1 h-4 w-4" />
                  {t('actions.cancel')}
                </Button>
              )}
              {variant === 'connected' && (
                <Button size="sm" variant="outline" onClick={() => messageContact(otherId)}>
                  <MessageSquare className="mr-1 h-4 w-4" />
                  {t('actions.message')}
                </Button>
              )}
              {variant === 'refused' && (
                <Button size="sm" variant="outline" onClick={() => sendRequest(otherId)}>
                  {t('actions.resend')}
                </Button>
              )}
            </div>
          }
        />
      );
    },
    [user?.id, t, acceptRequest, rejectRequest, cancelRequest, messageContact, sendRequest]
  );

  const renderBlockedRow = useCallback(
    (blocked: BlockedUser) => {
      const name = blocked.displayName || blocked.username || blocked.id;
      return (
        <RowShell
          key={blocked.id}
          avatar={blocked.avatar}
          name={name}
          username={blocked.username ? `@${blocked.username}` : undefined}
          actions={
            <Button size="sm" variant="outline" onClick={() => unblockUser(blocked.id)}>
              {t('actions.unblock')}
            </Button>
          }
        />
      );
    },
    [t, unblockUser]
  );

  // ─── List content per tab ────────────────────────────────────────────────

  const emptyState = (title: string, description: string) => (
    <Card className="border-2 border-dashed border-gray-300 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/50">
      <CardContent className="flex flex-col items-center justify-center py-16 px-6 text-center">
        <div className="relative mb-6">
          <div className="absolute inset-0 bg-gradient-to-r from-blue-500/20 to-indigo-500/20 blur-3xl rounded-full" />
          <div className="relative p-6 bg-gradient-to-br from-blue-100 to-indigo-100 dark:from-blue-900/30 dark:to-indigo-900/30 rounded-3xl">
            <Users className="h-16 w-16 text-blue-600 dark:text-blue-400" />
          </div>
        </div>
        <h3 className="text-2xl font-bold text-foreground mb-3">{title}</h3>
        <p className="text-muted-foreground text-base max-w-md">{description}</p>
      </CardContent>
    </Card>
  );

  const listCard = (children: React.ReactNode) => (
    <Card className="border-2 shadow-lg bg-white dark:bg-gray-950 overflow-hidden">
      <ul role="list" className="divide-y divide-gray-100 dark:divide-gray-800">
        {children}
      </ul>
    </Card>
  );

  const loadingCard = (
    <Card className="border-2 bg-white dark:bg-gray-950">
      <CardContent className="flex flex-col items-center justify-center py-16">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-gray-200 border-t-primary" />
        <p className="mt-4 text-muted-foreground font-medium">{t('loading')}</p>
      </CardContent>
    </Card>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-950 dark:to-gray-900 flex flex-col">
      <DashboardLayout
        title={t('title')}
        className="!bg-none !bg-transparent !h-auto !max-w-none !px-0"
      >
        <div className="relative z-10 space-y-8 pb-8 w-full py-8 px-4 md:px-8">
          {/* Hero */}
          <header className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-700 p-8 md:p-12 text-white shadow-2xl">
            <div className="absolute inset-0 bg-black/10" />
            <div className="relative z-10">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-3 bg-white/20 backdrop-blur-sm rounded-2xl">
                  <Users className="h-8 w-8" />
                </div>
                <h1 className="text-4xl md:text-5xl font-bold">{t('title')}</h1>
              </div>
              <p className="text-lg md:text-xl text-blue-100 max-w-2xl">{t('subtitle')}</p>
            </div>
            <div className="absolute -right-12 -bottom-12 w-48 h-48 bg-white/10 rounded-full blur-3xl" />
            <div className="absolute -left-12 -top-12 w-64 h-64 bg-purple-500/20 rounded-full blur-3xl" />
          </header>

          {/* Controls: tabs + stats + search */}
          <Card className="border-2 shadow-lg bg-white dark:bg-gray-950">
            <CardContent className="p-6 space-y-6">
              <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as ContactTab)}>
                <TabsList className="w-full grid grid-cols-3 md:grid-cols-6 h-auto p-1.5 bg-gray-100 dark:bg-gray-800 gap-1">
                  {TABS.map(({ key, icon: Icon, count, activeClass }) => (
                    <TabsTrigger
                      key={key}
                      value={key}
                      className={`${activeClass} data-[state=active]:text-white py-2 px-2 rounded-lg font-medium transition-all flex flex-col md:flex-row items-center justify-center gap-1 md:gap-2`}
                    >
                      <Icon className="h-4 w-4" />
                      <span className="text-xs md:text-sm">{t(`tabs.${key}`)}</span>
                      {count > 0 && (
                        <span className="text-[10px] md:text-xs px-1.5 rounded-full bg-black/10">
                          {count}
                        </span>
                      )}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>

              {/* Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-muted-foreground">{t('stats.totalContacts')}</p>
                  <p className="text-2xl font-bold text-foreground">{stats.total}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium text-muted-foreground">{t('stats.online')}</p>
                  <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{stats.online}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium text-muted-foreground">{t('stats.connected')}</p>
                  <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{stats.connected}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium text-muted-foreground">{t('stats.pending')}</p>
                  <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{stats.pending}</p>
                </div>
              </div>

              {/* Search + sort */}
              <div className="flex flex-col md:flex-row gap-4">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <Input
                    type="search"
                    placeholder={t('searchPlaceholder')}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    aria-label={t('searchPlaceholder')}
                    className="pl-10 h-12 text-base border-2 focus:border-primary"
                  />
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="h-12 px-5 gap-2">
                      <ArrowUpDown className="h-4 w-4" />
                      {t('sort.label') || 'Trier'}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {SORT_OPTIONS.map((opt) => (
                      <DropdownMenuItem
                        key={opt.key}
                        onClick={() => setSortBy(opt.key)}
                        className={sortBy === opt.key ? 'font-semibold text-primary' : ''}
                      >
                        {t(opt.labelKey)}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button variant="outline" className="h-12 px-4" onClick={handleRefreshAll} aria-label={t('actions.menu')}>
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Error */}
          {contactsError && (
            <Card className="border-2 border-rose-300 bg-rose-50 dark:bg-rose-950/30">
              <CardContent className="p-4">
                <p className="text-rose-700 dark:text-rose-300" role="alert">{contactsError}</p>
              </CardContent>
            </Card>
          )}

          {/* Lists */}
          <section aria-label={t(`tabs.${activeTab}`)} aria-live="polite">
            {isLoading ? (
              loadingCard
            ) : activeTab === 'all' ? (
              displayContacts.length === 0 ? (
                emptyState(
                  searchQuery ? t('messages.noContactsFound') : t('messages.noContacts'),
                  searchQuery ? t('messages.noContactsFoundDescription') : t('messages.noContactsDescription')
                )
              ) : (
                <div className="space-y-4">
                  {!searchQuery && onlineContacts.length > 0 && (
                    <>
                      <h2 className="text-sm font-semibold px-1 text-muted-foreground uppercase tracking-wider">
                        {t('sections.online')} ({onlineContacts.length})
                      </h2>
                      {listCard(onlineContacts.map(renderContactRow))}
                      {offlineContacts.length > 0 && (
                        <h2 className="text-sm font-semibold px-1 pt-2 text-muted-foreground uppercase tracking-wider">
                          {t('sections.offline')} ({offlineContacts.length})
                        </h2>
                      )}
                    </>
                  )}
                  {listCard((searchQuery ? displayContacts : offlineContacts).map(renderContactRow))}
                </div>
              )
            ) : activeTab === 'connected' ? (
              connected.length === 0
                ? emptyState(t('messages.noConnectedContacts'), t('messages.noConnectedContactsDescription'))
                : listCard(connected.map((r) => renderRequestRow(r, 'connected')))
            ) : activeTab === 'pending' ? (
              pending.length === 0
                ? emptyState(t('messages.noPendingRequests'), t('messages.noPendingRequestsDescription'))
                : listCard(pending.map((r) => renderRequestRow(r, 'pending')))
            ) : activeTab === 'refused' ? (
              refused.length === 0
                ? emptyState(t('messages.noRefusedRequests'), t('messages.noRefusedRequestsDescription'))
                : listCard(refused.map((r) => renderRequestRow(r, 'refused')))
            ) : activeTab === 'blocked' ? (
              blockedUsers.length === 0
                ? emptyState(t('messages.noBlockedUsers'), t('messages.noBlockedUsersDescription'))
                : listCard(blockedUsers.map(renderBlockedRow))
            ) : (
              emptyState(t('messages.noAffiliateContacts'), t('messages.noAffiliateContactsDescription'))
            )}

            {isSearching && (
              <div className="flex justify-center py-4">
                <div className="animate-spin rounded-full h-6 w-6 border-2 border-primary border-t-transparent" />
              </div>
            )}
          </section>
        </div>
      </DashboardLayout>

      <div className="w-screen relative left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] mt-16">
        <Footer />
      </div>
    </div>
  );
}
