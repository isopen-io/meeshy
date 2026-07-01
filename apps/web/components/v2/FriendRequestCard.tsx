'use client';

import React, { memo } from 'react';
import { cn } from '@/lib/utils';
import { Avatar } from './Avatar';
import { Badge } from './Badge';
import { Button } from './Button';
import { Check, X, Clock, RotateCcw } from 'lucide-react';
import type { FriendRequest } from '@/types/contacts';
import { classifyRelativeTime } from '@meeshy/shared/utils/relative-time';
import { getUserDisplayName } from '@/utils/user-display-name';

export type FriendRequestAction = 'accept' | 'reject' | 'cancel' | 'resend';

export interface FriendRequestCardProps {
  request: FriendRequest;
  currentUserId?: string;
  onAction: (action: FriendRequestAction, requestId: string, userId?: string) => void;
  t: (key: string, params?: Record<string, unknown>) => string;
  locale?: string;
  className?: string;
}

function getOtherUser(request: FriendRequest, currentUserId?: string) {
  const isSender = request.senderId === currentUserId;
  return isSender ? request.receiver : request.sender;
}

function formatRelativeDate(
  dateStr: string,
  t: (key: string, params?: Record<string, unknown>) => string,
  locale?: string
): string {
  const date = new Date(dateStr);
  const bucket = classifyRelativeTime(date.getTime(), Date.now());

  if (bucket.unit === 'days') return t('status.daysAgo', { count: bucket.value });
  if (bucket.unit === 'beyond') return date.toLocaleDateString(locale);
  return t('status.justNow');
}

export const FriendRequestCard = memo(function FriendRequestCard({
  request,
  currentUserId,
  onAction,
  t,
  locale,
  className,
}: FriendRequestCardProps) {
  const isSender = request.senderId === currentUserId;
  const otherUser = getOtherUser(request, currentUserId);
  const displayName = getUserDisplayName(otherUser, '?');

  return (
    <div
      className={cn(
        'p-4 flex items-center gap-4 transition-colors duration-200',
        'hover:bg-[var(--gp-hover)]',
        className
      )}
    >
      <Avatar
        src={otherUser?.avatar}
        name={displayName}
        size="lg"
      />

      <div className="flex-1 min-w-0">
        <p className="font-medium truncate text-[var(--gp-text-primary)]">
          {displayName}
        </p>
        <p className="text-sm truncate text-[var(--gp-text-muted)]">
          @{otherUser?.username}
        </p>
        <p className="text-xs text-[var(--gp-text-muted)] mt-0.5">
          {request.status === 'pending' && (
            isSender
              ? t('messages.requestSent', { date: formatRelativeDate(request.createdAt, t, locale) })
              : t('messages.requestReceived', { date: formatRelativeDate(request.createdAt, t, locale) })
          )}
          {request.status === 'rejected' &&
            t('messages.requestRejected', { date: formatRelativeDate(request.updatedAt, t, locale) })}
        </p>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        {request.status === 'pending' && !isSender && (
          <>
            <Button
              variant="primary"
              size="sm"
              onClick={() => onAction('accept', request.id)}
              aria-label={t('actions.accept')}
            >
              <Check className="w-4 h-4 mr-1" />
              {t('actions.accept')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onAction('reject', request.id)}
              aria-label={t('actions.reject')}
            >
              <X className="w-4 h-4 mr-1" />
              {t('actions.reject')}
            </Button>
          </>
        )}

        {request.status === 'pending' && isSender && (
          <>
            <Badge variant="warning" size="sm">
              <Clock className="w-3 h-3 mr-1" />
              {t('status.pending')}
            </Badge>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onAction('cancel', request.id)}
              aria-label={t('actions.cancel')}
            >
              <X className="w-4 h-4" />
            </Button>
          </>
        )}

        {request.status === 'rejected' && !isSender && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => onAction('resend', request.id, request.senderId)}
            aria-label={t('actions.resend')}
          >
            <RotateCcw className="w-4 h-4 mr-1" />
            {t('actions.resend')}
          </Button>
        )}

        {request.status === 'rejected' && isSender && (
          <Badge variant="error" size="sm">
            {t('status.rejected')}
          </Badge>
        )}
      </div>
    </div>
  );
});
