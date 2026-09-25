/**
 * LE TIROIR DES PIÈCES JOINTES DU COMPOSEUR — tranche du catalogue, extraite
 * pour tenir le budget de taille (motif `catalog-fr-mentions.ts`) : ses
 * tuiles, la position partagée, et « Mes stickers » (#7938). Chaque langue
 * RÉPAND la sienne dans son catalogue.
 */
const frComposerAttach = {
  'composer.attach.group': 'Types de pièces jointes',
  'composer.attach.handle': 'Poignée du panneau',
  'composer.attach.photo': 'Photos',
  'composer.attach.photo.action': 'Choisir des photos',
  'composer.attach.camera': 'Caméra',
  'composer.attach.camera.action': 'Prendre une photo',
  'composer.attach.file': 'Fichier',
  'composer.attach.file.action': 'Choisir un fichier',
  'composer.attach.location': 'Position',
  'composer.attach.location.action': 'Partager ma position',
  'composer.attach.voice': 'Vocal',
  'composer.attach.voice.action': 'Enregistrer un message vocal',
  'composer.attach.emoji': 'Emoji',
  'composer.attach.emoji.action': 'Insérer un emoji',
  'composer.emoji.title': 'Insérer un emoji',
  'composer.location.locating': 'Recherche de votre position…',
  'composer.location.denied': 'Position refusée — autorisez-la dans les réglages',
  'composer.location.unavailable': 'Position indisponible sur ce navigateur',
  'composer.location.failed': 'Position introuvable — réessayez',
  'composer.location.chip': 'LIEU',
  'composer.location.unknown': 'Lieu inconnu',
  'composer.location.remove': 'Retirer la position',
  'composer.attach.sticker': 'Sticker',
  'composer.attach.sticker.action': 'Envoyer un sticker',
  'composer.sticker.title': 'Mes stickers',
  'composer.sticker.fromImage': 'Depuis une image',
  'composer.sticker.paste': 'Coller',
  'composer.sticker.pasteHint': 'Collez ou déposez une image ici pour en faire un sticker',
  'composer.sticker.nothingToPaste': 'Aucune image dans le presse-papier',
  'composer.sticker.empty': 'Aucun sticker pour l’instant — créez-en un depuis une image ou collez-en une',
  'composer.sticker.creating': 'Création du sticker…',
  'composer.sticker.manage': 'Gérer',
  'composer.sticker.done': 'Terminé',
  'composer.sticker.remove': 'Retirer ce sticker',
  'composer.sticker.item': 'Sticker',
  'composer.sticker.unavailable': 'Ce sticker n’a pas pu être relu — réessayez',
  'composer.sticker.error.notImage': 'Ce fichier n’est pas une image',
  'composer.sticker.error.tooLarge': 'Image trop lourde pour un sticker',
  'composer.sticker.error.full': 'Bibliothèque pleine — retirez un sticker pour en ajouter un',
  'composer.sticker.error.failed': 'Le sticker n’a pas pu être créé',
  'composer.quickEmoji.label': 'Envoyer directement',
  'composer.quickEmoji.group': 'Emojis rapides',
  'composer.effects.panel': 'Effets du message',
  'composer.effects.entrance': "Animation d'entrée",
  'composer.effects.permanent': 'Effet permanent',
  'composer.effects.clearAll': 'Tout effacer',
} as const;

export type ComposerAttachCatalogSlice = Readonly<Record<keyof typeof frComposerAttach, string>>;

export default frComposerAttach;
