import type { AppearanceCatalog } from '@/lib/i18n-appearance-catalog';

/**
 * LE FOND ET L'ACCENT D'UNE CONVERSATION (#10631), DE — les libellés
 * `appearance.*` du sélecteur « Fond et couleur ». Hors du catalogue
 * d'interface, à son plafond : chargé par la feuille (`i18n-appearance-catalog.ts`),
 * jamais au démarrage. Les NOMS des modèles, des packs et des couleurs viennent
 * des chaînes partagées que lit aussi iOS (`design/appearance/strings/`).
 */
const de = {
  'appearance.title': 'Hintergrund und Farbe',
  'appearance.preview': 'Vorschau',
  'appearance.background': 'Hintergrund',
  'appearance.signature': 'Signature',
  'appearance.solid': 'Einfarbig',
  'appearance.photo': 'Foto der Unterhaltung',
  'appearance.photo_empty': 'In dieser Unterhaltung wurde kein Foto gesendet',
  'appearance.photo_unavailable': 'Die Fotos können gerade nicht geladen werden',
  'appearance.photo_more': 'Mehr Fotos',
  'appearance.photo_item': 'Foto {index}',
  'appearance.veil': 'Schleier',
  'appearance.blur': 'Unschärfe',
  'appearance.accent': 'Akzent',
  'appearance.auto': 'Automatisch',
  'appearance.animate': 'Animationen',
  'appearance.shop': 'Mehr im Shop',
  'appearance.reset': 'Auf Standard zurücksetzen',
  'appearance.err_generic': 'Diese Auswahl konnte nicht gespeichert werden und wurde rückgängig gemacht.',
  'appearance.err_not_owned': 'Dieser Hintergrund gehört nicht zu deinen Paketen.',
  'appearance.err_photo': 'Dieses Foto ist nicht mehr verfügbar.',
  'appearance.pack_group': 'Paket {name}',
  'appearance.picked': 'Ausgewählt',
} satisfies AppearanceCatalog;

export default de;
