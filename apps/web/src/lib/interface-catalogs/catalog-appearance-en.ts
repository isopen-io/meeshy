import type { AppearanceCatalog } from '@/lib/i18n-appearance-catalog';

/**
 * LE FOND ET L'ACCENT D'UNE CONVERSATION (#10631), EN — les libellés
 * `appearance.*` du sélecteur « Fond et couleur ». Hors du catalogue
 * d'interface, à son plafond : chargé par la feuille (`i18n-appearance-catalog.ts`),
 * jamais au démarrage. Les NOMS des modèles, des packs et des couleurs viennent
 * des chaînes partagées que lit aussi iOS (`design/appearance/strings/`).
 */
const en = {
  'appearance.title': 'Background and color',
  'appearance.preview': 'Preview',
  'appearance.background': 'Background',
  'appearance.signature': 'Signature',
  'appearance.solid': 'Solid color',
  'appearance.photo': 'Conversation photo',
  'appearance.photo_empty': 'No photo has been sent in this conversation',
  'appearance.photo_unavailable': 'Photos can’t be loaded right now',
  'appearance.photo_more': 'More photos',
  'appearance.photo_item': 'Photo {index}',
  'appearance.veil': 'Veil',
  'appearance.blur': 'Blur',
  'appearance.accent': 'Accent',
  'appearance.auto': 'Automatic',
  'appearance.animate': 'Animations',
  'appearance.shop': 'More in the shop',
  'appearance.reset': 'Back to the default',
  'appearance.err_generic': 'This choice couldn’t be saved and was undone.',
  'appearance.err_not_owned': 'This background isn’t in your packs.',
  'appearance.err_photo': 'This photo is no longer available.',
  'appearance.pack_group': '{name} pack',
  'appearance.picked': 'Selected',
} satisfies AppearanceCatalog;

export default en;
