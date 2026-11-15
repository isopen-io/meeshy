import type { AppearanceCatalog } from '@/lib/i18n-appearance-catalog';

/**
 * LE FOND ET L'ACCENT D'UNE CONVERSATION (#10631), IT — les libellés
 * `appearance.*` du sélecteur « Fond et couleur ». Hors du catalogue
 * d'interface, à son plafond : chargé par la feuille (`i18n-appearance-catalog.ts`),
 * jamais au démarrage. Les NOMS des modèles, des packs et des couleurs viennent
 * des chaînes partagées que lit aussi iOS (`design/appearance/strings/`).
 */
const it = {
  'appearance.title': 'Sfondo e colore',
  'appearance.preview': 'Anteprima',
  'appearance.background': 'Sfondo',
  'appearance.signature': 'Signature',
  'appearance.solid': 'Tinta unita',
  'appearance.photo': 'Foto della conversazione',
  'appearance.photo_empty': 'Nessuna foto è stata inviata in questa conversazione',
  'appearance.photo_unavailable': 'Al momento non è possibile caricare le foto',
  'appearance.photo_more': 'Altre foto',
  'appearance.photo_item': 'Foto {index}',
  'appearance.veil': 'Velo',
  'appearance.blur': 'Sfocatura',
  'appearance.accent': 'Accento',
  'appearance.auto': 'Automatico',
  'appearance.animate': 'Animazioni',
  'appearance.shop': 'Altro nello shop',
  'appearance.reset': 'Torna all’impostazione originale',
  'appearance.err_generic': 'Impossibile salvare questa scelta: è stata annullata.',
  'appearance.err_not_owned': 'Questo sfondo non è nei tuoi pack.',
  'appearance.err_photo': 'Questa foto non è più disponibile.',
  'appearance.pack_group': 'Pack {name}',
  'appearance.picked': 'Selezionato',
} satisfies AppearanceCatalog;

export default it;
