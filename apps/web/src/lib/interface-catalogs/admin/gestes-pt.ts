import type { AdminCatalogFragment } from './fragment';
import type fr from './gestes-fr';

const f = {
  'admin.gesture.col': 'Ações',
  'admin.gesture.group': 'Ações nesta publicação',
  'admin.gesture.takeOffline': 'Tirar do ar',
  'admin.gesture.restore': 'Recolocar no ar',
  'admin.gesture.audience': 'Público',
  'admin.gesture.audience.placeholder': 'Mudar o público…',
  'admin.gesture.takeOffline.title': 'Tirar esta publicação do ar?',
  'admin.gesture.takeOffline.body': 'Some do feed, dos perfis e dos links. O autor ainda a vê, sem poder reabri-la. «Recolocar no ar» a devolve como estava.',
  'admin.gesture.restore.title': 'Recolocar esta publicação no ar?',
  'admin.gesture.restore.body': 'A retirada é levantada e a publicação recupera o público escolhido pelo autor.',
  'admin.gesture.audience.title': 'Mostrar esta publicação a: {audience}?',
  'admin.gesture.audience.body': 'O público escolhido substitui o do autor; qualquer retirada de moderação é levantada.',
  'admin.gesture.motive': 'Motivo',
  'admin.gesture.done.takeOffline': 'Publicação tirada do ar.',
  'admin.gesture.done.restore': 'Publicação de volta ao ar.',
  'admin.gesture.done.audience': 'Público da publicação alterado.',
  'admin.gesture.filter.state': 'Estado',
} satisfies AdminCatalogFragment<typeof fr>;

export default f;
