/**
 * L'IDENTITÉ D'UNE PERSONNE ET D'UNE CONVERSATION — tranche du catalogue `catalog-pt.ts`,
 * extraite pour tenir le budget de taille (CLAUDE.md) : le catalogue la
 * RÉPAND. Les libellés des liens d'avatar (#7241) et le menu d'appui long
 * d'un avatar (#7828), miroir `avatar.menu.*` d'iOS
 * (`MeeshyAvatar.swift:331-354`), et la feuille de détails d'une
 * conversation (#7829, miroir `ConversationInfoSheet.swift`), et la pile des
 * participants les plus actifs de l'en-tête (#7830).
 */
const ptIdentity = {
  'a11y.avatar.profile': 'Ver o perfil de {name}',
  'a11y.avatar.story': 'Ver a story de {name}',
  'avatar.menu.label': 'Ações para {name}',
  'avatar.menu.view_profile': 'Ver o perfil',
  'userProfile.peek.openPage': 'Abrir o perfil completo',
  'avatar.menu.view_story': 'Ver a story',
  'avatar.menu.conversation_details': 'Detalhes da conversa',
  'conversation.details.title': 'Detalhes da conversa',
  'conversation.details.open': 'Ver os detalhes de {name}',
  'conversation.details.type.direct': 'Conversa privada',
  'conversation.details.type.group': 'Grupo',
  'conversation.details.type.public': 'Conversa pública',
  'conversation.details.type.global': 'Conversa global',
  'conversation.details.type.broadcast': 'Transmissão',
  'conversation.details.members.one': '{count} membro',
  'conversation.details.members.other': '{count} membros',
  'conversation.details.members.section': 'Membros',
  'conversation.details.members.loading': 'Carregando os membros',
  'conversation.details.members.error': 'Não foi possível carregar os membros.',
  'conversation.details.members.retry': 'Tentar novamente',
  'conversation.details.members.empty': 'Nenhum membro para mostrar.',
  'conversation.details.members.more': 'Mostrar mais membros',
  'conversation.details.members.you': 'Você',
  'conversation.details.role.creator': 'Criador',
  'conversation.details.role.admin': 'Administrador',
  'conversation.details.role.moderator': 'Moderador',
  'conversation.details.share': 'Compartilhar um link',
  'conversation.details.share.busy': 'Criando o link…',
  'conversation.details.share.copied': 'Link copiado — é só colar.',
  'conversation.details.share.failed': 'Não foi possível criar o link — tente novamente em instantes.',
  'conversation.details.share.unavailable': 'Não é possível compartilhar aqui — copie o link: {url}',
  'thread.header.active_members': 'Membros mais ativos',
};

export default ptIdentity;
