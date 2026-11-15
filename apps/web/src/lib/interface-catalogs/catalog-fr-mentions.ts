/**
 * LA LISTE DE MENTIONS DU COMPOSEUR (#7826) — tranche du catalogue, extraite
 * pour tenir le budget de taille (motif `catalog-fr-thread-states.ts`) :
 * chaque langue RÉPAND la sienne dans son catalogue. Les valeurs sont celles
 * du catalogue iOS (`composer.document.a11y.mentions`, `composer.mention.empty`)
 * là où il en a une.
 */
const frMentions = {
  'composer.mention.suggestions': 'Suggestions de mention',
  'composer.mention.empty': 'Aucune personne trouvée',
  'composer.mention.count': 'Suggestions de mention : {count}',
  'composer.mention.badge.friend': 'Contact',
} as const;

export type MentionCatalogSlice = Readonly<Record<keyof typeof frMentions, string>>;

export default frMentions;
