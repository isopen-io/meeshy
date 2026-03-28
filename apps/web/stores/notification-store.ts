import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { useShallow } from 'zustand/react/shallow';

type NotificationUIState = {
  activeConversationId: string | null;
  isConnected: boolean;
};

type NotificationUIActions = {
  setActiveConversationId: (conversationId: string | null) => void;
  setConnected: (isConnected: boolean) => void;
};

type NotificationUIStore = NotificationUIState & NotificationUIActions;

export const useNotificationStore = create<NotificationUIStore>()(
  devtools(
    (set) => ({
      activeConversationId: null,
      isConnected: false,

      setActiveConversationId: (conversationId: string | null) => {
        set({ activeConversationId: conversationId });
      },

      setConnected: (isConnected: boolean) => {
        set({ isConnected });
      },
    }),
    { name: 'NotificationStore' }
  )
);

export const useNotificationActions = () =>
  useNotificationStore(
    useShallow((state) => ({
      setActiveConversationId: state.setActiveConversationId,
      setConnected: state.setConnected,
    }))
  );

export const useActiveConversationId = () =>
  useNotificationStore((state) => state.activeConversationId);

export const useIsNotificationConnected = () =>
  useNotificationStore((state) => state.isConnected);
