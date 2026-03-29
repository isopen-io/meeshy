'use client';

import React, { memo } from 'react';
import { cn } from '@/lib/utils';
import { Avatar } from './Avatar';
import { Badge } from './Badge';
import { Button } from './Button';
import { Check, X, Clock, RotateCcw } from 'lucide-react';
import type { FriendRequest } from '@/types/contacts';

export type FriendRequestAction = 'accept' | 'reject' | 'cancel' | 'resend';

export interface FriendRequestCardProps {
  request: FriendRequest;
  currentUserId?: string;
  onAction: (action: FriendRequestAction, requestId: string, userId?: string) => void;
  t: (key: string, params?: Record<string, unknown>) => string;
  className?: string;
}

function getOtherUser(request: FriendRequest, currentUserId?: string) {
  const isSender = request.senderId === currentUserId;
  return isSender ? request.receiver : request.sender;
}

function getUserDisplayName(user?: { displayName?: string; firstName?: string; lastName?: string; username?: string }) {
  if (!user) return '?';
  if (user.displayName) return user.displayName;
  const fullName = `${user.firstName || ''} ${user.lastName || ''}`.trim();
  return fullName || user.username || '?';
}

function formatRelativeDate(dateStr: string, t: (key: string, params?: Record<string, unknown>) => string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffDays === 0) return t('status.justNow');
  if (diffDays === 1) return t('status.daysAgo', { count: 1 });
  if (diffDays < 7) return t('status.daysAgo', { count: diffDays });
  return date.toLocaleDateString();
}

export const FriendRequestCard = memo(function FriendRequestCard({
  request,
  currentUserId,
  onAction,
  t,
  className,
}: FriendRequestCardProps) {
  const isSender = request.senderId === currentUserId;
  const otherUser = getOtherUser(request, currentUserId);
  const displayName = getUserDisplayName(otherUser);

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
              ? t('messages.requestSent', { date: formatRelativeDate(request.createdAt, t) })
              : t('messages.requestReceived', { date: formatRelativeDate(request.createdAt, t) })
          )}
          {request.status === 'rejected' &&
            t('messages.requestRejected', { date: formatRelativeDate(request.updatedAt, t) })}
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
