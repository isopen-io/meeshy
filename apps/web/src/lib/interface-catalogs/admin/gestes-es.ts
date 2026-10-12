import type { AdminCatalogFragment } from './fragment';
import type fr from './gestes-fr';

const f = {
  'admin.gesture.col': 'Acciones',
  'admin.gesture.group': 'Acciones sobre esta publicación',
  'admin.gesture.takeOffline': 'Retirar',
  'admin.gesture.restore': 'Volver a publicar',
  'admin.gesture.audience': 'Audiencia',
  'admin.gesture.audience.placeholder': 'Cambiar la audiencia…',
  'admin.gesture.takeOffline.title': '¿Retirar esta publicación?',
  'admin.gesture.takeOffline.body': 'Desaparece del feed, de los perfiles y de los enlaces. Su autor aún la ve, sin poder reabrirla. «Volver a publicar» la devuelve tal como estaba.',
  'admin.gesture.restore.title': '¿Volver a publicar esta publicación?',
  'admin.gesture.restore.body': 'Se levanta la retirada y la publicación recupera la audiencia que eligió su autor.',
  'admin.gesture.audience.title': '¿Mostrar esta publicación a: {audience}?',
  'admin.gesture.audience.body': 'La audiencia elegida sustituye a la del autor; se levanta cualquier retirada de moderación.',
  'admin.gesture.motive': 'Motivo',
  'admin.gesture.done.takeOffline': 'Publicación retirada.',
  'admin.gesture.done.restore': 'Publicación de nuevo en línea.',
  'admin.gesture.done.audience': 'Audiencia de la publicación cambiada.',
  'admin.gesture.filter.state': 'Estado',
} satisfies AdminCatalogFragment<typeof fr>;

export default f;
