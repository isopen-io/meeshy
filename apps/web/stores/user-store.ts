/**
 * User Store - Gestion centralisée des statuts utilisateur en temps réel
 * Écoute les événements Socket.IO USER_STATUS pour mettre à jour les statuts
 */

'use client';

import { create } from 'zustand';
import type { User } from '@/types';

export interface UserStatusUpdate {
  isOnline?: boolean;
  lastActiveAt?: Date;
}

interface UserStoreState {
  // Map userId -> User pour un accès O(1)
  usersMap: Map<string, User>;

  // Liste des participants pour compatibilité
  participants: User[];

  // Timestamp de la dernière mise à jour (pour forcer re-render)
  _lastStatusUpdate: number;

  // Actions
  setParticipants: (participants: User[]) => void;
  updateUserStatus: (userId: string, updates: UserStatusUpdate) => void;
  triggerStatusTick: () => void;
  getUserById: (userId: string) => User | undefined;
  clearStore: () => void;
}

export const useUserStore = create<UserStoreState>((set, get) => ({
  usersMap: new Map(),
  participants: [],
  _lastStatusUpdate: 0,

  /**
   * Initialiser/remplacer la liste des participants
   */
  setParticipants: (participants: User[]) => {
    const usersMap = new Map<string, User>();
    participants.forEach(user => {
      usersMap.set(user.id, user);
    });

    set({
      participants,
      usersMap,
      _lastStatusUpdate: Date.now()
    });
  },

  /**
   * Mettre à jour le statut d'un utilisateur spécifique
   * Appelé par le hook useUserStatusRealtime lors de réception d'événements Socket.IO
   */
  updateUserStatus: (userId: string, updates: UserStatusUpdate) => {
    const state = get();
    const user = state.usersMap.get(userId);

    if (!user) {
      // L'utilisateur n'est pas dans le store, ignorer silencieusement
      return;
    }

    // Créer l'utilisateur mis à jour
    const updatedUser: User = {
      ...user,
      ...(updates.isOnline !== undefined && { isOnline: updates.isOnline }),
      ...(updates.lastActiveAt && { lastActiveAt: updates.lastActiveAt })
    };

    // Mettre à jour la map
    const newUsersMap = new Map(state.usersMap);
    newUsersMap.set(userId, updatedUser);

    // Mettre à jour la liste des participants
    const newParticipants = state.participants.map(p =>
      p.id === userId ? updatedUser : p
    );


    set({
      usersMap: newUsersMap,
      participants: newParticipants,
      _lastStatusUpdate: Date.now()
    });
  },

  /**
   * Tick local : force un re-render pour que getUserStatus() recalcule
   * les transitions temporelles (VERT→ORANGE→GRIS) sans appel réseau.
   */
  triggerStatusTick: () => {
    set({ _lastStatusUpdate: Date.now() });
  },

  /**
   * Récupérer un utilisateur par son ID (O(1))
   */
  getUserById: (userId: string) => {
    return get().usersMap.get(userId);
  },

  /**
   * Nettoyer le store (lors de déconnexion par exemple)
   */
  clearStore: () => {
    set({
      usersMap: new Map(),
      participants: [],
      _lastStatusUpdate: Date.now()
    });
  }
}));
