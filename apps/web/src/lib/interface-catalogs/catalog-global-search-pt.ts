import type { GlobalSearchCatalog } from '../i18n-global-search-catalog';

/** LA RECHERCHE GÉNÉRALE, PORTUGAIS (#14619, #14620). */
const pt = {
  'section.messages': 'Mensagens',
  'search.title': 'Pesquisar',
  'search.placeholder': 'Mensagens, publicações, pessoas',
  'search.label': 'Pesquisar em todo lado',
  'search.clear': 'Limpar a pesquisa',
  'search.back': 'Voltar',
  'search.everywhere': 'Pesquisar em todo lado',
  'search.hint': 'Escreva pelo menos dois caracteres',
  'search.loading': 'A pesquisar',
  'search.loadMore': 'Mostrar mais',
  'search.retry': 'Tentar de novo',
  'search.error': 'A pesquisa não foi concluída',
  'search.offline': 'Sem ligação — a pesquisa retoma com a rede',
  'tab.messages': 'Mensagens',
  'tab.posts': 'Publicações',
  'tab.people': 'Pessoas',
  'messages.empty': 'Nenhuma mensagem corresponde',
  'posts.empty': 'Nenhuma publicação corresponde',
  'people.empty': 'Ninguém corresponde',
  'type.post': 'Publicação',
  'type.reel': 'Reel',
  'type.story': 'História',
  'translated': 'Traduzido',
} as const satisfies GlobalSearchCatalog;

export default pt;
