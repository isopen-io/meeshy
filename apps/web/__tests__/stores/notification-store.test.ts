import { act } from '@testing-library/react';
import { useNotificationStore } from '../../stores/notification-store';

describe('Notification UI Store', () => {
  beforeEach(() => {
    act(() => {
      useNotificationStore.setState({
        activeConversationId: null,
        isConnected: false,
      });
    });
  });

  describe('activeConversationId', () => {
    it('should set active conversation id', () => {
      act(() => {
        useNotificationStore.getState().setActiveConversationId('conv-123');
      });

      expect(useNotificationStore.getState().activeConversationId).toBe('conv-123');
    });

    it('should clear active conversation id', () => {
      act(() => {
        useNotificationStore.getState().setActiveConversationId('conv-123');
        useNotificationStore.getState().setActiveConversationId(null);
      });

      expect(useNotificationStore.getState().activeConversationId).toBeNull();
    });
  });

  describe('isConnected', () => {
    it('should set connected state', () => {
      act(() => {
        useNotificationStore.getState().setConnected(true);
      });

      expect(useNotificationStore.getState().isConnected).toBe(true);
    });

    it('should set disconnected state', () => {
      act(() => {
        useNotificationStore.getState().setConnected(true);
        useNotificationStore.getState().setConnected(false);
      });

      expect(useNotificationStore.getState().isConnected).toBe(false);
    });
  });

  describe('initial state', () => {
    it('should have correct initial values', () => {
      const state = useNotificationStore.getState();
      expect(state.activeConversationId).toBeNull();
      expect(state.isConnected).toBe(false);
    });
  });
});
