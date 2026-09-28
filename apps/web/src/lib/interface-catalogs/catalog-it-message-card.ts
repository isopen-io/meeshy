import type { MessageCardCatalogSlice } from './catalog-fr-message-card';

/** Message export as image — see `catalog-fr-message-card.ts`. */
const itMessageCard = {
  'message.menu.export': 'Esporta come immagine',
  'export.card.title': 'Esporta come immagine',
  'export.card.footer': 'Esportato da {name}',
  'export.card.styles': 'Stile',
  'export.card.style.aurore': 'Aurora',
  'export.card.style.editorial': 'Editoriale',
  'export.card.style.manuscrit': 'Manoscritto',
  'export.card.preview': 'Anteprima dell’immagine',
  'export.card.rendering': 'Preparazione dell’immagine…',
  'export.card.save': 'Salva immagine',
  'export.card.truncated': 'Messaggio lungo: la fine è tagliata nell’immagine.',
  'export.announce.gallery': 'Immagine salvata nella galleria',
  'export.announce.shared': 'Immagine pronta',
  'export.announce.cancelled': 'Esportazione annullata',
  'export.announce.expired': 'Tocca di nuovo per salvare',
  'export.announce.failed': 'Impossibile creare l’immagine',
  'export.announce.unavailable': 'Questo dispositivo non può salvare l’immagine',
} satisfies MessageCardCatalogSlice;

export default itMessageCard;
