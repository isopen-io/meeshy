import type { GlobalSearchCatalog } from '../i18n-global-search-catalog';

/** LA RECHERCHE GÉNÉRALE, ESPAGNOL (#14619, #14620). */
const es = {
  'section.messages': 'Mensajes',
  'search.title': 'Buscar',
  'search.placeholder': 'Mensajes, publicaciones, personas',
  'search.label': 'Buscar en todas partes',
  'search.clear': 'Borrar la búsqueda',
  'search.back': 'Volver',
  'search.everywhere': 'Buscar en todas partes',
  'search.hint': 'Escribe al menos dos caracteres',
  'search.loading': 'Buscando',
  'search.loadMore': 'Mostrar más',
  'search.retry': 'Reintentar',
  'search.error': 'La búsqueda no se completó',
  'search.offline': 'Sin conexión — la búsqueda se reanudará con la red',
  'tab.messages': 'Mensajes',
  'tab.posts': 'Publicaciones',
  'tab.people': 'Personas',
  'messages.empty': 'Ningún mensaje coincide',
  'posts.empty': 'Ninguna publicación coincide',
  'people.empty': 'Nadie coincide',
  'type.post': 'Publicación',
  'type.reel': 'Reel',
  'type.story': 'Historia',
  'translated': 'Traducido',
  'message.blurred': 'Mensaje difuminado',
} as const satisfies GlobalSearchCatalog;

export default es;
