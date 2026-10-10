import type { SoundsMineCatalog } from '@/lib/i18n-sounds-mine-catalog';

/** « MES SONS » (#9848) — voir le doc-comment de `catalog-sounds-mine-fr.ts`. */
const pt = {
  'soundsMine.title': 'Meus sons',
  'soundsMine.back': 'Voltar aos ajustes',
  'soundsMine.empty.title': 'Nenhum som na sua biblioteca',
  'soundsMine.empty.subtitle': 'Os sons que você enviar ou que forem extraídos dos seus vídeos aparecerão aqui.',
  'soundsMine.error.title': 'Não foi possível carregar seus sons',
  'soundsMine.untitled': 'Som original',
  'soundsMine.posts.one': '{count} publicação',
  'soundsMine.posts.other': '{count} publicações',
  'soundsMine.action.remove': 'Remover da minha biblioteca',
  'soundsMine.remove.title': 'Remover este som da sua biblioteca?',
  'soundsMine.remove.confirm': 'Remover',
  'soundsMine.remove.body.unused': 'Este som vai sumir da sua biblioteca e não poderá mais ser adicionado a uma publicação.',
  'soundsMine.remove.body.one': '{count} publicação ainda o usa e continuará a tocá-lo. Ele vai sumir da sua biblioteca e não poderá mais ser adicionado a uma nova publicação.',
  'soundsMine.remove.body.other': '{count} publicações ainda o usam e continuarão a tocá-lo. Ele vai sumir da sua biblioteca e não poderá mais ser adicionado a uma nova publicação.',
  'soundsMine.remove.success': 'Som removido da sua biblioteca',
  'soundsMine.remove.failure': 'Não foi possível remover o som. Tente novamente.',
  'soundsMine.offline': 'Sem conexão — você poderá removê-lo quando a rede voltar.',
} satisfies SoundsMineCatalog;

export default pt;
