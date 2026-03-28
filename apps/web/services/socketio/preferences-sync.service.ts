'use client';

import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import type { UserPreferencesUpdatedEventData } from '@meeshy/shared/types/socketio-events';
import type { TypedSocket, UnsubscribeFn } from './types';

type PreferencesUpdatedListener = (data: UserPreferencesUpdatedEventData) => void;

export class PreferencesSyncService {
  private listeners: Set<PreferencesUpdatedListener> = new Set();

  setupEventListeners(socket: TypedSocket): void {
    socket.on(SERVER_EVENTS.USER_PREFERENCES_UPDATED as any, (data: UserPreferencesUpdatedEventData) => {
      this.listeners.forEach(listener => listener(data));
    });
  }

  onPreferencesUpdated(listener: PreferencesUpdatedListener): UnsubscribeFn {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  cleanup(): void {
    this.listeners.clear();
  }
}
