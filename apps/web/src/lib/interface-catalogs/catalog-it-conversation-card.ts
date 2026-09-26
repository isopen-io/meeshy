import type { ConversationCardCatalogSlice } from './catalog-fr-conversation-card';

/** La carte de conversation d'une bulle (#8099) — voir `catalog-fr-conversation-card.ts`. */
const itConversationCard = {
  'conversation.card.invite.lead': 'ti invita a unirti a questa conversazione',
  'conversation.card.members.one': '{count} membro',
  'conversation.card.members.other': '{count} membri',
  'conversation.card.messages.one': '{count} messaggio',
  'conversation.card.messages.other': '{count} messaggi',
  'conversation.card.languages': 'Lingue parlate',
  'conversation.card.join': 'Unisciti',
  'conversation.card.joinAnonymously': 'Unisciti in anonimo',
  'conversation.card.open': 'Apri',
  'conversation.card.leave': 'Esci',
  'conversation.card.leaving': 'Uscita…',
  'conversation.card.leave.confirm.title': 'Uscire da «{title}»?',
  'conversation.card.leave.confirm.body': 'Non riceverai più i suoi messaggi. La cronologia resta leggibile.',
  'conversation.card.cancel': 'Annulla',
  'conversation.card.expired': 'Link scaduto',
  'conversation.card.expired.body': 'Questo link di invito non è più attivo.',
  'conversation.card.private': 'Conversazione privata',
  'conversation.card.private.body': 'Solo i membri possono vederla.',
  'conversation.card.notFound': 'Link non trovato',
  'conversation.card.notFound.body': 'Questo link di invito non esiste o è stato eliminato.',
  'conversation.card.error': 'Impossibile caricare questa conversazione',
  'conversation.card.retry': 'Riprova',
  'conversation.card.loading': 'Caricamento della conversazione',
  'conversation.card.join.error': 'Impossibile unirsi. Riprova.',
  'conversation.card.leave.error': 'Impossibile uscire. Riprova.',
  'conversation.card.a11y': 'Conversazione: {title}',
} satisfies ConversationCardCatalogSlice;

export default itConversationCard;
