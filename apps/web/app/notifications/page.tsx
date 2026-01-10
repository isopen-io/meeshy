'use client';

import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import {
  Bell,
  BellOff,
  Check,
  CheckCheck,
  Settings,
  MessageSquare,
  PhoneMissed,
  Trash2,
  Search,
  X,
  UserPlus
} from '@/lib/icons';
import {
  Filter,
  ArrowUpDown,
  Clock,
  CheckSquare,
  Square
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useRouter } from 'next/navigation';
import { useNotifications } from '@/hooks/use-notifications';
import { NotificationTest } from '@/components/notifications/NotificationTest';
import { useI18n } from '@/hooks/use-i18n';
import type { Notification } from '@/services/notification.service';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { NotificationFilters, type NotificationType } from '@/components/notifications/NotificationFilters';
import { cn } from '@/lib/utils';
import { AttachmentDetails } from '@/components/attachments/AttachmentDetails';
import { buildApiUrl } from '@/lib/config';
import { authManager } from '@/services/auth-manager.service';
import { toast } from 'sonner';
import { getUserDisplayName } from '@/utils/user-display-name';

type SortOption = 'date-desc' | 'date-asc' | 'unread-first' | 'type';

/**
 * Construit un titre formaté pour une notification avec le nom de l'expéditeur
 */
function buildNotificationTitle(notification: Notification, t: (key: string, params?: Record<string, string>) => string): string {
  // Utiliser la fonction centralisée pour obtenir le nom de l'expéditeur
  // Support both nested (sender) and flat (legacy) structures
  const senderName = getUserDisplayName({
    displayName: notification.sender?.displayName || (notification.data?.senderDisplayName as string | undefined),
    firstName: notification.sender?.firstName || (notification.data?.senderFirstName as string | undefined),
    lastName: notification.sender?.lastName || (notification.data?.senderLastName as string | undefined),
    username: notification.sender?.username || notification.senderUsername
  }, 'Un utilisateur');

  const conversationTitle = notification.context?.conversationTitle || (notification.data?.conversationTitle as string | undefined) || 'la conversation';

  switch (notification.type) {
    case 'new_message':
    case 'message':
      return t('titles.newMessage', { sender: senderName });

    case 'message_reply':
      return t('titles.reply', { sender: senderName });

    case 'mention':
    case 'user_mentioned':
      return t('titles.mentioned', { sender: senderName });

    case 'message_reaction':
      const emoji = (notification.data?.emoji as string) || '❤️';
      return t('titles.reaction', { sender: senderName, emoji });

    case 'missed_call':
      return t('titles.missedCall', { type: 'vidéo' });

    case 'new_conversation':
    case 'conversation':
    case 'new_conversation_direct':
    case 'new_conversation_group':
      // Déterminer si c'est une conversation directe ou de groupe
      if (notification.context?.conversationType === 'direct' || notification.type === 'new_conversation_direct') {
        return t('titles.newConversationDirect', { sender: senderName });
      } else {
        return t('titles.newConversationGroup', { title: conversationTitle });
      }

    case 'contact_request':
      return t('titles.contactRequest', { sender: senderName });

    case 'contact_accepted':
      return t('titles.contactAccepted', { sender: senderName });

    case 'system':
      return notification.title || t('titles.system');

    default:
      return notification.title || t('titles.default');
  }
}

function NotificationsPageContent() {
  const { t } = useI18n('notifications');
  const router = useRouter();
  const [selectedFilter, setSelectedFilter] = useState<NotificationType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOption, setSortOption] = useState<SortOption>('date-desc');
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedNotifications, setSelectedNotifications] = useState<Set<string>>(new Set());
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const {
    notifications,
    unreadNotifications,
    unreadCount,
    totalCount,
    markAsRead,
    markAllAsRead,
    removeNotification,
    clearAll,
    isConnected
  } = useNotifications();

  // Gérer le chargement initial pour éviter l'incohérence d'affichage
  useEffect(() => {
    // Attendre un court instant pour que les données se chargent
    const timer = setTimeout(() => {
      setIsInitialLoading(false);
    }, 300);

    return () => clearTimeout(timer);
  }, []);

  // Filtrer, rechercher et trier les notifications
  const filteredNotifications = useMemo(() => {
    let filtered = notifications;

    // Filtrer par type (avec mapping des types backend vers types frontend)
    if (selectedFilter !== 'all') {
      filtered = filtered.filter(n => {
        // Mapper les types backend vers les filtres frontend
        if (selectedFilter === 'new_message') {
          return n.type === 'new_message' || n.type === 'message';
        }
        if (selectedFilter === 'conversation') {
          return n.type === 'conversation' || n.type === 'new_conversation';
        }
        if (selectedFilter === 'system') {
          return n.type === 'system' || n.type === 'missed_call';
        }
        return n.type === selectedFilter;
      });
    }

    // Filtrer par recherche
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filtered = filtered.filter(n => {
        const title = (n.title || '').toLowerCase();
        const content = (n.content || '').toLowerCase();
        const preview = (n.messagePreview || '').toLowerCase();
        const senderName = (n.sender?.username || n.senderUsername || '').toLowerCase();

        return title.includes(query) ||
               content.includes(query) ||
               preview.includes(query) ||
               senderName.includes(query);
      });
    }

    // Trier les notifications
    const sorted = [...filtered].sort((a, b) => {
      switch (sortOption) {
        case 'date-asc':
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        case 'date-desc':
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case 'unread-first':
          if (a.isRead === b.isRead) {
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
          }
          return a.isRead ? 1 : -1;
        case 'type':
          if (a.type === b.type) {
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
          }
          return a.type.localeCompare(b.type);
        default:
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
    });

    return sorted;
  }, [notifications, selectedFilter, searchQuery, sortOption]);

  // Gestion de la sélection
  const toggleSelection = (notificationId: string) => {
    const newSelection = new Set(selectedNotifications);
    if (newSelection.has(notificationId)) {
      newSelection.delete(notificationId);
    } else {
      newSelection.add(notificationId);
    }
    setSelectedNotifications(newSelection);
  };

  const toggleSelectAll = () => {
    if (selectedNotifications.size === filteredNotifications.length) {
      setSelectedNotifications(new Set());
    } else {
      setSelectedNotifications(new Set(filteredNotifications.map(n => n.id)));
    }
  };

  const markSelectedAsRead = async () => {
    for (const id of selectedNotifications) {
      await markAsRead(id);
    }
    setSelectedNotifications(new Set());
    setSelectionMode(false);
  };

  const deleteSelected = async () => {
    for (const id of selectedNotifications) {
      await removeNotification(id);
    }
    setSelectedNotifications(new Set());
    setSelectionMode(false);
  };

  // Réinitialiser la sélection si on quitte le mode sélection
  useEffect(() => {
    if (!selectionMode) {
      setSelectedNotifications(new Set());
    }
  }, [selectionMode]);

  // Calculer les compteurs par type
  const typeCounts = useMemo(() => ({
    all: notifications.length,
    new_message: notifications.filter(n => n.type === 'new_message' || n.type === 'message').length,
    missed_call: notifications.filter(n => n.type === 'missed_call').length,
    system: notifications.filter(n => n.type === 'system' || n.type === 'missed_call').length,
    conversation: notifications.filter(n => n.type === 'conversation' || n.type === 'new_conversation').length,
    friend_request: notifications.filter(n => n.type === 'friend_request').length,
  }), [notifications]);

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'message':
      case 'new_message':
        return <MessageSquare className="h-4 w-4" />;
      case 'missed_call':
        return <PhoneMissed className="h-4 w-4" />;
      case 'system':
        return <Settings className="h-4 w-4" />;
      case 'conversation':
      case 'new_conversation':
        return <MessageSquare className="h-4 w-4" />;
      case 'friend_request':
        return <UserPlus className="h-4 w-4" />;
      default:
        return <Bell className="h-4 w-4" />;
    }
  };

  const handleNotificationClick = (notification: Notification) => {
    // Marquer comme lue
    markAsRead(notification.id);

    // Naviguer vers la destination avec ancre #message-{messageId}
    if (notification.conversationId) {
      if (notification.messageId) {
        // Construire l'URL avec ancre : /conversations/{conversationId}?messageId={messageId}#message-{messageId}
        router.push(`/conversations/${notification.conversationId}?messageId=${notification.messageId}#message-${notification.messageId}`);
      } else {
        router.push(`/conversations/${notification.conversationId}`);
      }
    } else if (notification.callSessionId && notification.conversationId) {
      router.push(`/conversations/${notification.conversationId}`);
    }
  };

  const getNotificationTypeLabel = (type: string) => {
    // Mapper les types backend vers les labels frontend
    const typeMap: Record<string, string> = {
      'new_message': 'message',
      'new_conversation': 'conversation',
      'missed_call': 'system'
    };

    const mappedType = typeMap[type] || type;
    return t(`types.${mappedType}`) || mappedType.replace('_', ' ');
  };

  const getNotificationColor = (type: string) => {
    switch (type) {
      case 'message':
      case 'new_message':
        return 'bg-blue-500/10 text-blue-700 border-blue-200 dark:bg-blue-500/20 dark:text-blue-400 dark:border-blue-800';
      case 'missed_call':
        return 'bg-red-500/10 text-red-700 border-red-200 dark:bg-red-500/20 dark:text-red-400 dark:border-red-800';
      case 'system':
        return 'bg-yellow-500/10 text-yellow-700 border-yellow-200 dark:bg-yellow-500/20 dark:text-yellow-400 dark:border-yellow-800';
      case 'conversation':
      case 'new_conversation':
        return 'bg-purple-500/10 text-purple-700 border-purple-200 dark:bg-purple-500/20 dark:text-purple-400 dark:border-purple-800';
      case 'friend_request':
        return 'bg-green-500/10 text-green-700 border-green-200 dark:bg-green-500/20 dark:text-green-400 dark:border-green-800';
      default:
        return 'bg-gray-500/10 text-gray-700 border-gray-200 dark:bg-gray-500/20 dark:text-gray-400 dark:border-gray-800';
    }
  };

  const formatNotificationTime = (timestamp: Date) => {
    const date = timestamp;
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMinutes < 1) return t('timeAgo.now');

    // Remplacer manuellement le placeholder {count}
    if (diffMinutes < 60) {
      const template = t('timeAgo.minute');
      return template.replace('{count}', diffMinutes.toString());
    }

    if (diffHours < 24) {
      const template = t('timeAgo.hour');
      return template.replace('{count}', diffHours.toString());
    }

    if (diffDays < 7) {
      const template = t('timeAgo.day');
      return template.replace('{count}', diffDays.toString());
    }

    // Pour les dates plus anciennes, utiliser un format court
    const day = date.toLocaleDateString('fr-FR', { day: 'numeric' });
    const month = date.toLocaleDateString('fr-FR', { month: 'short' });
    const year = date.getFullYear();
    const currentYear = now.getFullYear();

    // N'afficher l'année que si différente de l'année en cours
    return currentYear === year ? `${day} ${month}` : `${day} ${month} ${year}`;
  };

  const getUnreadCountMessage = () => {
    if (unreadCount > 0) {
      const key = unreadCount === 1 ? 'unreadCount.single' : 'unreadCount.plural';
      const template = t(key);
      return template
        .replace('{count}', unreadCount.toString())
        .replace('{total}', totalCount.toString());
    } else if (totalCount > 0) {
      const plural = totalCount > 1 ? 's' : '';
      const template = t('unreadCount.allRead');
      return template
        .replace('{total}', totalCount.toString())
        .replace('{plural}', plural);
    } else {
      return t('unreadCount.empty');
    }
  };

  return (
    <DashboardLayout title={t('pageTitle')}>
      <div className="h-full flex flex-col">
        {/* Header avec actions - responsive */}
        <div className="flex-shrink-0 border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="py-4 sm:py-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <h1 className="text-2xl sm:text-3xl font-bold text-foreground truncate">
                    {t('pageTitle')}
                  </h1>
                  {isInitialLoading ? (
                    <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-48 mt-1 animate-pulse"></div>
                  ) : (
                    <p className="text-sm text-muted-foreground mt-1">
                      {getUnreadCountMessage()}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {/* Mode sélection et actions groupées */}
                  {selectionMode ? (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectionMode(false)}
                        className="flex items-center gap-2"
                      >
                        <X className="h-4 w-4" />
                        <span className="hidden sm:inline">{t('actions.cancel')}</span>
                      </Button>

                      {selectedNotifications.size > 0 && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={markSelectedAsRead}
                            className="flex items-center gap-2"
                          >
                            <Check className="h-4 w-4" />
                            <span className="hidden sm:inline">{t('actions.markAsReadCount').replace('{count}', selectedNotifications.size.toString())}</span>
                            <span className="sm:hidden">{selectedNotifications.size}</span>
                          </Button>

                          <Button
                            variant="outline"
                            size="sm"
                            onClick={deleteSelected}
                            className="flex items-center gap-2 text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                            <span className="hidden sm:inline">{t('actions.deleteCount').replace('{count}', selectedNotifications.size.toString())}</span>
                          </Button>
                        </>
                      )}
                    </>
                  ) : (
                    <>
                      {/* Menu de tri */}
                      <select
                        value={sortOption}
                        onChange={(e) => setSortOption(e.target.value as SortOption)}
                        disabled={isInitialLoading}
                        className="h-9 px-3 rounded-md border border-input bg-background text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <option value="date-desc">{t('sortOptions.newest')}</option>
                        <option value="date-asc">{t('sortOptions.oldest')}</option>
                        <option value="unread-first">{t('sortOptions.unreadFirst')}</option>
                        <option value="type">{t('sortOptions.byType')}</option>
                      </select>

                      {/* Bouton de sélection */}
                      {totalCount > 0 && !isInitialLoading && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectionMode(true)}
                          className="flex items-center gap-2"
                        >
                          <CheckSquare className="h-4 w-4" />
                          <span className="hidden sm:inline">{t('actions.select')}</span>
                        </Button>
                      )}

                      {unreadCount > 0 && !isInitialLoading && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={markAllAsRead}
                          className="flex items-center gap-2"
                        >
                          <CheckCheck className="h-4 w-4" />
                          <span className="hidden sm:inline">{t('markAllRead')}</span>
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Barre de recherche - toujours visible */}
              <div className="mt-4 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t('search')}
                  disabled={isInitialLoading}
                  className="pl-9 pr-9 h-10 w-full"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              {/* Filtres par type - responsive */}
              {!isInitialLoading && (
                <div className="mt-4">
                  <NotificationFilters
                    selectedType={selectedFilter}
                    onTypeChange={setSelectedFilter}
                    counts={typeCounts}
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Contenu principal scrollable */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
              {/* Liste des notifications - 3 colonnes sur large écran */}
              <div className="lg:col-span-3">
                {/* Bouton "Tout sélectionner" en mode sélection */}
                {selectionMode && filteredNotifications.length > 0 && (
                  <div className="mb-4 flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={toggleSelectAll}
                      className="flex items-center gap-2"
                    >
                      {selectedNotifications.size === filteredNotifications.length ? (
                        <CheckSquare className="h-4 w-4" />
                      ) : (
                        <Square className="h-4 w-4" />
                      )}
                      <span>
                        {selectedNotifications.size === filteredNotifications.length
                          ? t('actions.deselectAll')
                          : t('actions.selectAll')}
                      </span>
                    </Button>
                    <span className="text-sm text-muted-foreground">
                      {(selectedNotifications.size > 1 ? t('selection.countPlural') : t('selection.count'))
                        .replace('{selected}', selectedNotifications.size.toString())
                        .replace('{total}', filteredNotifications.length.toString())}
                    </span>
                  </div>
                )}

                {isInitialLoading ? (
                  // Skeleton loading - afficher pendant le chargement initial
                  <div className="space-y-2">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <Card key={i} className="animate-pulse">
                        <CardContent className="p-3 sm:p-4">
                          <div className="flex items-start gap-3">
                            <div className="h-10 w-10 sm:h-12 sm:w-12 bg-gray-200 dark:bg-gray-700 rounded-full flex-shrink-0"></div>
                            <div className="flex-1 space-y-2">
                              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4"></div>
                              <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-full"></div>
                              <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : totalCount === 0 ? (
                  <Card>
                    <CardContent className="flex flex-col items-center justify-center py-16 sm:py-24">
                      <div className="w-16 h-16 sm:w-20 sm:h-20 bg-muted rounded-full flex items-center justify-center mb-4">
                        <BellOff className="h-8 w-8 sm:h-10 sm:w-10 text-muted-foreground" />
                      </div>
                      <h3 className="text-lg font-semibold text-foreground mb-2">
                        {t('empty.title')}
                      </h3>
                      <p className="text-muted-foreground text-center max-w-sm text-sm sm:text-base">
                        {t('empty.description')}
                      </p>
                    </CardContent>
                  </Card>
                ) : filteredNotifications.length === 0 ? (
                  <Card>
                    <CardContent className="flex flex-col items-center justify-center py-16 sm:py-24">
                      <div className="w-16 h-16 sm:w-20 sm:h-20 bg-muted rounded-full flex items-center justify-center mb-4">
                        <Search className="h-8 w-8 sm:h-10 sm:w-10 text-muted-foreground" />
                      </div>
                      <p className="text-muted-foreground text-center text-sm sm:text-base">
                        {t('noResults')}
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-2">
                    {filteredNotifications.map((notification, index) => (
                      <Card
                        key={notification.id}
                        className={cn(
                          "hover:shadow-md transition-all duration-300 cursor-pointer border group",
                          !notification.isRead && "border-l-4 border-l-primary bg-accent/5",
                          selectedNotifications.has(notification.id) && "ring-2 ring-primary bg-accent/10",
                          "animate-in fade-in slide-in-from-bottom-2"
                        )}
                        style={{
                          animationDelay: `${index * 30}ms`,
                          animationFillMode: 'backwards'
                        }}
                        onClick={(e) => {
                          if (selectionMode) {
                            e.preventDefault();
                            toggleSelection(notification.id);
                          } else {
                            handleNotificationClick(notification);
                          }
                        }}
                      >
                        <CardContent className="p-3 sm:p-4">
                          <div className="flex items-start gap-3">
                            {/* Checkbox en mode sélection */}
                            {selectionMode && (
                              <div className="flex items-center pt-2">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleSelection(notification.id);
                                  }}
                                  className="w-5 h-5 rounded border-2 border-primary flex items-center justify-center hover:bg-accent transition-colors"
                                >
                                  {selectedNotifications.has(notification.id) && (
                                    <Check className="h-4 w-4 text-primary" />
                                  )}
                                </button>
                              </div>
                            )}

                            {/* Avatar ou icône */}
                            {notification.sender?.avatar || notification.senderId ? (
                              <Avatar className="h-10 w-10 sm:h-12 sm:w-12 flex-shrink-0">
                                <AvatarImage src={notification.sender?.avatar} alt={notification.sender?.username || 'User'} />
                                <AvatarFallback className="text-xs sm:text-sm">
                                  {(notification.sender?.username || 'U').charAt(0).toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                            ) : (
                              <div className={cn(
                                "p-2 sm:p-2.5 rounded-full flex-shrink-0",
                                getNotificationColor(notification.type)
                              )}>
                                {getNotificationIcon(notification.type)}
                              </div>
                            )}

                            {/* Contenu */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2 mb-1">
                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                  <h4 className={cn(
                                    "text-sm truncate",
                                    !notification.isRead ? 'font-bold text-foreground' : 'font-semibold text-muted-foreground'
                                  )}>
                                    {buildNotificationTitle(notification, t)}
                                  </h4>
                                  {!notification.isRead && (
                                    <span className="inline-block w-2 h-2 bg-primary rounded-full flex-shrink-0"></span>
                                  )}
                                </div>
                                <Badge variant="secondary" className="text-xs flex-shrink-0 hidden sm:inline-flex">
                                  {getNotificationTypeLabel(notification.type)}
                                </Badge>
                              </div>

                              {/* Message preview or attachment details */}
                              {Array.isArray(notification.data?.attachments) && notification.data.attachments.length > 0 ? (
                                <div className="mb-2 space-y-1">
                                  {(notification.data.attachments as any[]).map((attachment: any) => (
                                    <div key={attachment.id} className="flex items-center gap-2">
                                      <AttachmentDetails
                                        attachment={attachment}
                                        className={cn(
                                          "text-sm",
                                          !notification.isRead ? 'text-foreground' : 'text-muted-foreground'
                                        )}
                                        iconSize="sm"
                                      />
                                    </div>
                                  ))}
                                  {notification.messagePreview && (
                                    <p className={cn(
                                      "text-sm line-clamp-1 mt-1",
                                      !notification.isRead ? 'text-foreground' : 'text-muted-foreground'
                                    )}>
                                      {notification.messagePreview}
                                    </p>
                                  )}
                                </div>
                              ) : (
                                <p className={cn(
                                  "text-sm mb-2 line-clamp-2",
                                  !notification.isRead ? 'text-foreground' : 'text-muted-foreground'
                                )}>
                                  {notification.messagePreview || notification.content}
                                </p>
                              )}

                              {/* Actions pour les requêtes d'amitié */}
                              {notification.type === 'friend_request' && Array.isArray(notification.data?.actions) && !notification.isRead && (
                                <div className="flex gap-2 mt-3 mb-2">
                                  {(notification.data.actions as any[]).map((action: any) => (
                                    <Button
                                      key={action.type}
                                      size="sm"
                                      variant={action.type === 'accept' ? 'default' : 'outline'}
                                      onClick={async (e) => {
                                        e.stopPropagation();
                                        try {
                                          const response = await fetch(buildApiUrl(action.endpoint), {
                                            method: action.method,
                                            headers: {
                                              'Content-Type': 'application/json',
                                              Authorization: `Bearer ${authManager.getAuthToken()}`
                                            },
                                            body: JSON.stringify(action.payload)
                                          });

                                          if (response.ok) {
                                            toast.success(action.type === 'accept' ? t('friendRequest.accepted') : t('friendRequest.rejected'));
                                            markAsRead(notification.id);
                                          } else {
                                            toast.error(t('friendRequest.error'));
                                          }
                                        } catch (error) {
                                          console.error('Error handling friend request action:', error);
                                          toast.error(t('friendRequest.connectionError'));
                                        }
                                      }}
                                      className="flex-1"
                                    >
                                      {action.label}
                                    </Button>
                                  ))}
                                </div>
                              )}

                              <div className="flex items-center justify-between">
                                <p className="text-xs text-muted-foreground">
                                  {formatNotificationTime(notification.createdAt)}
                                  {notification.context?.conversationType !== 'direct' && notification.context?.conversationTitle && (
                                    <span> {t('conversationContext').replace('{conversationTitle}', notification.context?.conversationTitle)}</span>
                                  )}
                                </p>

                                {/* Actions - visibles sur hover desktop, toujours visibles sur mobile */}
                                <div className="flex items-center gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                                  {!notification.isRead && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        markAsRead(notification.id);
                                      }}
                                      className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                                      title={t('actions.markAsRead')}
                                    >
                                      <Check className="h-3.5 w-3.5" />
                                    </Button>
                                  )}
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      removeNotification(notification.id);
                                    }}
                                    className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                                    title={t('actions.delete')}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>

              {/* Sidebar - cachée sur mobile, visible sur large écran */}
              <div className="hidden lg:block space-y-6">
                {isInitialLoading ? (
                  <Card className="animate-pulse">
                    <CardContent className="p-4 space-y-4">
                      <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-2/3"></div>
                      <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded"></div>
                      <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded"></div>
                      <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded"></div>
                    </CardContent>
                  </Card>
                ) : (
                  <Card>
                    <CardContent className="p-4 space-y-4">
                      <div className="flex items-center gap-2 mb-4">
                        <Settings className="h-5 w-5 text-muted-foreground" />
                        <span className="font-semibold">{t('systemStatus')}</span>
                      </div>

                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">{t('service')}</span>
                        <div className={cn(
                          "w-2.5 h-2.5 rounded-full",
                          isConnected ? 'bg-green-500' : 'bg-red-500'
                        )} />
                      </div>

                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">{t('totalNotifications')}</span>
                        <Badge variant="secondary">{totalCount}</Badge>
                      </div>

                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">{t('unread')}</span>
                        <Badge variant={unreadCount > 0 ? "destructive" : "secondary"}>
                          {unreadCount}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Quick Actions */}
                {process.env.NODE_ENV === 'development' && (
                  <Card>
                    <CardContent className="p-4">
                      <h3 className="font-semibold mb-3">{t('quickActions')}</h3>
                      <NotificationTest />
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

export default function NotificationsPage() {
  return (
    <AuthGuard>
      <NotificationsPageContent />
    </AuthGuard>
  );
}
