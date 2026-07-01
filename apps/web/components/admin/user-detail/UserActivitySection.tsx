'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { isExpired } from '@/utils/time-remaining';
import { Badge } from '@/components/ui/badge';
import {
  Activity,
  Share2,
  Target,
  Link2,
  UserPlus,
  UserCheck,
  ExternalLink,
  Clock,
  Users,
  ChevronDown,
  ChevronUp,
  Loader2,
} from 'lucide-react';

import { apiService } from '@/services/api.service';
import { useI18n } from '@/hooks/use-i18n';
import { useCurrentInterfaceLanguage } from '@/stores/language-store';

interface ShareLink {
  id: string;
  linkId: string;
  identifier: string | null;
  name: string | null;
  description: string | null;
  maxUses: number | null;
  currentUses: number;
  maxConcurrentUsers: number | null;
  currentConcurrentUsers: number;
  isActive: boolean;
  expiresAt: string | null;
  createdAt: string;
  conversation: { id: string; identifier: string | null } | null;
  _count: { anonymousParticipants: number };
}

interface TrackingLink {
  id: string;
  token: string;
  name: string | null;
  campaign: string | null;
  source: string | null;
  medium: string | null;
  originalUrl: string;
  shortUrl: string | null;
  totalClicks: number;
  uniqueClicks: number;
  isActive: boolean;
  expiresAt: string | null;
  createdAt: string;
  lastClickedAt: string | null;
}

interface AffiliateToken {
  id: string;
  token: string;
  name: string | null;
  maxUses: number | null;
  currentUses: number;
  clickCount: number;
  isActive: boolean;
  expiresAt: string | null;
  createdAt: string;
  _count: { affiliations: number };
}

interface ContactRequest {
  id: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  sender?: { id: string; username: string; displayName: string | null; avatar: string | null };
  receiver?: { id: string; username: string; displayName: string | null; avatar: string | null };
}

interface ActivityData {
  shareLinks: ShareLink[];
  trackingLinks: TrackingLink[];
  affiliateTokens: AffiliateToken[];
  contacts: {
    sent: ContactRequest[];
    received: ContactRequest[];
  };
}

function formatDate(date: string | null, locale: string) {
  if (!date) return 'N/A';
  try {
    return new Date(date).toLocaleDateString(locale, {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } /* istanbul ignore next -- toLocaleDateString never throws in practice */ catch {
    return 'N/A';
  }
}

function StatusBadge({ active, expired }: { active: boolean; expired: boolean }) {
  const { t } = useI18n('admin');
  if (expired) return <Badge variant="outline" className="text-xs">{t('usersDetail.expiredBadge')}</Badge>;
  if (active) return <Badge variant="default" className="text-xs bg-green-600">{t('usersDetail.activeBadge')}</Badge>;
  return <Badge variant="secondary" className="text-xs">{t('usersDetail.inactiveBadge')}</Badge>;
}


function CollapsibleSection({
  title,
  icon: Icon,
  count,
  children,
  defaultOpen = false,
}: {
  title: string;
  icon: React.ElementType;
  count: number;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  if (count === 0) return null;

  return (
    <div className="border dark:border-gray-700 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(prev => !prev)}
        className="w-full flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-750 transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
          <span className="font-semibold text-sm dark:text-gray-100">{title}</span>
          <Badge variant="secondary" className="text-xs">{count}</Badge>
        </div>
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>
      {open && <div className="p-4 space-y-3">{children}</div>}
    </div>
  );
}

function ShareLinkCard({ link }: { link: ShareLink }) {
  const { t, locale } = useI18n('admin');
  const expired = isExpired(link.expiresAt);
  return (
    <div className="p-3 border dark:border-gray-700 rounded-md bg-white dark:bg-gray-900 space-y-2">
      <div className="flex items-center justify-between">
        <span className="font-medium text-sm dark:text-gray-100">
          {link.name || link.identifier || link.linkId}
        </span>
        <StatusBadge active={link.isActive} expired={expired} />
      </div>
      {link.description && (
        <p className="text-xs text-gray-500 dark:text-gray-400">{link.description}</p>
      )}
      <div className="grid grid-cols-2 gap-2 text-xs text-gray-600 dark:text-gray-400">
        <div className="flex items-center gap-1">
          <Users className="h-3 w-3" />
          <span>{t('usersDetail.usageLabel', { current: String(link.currentUses), max: link.maxUses ? `/${link.maxUses}` : '' })}</span>
        </div>
        <div className="flex items-center gap-1">
          <UserPlus className="h-3 w-3" />
          <span>{t('usersDetail.anonymousLabel', { count: String(link._count.anonymousParticipants) })}</span>
        </div>
        <div className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          <span>{t('usersDetail.createdOnLabel', { date: formatDate(link.createdAt, locale) })}</span>
        </div>
        {link.conversation?.identifier && (
          <div className="flex items-center gap-1">
            <ExternalLink className="h-3 w-3" />
            <span className="truncate">{link.conversation.identifier}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function TrackingLinkCard({ link }: { link: TrackingLink }) {
  const { t, locale } = useI18n('admin');
  const expired = isExpired(link.expiresAt);
  const conversionRate = link.totalClicks > 0
    ? ((link.uniqueClicks / link.totalClicks) * 100).toFixed(1)
    : '0';

  return (
    <div className="p-3 border dark:border-gray-700 rounded-md bg-white dark:bg-gray-900 space-y-2">
      <div className="flex items-center justify-between">
        <span className="font-medium text-sm dark:text-gray-100">
          {link.name || link.token}
        </span>
        <StatusBadge active={link.isActive} expired={expired} />
      </div>
      {link.campaign && (
        <div className="flex gap-1 flex-wrap">
          <Badge variant="outline" className="text-xs">{link.campaign}</Badge>
          {link.source && <Badge variant="outline" className="text-xs">{link.source}</Badge>}
          {link.medium && <Badge variant="outline" className="text-xs">{link.medium}</Badge>}
        </div>
      )}
      <div className="text-xs text-gray-500 dark:text-gray-400 truncate font-mono">
        {link.originalUrl}
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="p-2 bg-gray-50 dark:bg-gray-800 rounded">
          <div className="text-lg font-bold text-indigo-600 dark:text-indigo-400">{link.totalClicks}</div>
          <div className="text-xs text-gray-500 dark:text-gray-400">{t('usersDetail.totalClicksLabel')}</div>
        </div>
        <div className="p-2 bg-gray-50 dark:bg-gray-800 rounded">
          <div className="text-lg font-bold text-green-600 dark:text-green-400">{link.uniqueClicks}</div>
          <div className="text-xs text-gray-500 dark:text-gray-400">{t('usersDetail.uniqueClicksLabel')}</div>
        </div>
        <div className="p-2 bg-gray-50 dark:bg-gray-800 rounded">
          <div className="text-lg font-bold text-amber-600 dark:text-amber-400">{conversionRate}%</div>
          <div className="text-xs text-gray-500 dark:text-gray-400">{t('usersDetail.uniqueRateLabel')}</div>
        </div>
      </div>
      <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
        <span>{t('usersDetail.createdOnLabel', { date: formatDate(link.createdAt, locale) })}</span>
        {link.lastClickedAt && <span>{t('usersDetail.lastClickLabel', { date: formatDate(link.lastClickedAt, locale) })}</span>}
      </div>
    </div>
  );
}

function AffiliateTokenCard({ token }: { token: AffiliateToken }) {
  const { t, locale } = useI18n('admin');
  const expired = isExpired(token.expiresAt);
  const conversionRate = token.clickCount > 0
    ? ((token._count.affiliations / token.clickCount) * 100).toFixed(1)
    : '0';

  return (
    <div className="p-3 border dark:border-gray-700 rounded-md bg-white dark:bg-gray-900 space-y-2">
      <div className="flex items-center justify-between">
        <span className="font-medium text-sm dark:text-gray-100">
          {token.name || token.token}
        </span>
        <StatusBadge active={token.isActive} expired={expired} />
      </div>
      <div className="text-xs text-gray-500 dark:text-gray-400 font-mono truncate">
        {token.token}
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="p-2 bg-gray-50 dark:bg-gray-800 rounded">
          <div className="text-lg font-bold text-indigo-600 dark:text-indigo-400">{token.clickCount}</div>
          <div className="text-xs text-gray-500 dark:text-gray-400">{t('usersDetail.clicksLabel')}</div>
        </div>
        <div className="p-2 bg-gray-50 dark:bg-gray-800 rounded">
          <div className="text-lg font-bold text-green-600 dark:text-green-400">{token._count.affiliations}</div>
          <div className="text-xs text-gray-500 dark:text-gray-400">{t('usersDetail.registeredLabel')}</div>
        </div>
        <div className="p-2 bg-gray-50 dark:bg-gray-800 rounded">
          <div className="text-lg font-bold text-amber-600 dark:text-amber-400">{conversionRate}%</div>
          <div className="text-xs text-gray-500 dark:text-gray-400">{t('usersDetail.conversionLabel')}</div>
        </div>
      </div>
      <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
        <span>{t('usersDetail.createdOnLabel', { date: formatDate(token.createdAt, locale) })}</span>
        <span>{t('usersDetail.usageLabel', { current: String(token.currentUses), max: token.maxUses ? `/${token.maxUses}` : '' })}</span>
      </div>
    </div>
  );
}

function ContactCard({ request, direction }: { request: ContactRequest; direction: 'sent' | 'received' }) {
  const locale = useCurrentInterfaceLanguage();
  const person = direction === 'sent' ? request.receiver : request.sender;
  if (!person) return null;

  const statusColors: Record<string, string> = {
    pending: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
    accepted: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
    rejected: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
    blocked: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300',
  };

  return (
    <div className="flex items-center justify-between p-2 border dark:border-gray-700 rounded-md bg-white dark:bg-gray-900">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-xs font-medium">
          {person.avatar ? (
            <img src={person.avatar} alt="" loading="lazy" decoding="async" className="w-8 h-8 rounded-full object-cover" />
          ) : (
            (person.displayName || person.username).charAt(0).toUpperCase()
          )}
        </div>
        <div>
          <div className="text-sm font-medium dark:text-gray-100">
            {person.displayName || person.username}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">@{person.username}</div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className={`text-xs px-2 py-0.5 rounded-full ${statusColors[request.status] || statusColors.pending}`}>
          {request.status}
        </span>
        <span className="text-xs text-gray-400">{formatDate(request.createdAt, locale)}</span>
      </div>
    </div>
  );
}

export function UserActivitySection({ userId }: { userId: string }) {
  const { t } = useI18n('admin');
  const [data, setData] = useState<ActivityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchActivity = async () => {
      try {
        setLoading(true);
        const response = await apiService.get<{ success: boolean; data: ActivityData }>(
          `/admin/users/${userId}/activity`
        );
        if (response.data?.data) {
          setData(response.data.data);
        }
      } catch (err) {
        console.error('Error fetching user activity:', err);
        setError(t('usersDetail.loadError'));
      } finally {
        setLoading(false);
      }
    };

    fetchActivity();
  }, [userId]);

  if (loading) {
    return (
      <Card className="dark:bg-gray-900 dark:border-gray-800">
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
          <span className="ml-2 text-sm text-gray-500">{t('usersDetail.loadingActivity')}</span>
        </CardContent>
      </Card>
    );
  }

  if (error || !data) return null;

  const totalContacts = (data.contacts.sent.length) + (data.contacts.received.length);
  const hasData = data.shareLinks.length > 0
    || data.trackingLinks.length > 0
    || data.affiliateTokens.length > 0
    || totalContacts > 0;

  if (!hasData) return null;

  return (
    <Card className="dark:bg-gray-900 dark:border-gray-800">
      <CardHeader>
        <CardTitle className="flex items-center space-x-2 dark:text-gray-100">
          <Activity className="h-5 w-5" />
          <span>{t('usersDetail.activityTitle')}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <CollapsibleSection
          title={t('usersDetail.shareLinksSection')}
          icon={Share2}
          count={data.shareLinks.length}
          defaultOpen={data.shareLinks.length > 0 && data.shareLinks.length <= 5}
        >
          {data.shareLinks.map(link => (
            <ShareLinkCard key={link.id} link={link} />
          ))}
        </CollapsibleSection>

        <CollapsibleSection
          title={t('usersDetail.trackedLinksSection')}
          icon={Target}
          count={data.trackingLinks.length}
          defaultOpen={data.trackingLinks.length > 0 && data.trackingLinks.length <= 5}
        >
          {data.trackingLinks.map(link => (
            <TrackingLinkCard key={link.id} link={link} />
          ))}
        </CollapsibleSection>

        <CollapsibleSection
          title={t('usersDetail.affiliateTokensSection')}
          icon={Link2}
          count={data.affiliateTokens.length}
          defaultOpen={data.affiliateTokens.length > 0 && data.affiliateTokens.length <= 5}
        >
          {data.affiliateTokens.map(token => (
            <AffiliateTokenCard key={token.id} token={token} />
          ))}
        </CollapsibleSection>

        <CollapsibleSection
          title={t('usersDetail.contactsSection')}
          icon={UserCheck}
          count={totalContacts}
          defaultOpen={totalContacts > 0 && totalContacts <= 10}
        >
          {data.contacts.sent.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                {t('usersDetail.sentRequests', { count: String(data.contacts.sent.length) })}
              </div>
              {data.contacts.sent.map(req => (
                <ContactCard key={req.id} request={req} direction="sent" />
              ))}
            </div>
          )}
          {data.contacts.received.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                {t('usersDetail.receivedRequests', { count: String(data.contacts.received.length) })}
              </div>
              {data.contacts.received.map(req => (
                <ContactCard key={req.id} request={req} direction="received" />
              ))}
            </div>
          )}
        </CollapsibleSection>
      </CardContent>
    </Card>
  );
}
