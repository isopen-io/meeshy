/**
 * User Store - Gestion centralisee des statuts utilisateur en temps reel
 * Ecoute les evenements Socket.IO USER_STATUS pour mettre a jour les statuts
 *
 * IMPORTANT: Ce store est ADDITIF — les utilisateurs sont merges, jamais ecrases.
 * Cela permet d'afficher la presence de tous les utilisateurs dans la liste
 * de conversations, pas seulement ceux de la conversation active.
 */

'use client';

import { create } from 'zustand';
import type { User } from '@/types';

export interface UserStatusUpdate {
  isOnline?: boolean;
  lastActiveAt?: Date;
  username?: string;
}

interface UserStoreState {
  usersMap: Map<string, User>;
  participants: User[];
  _lastStatusUpdate: number;

  mergeParticipants: (participants: User[]) => void;
  /** @deprecated Use mergeParticipants instead */
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
   * Merge des participants dans le store existant (additif).
   * Les donnees plus recentes ecrasent les anciennes pour un meme userId.
   */
  mergeParticipants: (participants: User[]) => {
    const state = get();
    const newMap = new Map(state.usersMap);

    for (const user of participants) {
      if (!user.id) continue;
      const existing = newMap.get(user.id);
      if (existing) {
        const existingTime = existing.lastActiveAt ? new Date(existing.lastActiveAt).getTime() : 0;
        const incomingTime = user.lastActiveAt ? new Date(user.lastActiveAt).getTime() : 0;
        newMap.set(user.id, incomingTime >= existingTime ? { ...existing, ...user } : existing);
      } else {
        newMap.set(user.id, user);
      }
    }

    set({
      usersMap: newMap,
      participants: Array.from(newMap.values()),
      _lastStatusUpdate: Date.now()
    });
  },

  /**
   * Backward-compatible alias — delegates to mergeParticipants
   */
  setParticipants: (participants: User[]) => {
    get().mergeParticipants(participants);
  },

  /**
   * Met a jour le statut d'un utilisateur.
   * Si l'utilisateur n'est pas dans le store, cree une entree minimale
   * pour ne pas perdre l'evenement Socket.IO.
   */
  updateUserStatus: (userId: string, updates: UserStatusUpdate) => {
    const state = get();
    const existing = state.usersMap.get(userId);

    const updatedUser: User = existing
      ? {
          ...existing,
          ...(updates.isOnline !== undefined && { isOnline: updates.isOnline }),
          ...(updates.lastActiveAt && { lastActiveAt: updates.lastActiveAt })
        }
      : {
          id: userId,
          username: updates.username || '',
          displayName: updates.username || '',
          firstName: '',
          lastName: '',
          email: '',
          phoneNumber: '',
          role: 'USER' as const,
          systemLanguage: 'fr',
          regionalLanguage: 'fr',
          autoTranslateEnabled: true,
          isOnline: updates.isOnline ?? false,
          lastActiveAt: updates.lastActiveAt || new Date(),
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        } as User;

    const newMap = new Map(state.usersMap);
    newMap.set(userId, updatedUser);

    const newParticipants = existing
      ? state.participants.map(p => p.id === userId ? updatedUser : p)
      : [...state.participants, updatedUser];

    set({
      usersMap: newMap,
      participants: newParticipants,
      _lastStatusUpdate: Date.now()
    });
  },

  triggerStatusTick: () => {
    set({ _lastStatusUpdate: Date.now() });
  },

  getUserById: (userId: string) => {
    return get().usersMap.get(userId);
  },

  clearStore: () => {
    set({
      usersMap: new Map(),
      participants: [],
      _lastStatusUpdate: Date.now()
    });
  }
}));
