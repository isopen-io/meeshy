import type { ConversationCardCatalogSlice } from './catalog-fr-conversation-card';

/** La carte de conversation d'une bulle (#8099) — voir `catalog-fr-conversation-card.ts`. */
const esConversationCard = {
  'conversation.card.invite.lead': 'te invita a unirte a esta conversación',
  'conversation.card.members.one': '{count} miembro',
  'conversation.card.members.other': '{count} miembros',
  'conversation.card.messages.one': '{count} mensaje',
  'conversation.card.messages.other': '{count} mensajes',
  'conversation.card.languages': 'Idiomas hablados',
  'conversation.card.join': 'Unirse',
  'conversation.card.joinAnonymously': 'Unirse de forma anónima',
  'conversation.card.open': 'Abrir',
  'conversation.card.leave': 'Salir',
  'conversation.card.leaving': 'Saliendo…',
  'conversation.card.leave.confirm.title': '¿Salir de «{title}»?',
  'conversation.card.leave.confirm.body': 'Ya no recibirás sus mensajes. El historial sigue siendo legible.',
  'conversation.card.cancel': 'Cancelar',
  'conversation.card.expired': 'Enlace caducado',
  'conversation.card.expired.body': 'Este enlace de invitación ya no está activo.',
  'conversation.card.private': 'Conversación privada',
  'conversation.card.private.body': 'Solo sus miembros pueden verla.',
  'conversation.card.notFound': 'Enlace no encontrado',
  'conversation.card.notFound.body': 'Este enlace de invitación no existe o fue eliminado.',
  'conversation.card.error': 'No se pudo cargar esta conversación',
  'conversation.card.retry': 'Reintentar',
  'conversation.card.loading': 'Cargando la conversación',
  'conversation.card.join.error': 'No se pudo unir. Inténtalo de nuevo.',
  'conversation.card.leave.error': 'No se pudo salir. Inténtalo de nuevo.',
  'conversation.card.a11y': 'Conversación: {title}',
} satisfies ConversationCardCatalogSlice;

export default esConversationCard;
