/**
 * LE CHROME DU COMPOSER PLEIN ÉCRAN (#8413) ET LE PANNEAU CADRE (#8414) —
 * tranche du catalogue, extraite pour tenir le budget de taille (motif
 * `catalog-fr-mentions.ts`) : chaque langue RÉPAND la sienne dans son
 * catalogue.
 */
const frStudioChrome = {
  'story.studio.more': 'Plus d’options',
  'story.studio.preview': 'Aperçu',
  'story.studio.preview.close': 'Fermer l’aperçu',
  'story.studio.page.remove.current': 'Supprimer cette scène',
  'story.studio.postText': 'Texte du post',
  'story.studio.postText.placeholder': 'Écrivez le texte du post…',
  'story.studio.postText.done': 'Terminé',
  'story.studio.tile.page': 'Scène',
  'story.studio.tile.text': 'Texte',
  'story.studio.tile.editor': 'Réglages',
  'story.studio.tile.frame': 'Cadre',
  'story.studio.undo': 'Annuler',
  'story.studio.redo': 'Rétablir',
  'story.studio.frame': 'Cadre',
  'story.studio.frame.media': 'Le média',
  'story.studio.frame.around': 'Autour du média',
  'story.studio.frame.fit': 'Ajuster',
  'story.studio.frame.fill': 'Remplir',
  'story.studio.frame.fit.hint': 'Entier, posé dans le cadre 9:16. Rien n’est rogné.',
  'story.studio.frame.fill.hint': 'Couvre tout le cadre 9:16, quitte à rogner les bords.',
  'story.studio.backdrop.blur': 'Flou',
  'story.studio.backdrop.black': 'Noir',
  'story.studio.backdrop.white': 'Blanc',
  'story.studio.backdrop.indigo': 'Indigo',
  'story.studio.backdrop.sand': 'Sable',
  'story.studio.animated': 'Animé',
  'story.studio.timeline': 'Frise de la scène',
  'story.studio.timeline.play': 'Lire',
  'story.studio.timeline.pause': 'Pause',
  'story.studio.timeline.start': 'Début de {name}',
  'story.studio.timeline.end': 'Fin de {name}',
  'story.studio.timeline.empty': 'Écrivez un texte ou posez un calque : chaque objet y prend sa piste.',
  'story.studio.timeline.overlay': 'Calque',
  'story.studio.retouch.title': 'Retoucher l’image',
  'story.studio.retouch.done': 'Terminé',
  'story.studio.retouch.cancel': 'Abandonner la retouche',
  'composer.attachment.edit': 'Éditer {name}',
  'story.studio.retouch.failed': 'L’image n’a pas pu être rendue.',
} as const;

export type StudioChromeCatalogSlice = Readonly<Record<keyof typeof frStudioChrome, string>>;

export default frStudioChrome;
