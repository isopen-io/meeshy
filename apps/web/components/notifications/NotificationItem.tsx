'use client';

import { memo } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { Check, Trash2, Users } from 'lucide-react';
import type { Notification } from '@/types/notification';
import {
  buildNotificationTitle,
  buildNotificationContent,
  buildNotificationContextLine,
  getNotificationIcon,
  getNotificationLink,
  NOTIFICATION_ACCENT,
} from '@/utils/notification-helpers';

type TranslateFunction = (key: string, params?: Record<string, string>) => string;

type NotificationItemProps = {
  notification: Notification;
  onMarkAsRead: (id: string) => void;
  onDelete: (id: string) => void;
  /** Activation de la rangée : marquage lu + effets parent (ex. fermer le dropdown). La navigation est gérée par le lien interne. */
  onClick: (notification: Notification) => void;
  formatTimeAgo: (date: Date | string | null) => string;
  t: TranslateFunction;
  /** Locale de l'appareil — décore la date locale de publication du contenu social. */
  locale?: string;
  compact?: boolean;
  index?: number;
};

export const NotificationItem = memo(function NotificationItem({
  notification,
  onMarkAsRead,
  onDelete,
  onClick,
  formatTimeAgo,
  t,
  locale,
  compact = false,
  index = 0,
}: NotificationItemProps) {
  const isUnread = !notification.state.isRead;
  const title = buildNotificationTitle(notification, t);
  const body = buildNotificationContent(notification, t);
  const contextLine = buildNotificationContextLine(notification, t, locale);
  const href = getNotificationLink(notification);

  const activate = () => onClick(notification);

  const overlayClass =
    'absolute inset-0 rounded-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset';

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -100 }}
      transition={{ duration: 0.15 }}
      className={cn(
        'notification-item group relative flex items-start border-l-2 transition-colors hover:bg-muted/50',
        compact ? 'gap-2.5 px-3 py-2.5' : 'gap-3 px-4 py-3',
        isUnread ? NOTIFICATION_ACCENT.rail : 'border-transparent'
      )}
    >
      {/* Cible primaire étirée (stretched link) — vrai lien si une cible existe, sinon bouton de marquage */}
      {href ? (
        <Link href={href} onClick={activate} aria-label={title} className={overlayClass} />
      ) : (
        <button type="button" onClick={activate} aria-label={title} className={overlayClass} />
      )}

      {/* Avatar + émoji de type (non interactif) */}
      <div className="pointer-events-none relative flex-shrink-0">
        <Avatar className={cn(compact ? 'h-10 w-10' : 'h-11 w-11', 'ring-1 ring-border')}>
          <AvatarImage src={notification.actor?.avatar || undefined} />
          <AvatarFallback className="bg-muted text-muted-foreground font-semibold">
            {(notification.actor?.displayName || notification.actor?.username || 'U').charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <span className="absolute -bottom-1 -right-1 text-sm leading-none select-none">
          {getNotificationIcon(notification).emoji}
        </span>
      </div>

      {/* Texte (non interactif — laisse passer le clic vers le lien) */}
      <div className="pointer-events-none relative min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <span
            className={cn(
              'text-sm font-semibold leading-snug',
              isUnread ? 'text-foreground' : 'text-foreground/70'
            )}
          >
            {title}
          </span>
          <span className="flex-shrink-0 whitespace-nowrap text-xs text-muted-foreground tabular-nums">
            {formatTimeAgo(notification.state.createdAt)}
          </span>
        </div>

        {body ? (
          <p
            className={cn(
              'mt-0.5 line-clamp-2 text-sm',
              isUnread ? 'text-foreground/80' : 'text-muted-foreground'
            )}
          >
            {body}
          </p>
        ) : null}

        {contextLine && (
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {contextLine}
          </p>
        )}

        {!compact && notification.context?.conversationTitle && (
          <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Users className="h-3 w-3 flex-shrink-0" />
            <span className="truncate">
              {notification.context.conversationType === 'direct'
                ? t('conversationTypes.private')
                : notification.context.conversationTitle}
            </span>
          </div>
        )}
      </div>

      {/* Actions persistantes (au-dessus du lien) */}
      <div className="relative z-10 flex flex-shrink-0 items-center gap-0.5">
        {isUnread && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onMarkAsRead(notification.id);
            }}
            className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground/70 transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={t('actions.markAsRead')}
          >
            <Check className="h-4 w-4" />
          </button>
        )}
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onDelete(notification.id);
          }}
          className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground/70 transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={t('actions.delete')}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </motion.div>
  );
});
