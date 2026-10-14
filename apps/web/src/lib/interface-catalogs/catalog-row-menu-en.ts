import type { RowMenuCatalog } from '../i18n-row-menu-catalog';

/** LE MENU D'UNE LIGNE ET LES PUCES DE LA LISTE, ANGLAIS (#10593). */
const en = {
  'rowMenu.details': 'Details',
  'rowMenu.rename': 'Rename',
  'rowMenu.favorite': 'Favorite',
  'rowMenu.favorite.remove': 'Remove from favourites',
  'rowMenu.moveTo': 'Move to…',
  'rowMenu.moveTo.mine': 'My conversations',
  'rowMenu.block': 'Block',
  'rowMenu.unblock': 'Unblock',
  'rowMenu.back': 'Back',
  'rowMenu.block.title': 'Block this user?',
  'rowMenu.block.message': 'This person will no longer be able to send you messages. The conversation moves to your archives.',
  'rowMenu.rename.title': 'Rename the conversation',
  'rowMenu.rename.label': 'Name',
  'rowMenu.rename.hint': 'Leave it empty to restore its original name.',
  'rowMenu.rename.save': 'Save',
  'listFilter.nav': 'Filters',
  'listFilter.all': 'All',
  'listFilter.unread': 'Unread',
  'listFilter.favorites': 'Favorites',
  'listFilter.groups': 'Groups',
  'listFilter.directs': 'Direct',
  'listFilter.pinned': 'Pinned',
  'listFilter.archived': 'Archived',
} as const satisfies RowMenuCatalog;

export default en;
