import type { SoundsMineCatalog } from '@/lib/i18n-sounds-mine-catalog';

/** « MES SONS » (#9848) — voir le doc-comment de `catalog-sounds-mine-fr.ts`. */
const es = {
  'soundsMine.title': 'Mis sonidos',
  'soundsMine.back': 'Volver a ajustes',
  'soundsMine.empty.title': 'No hay sonidos en tu biblioteca',
  'soundsMine.empty.subtitle': 'Los sonidos que subas o que se extraigan de tus vídeos aparecerán aquí.',
  'soundsMine.error.title': 'No se pudieron cargar tus sonidos',
  'soundsMine.untitled': 'Sonido original',
  'soundsMine.posts.one': '{count} publicación',
  'soundsMine.posts.other': '{count} publicaciones',
  'soundsMine.action.remove': 'Quitar de mi biblioteca',
  'soundsMine.remove.title': '¿Quitar este sonido de tu biblioteca?',
  'soundsMine.remove.confirm': 'Quitar',
  'soundsMine.remove.body.unused': 'Este sonido desaparecerá de tu biblioteca y ya no podrá añadirse a una publicación.',
  'soundsMine.remove.body.one': '{count} publicación aún lo usa y lo seguirá reproduciendo. Desaparecerá de tu biblioteca y ya no podrá añadirse a una nueva publicación.',
  'soundsMine.remove.body.other': '{count} publicaciones aún lo usan y lo seguirán reproduciendo. Desaparecerá de tu biblioteca y ya no podrá añadirse a una nueva publicación.',
  'soundsMine.remove.success': 'Sonido quitado de tu biblioteca',
  'soundsMine.remove.failure': 'No se pudo quitar el sonido. Inténtalo de nuevo.',
  'soundsMine.offline': 'Sin conexión: podrás quitarlo cuando vuelva la red.',
} satisfies SoundsMineCatalog;

export default es;
