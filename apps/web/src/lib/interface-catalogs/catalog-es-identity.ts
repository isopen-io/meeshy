/**
 * L'IDENTITÉ D'UNE PERSONNE ET D'UNE CONVERSATION — tranche du catalogue `catalog-es.ts`,
 * extraite pour tenir le budget de taille (CLAUDE.md) : le catalogue la
 * RÉPAND. Les libellés des liens d'avatar (#7241) et le menu d'appui long
 * d'un avatar (#7828), miroir `avatar.menu.*` d'iOS
 * (`MeeshyAvatar.swift:331-354`), et la feuille de détails d'une
 * conversation (#7829, miroir `ConversationInfoSheet.swift`).
 */
const esIdentity = {
  'a11y.avatar.profile': 'Ver el perfil de {name}',
  'a11y.avatar.story': 'Ver la historia de {name}',
  'avatar.menu.label': 'Acciones para {name}',
  'avatar.menu.view_profile': 'Ver el perfil',
  'avatar.menu.view_story': 'Ver la historia',
  'avatar.menu.conversation_details': 'Detalles de la conversación',
  'conversation.details.title': 'Detalles de la conversación',
  'conversation.details.open': 'Ver los detalles de {name}',
  'conversation.details.type.direct': 'Chat privado',
  'conversation.details.type.group': 'Grupo',
  'conversation.details.type.public': 'Conversación pública',
  'conversation.details.type.global': 'Conversación global',
  'conversation.details.type.broadcast': 'Difusión',
  'conversation.details.members.one': '{count} miembro',
  'conversation.details.members.other': '{count} miembros',
  'conversation.details.members.section': 'Miembros',
  'conversation.details.members.loading': 'Cargando los miembros',
  'conversation.details.members.error': 'No se pudieron cargar los miembros.',
  'conversation.details.members.retry': 'Reintentar',
  'conversation.details.members.empty': 'No hay miembros que mostrar.',
  'conversation.details.members.more': 'Mostrar más miembros',
  'conversation.details.members.you': 'Tú',
  'conversation.details.role.creator': 'Creador',
  'conversation.details.role.admin': 'Administrador',
  'conversation.details.role.moderator': 'Moderador',
  'conversation.details.share': 'Compartir un enlace',
  'conversation.details.share.busy': 'Creando el enlace…',
  'conversation.details.share.copied': 'Enlace copiado: solo falta pegarlo.',
  'conversation.details.share.failed': 'No se pudo crear el enlace. Inténtalo de nuevo en un momento.',
  'conversation.details.share.unavailable': 'No se puede compartir aquí. Copia el enlace: {url}',
};

export default esIdentity;
