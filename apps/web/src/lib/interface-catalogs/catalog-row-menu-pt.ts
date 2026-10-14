import type { RowMenuCatalog } from '../i18n-row-menu-catalog';

/** LE MENU D'UNE LIGNE ET LES PUCES DE LA LISTE, PORTUGAIS (iOS sert le brésilien, repris ici) (#10593). */
const pt = {
  'rowMenu.details': 'Detalhes',
  'rowMenu.rename': 'Renomear',
  'rowMenu.favorite': 'Favorito',
  'rowMenu.favorite.remove': 'Remover dos favoritos',
  'rowMenu.moveTo': 'Mover para…',
  'rowMenu.moveTo.mine': 'Minhas conversas',
  'rowMenu.block': 'Bloquear',
  'rowMenu.unblock': 'Desbloquear',
  'rowMenu.back': 'Voltar',
  'rowMenu.block.title': 'Bloquear este usuário?',
  'rowMenu.block.message': 'Esta pessoa não poderá mais enviar mensagens para você. A conversa vai para os seus arquivos.',
  'rowMenu.rename.title': 'Renomear a conversa',
  'rowMenu.rename.label': 'Nome',
  'rowMenu.rename.hint': 'Deixe vazio para recuperar o nome original.',
  'rowMenu.rename.save': 'Salvar',
  'listFilter.nav': 'Filtros',
  'listFilter.all': 'Todas',
  'listFilter.unread': 'Não lidas',
  'listFilter.favorites': 'Favoritos',
  'listFilter.groups': 'Grupos',
  'listFilter.directs': 'Diretas',
  'listFilter.pinned': 'Fixadas',
  'listFilter.archived': 'Arquivadas',
} as const satisfies RowMenuCatalog;

export default pt;
