import type { AppearanceCatalog } from '@/lib/i18n-appearance-catalog';

/**
 * LE FOND ET L'ACCENT D'UNE CONVERSATION (#10631), ES — les libellés
 * `appearance.*` du sélecteur « Fond et couleur ». Hors du catalogue
 * d'interface, à son plafond : chargé par la feuille (`i18n-appearance-catalog.ts`),
 * jamais au démarrage. Les NOMS des modèles, des packs et des couleurs viennent
 * des chaînes partagées que lit aussi iOS (`design/appearance/strings/`).
 */
const es = {
  'appearance.title': 'Fondo y color',
  'appearance.preview': 'Vista previa',
  'appearance.background': 'Fondo',
  'appearance.signature': 'Signature',
  'appearance.solid': 'Color liso',
  'appearance.photo': 'Foto de la conversación',
  'appearance.photo_empty': 'No se ha enviado ninguna foto en esta conversación',
  'appearance.photo_unavailable': 'Las fotos no se pueden cargar en este momento',
  'appearance.photo_more': 'Más fotos',
  'appearance.photo_item': 'Foto {index}',
  'appearance.veil': 'Velo',
  'appearance.blur': 'Desenfoque',
  'appearance.accent': 'Acento',
  'appearance.auto': 'Automático',
  'appearance.animate': 'Animaciones',
  'appearance.shop': 'Más en la tienda',
  'appearance.reset': 'Volver al ajuste original',
  'appearance.err_generic': 'No se pudo guardar esta elección y se deshizo.',
  'appearance.err_not_owned': 'Este fondo no está en tus packs.',
  'appearance.err_photo': 'Esta foto ya no está disponible.',
  'appearance.pack_group': 'Pack {name}',
  'appearance.picked': 'Seleccionado',
} satisfies AppearanceCatalog;

export default es;
