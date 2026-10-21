import type { ThreadSearchCatalogSlice } from './catalog-fr-thread-search';

/** La recherche dans la conversation — tranche du catalogue, miroir de `catalog-fr-thread-search.ts`. */
const ptThreadSearch = {
  'thread.search.open': 'Pesquisar na conversa',
  'thread.search.placeholder': 'Pesquisar na conversa…',
  'thread.search.close': 'Fechar a pesquisa',
  'thread.search.hint': 'Digite pelo menos dois caracteres',
  'thread.search.searching': 'Pesquisando…',
  'thread.search.empty': 'Nenhum resultado',
  'thread.search.count.one': '{count} resultado',
  'thread.search.count.other': '{count} resultados',
  'thread.search.failed': 'A pesquisa não foi concluída',
  'thread.search.retry': 'Tentar novamente',
  'thread.search.more': 'Mais resultados',
  'thread.search.translated': 'Encontrado numa tradução',
} satisfies ThreadSearchCatalogSlice;

export default ptThreadSearch;
