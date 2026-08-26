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
  /**
   * Cle PRESENTE ⇒ le champ est pose tel quel : un `null` (ou un `undefined`
   * explicite — forme que useUserStatusRealtime donne au `null` servi par la
   * passerelle) EFFACE le dernier instant d'activite. Une presence retiree par
   * le serveur ne survit pas cote client. Cle ABSENTE ⇒ le champ n'est pas touche.
   */
  lastActiveAt?: Date | null;
  username?: string;
}

const presenceTime = (user: Pick<User, 'lastActiveAt'>): number | null => {
  if (user.lastActiveAt === null || user.lastActiveAt === undefined) return null;
  const time = new Date(user.lastActiveAt).getTime();
  return Number.isNaN(time) ? null : time;
};

/**
 * Une charge SANS horodatage n'est jamais « plus ancienne » : c'est la forme
 * d'une presence masquee par la passerelle (`isOnline:false`, `lastActiveAt:null`,
 * cf. applyPresenceVisibilityAsOffline), et elle doit remplacer l'ancienne.
 * La comparaison ne departage que deux charges DATEES — elle protege une
 * presence fraiche (socket) d'une relecture perimee (liste REST en cache).
 */
const isStalerThan = (incoming: User, existing: User): boolean => {
  const incomingTime = presenceTime(incoming);
  const existingTime = presenceTime(existing);
  return incomingTime !== null && existingTime !== null && incomingTime < existingTime;
};

// Le type partage `User.lastActiveAt: Date` ne modelise pas la presence masquee
// (`null` sur le fil) ; le store garde la forme absente (`undefined`), comme
// toMinimalUser et la branche « utilisateur inconnu » ci-dessous.
export type MergeParticipantsOptions = {
  /**
   * `'keep-existing'` — la charge vient d'un CACHE (liste de conversations
   * React Query, persistee) et n'a pas autorite sur la presence : elle met a
   * jour l'identite d'un utilisateur deja connu (nom, avatar…) en conservant
   * ses isOnline / lastActiveAt tels quels, masque compris ; un utilisateur
   * inconnu recoit la charge entiere. Par defaut (`'incoming'`), la presence
   * entrante s'applique selon isStalerThan — forme des ecrivains VIVANTS
   * (presence:snapshot, REST frais).
   */
  presence?: 'incoming' | 'keep-existing';
};

const withExistingPresence = (existing: User, incoming: User): User => ({
  ...existing,
  ...incoming,
  isOnline: existing.isOnline,
  lastActiveAt: existing.lastActiveAt,
});

const mergeKnownUser = (existing: User, incoming: User, options: MergeParticipantsOptions): User => {
  if (options.presence === 'keep-existing') return withExistingPresence(existing, incoming);
  return isStalerThan(incoming, existing) ? existing : { ...existing, ...incoming };
};

const applyStatusUpdate = (user: User, updates: UserStatusUpdate): User =>
  ({
    ...user,
    ...(updates.isOnline !== undefined && { isOnline: updates.isOnline }),
    ...('lastActiveAt' in updates && { lastActiveAt: updates.lastActiveAt ?? undefined }),
  }) as User;

interface UserStoreState {
  usersMap: Map<string, User>;
  participants: User[];
  _lastStatusUpdate: number;

  mergeParticipants: (participants: User[], options?: MergeParticipantsOptions) => void;
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
   * Entre deux charges DATEES, la plus recente gagne ; une charge sans
   * horodatage (presence masquee) est toujours appliquee — voir isStalerThan.
   * Un re-semis depuis un cache passe `presence: 'keep-existing'` — voir
   * MergeParticipantsOptions.
   */
  mergeParticipants: (participants: User[], options: MergeParticipantsOptions = {}) => {
    const state = get();
    const newMap = new Map(state.usersMap);

    for (const user of participants) {
      if (!user.id) continue;
      const existing = newMap.get(user.id);
      if (!existing) {
        newMap.set(user.id, user);
        continue;
      }
      newMap.set(user.id, mergeKnownUser(existing, user, options));
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
      ? applyStatusUpdate(existing, updates)
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
          // A missing lastActiveAt must stay absent — never fabricate now(),
          // which would make getUserStatus decay to 'online' for an offline
          // contact whose "last seen" is hidden by privacy prefs.
          lastActiveAt: updates.lastActiveAt ?? undefined,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        } as unknown as User;

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
    // _lastStatusUpdate sert de signal de re-render pour useUserStatusTick.
    // Date.now() seul peut renvoyer la meme valeur que le mergeParticipants qui
    // precede (meme milliseconde) : le selecteur Zustand ne voit alors aucun
    // changement et le decay temporel n'est jamais recalcule. On garantit une
    // valeur strictement croissante pour toujours declencher le re-render.
    set(state => ({ _lastStatusUpdate: Math.max(Date.now(), state._lastStatusUpdate + 1) }));
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

/**
 * Selector hooks — abonnements granulaires pour eviter les re-renders globaux.
 * useUserById : re-render uniquement quand l'entree de CET utilisateur change.
 * useUserStatusTick : pour les vues qui recalculent des statuts relatifs (decay).
 */
export const useUserById = (userId: string | undefined) => {
  return useUserStore(state => (userId ? state.usersMap.get(userId) : undefined));
};

export const useUserStatusTick = () => {
  return useUserStore(state => state._lastStatusUpdate);
};
