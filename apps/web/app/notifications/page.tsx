'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useRouter } from 'next/navigation';
import { useNotificationsManagerRQ } from '@/hooks/queries/use-notifications-manager-rq';
import { useI18n } from '@/hooks/use-i18n';
import type { Notification } from '@/services/notification.service';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { cn } from '@/lib/utils';
import {
  Bell,
  Search,
  X,
  MessageSquare,
  Users,
  Phone,
  Check,
  Trash2,
  UserPlus
} from 'lucide-react';

type FilterType = 'all' | 'new_message' | 'conversation' | 'missed_call' | 'friend_request' | 'mention';

interface FilterOption {
  value: FilterType;
  label: string;
  labelShort?: string; // Version courte pour mobile
  icon: typeof MessageSquare;
}

function NotificationsPageContent() {
  const { t } = useI18n('notifications');
  const router = useRouter();
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  const {
    notifications,
    unreadCount,
    isLoading,
    markAsRead,
    markAllAsRead,
    deleteNotification,
  } = useNotificationsManagerRQ();

  // Filters configuration
  const filters: FilterOption[] = [
    { value: 'all', label: t('filters.all'), labelShort: t('filters.all'), icon: Bell },
    { value: 'new_message', label: t('filters.messages'), labelShort: t('filters.messagesShort'), icon: MessageSquare },
    { value: 'mention', label: t('filters.mentions'), labelShort: t('filters.mentionsShort'), icon: MessageSquare },
    { value: 'conversation', label: t('filters.conversations'), labelShort: t('filters.conversationsShort'), icon: Users },
    { value: 'missed_call', label: t('filters.calls'), labelShort: t('filters.callsShort'), icon: Phone },
    { value: 'friend_request', label: t('filters.friendRequests'), labelShort: t('filters.friendRequestsShort'), icon: UserPlus },
  ];

  // Filter and search notifications
  const filteredNotifications = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();

    return notifications.filter(n => {
      // Filter by type
      if (activeFilter !== 'all') {
        const typeMatch =
          (activeFilter === 'new_message' && (n.type === 'new_message' || n.type === 'message')) ||
          (activeFilter === 'mention' && (n.type === 'user_mentioned' || n.type === 'mention')) ||
          (activeFilter === 'conversation' && (n.type === 'conversation' || n.type === 'new_conversation')) ||
          (activeFilter === 'missed_call' && n.type === 'missed_call') ||
          (activeFilter === 'friend_request' && n.type === 'friend_request');

        if (!typeMatch) return false;
      }

      // Filter by search query
      if (query) {
        const content = (n.content || '').toLowerCase();
        const actorName = (n.actor?.displayName || n.actor?.username || '').toLowerCase();
        const conversationTitle = (n.context?.conversationTitle || '').toLowerCase();

        return content.includes(query) || actorName.includes(query) || conversationTitle.includes(query);
      }

      return true;
    });
  }, [notifications, activeFilter, searchQuery]);

  // Calculate filter counts
  const filterCounts = useMemo(() => ({
    all: notifications.length,
    new_message: notifications.filter(n => n.type === 'new_message' || n.type === 'message').length,
    mention: notifications.filter(n => n.type === 'user_mentioned' || n.type === 'mention').length,
    conversation: notifications.filter(n => n.type === 'conversation' || n.type === 'new_conversation').length,
    missed_call: notifications.filter(n => n.type === 'missed_call').length,
    friend_request: notifications.filter(n => n.type === 'friend_request').length,
  }), [notifications]);

  // Debug: Log first 3 notifications dates in dev mode
  useEffect(() => {
    if (process.env.NODE_ENV === 'development' && notifications.length > 0) {
      console.group('📋 Notifications Debug');
      console.log('Total notifications:', notifications.length);
      console.log('First 3 notifications dates:');
      notifications.slice(0, 3).forEach((n, i) => {
        console.log(`  ${i + 1}. ID: ${n.id}`);
        console.log(`     createdAt: ${n.state.createdAt}`);
        console.log(`     isRead: ${n.state.isRead}`);
      });
      console.groupEnd();
    }
  }, [notifications]);

  const handleNotificationClick = (notification: Notification) => {
    markAsRead(notification.id);

    if (notification.context?.conversationId) {
      const url = notification.context?.messageId
        ? `/conversations/${notification.context.conversationId}?messageId=${notification.context.messageId}#message-${notification.context.messageId}`
        : `/conversations/${notification.context.conversationId}`;
      router.push(url);
    }
  };

  const formatTimeAgo = (timestamp: Date | string) => {
    try {
      const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
      const now = new Date();

      // Vérifier si la date est valide
      if (isNaN(date.getTime())) {
        console.warn('Invalid date:', timestamp);
        return t('timeAgo.now');
      }

      const diffMs = now.getTime() - date.getTime();
      const diffMinutes = Math.floor(diffMs / (1000 * 60));
      const diffSeconds = Math.floor(diffMs / 1000);

      // Si la différence est négative, la notification est dans le futur
      if (diffSeconds < 0) {
        console.warn('⚠️ Notification date is in the future:', {
          now: now.toISOString(),
          notificationDate: date.toISOString(),
          diffSeconds
        });
        return t('timeAgo.now');
      }

      if (diffMinutes < 1) return t('timeAgo.now');
      if (diffMinutes < 60) return t('timeAgo.minute').replace('{count}', diffMinutes.toString());

      const diffHours = Math.floor(diffMinutes / 60);
      if (diffHours < 24) return t('timeAgo.hour').replace('{count}', diffHours.toString());

      const diffDays = Math.floor(diffHours / 24);
      if (diffDays < 7) return t('timeAgo.day').replace('{count}', diffDays.toString());

      return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
    } catch (error) {
      console.error('Error formatting time:', error);
      return t('timeAgo.now');
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 flex items-center justify-center">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
          className="w-10 h-10 border-3 border-blue-500 border-t-transparent rounded-full"
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Animated gradient background - same as login */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950" />

      {/* Animated decorative blobs */}
      <motion.div
        animate={{
          scale: [1, 1.2, 1],
          x: [0, 30, 0],
          y: [0, -20, 0],
        }}
        transition={{
          duration: 8,
          repeat: Infinity,
          ease: "easeInOut",
        }}
        className="absolute top-0 -left-40 w-96 h-96 bg-gradient-to-br from-blue-400/30 to-indigo-500/30 dark:from-blue-600/20 dark:to-indigo-700/20 rounded-full blur-3xl"
      />
      <motion.div
        animate={{
          scale: [1, 1.1, 1],
          x: [0, -20, 0],
          y: [0, 30, 0],
        }}
        transition={{
          duration: 10,
          repeat: Infinity,
          ease: "easeInOut",
          delay: 1,
        }}
        className="absolute top-1/3 -right-40 w-96 h-96 bg-gradient-to-br from-cyan-400/30 to-blue-500/30 dark:from-cyan-600/20 dark:to-blue-700/20 rounded-full blur-3xl"
      />

      {/* Main content */}
      <div className="relative z-10 min-h-screen px-4 py-8 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          {/* Header with glass effect */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="backdrop-blur-xl bg-white/60 dark:bg-gray-900/60 rounded-2xl shadow-xl shadow-black/5 dark:shadow-black/20 border border-white/30 dark:border-gray-700/40 p-6 mb-6"
          >
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg">
                  <Bell className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                    {t('pageTitle')}
                  </h1>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {unreadCount > 0
                      ? t('unreadCount.plural').replace('{count}', unreadCount.toString())
                      : t('unreadCount.empty')
                    }
                  </p>
                </div>
              </div>

              {unreadCount > 0 && (
                <Button
                  onClick={markAllAsRead}
                  size="sm"
                  variant="outline"
                  className="backdrop-blur-sm bg-white/50 dark:bg-gray-800/50 border-white/30 dark:border-gray-700/40 hover:bg-white/70 dark:hover:bg-gray-800/70"
                >
                  <Check className="h-4 w-4 sm:mr-2" />
                  <span className="hidden sm:inline">{t('markAllRead')}</span>
                </Button>
              )}
            </div>

            {/* Search bar */}
            <div className="relative mb-6">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-gray-500 pointer-events-none" />
              <Input
                ref={searchInputRef}
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('search')}
                className="pl-10 pr-10 backdrop-blur-sm bg-white/50 dark:bg-gray-800/50 border-white/30 dark:border-gray-700/40 focus:bg-white/70 dark:focus:bg-gray-800/70 focus:ring-2 focus:ring-blue-500/20"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  aria-label={t('actions.clearSearch')}
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Filters */}
            <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
              {filters.map((filter) => {
                const Icon = filter.icon;
                const count = filterCounts[filter.value];
                const isActive = activeFilter === filter.value;

                return (
                  <motion.button
                    key={filter.value}
                    onClick={() => setActiveFilter(filter.value)}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className={cn(
                      "flex items-center gap-2 px-3 sm:px-4 py-2 rounded-xl text-sm font-medium transition-all whitespace-nowrap",
                      isActive
                        ? "bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow-lg shadow-blue-500/25"
                        : "backdrop-blur-sm bg-white/50 dark:bg-gray-800/50 text-gray-700 dark:text-gray-300 hover:bg-white/70 dark:hover:bg-gray-800/70 border border-white/30 dark:border-gray-700/40"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="hidden sm:inline">{filter.label}</span>
                    <span className="sm:hidden">{filter.labelShort || filter.label}</span>
                    {count > 0 && (
                      <span className={cn(
                        "px-2 py-0.5 rounded-full text-xs font-semibold tabular-nums",
                        isActive
                          ? "bg-white/20 text-white"
                          : "bg-gray-200/50 dark:bg-gray-700/50 text-gray-700 dark:text-gray-300"
                      )}>
                        {count}
                      </span>
                    )}
                  </motion.button>
                );
              })}
            </div>
          </motion.div>

          {/* Notifications list */}
          <div className="space-y-3">
            <AnimatePresence mode="popLayout">
              {filteredNotifications.length === 0 ? (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="backdrop-blur-xl bg-white/60 dark:bg-gray-900/60 rounded-2xl shadow-xl shadow-black/5 dark:shadow-black/20 border border-white/30 dark:border-gray-700/40 p-12 text-center"
                >
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-gray-200 to-gray-300 dark:from-gray-700 dark:to-gray-800 flex items-center justify-center">
                    <Bell className="h-8 w-8 text-gray-400 dark:text-gray-500" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                    {searchQuery ? t('noResults') : t('empty.title')}
                  </h3>
                  <p className="text-gray-600 dark:text-gray-400">
                    {searchQuery ? t('empty.tryDifferentSearch') : t('empty.description')}
                  </p>
                </motion.div>
              ) : (
                filteredNotifications.map((notification, index) => (
                  <motion.div
                    key={notification.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -100 }}
                    transition={{ delay: index * 0.03 }}
                    onClick={() => handleNotificationClick(notification)}
                    className={cn(
                      "backdrop-blur-xl rounded-2xl shadow-lg shadow-black/5 dark:shadow-black/20 border cursor-pointer transition-all hover:scale-[1.02] group",
                      !notification.state.isRead
                        ? "bg-blue-50/80 dark:bg-blue-950/40 border-blue-200/50 dark:border-blue-800/40 hover:bg-blue-100/80 dark:hover:bg-blue-950/60 opacity-100"
                        : "bg-white/60 dark:bg-gray-900/60 border-white/30 dark:border-gray-700/40 hover:bg-white/80 dark:hover:bg-gray-900/80 opacity-75"
                    )}
                  >
                    <div className="p-4 flex items-start gap-4">
                      {/* Avatar */}
                      <Avatar className="h-12 w-12 ring-2 ring-white/50 dark:ring-gray-800/50">
                        <AvatarImage src={notification.actor?.avatar || undefined} />
                        <AvatarFallback className="bg-gradient-to-br from-blue-500 to-indigo-600 text-white font-semibold">
                          {(notification.actor?.displayName || notification.actor?.username || 'U').charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <div className="flex items-center gap-2">
                            <span className={cn(
                              "font-semibold truncate",
                              !notification.state.isRead
                                ? "text-gray-900 dark:text-white"
                                : "text-gray-700 dark:text-gray-300"
                            )}>
                              {notification.actor?.displayName || notification.actor?.username}
                            </span>
                            {!notification.state.isRead && (
                              <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                            )}
                          </div>
                          <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap tabular-nums">
                            {formatTimeAgo(notification.state.createdAt)}
                          </span>
                        </div>

                        <p className={cn(
                          "text-sm mb-1 line-clamp-2",
                          !notification.state.isRead
                            ? "text-gray-800 dark:text-gray-200"
                            : "text-gray-600 dark:text-gray-400"
                        )}>
                          {notification.content}
                        </p>

                        {notification.context?.conversationTitle && (
                          <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                            <Users className="h-3 w-3" />
                            <span className="truncate">
                              {notification.context.conversationType === 'direct'
                                ? t('conversationTypes.private')
                                : notification.context.conversationTitle}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {!notification.state.isRead && (
                          <Button
                            onClick={(e) => {
                              e.stopPropagation();
                              markAsRead(notification.id);
                            }}
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0 hover:bg-white/50 dark:hover:bg-gray-800/50"
                            aria-label={t('actions.markAsRead')}
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteNotification(notification.id);
                          }}
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0 hover:bg-red-50 dark:hover:bg-red-950/30 hover:text-red-600 dark:hover:text-red-400"
                          aria-label={t('actions.delete')}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </motion.div>
                ))
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function NotificationsPage() {
  return (
    <AuthGuard>
      <NotificationsPageContent />
    </AuthGuard>
  );
}
