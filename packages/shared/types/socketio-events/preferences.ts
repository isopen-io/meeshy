/**
 * Le domaine PREFERENCES : préférences de conversation, de catégorie et de
 * communauté, et leurs réordonnancements.
 *
 * @see ../socketio-events.ts — la façade qui garde l'adresse historique.
 */

/**
 * Snapshot complet des préférences user/conversation envoyé dans les
 * événements `USER_PREFERENCES_UPDATED` (scope conversation). Reflète
 * `UserConversationPreferences` côté Prisma.
 *
 * @see schema.prisma model UserConversationPreferences
 */
export interface ConversationPreferencesPayload {
  readonly isPinned: boolean;
  readonly isMuted: boolean;
  readonly mentionsOnly: boolean;
  readonly isArchived: boolean;
  readonly tags: readonly string[];
  readonly categoryId: string | null;
  readonly orderInCategory: number | null;
  readonly customName: string | null;
  readonly reaction: string | null;
  /** `ReadingModePreference` (`types/reading-modes.ts`) : `auto` rend la main à l'orchestrateur. */
  readonly readingMode: string;
  readonly clearHistoryBefore: string | null;
}

/**
 * Variante "préférences user-level" : émis par les QUATRE verbes écrivains de
 * `me/preferences/{category}` (`PUT`, `PATCH`, `DELETE`) ET par la remise à
 * zéro globale `DELETE /me/preferences`, qui émet UNE FOIS PAR CATÉGORIE
 * effacée — le contrat étant per-catégorie, un événement « tout » sans
 * `category` ne tomberait dans aucune branche du discriminant côté client.
 *
 * Le client doit refetch la catégorie nommée : `usePreferences()` pose
 * `staleTime: Infinity`, donc cette invalidation est le seul chemin par lequel
 * un réglage changé sur un autre appareil atteint un onglet ouvert.
 *
 * Point unique côté gateway : `services/preferences/preferences-broadcast.ts`.
 */
export interface UserPreferencesCategoryUpdatedEventData {
  readonly userId: string;
  readonly category: string;
}

/**
 * Variante "préférences scope conversation" : émis par TOUT écrivain de
 * `UserConversationPreferences` — `PUT/DELETE /user-preferences/conversations/:id`
 * ET les routes de suppression par utilisateur (`delete-for-me`,
 * `restore-for-me`, `clear-history`), qui écrivent `deletedForUserAt` /
 * `clearHistoryBefore`. La ligne étant par UTILISATEUR et non par appareil,
 * un écrivain qui n'émet pas laisse les autres appareils sur un état périmé.
 * Côté gateway, `writeConversationPreferences` est le point unique qui
 * garantit l'incrément de `version` et cette diffusion.
 *
 * Payload complet incluant `version` pour la résolution optimistic vs socket.
 */
export interface UserPreferencesConversationUpdatedEventData {
  readonly userId: string;
  readonly conversationId: string;
  readonly version: number;
  /** true si l'événement résulte d'un DELETE (reset aux defaults). */
  readonly reset: boolean;
  /** null si reset === true (le client applique ses defaults locaux). */
  readonly preferences: ConversationPreferencesPayload | null;
}

/**
 * Snapshot complet des préférences user/communauté envoyé dans les
 * événements `USER_PREFERENCES_UPDATED` (scope communauté). Reflète
 * `UserCommunityPreferences` côté Prisma.
 *
 * @see schema.prisma model UserCommunityPreferences
 */
export interface CommunityPreferencesPayload {
  readonly isPinned: boolean;
  readonly isMuted: boolean;
  readonly isArchived: boolean;
  readonly isHidden: boolean;
  readonly notificationLevel: 'all' | 'mentions' | 'none';
  readonly customName: string | null;
  readonly categoryId: string | null;
  readonly orderInCategory: number | null;
}

/**
 * Variante "préférences scope communauté" : émis par
 * `PUT/DELETE /user-preferences/communities/:id`. Sibling de
 * `UserPreferencesConversationUpdatedEventData` (pas de `version` :
 * `UserCommunityPreferences` n'a pas ce champ — le client réagit en
 * invalidant son cache plutôt qu'en réconciliant un snapshot optimiste).
 */
export interface UserPreferencesCommunityUpdatedEventData {
  readonly userId: string;
  readonly communityId: string;
  /** true si l'événement résulte d'un DELETE (reset aux defaults). */
  readonly reset: boolean;
  /** null si reset === true (le client applique ses defaults locaux). */
  readonly preferences: CommunityPreferencesPayload | null;
}

/**
 * Union des trois scopes possibles. La présence de `conversationId` /
 * `communityId` discrimine côté client (sinon c'est le scope `category`).
 */
export type UserPreferencesUpdatedEventData =
  | UserPreferencesCategoryUpdatedEventData
  | UserPreferencesConversationUpdatedEventData
  | UserPreferencesCommunityUpdatedEventData;

/**
 * Émis par `POST /user-preferences/conversations/reorder` après mise
 * à jour batch de l'ordre dans une catégorie.
 */
export interface UserPreferencesReorderedEventData {
  readonly userId: string;
  readonly updates: ReadonlyArray<{
    readonly conversationId: string;
    readonly orderInCategory: number;
  }>;
}

/**
 * Émis par `POST /user-preferences/communities/reorder` après mise à jour batch
 * de l'ordre des COMMUNAUTÉS dans une catégorie.
 *
 * ## Pourquoi un événement à part, et non un élargissement du précédent
 *
 * `UserPreferencesReorderedEventData` décrit le même geste sur l'autre table, et
 * la tentation est d'y ajouter `communityId`. Mesuré sur les décodeurs
 * existants, cet élargissement casse le cas nominal pour en servir un neuf :
 *
 * - iOS — `UserPreferencesReorderedSocketEvent.Update.conversationId` est un
 *   `String` NON optionnel : un seul item de communauté fait échouer le
 *   décodage de l'ÉVÉNEMENT ENTIER, emportant les réordonnancements de
 *   conversation qui voyagent avec lui ;
 * - web — `applyRemoteReorder` filtre sur `preferencesMap.has(conversationId)`,
 *   donc les items de communauté disparaissent en silence.
 *
 * Un nom neuf est INERTE pour ces deux consommateurs par construction. La règle
 * générale : la forme d'un événement DIFFUSÉ ne s'élargit qu'après avoir relevé
 * ses décodeurs sur les trois clients, et un décodeur strict rend l'élargissement
 * plus cher que le nom neuf.
 *
 * Comme son jumeau conversation, il ne porte PAS de version : `orderInCategory`
 * vit hors du chemin versionné et le client l'applique sans arbitrage. Il ne
 * nomme que ce qui a été RÉELLEMENT écrit — les communautés dont l'appelant est
 * membre — jamais ce qu'il a demandé.
 */
export interface UserPreferencesCommunityReorderedEventData {
  readonly userId: string;
  readonly updates: ReadonlyArray<{
    readonly communityId: string;
    readonly orderInCategory: number;
  }>;
}
