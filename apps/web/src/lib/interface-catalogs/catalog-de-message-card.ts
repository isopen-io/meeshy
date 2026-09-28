import type { MessageCardCatalogSlice } from './catalog-fr-message-card';

/** Message export as image — see `catalog-fr-message-card.ts`. */
const deMessageCard = {
  'message.menu.export': 'Als Bild exportieren',
  'export.card.title': 'Als Bild exportieren',
  'export.card.footer': 'Exportiert von {name}',
  'export.card.styles': 'Stil',
  'export.card.style.aurore': 'Aurora',
  'export.card.style.editorial': 'Editorial',
  'export.card.style.manuscrit': 'Handschrift',
  'export.card.preview': 'Bildvorschau',
  'export.card.rendering': 'Bild wird vorbereitet…',
  'export.card.save': 'Bild sichern',
  'export.card.truncated': 'Lange Nachricht: Das Ende wird im Bild abgeschnitten.',
  'export.announce.gallery': 'Bild in der Galerie gesichert',
  'export.announce.shared': 'Bild bereit',
  'export.announce.cancelled': 'Export abgebrochen',
  'export.announce.expired': 'Zum Sichern erneut tippen',
  'export.announce.failed': 'Bild konnte nicht erstellt werden',
  'export.announce.unavailable': 'Dieses Gerät kann das Bild nicht sichern',
} satisfies MessageCardCatalogSlice;

export default deMessageCard;
