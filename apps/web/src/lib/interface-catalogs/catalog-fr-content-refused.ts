/**
 * LE REFUS D'UN CONTENU (#10314, #10318) — tranche du catalogue, extraite pour
 * tenir le budget de taille : `catalog-fr` la RÉPAND. Les clés et les mots sont
 * ceux d'iOS (`ContentFetchFailure+Copy`, `feed.post.detail.unavailable.*`) :
 * un réel, une publication ou une story refusés disent la même chose sur les
 * deux plateformes (`components/refused-content.tsx`).
 */
const frContentRefused = {
  'feed.post.detail.unavailable.title': 'Ce contenu n’est plus disponible',
  'feed.post.detail.unavailable.body': 'Il a peut-être expiré ou été retiré par son auteur.',
  'feed.post.detail.unavailable.back': 'Retour',
} as const;

export default frContentRefused;
