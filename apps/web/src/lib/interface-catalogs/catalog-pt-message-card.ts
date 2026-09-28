import type { MessageCardCatalogSlice } from './catalog-fr-message-card';

/** Message export as image — see `catalog-fr-message-card.ts`. */
const ptMessageCard = {
  'message.menu.export': 'Exportar como imagem',
  'export.card.title': 'Exportar como imagem',
  'export.card.footer': 'Exportado por {name}',
  'export.card.styles': 'Estilo',
  'export.card.style.aurore': 'Aurora',
  'export.card.style.editorial': 'Editorial',
  'export.card.style.manuscrit': 'Manuscrito',
  'export.card.preview': 'Pré-visualização da imagem',
  'export.card.rendering': 'A preparar a imagem…',
  'export.card.save': 'Guardar imagem',
  'export.card.truncated': 'Mensagem longa: o final é cortado na imagem.',
  'export.announce.gallery': 'Imagem guardada na galeria',
  'export.announce.shared': 'Imagem pronta',
  'export.announce.cancelled': 'Exportação cancelada',
  'export.announce.expired': 'Toque novamente para guardar',
  'export.announce.failed': 'Não foi possível criar a imagem',
  'export.announce.unavailable': 'Este dispositivo não consegue guardar a imagem',
} satisfies MessageCardCatalogSlice;

export default ptMessageCard;
