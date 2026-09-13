import type { InterfaceCatalog } from '@/lib/i18n-catalog';

/**
 * Le portugais du web est celui qu'iOS catalogue sous `pt-BR` : le script
 * d'amorçage réduit la locale du navigateur à sa langue (`pt-BR` → `pt`).
 */
const pt = {
  'announce.messageSent': 'Mensagem enviada',
  'announce.messageCopied': 'Mensagem copiada',
  'announce.messagesCopied': 'Mensagens copiadas',
  'announce.messageProtected': 'Mensagem protegida',
  'announce.selectionCap': 'Máximo de {count} mensagens',
  'announce.nothingToCopy': 'Nada para copiar',

  'message.author.self': 'Você',
  'message.excerpt.protected': 'conteúdo protegido',
  'a11y.message.menu.subject': 'Ações da mensagem de {author}: {excerpt}',

  'typing.named': '{name} está escrevendo',
  'typing.double': '{first} e {second} estão escrevendo',
  'typing.several': 'Várias pessoas estão escrevendo',

  'root.menu.feed': 'Feed',
  'root.menu.links': 'Meus links',
  'root.menu.notifications': 'Notificações',
  'root.menu.calls': 'Chamadas',
  'root.menu.discover': 'Descobrir',
  'root.menu.communities': 'Comunidades',
  'root.menu.settings': 'Ajustes',
  'root.menu.profile': 'Perfil',
  'a11y.floating.menu': 'Menu',
  'a11y.floating.menu.ladder': 'Navegação do Meeshy',

  'pending.back': 'Voltar às conversas',
  'pending.comingSoon': 'Esta tela chega em breve.',
  'pending.feed.promise': 'As publicações de quem você segue.',
  'pending.links.promise': 'Os links compartilhados nas suas conversas vão se reunir aqui.',
  'pending.notifications.promise': 'O que espera por você — menções, respostas, convites — vai aparecer aqui.',
  'pending.calls.promise': 'O histórico das suas chamadas, e um jeito de fazer uma.',
  'pending.discover.promise': 'Pessoas para conhecer, escolhidas pelo que vocês têm em comum.',
  'pending.communities.promise': 'As comunidades das quais você faz parte, e as que se parecem com você.',
  'pending.settings.promise': 'Seus idiomas, sua privacidade, suas notificações.',
  'pending.profile.promise': 'Sua identidade no Meeshy — nome, foto, idiomas e o que os outros veem dela.',
} satisfies InterfaceCatalog;

export default pt;
