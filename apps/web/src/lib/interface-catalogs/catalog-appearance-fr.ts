/**
 * LE FOND ET L'ACCENT D'UNE CONVERSATION (#10631), FRANÇAIS (la SOURCE des clés) — les libellés
 * `appearance.*` du sélecteur « Fond et couleur ». Hors du catalogue
 * d'interface, à son plafond : chargé par la feuille (`i18n-appearance-catalog.ts`),
 * jamais au démarrage. Les NOMS des modèles, des packs et des couleurs viennent
 * des chaînes partagées que lit aussi iOS (`design/appearance/strings/`).
 */
const fr = {
  'appearance.title': 'Fond et couleur',
  'appearance.preview': 'Aperçu',
  'appearance.background': 'Fond',
  'appearance.signature': 'Signature',
  'appearance.solid': 'Couleur unie',
  'appearance.photo': 'Photo de la conversation',
  'appearance.photo_empty': 'Aucune photo envoyée dans cette conversation',
  'appearance.photo_unavailable': 'Les photos ne se chargent pas pour l’instant',
  'appearance.photo_more': 'Plus de photos',
  'appearance.photo_item': 'Photo {index}',
  'appearance.veil': 'Voile',
  'appearance.blur': 'Flou',
  'appearance.accent': 'Accent',
  'appearance.auto': 'Automatique',
  'appearance.animate': 'Animations',
  'appearance.shop': 'Plus dans la boutique',
  'appearance.reset': 'Revenir au réglage d’origine',
  'appearance.err_generic': 'Impossible d’enregistrer ce choix : il a été annulé.',
  'appearance.err_not_owned': 'Ce fond n’est pas dans vos packs.',
  'appearance.err_photo': 'Cette photo n’est plus disponible.',
  'appearance.pack_group': 'Pack {name}',
  'appearance.picked': 'Sélectionné',
} as const;

export default fr;
