'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MessageSquare, Users, Clock, Loader2, Paperclip, ShieldCheck, X } from 'lucide-react';
import { apiService } from '@/services/api.service';
import { useI18n } from '@/hooks/use-i18n';
import { useCurrentInterfaceLanguage } from '@/stores/language-store';
import { useUser } from '@/stores';
import { buildAttachmentUrl } from '@/utils/attachment-url';

/**
 * Doit rester égal à `REASON_MIN_LENGTH` dans
 * `services/gateway/src/routes/admin/conversation-messages-sovereign.ts` —
 * le schéma AJV de `GET /admin/conversations/:conversationId/messages` y
 * refuse tout `reason` plus court avec un 400, AVANT le handler. Le web ne
 * peut pas importer cette constante depuis le gateway (paquets distincts) ;
 * elle est donc recopiée ICI, et doit être tenue à jour si le seuil serveur
 * change (issue #4383).
 */
const SOVEREIGN_REASON_MIN_LENGTH = 10;

interface ParticipantUser {
  id: string;
  username: string;
  displayName: string | null;
  avatar: string | null;
}

interface ConversationParticipant {
  id: string;
  userId: string | null;
  type?: string;
  displayName: string | null;
  avatar: string | null;
  role: string;
  joinedAt: string | null;
  isActive: boolean;
  isOnline?: boolean;
  nickname: string | null;
  user: ParticipantUser | null;
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
  participants: ConversationParticipant[];
  membership: ConversationParticipant | null;
}

interface PaginatedConversations {
  success: boolean;
  data: AdminUserConversation[];
  pagination?: { total: number; offset: number; limit: number; hasMore: boolean };
}

interface PaginatedParticipants {
  success: boolean;
  data: ConversationParticipant[];
  pagination?: { total: number; offset: number; limit: number; hasMore: boolean };
}

type ParticipantLike = Pick<ConversationParticipant, 'displayName' | 'nickname' | 'avatar' | 'user'>;

interface AdminConversationMessage {
  id: string;
  content: string;
  originalLanguage: string;
  messageType: string;
  messageSource: string;
  isEdited: boolean;
  editedAt: string | null;
  deletedAt: string | null;
  replyToId: string | null;
  createdAt: string;
  sender: ParticipantLike | null;
  attachmentCount: number;
}

interface PaginatedMessages {
  success: boolean;
  data: AdminConversationMessage[];
  pagination?: { total: number; offset: number; limit: number; hasMore: boolean };
}

const PAGE_SIZE = 20;
const MEMBERS_PAGE_SIZE = 30;
const MESSAGES_PAGE_SIZE = 30;

function formatDate(date: string | null, locale: string) {
  if (!date) return '—';
  try {
    return new Date(date).toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' });
  } /* istanbul ignore next -- toLocaleDateString never throws in practice */ catch {
    return '—';
  }
}

function formatDateTime(date: string | null, locale: string) {
  if (!date) return '—';
  try {
    return new Date(date).toLocaleString(locale, {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  } /* istanbul ignore next -- toLocaleString never throws in practice */ catch {
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

function participantName(p: ParticipantLike): string {
  return p.user?.displayName || p.nickname || p.displayName || p.user?.username || '?';
}

function ParticipantAvatar({ p, size = 28 }: { p: ParticipantLike; size?: number }) {
  const avatar = p.user?.avatar || p.avatar;
  const name = participantName(p);
  return (
    <div
      className="rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-xs font-medium overflow-hidden flex-shrink-0"
      style={{ width: size, height: size }}
    >
      {avatar ? (
        <img src={buildAttachmentUrl(avatar) ?? undefined} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />
      ) : (
        name.charAt(0).toUpperCase()
      )}
    </div>
  );
}

function GroupMembersModal({ conversation, onClose }: { conversation: AdminUserConversation; onClose: () => void }) {
  const { t } = useI18n('admin');
  const [members, setMembers] = useState<ConversationParticipant[]>([]);
  const [total, setTotal] = useState(conversation.memberCount);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = async (nextOffset: number, replace: boolean) => {
    if (replace) setLoading(true); else setLoadingMore(true);
    try {
      const resp = await apiService.get<PaginatedParticipants>(
        `/admin/conversations/${conversation.id}/participants`,
        { offset: nextOffset, limit: MEMBERS_PAGE_SIZE }
      );
      const page = resp.data?.data ?? [];
      const pagination = resp.data?.pagination;
      setMembers(prev => (replace ? page : [...prev, ...page]));
      setTotal(pagination?.total ?? page.length);
      setHasMore(pagination?.hasMore ?? false);
      setOffset(nextOffset + page.length);
    } catch (err) {
      console.error('Error fetching conversation participants:', err);
    } finally {
      if (replace) setLoading(false); else setLoadingMore(false);
    }
  };

  useEffect(() => {
    load(0, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation.id]);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <Card
        className="w-full max-w-md max-h-[80vh] flex flex-col dark:bg-gray-900 dark:border-gray-800"
        onClick={(e) => e.stopPropagation()}
      >
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2 dark:text-gray-100 text-base min-w-0">
            <Users className="h-5 w-5 flex-shrink-0" />
            <span className="truncate">{conversation.title || conversation.identifier || t('usersDetail.membersModalTitle')}</span>
            <Badge variant="secondary" className="text-xs flex-shrink-0">{total}</Badge>
          </CardTitle>
          <button onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 flex-shrink-0">
            <X className="h-5 w-5" />
          </button>
        </CardHeader>
        <CardContent className="space-y-2 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
            </div>
          ) : (
            <>
              {members.map(m => {
                const roleKey = CONV_ROLE_KEYS[m.role];
                return (
                  <div key={m.id} className="flex items-center justify-between gap-2 p-2 border dark:border-gray-700 rounded-md">
                    <div className="flex items-center gap-2 min-w-0">
                      <ParticipantAvatar p={m} />
                      <div className="min-w-0">
                        <div className="text-sm font-medium dark:text-gray-100 truncate">{participantName(m)}</div>
                        {m.user?.username && <div className="text-xs text-gray-500 dark:text-gray-400 truncate">@{m.user.username}</div>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {!m.isActive && <Badge variant="outline" className="text-xs">{t('usersDetail.inactiveBadge')}</Badge>}
                      {roleKey && <Badge variant="secondary" className="text-xs">{t(roleKey)}</Badge>}
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
    </div>
  );
}

/**
 * Motif écrit d'une lecture souveraine (#4383) — la garde CLIENT qui précède
 * `ConversationMessagesModal`. `requireSovereign()` réserve déjà la route
 * elle-même à BIGBOSS côté serveur ; ce prompt évite l'aller-retour réseau
 * (403 systématique pour tout autre rôle, 400 systématique sans motif) et
 * DIT à l'opérateur pourquoi on le lui demande — le taire le priverait de
 * l'information qui justifie la question (issue #4383, critère 3).
 */
function SovereignReasonModal({
  conversation,
  onCancel,
  onConfirm,
}: {
  conversation: AdminUserConversation;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const { t } = useI18n('admin');
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);
  const trimmed = reason.trim();
  const tooShort = trimmed.length < SOVEREIGN_REASON_MIN_LENGTH;

  const handleConfirm = () => {
    setTouched(true);
    if (tooShort) return;
    onConfirm(trimmed);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onCancel}>
      <Card
        className="w-full max-w-md dark:bg-gray-900 dark:border-gray-800"
        onClick={(e) => e.stopPropagation()}
      >
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2 dark:text-gray-100 text-base min-w-0">
            <ShieldCheck className="h-5 w-5 flex-shrink-0" />
            <span className="truncate">{t('usersDetail.sovereignReasonTitle')}</span>
          </CardTitle>
          <button onClick={onCancel} aria-label="Close" className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 flex-shrink-0">
            <X className="h-5 w-5" />
          </button>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {t('usersDetail.sovereignReasonNotice')}
          </p>
          <div className="space-y-1">
            <label htmlFor="sovereign-reason-input" className="text-xs font-medium dark:text-gray-200">
              {t('usersDetail.sovereignReasonLabel')}
            </label>
            <textarea
              id="sovereign-reason-input"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              onBlur={() => setTouched(true)}
              placeholder={t('usersDetail.sovereignReasonPlaceholder')}
              rows={3}
              className="w-full text-sm border dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 rounded-md p-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <p className="text-[11px] text-gray-400 dark:text-gray-500">
              {t('usersDetail.sovereignReasonHint', { min: String(SOVEREIGN_REASON_MIN_LENGTH) })}
            </p>
            {touched && tooShort && (
              <p className="text-[11px] text-red-600 dark:text-red-400">
                {t('usersDetail.sovereignReasonTooShort', { min: String(SOVEREIGN_REASON_MIN_LENGTH) })}
              </p>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button
              onClick={onCancel}
              className="text-xs px-3 py-1.5 rounded-md border dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              {t('usersDetail.cancelButton')}
            </button>
            <button
              onClick={handleConfirm}
              disabled={tooShort}
              className="text-xs px-3 py-1.5 rounded-md bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {t('usersDetail.sovereignReasonConfirm')}
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ConversationMessagesModal({
  conversation,
  reason,
  onClose,
}: {
  conversation: AdminUserConversation;
  reason: string;
  onClose: () => void;
}) {
  const { t } = useI18n('admin');
  const locale = useCurrentInterfaceLanguage();
  const [messages, setMessages] = useState<AdminConversationMessage[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const pagingRef = useRef({ offset: 0, hasMore: false, busy: true });

  const load = async (nextOffset: number, replace: boolean) => {
    pagingRef.current.busy = true;
    if (replace) setLoading(true); else setLoadingMore(true);
    try {
      const resp = await apiService.get<PaginatedMessages>(
        `/admin/conversations/${conversation.id}/messages`,
        { offset: nextOffset, limit: MESSAGES_PAGE_SIZE, reason }
      );
      const page = resp.data?.data ?? [];
      const pagination = resp.data?.pagination;
      setMessages(prev => (replace ? page : [...prev, ...page]));
      setTotal(pagination?.total ?? page.length);
      pagingRef.current = { offset: nextOffset + page.length, hasMore: pagination?.hasMore ?? false, busy: false };
    } catch (err) {
      console.error('Error fetching conversation messages:', err);
      pagingRef.current.busy = false;
    } finally {
      if (replace) setLoading(false); else setLoadingMore(false);
    }
  };

  useEffect(() => {
    load(0, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation.id]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const { offset: nextOffset, hasMore, busy } = pagingRef.current;
        if (entries.some(e => e.isIntersecting) && hasMore && !busy) {
          load(nextOffset, false);
        }
      },
      { root: scrollRef.current, rootMargin: '120px' }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation.id]);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <Card
        className="w-full max-w-2xl max-h-[85vh] flex flex-col dark:bg-gray-900 dark:border-gray-800"
        onClick={(e) => e.stopPropagation()}
      >
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2 dark:text-gray-100 text-base min-w-0">
            <MessageSquare className="h-5 w-5 flex-shrink-0" />
            <span className="truncate">{conversation.title || conversation.identifier || t('usersDetail.messagesModalTitle')}</span>
            <Badge variant="secondary" className="text-xs flex-shrink-0">{total}</Badge>
          </CardTitle>
          <button onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 flex-shrink-0">
            <X className="h-5 w-5" />
          </button>
        </CardHeader>
        <p
          className="flex items-center gap-1 text-[11px] text-amber-700 dark:text-amber-400 px-4 pb-2 -mt-2 truncate"
          title={reason}
        >
          <ShieldCheck className="h-3 w-3 flex-shrink-0" />
          {t('usersDetail.sovereignReadTrackedNotice', { reason })}
        </p>
        <CardContent className="flex-1 min-h-0 overflow-hidden p-0">
          <div ref={scrollRef} className="h-full max-h-[70vh] overflow-y-auto px-4 pb-4 space-y-2">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
              </div>
            ) : messages.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400 py-8 text-center">{t('usersDetail.noMessages')}</p>
            ) : (
              messages.map(msg => (
                <div key={msg.id} className="flex items-start gap-2 p-2 border dark:border-gray-700 rounded-md">
                  {msg.sender && <ParticipantAvatar p={msg.sender} size={24} />}
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      {msg.sender && (
                        <span className="text-xs font-medium dark:text-gray-100">{participantName(msg.sender)}</span>
                      )}
                      {msg.sender?.user?.username && (
                        <span className="text-xs text-gray-500 dark:text-gray-400">@{msg.sender.user.username}</span>
                      )}
                      <Badge variant="outline" className="text-[10px] px-1">{msg.originalLanguage}</Badge>
                      {msg.isEdited && (
                        <Badge variant="outline" className="text-[10px] px-1">{t('usersDetail.editedBadge')}</Badge>
                      )}
                      {msg.deletedAt && (
                        <Badge variant="destructive" className="text-[10px] px-1">{t('usersDetail.deletedBadge')}</Badge>
                      )}
                    </div>
                    <p className={`text-sm break-words whitespace-pre-wrap ${msg.deletedAt ? 'line-through text-gray-400 dark:text-gray-500' : 'text-gray-700 dark:text-gray-300'}`}>
                      {msg.content}
                    </p>
                    <div className="flex items-center gap-2 text-[11px] text-gray-400 dark:text-gray-500">
                      <span>{formatDateTime(msg.createdAt, locale)}</span>
                      {msg.attachmentCount > 0 && (
                        <span className="flex items-center gap-0.5">
                          <Paperclip className="h-3 w-3" />
                          <span>{msg.attachmentCount}</span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
            {loadingMore && (
              <div className="flex items-center justify-center py-3">
                <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
              </div>
            )}
            <div ref={sentinelRef} aria-hidden="true" className="h-px" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export function UserConversationsSection({ userId }: { userId: string }) {
  const { t } = useI18n('admin');
  const locale = useCurrentInterfaceLanguage();
  const currentUser = useUser();
  // `GET /admin/conversations/:id/messages` est en régime souverain côté
  // serveur (`requireSovereign()`, #4383) : BIGBOSS et lui seul, sinon 403.
  // Un contrôle voué au 403 ne se propose pas — le bouton "view messages"
  // n'existe même pas pour les autres rôles.
  const isSovereignReader = currentUser?.role === 'BIGBOSS';
  const [conversations, setConversations] = useState<AdminUserConversation[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalConversation, setModalConversation] = useState<AdminUserConversation | null>(null);
  const [reasonPromptConversation, setReasonPromptConversation] = useState<AdminUserConversation | null>(null);
  const [messagesModal, setMessagesModal] = useState<{ conversation: AdminUserConversation; reason: string } | null>(null);

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
              const isDirect = conv.type === 'direct';
              // For direct conversations, surface the *other* participants inline.
              const others = (conv.participants ?? []).filter(p => p.userId !== userId);
              return (
                <div key={conv.id} className="p-3 border dark:border-gray-700 rounded-md bg-white dark:bg-gray-900 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-xs font-medium overflow-hidden flex-shrink-0">
                        {conv.avatar ? (
                          <img src={buildAttachmentUrl(conv.avatar) ?? undefined} alt="" loading="lazy" decoding="async" className="w-8 h-8 rounded-full object-cover" />
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

                  {/* Direct → list the other participants; group/other → members modal.
                      Every conversation exposes the messages modal. */}
                  {isDirect && others.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2">
                      {others.map(p => (
                        <div key={p.id} className="flex items-center gap-1.5 bg-gray-50 dark:bg-gray-800 rounded-full pl-1 pr-2 py-0.5">
                          <ParticipantAvatar p={p} size={20} />
                          <span className="text-xs dark:text-gray-200 truncate max-w-[140px]">{participantName(p)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-3">
                    {!isDirect && (
                      <button
                        onClick={() => setModalConversation(conv)}
                        className="flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
                      >
                        <Users className="h-3 w-3" />
                        <span>{t('usersDetail.viewMembers')} ({conv.memberCount})</span>
                      </button>
                    )}
                    {isSovereignReader && (
                      <button
                        onClick={() => setReasonPromptConversation(conv)}
                        className="flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
                      >
                        <MessageSquare className="h-3 w-3" />
                        <span>{t('usersDetail.viewMessages')}</span>
                      </button>
                    )}
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

      {modalConversation && (
        <GroupMembersModal conversation={modalConversation} onClose={() => setModalConversation(null)} />
      )}

      {reasonPromptConversation && (
        <SovereignReasonModal
          conversation={reasonPromptConversation}
          onCancel={() => setReasonPromptConversation(null)}
          onConfirm={(reason) => {
            setMessagesModal({ conversation: reasonPromptConversation, reason });
            setReasonPromptConversation(null);
          }}
        />
      )}

      {messagesModal && (
        <ConversationMessagesModal
          conversation={messagesModal.conversation}
          reason={messagesModal.reason}
          onClose={() => setMessagesModal(null)}
        />
      )}
    </Card>
  );
}
