/**
 * CE QUE CHAQUE PERSONNE DE LA LISTE DES VUES A FAIT, FRANÇAIS (#9727) — la
 * SOURCE des clés `viewerEngagement.*` de la feuille « Vues »
 * (`components/publication-viewers-sheet.tsx`). Les six autres langues portent
 * exactement ces clés (`satisfies ViewerEngagementCatalog`,
 * `i18n-viewer-engagement-catalog.test.ts`). Hors du catalogue d'interface,
 * arrivé à son plafond : chargé avec la feuille, jamais au démarrage.
 */
const fr = {
  'viewerEngagement.shares.one': '{count} partage',
  'viewerEngagement.shares.other': '{count} partages',
  'viewerEngagement.reposts.one': '{count} republication',
  'viewerEngagement.reposts.other': '{count} republications',
  'viewerEngagement.comments.one': '{count} commentaire',
  'viewerEngagement.comments.other': '{count} commentaires',
  'viewerEngagement.replies.one': '{count} réponse',
  'viewerEngagement.replies.other': '{count} réponses',
  'viewerEngagement.reactions': 'Réactions : {emojis}',
  'viewerEngagement.bookmarked': 'Enregistré dans ses favoris',
  'viewerEngagement.viewedAt': 'Vu à {time}',
  'viewerEngagement.onlyViewed': 'A vu, sans autre interaction',
  'viewerEngagement.openProfile': 'Voir le profil',
  'viewerEngagement.back': 'Retour aux vues',
  'viewerEngagement.openDetail': 'Voir ce que {name} a fait',
  'viewerEngagement.empty.subtitle': 'Les personnes qui verront cette publication apparaîtront ici.',
  'viewerEngagement.forbidden': 'Seul l’auteur peut voir qui a vu cette publication.',
} as const;

export default fr;
