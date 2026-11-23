/**
 * LA CARTE D'UN CONTENU (#19334, parapluie #19331) — tranche du catalogue : la
 * carte vivante d'un lien Meeshy vers une publication, un réel, une story ou
 * une humeur, sous le texte d'une bulle ou d'une publication. Chaque langue
 * RÉPAND la sienne dans son catalogue (motif `catalog-fr-conversation-card.ts`).
 *
 * Ce qui se dit déjà ailleurs n'est pas redit : les noms des types
 * (`post.detail.title`, `feed.post.reel.chip`, `feed.post.repost.embed.story`,
 * `message.mood.label`), « Réel de X » (`feed.post.reel.of`), « Humeur de X »
 * (`mood.peek.title`) et le compte des vues (`story.views.count.*`).
 */
const frContentCard = {
  'content.card.loading': 'Chargement du contenu',
  'content.card.unavailable': 'Ce contenu n’est plus disponible',
  'content.card.hint': 'Ouvre le contenu',
  'content.card.of.post': 'Publication de {author}',
  'content.card.of.story': 'Story de {author}',
  'content.card.favorites.one': '{count} favori',
  'content.card.favorites.other': '{count} favoris',
  'content.card.saved': 'enregistré',
} as const;

export type ContentCardCatalogSlice = Readonly<Record<keyof typeof frContentCard, string>>;

export default frContentCard;
