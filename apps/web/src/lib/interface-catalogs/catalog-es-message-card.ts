import type { MessageCardCatalogSlice } from './catalog-fr-message-card';

/** Message export as image — see `catalog-fr-message-card.ts`. */
const esMessageCard = {
  'message.menu.export': 'Exportar como imagen',
  'export.card.title': 'Exportar como imagen',
  'export.card.footer': 'Exportado por {name}',
  'export.card.styles': 'Estilo',
  'export.card.style.aurore': 'Aurora',
  'export.card.style.editorial': 'Editorial',
  'export.card.style.manuscrit': 'Manuscrito',
  'export.card.preview': 'Vista previa de la imagen',
  'export.card.rendering': 'Preparando la imagen…',
  'export.card.save': 'Guardar imagen',
  'export.card.truncated': 'Mensaje largo: el final se corta en la imagen.',
  'export.announce.gallery': 'Imagen guardada en la galería',
  'export.announce.shared': 'Imagen lista',
  'export.announce.cancelled': 'Exportación cancelada',
  'export.announce.expired': 'Toca de nuevo para guardar',
  'export.announce.failed': 'No se pudo crear la imagen',
  'export.announce.unavailable': 'Este dispositivo no puede guardar la imagen',
  'message.menu.exportQuick': 'Exportación rápida',
  'export.card.options': 'Mostrar',
  'export.card.option.title': 'Título de la conversación',
  'export.card.option.authors': 'Nombres de los autores',
  'export.card.option.date': 'Fecha',
  'export.card.default.save': 'Usar como formato predeterminado',
  'export.card.default.current': 'Formato predeterminado',
  'export.announce.defaultSaved': 'Formato predeterminado guardado',
} satisfies MessageCardCatalogSlice;

export default esMessageCard;
