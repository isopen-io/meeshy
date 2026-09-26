/**
 * LA CARTE DU FIL ET SES GESTES (#6488, extrait de `catalog-fr.ts` au lot
 * #6278 c — CLAUDE.md § budget de taille) — tranche du catalogue français :
 * ce sont des clés du catalogue comme les autres, `catalog-fr` les RÉPAND, et
 * les six autres langues les portent à plat (même arbitrage que « Mes
 * stories », `catalog-fr-stories-mine.ts` — sous leur propre plafond).
 *
 * `FeedPostCard`, l'en-tête et les quatre états du Flux (`routes/feed.tsx`),
 * et les échecs d'un geste (`lib/api/feed-gestures.ts`, `lib/feed/share-url.ts`) :
 * tous écrits en dur en français jusqu'ici, alors qu'une coque branchée en
 * anglais servait déjà `reels.open` sur la même carte.
 */
const frFeedPost = {
  'feed.post.action.like': 'Aimer',
  'feed.post.action.comment': 'Commenter',
  'feed.post.action.repost': 'Repartager',
  'feed.post.action.bookmark': 'Enregistrer',
  'feed.post.action.share': 'Partager',
  'feed.post.media.video': 'Vidéo',
  'feed.post.media.audio': 'Audio',
  'feed.post.media.previous': 'Média précédent',
  'feed.post.media.next': 'Média suivant',
  'feed.post.media.mosaic': 'Mosaïque de {count} médias',
  'feed.post.see_more': 'voir plus',
  'feed.post.see_less': 'voir moins',
  'feed.post.more_options': 'Plus d’options',
  'feed.post.menu.open': 'Ouvrir',
  'feed.post.menu.copy_text': 'Copier le texte',
  'feed.post.menu.unsave': 'Retirer des enregistrements',
  'feed.post.menu.pin': 'Épingler',
  'feed.post.menu.delete': 'Supprimer',
  /* MODIFIER LE TEXTE (#7534) — miroir `FeedPostCard+Header.swift:213`
     (`feed.post.edit` = « Modifier ») et `EditPostSheet.swift` pour les cinq
     clés de la feuille. */
  'feed.post.edit': 'Modifier',
  'feed.post.edit.title': 'Modifier le post',
  'feed.post.edit.body.a11y': 'Contenu de la publication',
  'feed.post.edit.remaining.a11y': '{count} caractères restants',
  'feed.post.edit.publish': 'Publier',
  'feed.post.copied': 'Texte copié',
  'feed.post.copy_failed': 'Impossible de copier le texte',
  'feed.post.pinned': 'Publication épinglée',
  'feed.post.pin_failed': 'Impossible d’épingler la publication',
  'feed.post.edited': 'Publication modifiée',
  'feed.post.edit_failed': 'La publication n’a pas pu être modifiée',
  'feed.post.edit_busy': 'Une modification est déjà en cours',
  'feed.post.deleted': 'Publication supprimée',
  'feed.post.delete_failed': 'Erreur lors de la suppression',
  /* REPARTAGER DEPUIS LE RAIL DES RÉELS (#6484) — miroir `ReelsViewModel.repost`
     (iOS, append-only). */
  'feed.post.repost.success': 'Repartage',
  'feed.post.repost.error': 'Erreur lors du repost',
  'feed.post.repost.already': 'Déjà repartagé',
  'feed.post.repost.offline': 'Hors ligne — le repartage n’a pas pu partir.',
  'feed.post.repost.unconfirmed': 'Repartage non confirmé — réessayez',
  'feed.post.repost.audience': 'Cette audience élargirait la diffusion d’origine',
  /* LA CONFIRMATION AVANT L'ENVOI (revue-correction #6278) — le repost est
     APPEND-ONLY, sans « annuler » nulle part dans l'interface : iOS ouvre une
     alerte (`FeedPostCard.swift:1049-1053`) avant d'envoyer, jamais au seul
     tap. `feed.post.action.repost` sert de libellé au bouton de confirmation
     (« Repartager »), `common.cancel` à celui d'annulation — ce sont les
     MÊMES mots que le bouton de la rangée et le reste de l'app. */
  'feed.post.repost.confirm.title': 'Repartager cette publication ?',
  'feed.post.repost.confirm.body': 'Elle apparaîtra dans votre fil, visible par vos abonnés. Cette action ne peut pas être annulée.',
  'feed.post.reel.chip': 'Réel',
  'feed.post.repost.embed.story': 'Story',
  'feed.post.reel.of': 'Réel de {author}',
  /* OUVRIR LA PUBLICATION (#7284) — le nom accessible DIT sa destination :
     « Ouvrir » seul laisserait le lecteur d'écran deviner de quelle carte
     il s'agit dans un fil qui en aligne vingt. */
  'feed.post.open': 'Ouvrir la publication de {author}',
  /* LA PUBLICATION CITÉE D'UN REPOST (#6278 c, G8) — nom DISTINCT de
     `feed.post.open` ci-dessus : les deux portes mènent à la MÊME adresse
     (`/post/$post`) depuis deux cartes IMBRIQUÉES, et un lecteur d'écran qui
     les annoncerait pareil ne saurait pas laquelle est la carte extérieure et
     laquelle est l'original cité — miroir `FeedPostCard.swift:905-906`
     (« Publication originale de %@ », `repostView`). */
  'feed.post.original.open': 'Publication originale de {author}',
} as const;

export default frFeedPost;
