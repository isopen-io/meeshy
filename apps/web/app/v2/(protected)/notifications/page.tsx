'use client';

import { useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Button, Card, Badge, LanguageOrb, PageHeader, Avatar, Skeleton } from '@/components/v2';
import { useNotificationsV2 } from '@/hooks/v2';

function NotificationSkeleton() {
  return (
    <div className="p-4 border-b border-[var(--gp-border)]">
      <div className="flex items-start gap-4">
        <Skeleton variant="circular" className="w-12 h-12" />
        <div className="flex-1">
          <Skeleton className="h-4 w-3/4 mb-2" />
          <Skeleton className="h-3 w-1/4" />
        </div>
      </div>
    </div>
  );
}

function NotificationTypeIcon({ type }: { type: string }) {
  switch (type) {
    case 'new_message':
    case 'message_reply':
      return (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      );
    case 'mention':
    case 'user_mentioned':
      return (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207" />
        </svg>
      );
    case 'reaction':
    case 'message_reaction':
      return (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
        </svg>
      );
    case 'friend_request':
    case 'contact_request':
    case 'friend_accepted':
    case 'contact_accepted':
      return (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
        </svg>
      );
    case 'community_invite':
    case 'community_announcement':
      return (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      );
    default:
      return (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
      );
  }
}

export default function V2NotificationsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    notifications,
    unreadCount,
    isLoading,
    isLoadingMore,
    hasMore,
    loadMore,
    markAsRead,
    markAllAsRead,
    error,
  } = useNotificationsV2();

  // Handle ?markAllRead=true from email digest link
  const markAllReadHandled = useRef(false);
  useEffect(() => {
    if (markAllReadHandled.current) return;
    if (searchParams.get('markAllRead') === 'true') {
      markAllReadHandled.current = true;
      markAllAsRead().then(() => {
        toast.success('Toutes les notifications marquees comme lues');
        router.replace('/v2/notifications');
      });
    }
  }, [searchParams, markAllAsRead, router]);

  const handleNotificationClick = async (notificationId: string, actionUrl?: string) => {
    await markAsRead(notificationId);
    if (actionUrl) {
      window.location.href = actionUrl;
    }
  };

  return (
    <div className="h-full overflow-auto bg-[var(--gp-background)] transition-colors duration-300">
      <PageHeader
        title="Mes notifications"
        hideNotificationButton
        titleBadge={
          unreadCount > 0 ? (
            <Badge variant="primary" size="sm">
              {unreadCount}
            </Badge>
          ) : undefined
        }
        actionButtons={
          <Button
            variant="ghost"
            size="sm"
            onClick={markAllAsRead}
            disabled={unreadCount === 0}
          >
            Tout marquer comme lu
          </Button>
        }
      />

      <main className="max-w-2xl mx-auto">
        {/* Error state */}
        {error && (
          <div className="p-4 m-4 rounded-xl" style={{ background: 'color-mix(in srgb, var(--gp-error) 15%, transparent)' }}>
            <p style={{ color: 'var(--gp-error)' }}>{error}</p>
          </div>
        )}

        {/* Loading state */}
        {isLoading && (
          <>
            <NotificationSkeleton />
            <NotificationSkeleton />
            <NotificationSkeleton />
            <NotificationSkeleton />
          </>
        )}

        {/* Empty state */}
        {!isLoading && notifications.length === 0 && (
          <div className="text-center py-16 px-4">
            <div className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center bg-[var(--gp-parchment)]">
              <svg className="w-8 h-8 text-[var(--gp-text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold mb-2 text-[var(--gp-text-primary)]">
              Aucune notification
            </h2>
            <p className="text-[var(--gp-text-secondary)]">
              Vous n'avez pas encore de notifications
            </p>
          </div>
        )}

        {/* Notifications list */}
        {!isLoading && notifications.map((notif) => (
          <button
            key={notif.id}
            onClick={() => handleNotificationClick(notif.id, notif.actionUrl)}
            className={`w-full p-4 border-b border-[var(--gp-border)] flex items-start gap-4 text-left transition-colors hover:bg-[var(--gp-hover)] ${notif.isUnread ? 'bg-[var(--gp-terracotta)]/5' : ''}`}
          >
            <Avatar
              src={notif.user.avatar}
              name={notif.user.name}
              size="lg"
              languageOrb={
                <LanguageOrb
                  code={notif.user.languageCode}
                  size="sm"
                  pulse={false}
                  className="w-5 h-5 text-xs border-2 border-[var(--gp-surface)]"
                />
              }
            />
            <div className="flex-1 min-w-0">
              <p className="text-[var(--gp-text-primary)]">
                <span className="font-semibold">{notif.user.name}</span>{' '}
                <span className="text-[var(--gp-text-secondary)]">{notif.content}</span>
              </p>
              <p className="text-sm mt-1 text-[var(--gp-text-muted)]">{notif.time}</p>
            </div>
            {notif.isUnread && (
              <div className="w-3 h-3 rounded-full flex-shrink-0 bg-[var(--gp-terracotta)]" />
            )}
          </button>
        ))}

        {/* Load more */}
        {hasMore && (
          <div className="p-4 text-center">
            <Button
              variant="outline"
              onClick={loadMore}
              isLoading={isLoadingMore}
            >
              Charger plus
            </Button>
          </div>
        )}
      </main>

      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Playfair+Display:wght@400;500;600;700&display=swap" rel="stylesheet" />
    </div>
  );
}
