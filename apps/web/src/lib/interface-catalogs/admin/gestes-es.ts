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
  'admin.gesture.preview.open': 'Vista previa',
  'admin.gesture.preview.title': 'Vista previa de la publicación',
  'admin.gesture.preview.previous': 'Publicación anterior',
  'admin.gesture.preview.next': 'Publicación siguiente',
  'admin.gesture.preview.fiche': 'Abrir la ficha',
  'admin.gesture.preview.keys': 'j y k, o las flechas, pasan de una publicación a otra.',
  'admin.gesture.preview.scene': 'Escena {index} de {count}',
  'admin.gesture.preview.scenePrevious': 'Escena anterior',
  'admin.gesture.preview.sceneNext': 'Escena siguiente',
  'admin.gesture.preview.file': 'Abrir el archivo',
  'admin.gesture.preview.empty': 'Esta publicación no tiene texto ni medios.',
} satisfies AdminCatalogFragment<typeof fr>;

export default f;
