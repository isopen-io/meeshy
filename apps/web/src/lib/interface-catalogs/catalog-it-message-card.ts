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
  'message.menu.exportQuick': 'Esportazione rapida',
  'export.card.options': 'Mostra',
  'export.card.option.title': 'Titolo della conversazione',
  'export.card.option.authors': 'Nomi degli autori',
  'export.card.option.date': 'Data',
  'export.card.default.save': 'Usa come formato predefinito',
  'export.card.default.current': 'Formato predefinito',
  'export.announce.defaultSaved': 'Formato predefinito salvato',
} satisfies MessageCardCatalogSlice;

export default itMessageCard;
