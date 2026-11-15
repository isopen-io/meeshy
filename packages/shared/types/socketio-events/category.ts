/**
 * Le domaine CATEGORY : catégories de conversation d'un utilisateur.
 *
 * @see ../socketio-events.ts — la façade qui garde l'adresse historique.
 */

/**
 * Snapshot d'une `UserConversationCategory` envoyé dans
 * `CATEGORY_CREATED` / `CATEGORY_UPDATED`.
 */
export interface UserConversationCategoryPayload {
  readonly id: string;
  readonly userId: string;
  readonly name: string;
  readonly color: string | null;
  readonly icon: string | null;
  readonly order: number;
  readonly isExpanded: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CategoryCreatedEventData {
  readonly userId: string;
  readonly category: UserConversationCategoryPayload;
}

export interface CategoryUpdatedEventData {
  readonly userId: string;
  readonly category: UserConversationCategoryPayload;
}

export interface CategoryDeletedEventData {
  readonly userId: string;
  readonly categoryId: string;
}

export interface CategoriesReorderedEventData {
  readonly userId: string;
  readonly updates: ReadonlyArray<{
    readonly categoryId: string;
    readonly order: number;
  }>;
}
