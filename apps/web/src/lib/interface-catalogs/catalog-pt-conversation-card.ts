import type { ConversationCardCatalogSlice } from './catalog-fr-conversation-card';

/** La carte de conversation d'une bulle (#8099) — voir `catalog-fr-conversation-card.ts`. */
const ptConversationCard = {
  'conversation.card.invite.lead': 'convida você a entrar nesta conversa',
  'conversation.card.members.one': '{count} membro',
  'conversation.card.members.other': '{count} membros',
  'conversation.card.messages.one': '{count} mensagem',
  'conversation.card.messages.other': '{count} mensagens',
  'conversation.card.languages': 'Idiomas falados',
  'conversation.card.join': 'Entrar',
  'conversation.card.joinAnonymously': 'Entrar anonimamente',
  'conversation.card.open': 'Abrir',
  'conversation.card.leave': 'Sair',
  'conversation.card.leaving': 'Saindo…',
  'conversation.card.leave.confirm.title': 'Sair de «{title}»?',
  'conversation.card.leave.confirm.body': 'Você não receberá mais as mensagens. O histórico continua legível.',
  'conversation.card.cancel': 'Cancelar',
  'conversation.card.expired': 'Link expirado',
  'conversation.card.expired.body': 'Este link de convite não está mais ativo.',
  'conversation.card.private': 'Conversa privada',
  'conversation.card.private.body': 'Somente os membros podem vê-la.',
  'conversation.card.notFound': 'Link não encontrado',
  'conversation.card.notFound.body': 'Este link de convite não existe ou foi excluído.',
  'conversation.card.error': 'Não foi possível carregar esta conversa',
  'conversation.card.retry': 'Tentar novamente',
  'conversation.card.loading': 'Carregando a conversa',
  'conversation.card.join.error': 'Não foi possível entrar. Tente novamente.',
  'conversation.card.leave.error': 'Não foi possível sair. Tente novamente.',
  'conversation.card.a11y': 'Conversa: {title}',
} satisfies ConversationCardCatalogSlice;

export default ptConversationCard;
