/**
 * Composant NotificationItem
 * Affiche une notification avec formatage contextuel selon le type
 */

'use client';

import React from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { X, Check, Phone, UserPlus, MessageSquare } from 'lucide-react';
import type { NotificationItemProps } from '@/types/notification';
import { NotificationTypeEnum } from '@/types/notification';
import {
  getNotificationIcon,
  formatNotificationContext,
  formatMessagePreview,
  getNotificationLink,
  requiresUserAction,
  buildNotificationTitle,
  buildNotificationContent
} from '@/utils/notification-helpers';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/hooks/useI18n';

/**
 * Composant NotificationItem
 */
export function NotificationItem({
  notification,
  onRead,
  onDelete,
  onClick,
  onAfterNavigation,
  showActions = true,
  compact = false
}: NotificationItemProps) {
  const router = useRouter();
  const { t } = useI18n('notifications');
  const icon = getNotificationIcon(notification);
  const context = formatNotificationContext(notification);
  const link = getNotificationLink(notification);
  const needsAction = requiresUserAction(notification);

  // Construire le titre et le contenu à partir des données brutes avec traductions
  const title = buildNotificationTitle(notification, t);
  const content = buildNotificationContent(notification, t);

  /**
   * Gère le clic sur la notification
   */
  const handleClick = () => {
    // Marquer comme lue si nécessaire
    if (!notification.isRead && onRead) {
      onRead(notification.id);
    }

    // Naviguer si un lien existe
    if (link) {
      router.push(link);
      // Fermer le dropdown après navigation
      onAfterNavigation?.();
    } else if (onClick) {
      // Fallback pour les notifications sans lien
      onClick(notification);
    }
  };

  /**
   * Gère le clic sur "Marquer comme lu"
   */
  const handleMarkAsRead = (e: React.MouseEvent) => {
    e.stopPropagation();
    onRead?.(notification.id);
  };

  /**
   * Gère le clic sur "Supprimer"
   */
  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete?.(notification.id);
  };

  /**
   * Rendu des actions rapides pour certains types de notifications
   */
  const renderQuickActions = () => {
    if (!showActions) return null;

    switch (notification.type) {
      case NotificationTypeEnum.CONTACT_REQUEST:
        return (
          <div className="flex gap-2 mt-2">
            <Button
              size="sm"
              variant="default"
              onClick={(e) => {
                e.stopPropagation();
                // TODO: Implémenter l'acceptation de contact
                console.log('Accept contact request:', notification.id);
              }}
              className="flex-1"
            >
              <Check className="w-4 h-4 mr-1" />
              {t('actions.accept')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={(e) => {
                e.stopPropagation();
                // TODO: Implémenter le refus de contact
                console.log('Decline contact request:', notification.id);
              }}
              className="flex-1"
            >
              <X className="w-4 h-4 mr-1" />
              {t('actions.decline')}
            </Button>
          </div>
        );

      case NotificationTypeEnum.MISSED_CALL:
        return (
          <div className="flex gap-2 mt-2">
            <Button
              size="sm"
              variant="default"
              onClick={(e) => {
                e.stopPropagation();
                if (notification.context?.conversationId) {
                  router.push(`/conversations/${notification.context.conversationId}?action=call`);
                }
              }}
              className="flex-1"
            >
              <Phone className="w-4 h-4 mr-1" />
              {t('actions.callBack')}
            </Button>
          </div>
        );

      case NotificationTypeEnum.NEW_CONVERSATION_GROUP:
        if (!notification.metadata?.isMember) {
          return (
            <div className="flex gap-2 mt-2">
              <Button
                size="sm"
                variant="default"
                onClick={(e) => {
                  e.stopPropagation();
                  if (notification.context?.conversationId) {
                    router.push(`/join/${notification.context.conversationId}`);
                  }
                }}
                className="flex-1"
              >
                <UserPlus className="w-4 h-4 mr-1" />
                {t('actions.join')}
              </Button>
            </div>
          );
        }
        break;
    }

    return null;
  };

  /**
   * Rendu du contenu principal de la notification
   */
  const renderContent = () => {
    // Utiliser le contenu construit
    if (!content) return null;

    return (
      <p className="text-sm text-gray-700 dark:text-gray-300 line-clamp-2">
        {content}
      </p>
    );
  };

  return (
    <div
      onClick={handleClick}
      className={cn(
        'group relative flex gap-2 p-2 transition-colors cursor-pointer',
        'hover:bg-gray-50 dark:hover:bg-gray-800/50',
        !notification.isRead && 'bg-blue-50/50 dark:bg-blue-900/10',
        compact && 'p-1.5'
      )}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          handleClick();
        }
      }}
    >
      {/* Badge non lu */}
      {!notification.isRead && (
        <div className="absolute top-2 left-1 w-1.5 h-1.5 bg-blue-600 rounded-full" />
      )}

      {/* Colonne gauche: Avatar + Actions */}
      <div className="flex-shrink-0 flex flex-col items-center gap-1">
        {/* Avatar de l'utilisateur */}
        {notification.sender ? (
          <Avatar className={cn('w-9 h-9', compact && 'w-7 h-7')}>
            <AvatarImage src={notification.sender.avatar} alt={notification.sender.username} />
            <AvatarFallback>
              {notification.sender.username[0]?.toUpperCase()}
            </AvatarFallback>
          </Avatar>
        ) : (
          <div
            className={cn(
              'flex items-center justify-center rounded-full',
              'w-9 h-9 text-base',
              compact && 'w-7 h-7 text-sm',
              icon.bgColor,
              icon.color
            )}
          >
            {icon.emoji}
          </div>
        )}

        {/* Actions désactivées - géré dans /notifications */}
      </div>

      {/* Contenu - prend toute la largeur disponible */}
      <div className="flex-1 min-w-0 w-full">
        {/* Titre - prend toute la largeur */}
        <div className="w-full mb-0.5">
          <h4 className={cn(
            'font-medium text-gray-900 dark:text-white line-clamp-1 w-full',
            compact ? 'text-sm' : 'text-base'
          )}>
            {title}
          </h4>

          {/* Badge de priorité */}
          {notification.priority === 'urgent' && (
            <span className="inline-block mt-1 px-1.5 py-0.5 text-[10px] font-semibold text-red-700 bg-red-100 rounded-full dark:bg-red-900 dark:text-red-200">
              {t('priorities.urgent')}
            </span>
          )}
          {notification.priority === 'high' && (
            <span className="inline-block mt-1 px-1.5 py-0.5 text-[10px] font-semibold text-orange-700 bg-orange-100 rounded-full dark:bg-orange-900 dark:text-orange-200">
              {t('priorities.high')}
            </span>
          )}
        </div>

        {/* Contenu */}
        {renderContent()}

        {/* Contexte (timestamp + conversation) - prend toute la largeur */}
        {context && (
          <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 w-full">
            {context}
          </p>
        )}

        {/* Actions rapides */}
        {renderQuickActions()}
      </div>

      {/* Indicateur cliquable */}
      {link && (
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
            <MessageSquare className="w-3.5 h-3.5 text-gray-400" />
          </div>
        </div>
      )}
    </div>
  );
}

export default NotificationItem;
