import type { ConversationCategory } from './conversation-categories';

/**
 * LES CATÉGORIES DU LECTEUR DE DÉMONSTRATION (#10103) — la forme DÉCODÉE de
 * `GET /me/categories`, dans l'ordre déclaré. « Travail » range
 * `c-annonces` et `c-page-01`, « Proches » `c-page-02` et `c-page-03`
 * (`userPreferences[0].categoryId` des fixtures) : la liste montre ainsi deux
 * sections de catégorie entre Épingles et Aujourd'hui, et les gates de
 * navigateur peuvent les replier sans monter de passerelle.
 */
export const FIXTURE_TRAVAIL_CATEGORY_ID = 'cat-travail';
export const FIXTURE_PROCHES_CATEGORY_ID = 'cat-proches';

export const FIXTURE_CONVERSATION_CATEGORIES: readonly ConversationCategory[] = [
  { id: FIXTURE_TRAVAIL_CATEGORY_ID, name: 'Travail', order: 0, isExpanded: true },
  { id: FIXTURE_PROCHES_CATEGORY_ID, name: 'Proches', order: 1, isExpanded: true },
];
