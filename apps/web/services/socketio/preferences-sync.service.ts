'use client';

import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import type { UserPreferencesUpdatedEventData } from '@meeshy/shared/types/socketio-events';
import type { TypedSocket, UnsubscribeFn } from './types';

type PreferencesUpdatedListener = (data: UserPreferencesUpdatedEventData) => void;
type CategoryChangedListener = () => void;

export class PreferencesSyncService {
  private listeners: Set<PreferencesUpdatedListener> = new Set();
  private categoryChangedListeners: Set<CategoryChangedListener> = new Set();

  setupEventListeners(socket: TypedSocket): void {
    socket.on(SERVER_EVENTS.USER_PREFERENCES_UPDATED as any, (data: UserPreferencesUpdatedEventData) => {
      this.listeners.forEach(listener => listener(data));
    });

    const notifyCategory = () => this.categoryChangedListeners.forEach(l => l());
    socket.on(SERVER_EVENTS.CATEGORY_CREATED as any, notifyCategory);
    socket.on(SERVER_EVENTS.CATEGORY_UPDATED as any, notifyCategory);
    socket.on(SERVER_EVENTS.CATEGORY_DELETED as any, notifyCategory);
    socket.on(SERVER_EVENTS.CATEGORIES_REORDERED as any, notifyCategory);
    socket.on(SERVER_EVENTS.USER_PREFERENCES_REORDERED as any, notifyCategory);
  }

  onPreferencesUpdated(listener: PreferencesUpdatedListener): UnsubscribeFn {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onCategoryChanged(listener: CategoryChangedListener): UnsubscribeFn {
    this.categoryChangedListeners.add(listener);
    return () => this.categoryChangedListeners.delete(listener);
  }

  cleanup(): void {
    this.listeners.clear();
    this.categoryChangedListeners.clear();
  }
}
