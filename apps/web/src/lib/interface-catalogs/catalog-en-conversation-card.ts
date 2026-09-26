import type { ConversationCardCatalogSlice } from './catalog-fr-conversation-card';

/** La carte de conversation d'une bulle (#8099) — voir `catalog-fr-conversation-card.ts`. */
const enConversationCard = {
  'conversation.card.invite.lead': 'invites you to join this conversation',
  'conversation.card.members.one': '{count} member',
  'conversation.card.members.other': '{count} members',
  'conversation.card.messages.one': '{count} message',
  'conversation.card.messages.other': '{count} messages',
  'conversation.card.languages': 'Spoken languages',
  'conversation.card.join': 'Join',
  'conversation.card.joinAnonymously': 'Join anonymously',
  'conversation.card.open': 'Open',
  'conversation.card.leave': 'Leave',
  'conversation.card.leaving': 'Leaving…',
  'conversation.card.leave.confirm.title': 'Leave “{title}”?',
  'conversation.card.leave.confirm.body': 'You will no longer receive its messages. The history stays readable.',
  'conversation.card.cancel': 'Cancel',
  'conversation.card.expired': 'Link expired',
  'conversation.card.expired.body': 'This invitation link is no longer active.',
  'conversation.card.private': 'Private conversation',
  'conversation.card.private.body': 'Only its members can see it.',
  'conversation.card.notFound': 'Link not found',
  'conversation.card.notFound.body': 'This invitation link does not exist or was deleted.',
  'conversation.card.error': 'Could not load this conversation',
  'conversation.card.retry': 'Retry',
  'conversation.card.loading': 'Loading the conversation',
  'conversation.card.join.error': 'Could not join. Try again.',
  'conversation.card.leave.error': 'Could not leave. Try again.',
  'conversation.card.a11y': 'Conversation: {title}',
} satisfies ConversationCardCatalogSlice;

export default enConversationCard;
