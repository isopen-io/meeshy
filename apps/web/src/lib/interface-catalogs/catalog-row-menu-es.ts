import type { RowMenuCatalog } from '../i18n-row-menu-catalog';

/** LE MENU D'UNE LIGNE ET LES PUCES DE LA LISTE, ESPAGNOL (#10593). */
const es = {
  'rowMenu.details': 'Detalles',
  'rowMenu.rename': 'Renombrar',
  'rowMenu.favorite': 'Favorito',
  'rowMenu.favorite.remove': 'Quitar de favoritos',
  'rowMenu.moveTo': 'Mover a…',
  'rowMenu.moveTo.mine': 'Mis conversaciones',
  'rowMenu.block': 'Bloquear',
  'rowMenu.unblock': 'Desbloquear',
  'rowMenu.back': 'Atrás',
  'rowMenu.block.title': '¿Bloquear este usuario?',
  'rowMenu.block.message': 'Esta persona ya no podrá enviarte mensajes. La conversación pasa a tus archivos.',
  'rowMenu.rename.title': 'Renombrar la conversación',
  'rowMenu.rename.label': 'Nombre',
  'rowMenu.rename.hint': 'Déjalo vacío para recuperar su nombre original.',
  'rowMenu.rename.save': 'Guardar',
  'listFilter.nav': 'Filtros',
  'listFilter.all': 'Todos',
  'listFilter.unread': 'No leídos',
  'listFilter.favorites': 'Favoritos',
  'listFilter.groups': 'Grupos',
  'listFilter.directs': 'Directos',
  'listFilter.pinned': 'Fijados',
  'listFilter.archived': 'Archivadas',
} as const satisfies RowMenuCatalog;

export default es;
