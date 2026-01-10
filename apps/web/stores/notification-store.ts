/**
 * Store Zustand pour les notifications
 * Gère l'état global des notifications avec real-time Socket.IO
 * Support Firebase + WebSocket avec fallback gracieux
 */

import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { useShallow } from 'zustand/react/shallow';
import type {
  Notification,
  NotificationStore,
  NotificationFilters,
  NotificationCounts,
  NotificationType,
  NotificationPriority,
  NotificationPaginationOptions
} from '@/types/notification';
import { firebaseChecker } from '@/utils/firebase-availability-checker';

/**
 * État initial du store
 */
const initialState = {
  notifications: [],
  unreadCount: 0,
  counts: {
    total: 0,
    unread: 0,
    byType: {} as Record<NotificationType, number>,
    byPriority: {} as Record<NotificationPriority, number>
  },
  isLoading: false,
  isLoadingMore: false,
  error: null,
  page: 1,
  hasMore: true,
  filters: {
    type: 'all' as const,
    isRead: undefined
  },
  isConnected: false,
  lastSync: undefined,
  activeConversationId: null // ObjectId de la conversation actuellement affichée
};

/**
 * Configuration du store
 */
const STORE_CONFIG = {
  MAX_NOTIFICATIONS: 500,
  PAGE_SIZE: 50,
  CACHE_DURATION: 5 * 60 * 1000 // 5 minutes
};

/**
 * Store Zustand pour les notifications
 */
export const useNotificationStore = create<NotificationStore>()(
  devtools(
    persist(
      (set, get) => ({
        ...initialState,

        /**
         * Initialise le store (appelé au montage)
         * CRITICAL: Toujours initialiser WebSocket, Firebase optionnel
         */
        initialize: async () => {
          const state = get();
          if (state.isLoading || state.isConnected) {
            return;
          }

          set({ isLoading: true, error: null });

          try {
            // 1. Toujours charger les notifications depuis l'API (WebSocket)
            await get().fetchNotifications({ offset: 0, limit: STORE_CONFIG.PAGE_SIZE });

            // 2. Initialiser Firebase seulement si disponible
            if (firebaseChecker.isAvailable()) {
              try {
                console.info('[NotificationStore] Firebase available - initializing FCM');
                // Importer et initialiser FCM
                const { fcm } = await import('@/utils/fcm-manager');
                const initialized = await fcm.initialize();
                if (initialized) {
                  console.info('[NotificationStore] FCM initialized successfully');
                }
              } catch (fcmError) {
                console.error('[NotificationStore] FCM init failed (non-critical):', fcmError);
                // Ne pas bloquer l'initialisation, WebSocket fonctionne toujours
              }
            } else {
              console.info('[NotificationStore] Running without Firebase - WebSocket only');
            }

            set({
              isConnected: true,
              lastSync: new Date()
            });
          } catch (error) {
            console.error('[NotificationStore] Initialization error:', error);
            set({
              error: error instanceof Error ? error.message : 'Initialization failed',
              isConnected: false
            });
          } finally {
            set({ isLoading: false });
          }
        },

        /**
         * Déconnecte le store
         */
        disconnect: () => {
          set({
            isConnected: false,
            lastSync: undefined
          });
        },

        /**
         * Charge les notifications depuis l'API
         */
        fetchNotifications: async (options?: Partial<NotificationPaginationOptions>) => {
          const state = get();
          const page = options?.offset !== undefined ? Math.floor(options.offset / (options.limit || STORE_CONFIG.PAGE_SIZE)) + 1 : state.page;
          const limit = options?.limit || STORE_CONFIG.PAGE_SIZE;
          const offset = (page - 1) * limit;

          set({ isLoading: page === 1, isLoadingMore: page > 1, error: null });

          try {
            // Import dynamique pour éviter les circular dependencies
            const { NotificationService } = await import('@/services/notification.service');

            const response = await NotificationService.fetchNotifications({
              ...state.filters,
              offset,
              limit,
              sortBy: 'createdAt',
              sortOrder: 'desc'
            });

            // Vérifier que response.data et pagination existent
            if (response.data?.notifications && response.data?.pagination) {
              const { notifications, pagination } = response.data;

              set(state => ({
                notifications: page === 1
                  ? notifications
                  : [...state.notifications, ...notifications],
                page,
                hasMore: pagination.hasMore,
                unreadCount: notifications.filter(n => !n.isRead).length,
                lastSync: new Date()
              }));

              // Mettre à jour les compteurs
              get().updateCountsFromNotifications();
            } else {
              console.error('[NotificationStore] Invalid response structure:', {
                hasData: !!response.data,
                hasNotifications: !!response.data?.notifications,
                hasPagination: !!response.data?.pagination,
                response
              });
              set({
                error: 'Invalid response structure from API',
                notifications: [],
                hasMore: false
              });
            }
          } catch (error) {
            console.error('[NotificationStore] Fetch error:', error);
            set({
              error: error instanceof Error ? error.message : 'Failed to fetch notifications'
            });
          } finally {
            set({ isLoading: false, isLoadingMore: false });
          }
        },

        /**
         * Charge plus de notifications (pagination infinie)
         */
        fetchMore: async () => {
          const state = get();

          if (!state.hasMore || state.isLoadingMore) {
            return;
          }

          await get().fetchNotifications({
            offset: state.page * STORE_CONFIG.PAGE_SIZE,
            limit: STORE_CONFIG.PAGE_SIZE
          });
        },

        /**
         * Rafraîchit les notifications
         */
        refresh: async () => {
          set({ page: 1, hasMore: true });
          await get().fetchNotifications({ offset: 0, limit: STORE_CONFIG.PAGE_SIZE });
        },

        /**
         * Ajoute une notification (via Socket.IO)
         */
        addNotification: (notification: Notification) => {
          set(state => {
            // Éviter les doublons
            if (state.notifications.some(n => n.id === notification.id)) {
              return state;
            }

            // FILTRE: Ignorer les notifications de la conversation active
            // Si l'utilisateur est déjà dans la conversation, pas besoin de notification
            if (notification.context?.conversationId) {
              const notificationConversationId = notification.context.conversationId;

              // Utiliser activeConversationId qui est défini par les composants de conversation
              // IMPORTANT: Toujours comparer avec les conversationId (ObjectIds), jamais avec les identifiers
              if (state.activeConversationId === notificationConversationId) {
                console.log('[NotificationStore] Notification ignorée - utilisateur déjà dans la conversation:', notificationConversationId);
                return state; // Ignorer cette notification
              }
            }

            // Ajouter au début de la liste
            const notifications = [notification, ...state.notifications];

            // LRU eviction si dépassement
            if (notifications.length > STORE_CONFIG.MAX_NOTIFICATIONS) {
              // Supprimer les notifications lues les plus anciennes
              const sorted = [...notifications].sort((a, b) => {
                if (a.isRead !== b.isRead) return a.isRead ? -1 : 1;
                return a.createdAt.getTime() - b.createdAt.getTime();
              });

              const toRemoveCount = Math.ceil(STORE_CONFIG.MAX_NOTIFICATIONS * 0.2);
              const idsToRemove = new Set(sorted.slice(0, toRemoveCount).map(n => n.id));

              return {
                notifications: notifications.filter(n => !idsToRemove.has(n.id)),
                unreadCount: state.unreadCount + (notification.isRead ? 0 : 1)
              };
            }

            return {
              notifications,
              unreadCount: state.unreadCount + (notification.isRead ? 0 : 1)
            };
          });

          // Mettre à jour les compteurs
          get().updateCountsFromNotifications();
        },

        /**
         * Supprime une notification
         */
        removeNotification: (id: string) => {
          set(state => {
            const notification = state.notifications.find(n => n.id === id);
            const notifications = state.notifications.filter(n => n.id !== id);

            return {
              notifications,
              unreadCount: notification && !notification.isRead
                ? state.unreadCount - 1
                : state.unreadCount
            };
          });

          get().updateCountsFromNotifications();
        },

        /**
         * Marque une notification comme lue
         */
        markAsRead: async (id: string) => {
          const notification = get().notifications.find(n => n.id === id);

          if (!notification || notification.isRead) {
            return;
          }

          // Optimistic update
          set(state => ({
            notifications: state.notifications.map(n =>
              n.id === id ? { ...n, isRead: true, readAt: new Date() } : n
            ),
            unreadCount: Math.max(0, state.unreadCount - 1)
          }));

          try {
            const { NotificationService } = await import('@/services/notification.service');
            await NotificationService.markAsRead(id);
            get().updateCountsFromNotifications();
          } catch (error) {
            console.error('[NotificationStore] Mark as read error:', error);

            // Rollback optimistic update
            set(state => ({
              notifications: state.notifications.map(n =>
                n.id === id ? { ...n, isRead: false, readAt: undefined } : n
              ),
              unreadCount: state.unreadCount + 1
            }));
          }
        },

        /**
         * Marque toutes les notifications comme lues
         */
        markAllAsRead: async () => {
          const previousNotifications = get().notifications;
          const previousUnreadCount = get().unreadCount;

          // Optimistic update
          set(state => ({
            notifications: state.notifications.map(n => ({
              ...n,
              isRead: true,
              readAt: n.readAt || new Date()
            })),
            unreadCount: 0
          }));

          try {
            const { NotificationService } = await import('@/services/notification.service');
            await NotificationService.markAllAsRead();
            get().updateCountsFromNotifications();
          } catch (error) {
            console.error('[NotificationStore] Mark all as read error:', error);

            // Rollback
            set({
              notifications: previousNotifications,
              unreadCount: previousUnreadCount
            });
          }
        },

        /**
         * Supprime une notification
         */
        deleteNotification: async (id: string) => {
          const previousNotifications = get().notifications;
          const notification = previousNotifications.find(n => n.id === id);

          // Optimistic update
          get().removeNotification(id);

          try {
            const { NotificationService } = await import('@/services/notification.service');
            await NotificationService.deleteNotification(id);
          } catch (error) {
            console.error('[NotificationStore] Delete error:', error);

            // Rollback
            if (notification) {
              set({ notifications: previousNotifications });
            }
          }
        },

        /**
         * Supprime toutes les notifications lues
         */
        deleteAllRead: async () => {
          const previousNotifications = get().notifications;

          // Optimistic update
          set(state => ({
            notifications: state.notifications.filter(n => !n.isRead)
          }));

          try {
            const { NotificationService } = await import('@/services/notification.service');
            await NotificationService.deleteAllRead();
            get().updateCountsFromNotifications();
          } catch (error) {
            console.error('[NotificationStore] Delete all read error:', error);

            // Rollback
            set({ notifications: previousNotifications });
          }
        },

        /**
         * Définit les filtres
         */
        setFilters: (filters: Partial<NotificationFilters>) => {
          set(state => ({
            filters: { ...state.filters, ...filters },
            page: 1,
            hasMore: true
          }));

          // Recharger les notifications avec les nouveaux filtres
          get().fetchNotifications({ offset: 0, limit: STORE_CONFIG.PAGE_SIZE });
        },

        /**
         * Réinitialise les filtres
         */
        clearFilters: () => {
          set({
            filters: {
              type: 'all',
              isRead: undefined
            },
            page: 1,
            hasMore: true
          });

          get().fetchNotifications({ offset: 0, limit: STORE_CONFIG.PAGE_SIZE });
        },

        /**
         * Met à jour les compteurs
         */
        updateCounts: (counts: NotificationCounts) => {
          set({ counts });
        },

        /**
         * Met à jour les compteurs depuis les notifications en mémoire
         */
        updateCountsFromNotifications: () => {
          const { notifications } = get();

          const byType = {} as Record<NotificationType, number>;
          const byPriority = {} as Record<NotificationPriority, number>;

          notifications.forEach(n => {
            byType[n.type] = (byType[n.type] || 0) + 1;
            byPriority[n.priority] = (byPriority[n.priority] || 0) + 1;
          });

          set({
            counts: {
              total: notifications.length,
              unread: notifications.filter(n => !n.isRead).length,
              byType,
              byPriority
            }
          });
        },

        /**
         * Définit l'état de chargement
         */
        setLoading: (isLoading: boolean) => {
          set({ isLoading });
        },

        /**
         * Définit l'erreur
         */
        setError: (error: string | null) => {
          set({ error });
        },

        /**
         * Définit l'état de connexion
         */
        setConnected: (isConnected: boolean) => {
          set({ isConnected });
        },

        /**
         * Définit la conversation active pour filtrer les notifications
         * @param conversationId - L'ObjectId de la conversation (pas l'identifier!)
         */
        setActiveConversationId: (conversationId: string | null) => {
          set({ activeConversationId: conversationId });
        }
      }),
      {
        name: 'meeshy-notifications',
        version: 1,
        partialize: (state) => ({
          notifications: state.notifications.slice(0, 50), // Cache seulement les 50 premières
          unreadCount: state.unreadCount,
          counts: state.counts,
          filters: state.filters,
          lastSync: state.lastSync,
          activeConversationId: state.activeConversationId
        }),
        // Migration depuis l'ancienne version si nécessaire
        migrate: (persistedState: any, version: number) => {
          if (version === 0) {
            return {
              ...initialState,
              notifications: [],
              unreadCount: 0
            };
          }
          return persistedState as NotificationStore;
        }
      }
    ),
    { name: 'NotificationStore' }
  )
);

/**
 * Hooks sélecteurs pour optimiser les re-renders
 */
export const useNotifications = () =>
  useNotificationStore(state => state.notifications);

export const useUnreadCount = () =>
  useNotificationStore(state => state.unreadCount);

export const useNotificationCounts = () =>
  useNotificationStore(state => state.counts);

export const useNotificationFilters = () =>
  useNotificationStore(state => state.filters);

export const useNotificationLoading = () =>
  useNotificationStore(state => state.isLoading);

export const useNotificationActions = () =>
  useNotificationStore(
    useShallow(state => ({
      initialize: state.initialize,
      disconnect: state.disconnect,
      fetchNotifications: state.fetchNotifications,
      fetchMore: state.fetchMore,
      refresh: state.refresh,
      addNotification: state.addNotification,
      removeNotification: state.removeNotification,
      markAsRead: state.markAsRead,
      markAllAsRead: state.markAllAsRead,
      deleteNotification: state.deleteNotification,
      deleteAllRead: state.deleteAllRead,
      setFilters: state.setFilters,
      clearFilters: state.clearFilters,
      setActiveConversationId: state.setActiveConversationId
    }))
  );
