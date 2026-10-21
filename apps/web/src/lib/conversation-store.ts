import { createStore } from 'zustand/vanilla';

import { flagsOf, type ConversationFlags, type ConversationPreferencePatch } from './api/preferences';
import type { Conversation } from './api/types';
import { unreadOf } from './view/conversation';
import { servedWriteRestriction } from './write-restriction';

/**
 * L'ÉTAT OPTIMISTE DES ACTIONS DE RANGÉE (#5559 §5.4) — épingler, sourdine,
 * archiver, marquer lu/non-lu.
 *
 * Cet état n'appartient PAS au client : `isPinned`/`isMuted`/`isArchived`
 * viennent du wire (`userPreferences`, §3.1) et `unreadCount` du serveur. Le
 * store ne porte donc AUCUNE persistance locale (contrairement à
 * `reading-mode/store.ts`, qui mémorise un mode COLLANT dans
 * `localStorage`) — seulement des OVERRIDES, la correction optimiste qu'un
 * appel serveur confirmera ou effacera. Quand le lot `staging` câble le
 * réseau, chaque action appelle le port correspondant
 * (`pushConversationFlags`/`pushRead`/`pushUnread`, `api/preferences.ts`)
 * puis RETIRE l'override sur 4xx — sémantique iOS
 * `ConversationListViewModel.togglePin` (`:2044-2053`) : la mise à jour
 * optimiste précède l'appel, un refus la défait, un succès la laisse telle
 * quelle (le prochain `GET /conversations` la remplacera par le wire
 * confirmé).
 *
 * `zustand/vanilla` — pas `zustand` (l'entrée par défaut suppose un
 * consommateur React immédiat) : ce fichier ne sait rien de la vue, les
 * composants s'y abonnent via `zustand/react`'s `useStore(conversationStore,
 * selector)`. `createStore` rend le magasin observable par `subscribe()`
 * hors de tout composant — c'est ce qu'un témoin exploite directement,
 * sans monter d'arbre.
 */
export type ConversationOverride = {
  readonly flags?: Partial<ConversationFlags>;
  readonly unreadCount?: number;
  /** Favori, catégorie, nom personnel (#10593) — `null` = retiré. */
  readonly preferences?: ConversationPreferencePatch;
};

type Overrides = Readonly<Record<string, ConversationOverride>>;

/** Les clés qu'un override PORTE — `unreadCount` à part, `flags` détaillé
 * champ par champ (#5650, F4/§5, étape 7). */
export type PreferenceKey = keyof ConversationPreferencePatch;

export type OverrideKey = 'isPinned' | 'isMuted' | 'isArchived' | 'unreadCount' | PreferenceKey;

const PREFERENCE_KEYS: readonly PreferenceKey[] = ['reaction', 'categoryId', 'customName'];

const isPreferenceKey = (key: OverrideKey): key is PreferenceKey => (PREFERENCE_KEYS as readonly OverrideKey[]).includes(key);

type FlagKey = Exclude<OverrideKey, 'unreadCount' | PreferenceKey>;

export type ConversationStoreState = {
  readonly overrides: Overrides;
  togglePin(id: string, current: boolean): void;
  toggleMute(id: string, current: boolean): void;
  toggleArchive(id: string, current: boolean): void;
  markRead(id: string): void;
  markUnread(id: string): void;
  /** Pose la correction optimiste d'une préférence (#10593). */
  setPreference(id: string, patch: ConversationPreferencePatch): void;
  /**
   * `clearOverride` (#5650, F4) — RETIRE les clés nommées de l'override d'UNE
   * conversation, IMMUABLE, et supprime l'entrée quand elle devient vide
   * (jamais un `{}` orphelin qui traînerait dans `overrides` indéfiniment).
   * Consommé par `performRowAction` (`api/conversation-actions.ts`) : un
   * 2xx retire la clé confirmée (le cache prend la valeur SERVEUR), un 4xx
   * retire la même clé (rollback) — deux issues, un seul geste.
   */
  clearOverride(id: string, keys: readonly OverrideKey[]): void;
};

const mergeOverride = (overrides: Overrides, id: string, patch: ConversationOverride): Overrides => ({
  ...overrides,
  [id]: { ...overrides[id], ...patch },
});

const mergeFlag = (
  overrides: Overrides,
  id: string,
  field: keyof ConversationFlags,
  value: boolean,
): Overrides =>
  mergeOverride(overrides, id, { flags: { ...overrides[id]?.flags, [field]: value } });

const remaining = <T extends object>(record: T | undefined, remove: ReadonlySet<string>): Partial<T> | undefined => {
  if (record === undefined) return undefined;
  const entries = Object.entries(record).filter(([key]) => !remove.has(key));
  return entries.length > 0 ? (Object.fromEntries(entries) as Partial<T>) : undefined;
};

/** Une FABRIQUE (#10593) : le singleton de l'application en est une instance,
 * et chaque témoin prend la sienne — deux tests ne se voient jamais. */
export const createConversationStore = () => createStore<ConversationStoreState>((set) => ({
  overrides: {},
  togglePin: (id, current) => set((state) => ({ overrides: mergeFlag(state.overrides, id, 'isPinned', !current) })),
  toggleMute: (id, current) => set((state) => ({ overrides: mergeFlag(state.overrides, id, 'isMuted', !current) })),
  toggleArchive: (id, current) =>
    set((state) => ({ overrides: mergeFlag(state.overrides, id, 'isArchived', !current) })),
  markRead: (id) => set((state) => ({ overrides: mergeOverride(state.overrides, id, { unreadCount: 0 }) })),
  /**
   * `unreadCount: 1` — le serveur recule le curseur d'UN message avant le
   * dernier (`ConversationListViewModel.markAsUnread`, `:2150-2160`) : depuis
   * n'importe quel état lu, le résultat observable est « au moins un non
   * lu ». Un compte plus précis exigerait de connaître le nombre RÉEL de
   * messages non consommés, que l'optimiste n'a pas — le serveur le corrige
   * au prochain `GET /conversations`.
   */
  markUnread: (id) => set((state) => ({ overrides: mergeOverride(state.overrides, id, { unreadCount: 1 }) })),
  setPreference: (id, patch) =>
    set((state) => ({ overrides: mergeOverride(state.overrides, id, { preferences: { ...state.overrides[id]?.preferences, ...patch } }) })),
  clearOverride: (id, keys) =>
    set((state) => {
      const current = state.overrides[id];
      if (current === undefined) return state;

      const removeFlags = new Set<string>(keys.filter((k): k is FlagKey => k !== 'unreadCount' && !isPreferenceKey(k)));
      const removePreferences = new Set<string>(keys.filter(isPreferenceKey));
      const removeUnread = keys.includes('unreadCount');

      const flags = remaining(current.flags, removeFlags);
      const preferences = remaining(current.preferences, removePreferences);
      const next: ConversationOverride = {
        ...(flags === undefined ? {} : { flags }),
        ...(!removeUnread && current.unreadCount !== undefined ? { unreadCount: current.unreadCount } : {}),
        ...(preferences === undefined ? {} : { preferences }),
      };

      if (Object.keys(next).length === 0) {
        const { [id]: _removed, ...rest } = state.overrides;
        return { overrides: rest };
      }
      return { overrides: { ...state.overrides, [id]: next } };
    }),
}));

export const conversationStore = createConversationStore();

/**
 * Sélecteurs PURS — `(conversation, overrides)`, jamais le store lui-même :
 * un témoin ou un composant qui n'a besoin que de LIRE l'état effectif ne
 * doit pas s'abonner à `conversationStore` pour ça.
 */
export function effectiveFlagsOf(conversation: Conversation, overrides: Overrides): ConversationFlags {
  const wire = flagsOf(conversation);
  const override = overrides[conversation.id]?.flags;
  const merged = override === undefined ? wire : { ...wire, ...override };
  /* L'ARCHIVE IMPOSÉE GAGNE (#9928) : Global fermée à un mineur reste aux
     archives quoi que disent sa préférence ou un override optimiste. */
  return servedWriteRestriction(conversation) === 'minor-global' ? { ...merged, isArchived: true, archiveLocked: true } : merged;
}

export function effectiveUnreadOf(conversation: Conversation, overrides: Overrides): number {
  const override = overrides[conversation.id]?.unreadCount;
  return override ?? unreadOf(conversation);
}

/**
 * LA CONVERSATION EFFECTIVE (#10593) — le wire auquel s'ajoute la correction
 * optimiste d'une préférence (favori, catégorie, nom personnel). La liste
 * entière lit ces objets : le nom (`titleOf`), la section (`categoryIdOf`), le
 * filtre « Favoris » (`reactionOf`) et la fiche voient la MÊME valeur, sans
 * qu'aucun lecteur ne réécrive la fusion.
 *
 * Sans aucune correction de préférence, la liste revient TELLE QUELLE — et une
 * conversation non corrigée garde son objet : les rangées mémoïsées
 * (`sameRowProps`) ne se repeignent pas pour le geste d'une autre.
 */
export function withPreferenceOverrides(conversations: readonly Conversation[], overrides: Overrides): readonly Conversation[] {
  if (!Object.values(overrides).some((override) => override.preferences !== undefined)) return conversations;
  return conversations.map((conversation) => {
    const preferences = overrides[conversation.id]?.preferences;
    if (preferences === undefined) return conversation;
    const raw = conversation.userPreferences;
    const entry = Array.isArray(raw) && typeof raw[0] === 'object' && raw[0] !== null ? (raw[0] as Record<string, unknown>) : {};
    return { ...conversation, userPreferences: [{ ...entry, ...preferences }] };
  });
}
