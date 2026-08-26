'use client';

import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import type {
  UserPreferencesUpdatedEventData,
  UserPreferencesReorderedEventData,
  UserPreferencesCommunityReorderedEventData,
} from '@meeshy/shared/types/socketio-events';
import type { TypedSocket, UnsubscribeFn } from './types';

type PreferencesUpdatedListener = (data: UserPreferencesUpdatedEventData) => void;
type PreferencesReorderedListener = (data: UserPreferencesReorderedEventData) => void;
type CommunityPreferencesReorderedListener = (
  data: UserPreferencesCommunityReorderedEventData
) => void;
type CategoryChangedListener = () => void;

export class PreferencesSyncService {
  private listeners: Set<PreferencesUpdatedListener> = new Set();
  private reorderedListeners: Set<PreferencesReorderedListener> = new Set();
  private communityReorderedListeners: Set<CommunityPreferencesReorderedListener> = new Set();
  private categoryChangedListeners: Set<CategoryChangedListener> = new Set();

  setupEventListeners(socket: TypedSocket): void {
    socket.on(SERVER_EVENTS.USER_PREFERENCES_UPDATED as any, (data: UserPreferencesUpdatedEventData) => {
      this.listeners.forEach(listener => listener(data));
    });

    // `user:preferences-reordered` a sa PROPRE sortie, et c'est le fond du
    // sujet : il porte `updates[]` — l'ordre de la liste, que rien d'autre
    // n'annonce — alors que le seau des catégories ci-dessous notifie par un
    // `() => void`. L'y router jetait la charge utile à l'entrée, et faisait
    // en plus relire les catégories, qu'un réordonnancement de conversations
    // ne touche jamais.
    socket.on(SERVER_EVENTS.USER_PREFERENCES_REORDERED as any, (data: UserPreferencesReorderedEventData) => {
      this.reorderedListeners.forEach(listener => listener(data));
    });

    // Le geste JUMEAU sur l'autre table, et son propre nom d'événement : la
    // charge de celui-ci porte des `communityId`, que le décodeur du précédent
    // (iOS compris) déclare en `conversationId` NON optionnel. Les router
    // ensemble casserait le cas nominal — cf.
    // `UserPreferencesCommunityReorderedEventData`.
    socket.on(
      SERVER_EVENTS.USER_PREFERENCES_COMMUNITY_REORDERED as any,
      (data: UserPreferencesCommunityReorderedEventData) => {
        this.communityReorderedListeners.forEach(listener => listener(data));
      }
    );

    const notifyCategory = () => this.categoryChangedListeners.forEach(l => l());
    socket.on(SERVER_EVENTS.CATEGORY_CREATED as any, notifyCategory);
    socket.on(SERVER_EVENTS.CATEGORY_UPDATED as any, notifyCategory);
    socket.on(SERVER_EVENTS.CATEGORY_DELETED as any, notifyCategory);
    socket.on(SERVER_EVENTS.CATEGORIES_REORDERED as any, notifyCategory);
  }

  onPreferencesUpdated(listener: PreferencesUpdatedListener): UnsubscribeFn {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onPreferencesReordered(listener: PreferencesReorderedListener): UnsubscribeFn {
    this.reorderedListeners.add(listener);
    return () => this.reorderedListeners.delete(listener);
  }

  onCommunityPreferencesReordered(listener: CommunityPreferencesReorderedListener): UnsubscribeFn {
    this.communityReorderedListeners.add(listener);
    return () => this.communityReorderedListeners.delete(listener);
  }

  onCategoryChanged(listener: CategoryChangedListener): UnsubscribeFn {
    this.categoryChangedListeners.add(listener);
    return () => this.categoryChangedListeners.delete(listener);
  }

  cleanup(): void {
    this.listeners.clear();
    this.reorderedListeners.clear();
    this.communityReorderedListeners.clear();
    this.categoryChangedListeners.clear();
  }
}
