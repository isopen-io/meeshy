'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MessageSquare, Users, Clock, Loader2, ShieldCheck } from 'lucide-react';
import { apiService } from '@/services/api.service';
import { useI18n } from '@/hooks/use-i18n';
import { useCurrentInterfaceLanguage } from '@/stores/language-store';

interface ConversationMembership {
  role: string;
  joinedAt: string | null;
  isActive: boolean;
  nickname: string | null;
}

interface AdminUserConversation {
  id: string;
  identifier: string | null;
  title: string | null;
  type: string;
  avatar: string | null;
  isActive: boolean;
  memberCount: number;
  communityId: string | null;
  createdAt: string;
  lastMessageAt: string | null;
  membership: ConversationMembership | null;
}

interface PaginatedConversations {
  success: boolean;
  data: AdminUserConversation[];
  pagination?: { total: number; offset: number; limit: number; hasMore: boolean };
}

const PAGE_SIZE = 20;

function formatDate(date: string | null, locale: string) {
  if (!date) return '—';
  try {
    return new Date(date).toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return '—';
  }
}

const CONV_TYPE_META: Record<string, { key: string; cls: string }> = {
  direct: { key: 'usersDetail.convTypeDirect', cls: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' },
  group: { key: 'usersDetail.convTypeGroup', cls: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300' },
  public: { key: 'usersDetail.convTypePublic', cls: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' },
  global: { key: 'usersDetail.convTypeGlobal', cls: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300' },
  broadcast: { key: 'usersDetail.convTypeBroadcast', cls: 'bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-300' },
};

const CONV_ROLE_KEYS: Record<string, string> = {
  admin: 'usersDetail.convRoleAdmin',
  moderator: 'usersDetail.convRoleModerator',
  member: 'usersDetail.convRoleMember',
};

export function UserConversationsSection({ userId }: { userId: string }) {
  const { t } = useI18n('admin');
  const locale = useCurrentInterfaceLanguage();
  const [conversations, setConversations] = useState<AdminUserConversation[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async (nextOffset: number, replace: boolean) => {
    if (replace) setLoading(true); else setLoadingMore(true);
    try {
      const resp = await apiService.get<PaginatedConversations>(
        `/admin/users/${userId}/conversations`,
        { offset: nextOffset, limit: PAGE_SIZE }
      );
      const page = resp.data?.data ?? [];
      const pagination = resp.data?.pagination;
      setConversations(prev => (replace ? page : [...prev, ...page]));
      setTotal(pagination?.total ?? page.length);
      setHasMore(pagination?.hasMore ?? false);
      setOffset(nextOffset + page.length);
      setError(null);
    } catch (err) {
      console.error('Error fetching user conversations:', err);
      setError(t('usersDetail.loadError'));
    } finally {
      if (replace) setLoading(false); else setLoadingMore(false);
    }
  };

  useEffect(() => {
    setConversations([]);
    setOffset(0);
    setError(null);
    load(0, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  if (loading) {
    return (
      <Card className="dark:bg-gray-900 dark:border-gray-800">
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
          <span className="ml-2 text-sm text-gray-500">{t('usersDetail.loadingConversations')}</span>
        </CardContent>
      </Card>
    );
  }

  if (error) return null;

  return (
    <Card className="dark:bg-gray-900 dark:border-gray-800">
      <CardHeader>
        <CardTitle className="flex items-center space-x-2 dark:text-gray-100">
          <MessageSquare className="h-5 w-5" />
          <span>{t('usersDetail.conversationsTitle')}</span>
          <Badge variant="secondary" className="text-xs">{total}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {conversations.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400 py-2">{t('usersDetail.noConversations')}</p>
        ) : (
          <>
            {conversations.map(conv => {
              const typeMeta = CONV_TYPE_META[conv.type];
              const roleKey = conv.membership?.role ? CONV_ROLE_KEYS[conv.membership.role] : null;
              return (
                <div key={conv.id} className="p-3 border dark:border-gray-700 rounded-md bg-white dark:bg-gray-900 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-xs font-medium overflow-hidden flex-shrink-0">
                        {conv.avatar ? (
                          <img src={conv.avatar} alt="" className="w-8 h-8 rounded-full object-cover" />
                        ) : (
                          (conv.title || conv.identifier || '#').charAt(0).toUpperCase()
                        )}
                      </div>
                      <span className="font-medium text-sm dark:text-gray-100 truncate">
                        {conv.title || conv.identifier || conv.id}
                      </span>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${typeMeta?.cls ?? 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300'}`}>
                      {typeMeta ? t(typeMeta.key) : conv.type}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs text-gray-600 dark:text-gray-400">
                    <div className="flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      <span>{conv.memberCount} {t('usersDetail.membersWord')}</span>
                    </div>
                    {roleKey && (
                      <div className="flex items-center gap-1">
                        <ShieldCheck className="h-3 w-3" />
                        <span>{t(roleKey)}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      <span>{formatDate(conv.lastMessageAt, locale)}</span>
                    </div>
                    {!conv.isActive && (
                      <Badge variant="outline" className="text-xs w-fit">{t('usersDetail.inactiveBadge')}</Badge>
                    )}
                  </div>
                </div>
              );
            })}
            {hasMore && (
              <button
                onClick={() => load(offset, false)}
                disabled={loadingMore}
                className="w-full text-sm text-indigo-600 dark:text-indigo-400 hover:underline py-2 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loadingMore && <Loader2 className="h-4 w-4 animate-spin" />}
                {t('usersDetail.loadMore')}
              </button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
