/**
 * LA RECHERCHE DANS LA CONVERSATION — tranche du catalogue, extraite pour
 * tenir le budget de taille (motif `catalog-fr-quote.ts`) : chaque langue
 * RÉPAND la sienne dans son catalogue. Miroir des chaînes iOS
 * `conversation.view.search.*` (`ConversationView+MessageRow.swift`) : le
 * champ, sa fermeture, et les trois états d'une recherche — en cours, vide,
 * comptée — plus ce que le web ajoute (l'échec réessayable, la page
 * suivante, le résultat trouvé dans une traduction).
 */
const frThreadSearch = {
  'thread.search.open': 'Rechercher dans la conversation',
  'thread.search.placeholder': 'Rechercher dans la conversation…',
  'thread.search.close': 'Fermer la recherche',
  'thread.search.hint': 'Tapez au moins deux caractères',
  'thread.search.searching': 'Recherche…',
  'thread.search.empty': 'Aucun résultat',
  'thread.search.count.one': '{count} résultat',
  'thread.search.count.other': '{count} résultats',
  'thread.search.failed': 'La recherche n’a pas abouti',
  'thread.search.retry': 'Réessayer',
  'thread.search.more': 'Plus de résultats',
  'thread.search.translated': 'Trouvé dans une traduction',
} as const;

export type ThreadSearchCatalogSlice = Readonly<Record<keyof typeof frThreadSearch, string>>;

export default frThreadSearch;
