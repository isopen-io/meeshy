/**
 * App Store - Global application state with Zustand persistence
 */

import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { useShallow } from 'zustand/react/shallow';

interface AppNotification {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message?: string;
  timestamp: Date;
  duration?: number;
  actions?: Array<{
    label: string;
    action: () => void;
  }>;
}

interface AppState {
  theme: 'light' | 'dark' | 'auto';
  notifications: AppNotification[];
  isInitialized: boolean;
}

interface AppActions {
  setTheme: (theme: AppState['theme']) => void;
  addNotification: (notification: Omit<AppNotification, 'id' | 'timestamp'>) => void;
  removeNotification: (id: string) => void;
  clearNotifications: () => void;
  initialize: () => Promise<void>;
}

type AppStore = AppState & AppActions;

const initialState: AppState = {
  theme: 'auto',
  notifications: [],
  isInitialized: false,
};

export const useAppStore = create<AppStore>()(
  devtools(
    persist(
      (set, get) => ({
        ...initialState,

        setTheme: (theme: AppState['theme']) => {
          set({ theme });
          
          // Apply theme to document
          if (typeof window !== 'undefined') {
            const root = window.document.documentElement;
            root.classList.remove('light', 'dark');
            
            if (theme === 'auto') {
              const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
              root.classList.add(prefersDark ? 'dark' : 'light');
            } else {
              root.classList.add(theme);
            }
          }
        },

        addNotification: (notification: Omit<AppNotification, 'id' | 'timestamp'>) => {
          const newNotification: AppNotification = {
            ...notification,
            id: `notification-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            timestamp: new Date(),
          };
          
          set((state) => ({
            notifications: [...state.notifications, newNotification],
          }));
          
          // Auto-remove notification after duration
          if (notification.duration !== 0) {
            const duration = notification.duration || 5000;
            setTimeout(() => {
              get().removeNotification(newNotification.id);
            }, duration);
          }
        },

        removeNotification: (id: string) => {
          set((state) => ({
            notifications: state.notifications.filter(n => n.id !== id),
          }));
        },

        clearNotifications: () => {
          set({ notifications: [] });
        },

        initialize: async () => {
          try {
            // NOTE: l'état réseau est désormais géré par la source unique
            // `useConnectionStatus()` (hooks/use-connection-status.ts).
            // Plus de listener online/offline dupliqué ici.
            if (typeof window !== 'undefined') {
              get().setTheme(get().theme);
            }

            set({ isInitialized: true });

          } catch (error) {
            console.error('[APP_STORE] Initialization error:', error);
            get().addNotification({
              type: 'error',
              title: 'Initialization Error',
              message: 'Failed to initialize application',
            });
          }
        },
      }),
      {
        name: 'meeshy-app',
        partialize: (state) => ({
          theme: state.theme,
          // Don't persist notifications or online status
        }),
      }
    ),
    { name: 'AppStore' }
  )
);

// Selector hooks
export const useTheme = () => useAppStore((state) => state.theme);
export const useNotifications = () => useAppStore((state) => state.notifications);
export const useIsInitialized = () => useAppStore((state) => state.isInitialized);

// Use useShallow to prevent infinite loops when selecting multiple actions
export const useAppActions = () => useAppStore(
  useShallow((state) => ({
    setTheme: state.setTheme,
    addNotification: state.addNotification,
    removeNotification: state.removeNotification,
    clearNotifications: state.clearNotifications,
  }))
);