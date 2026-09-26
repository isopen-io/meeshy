import type { ConversationCardCatalogSlice } from './catalog-fr-conversation-card';

/** La carte de conversation d'une bulle (#8099) — voir `catalog-fr-conversation-card.ts`. */
const deConversationCard = {
  'conversation.card.invite.lead': 'lädt dich ein, dieser Unterhaltung beizutreten',
  'conversation.card.members.one': '{count} Mitglied',
  'conversation.card.members.other': '{count} Mitglieder',
  'conversation.card.messages.one': '{count} Nachricht',
  'conversation.card.messages.other': '{count} Nachrichten',
  'conversation.card.languages': 'Gesprochene Sprachen',
  'conversation.card.join': 'Beitreten',
  'conversation.card.joinAnonymously': 'Anonym beitreten',
  'conversation.card.open': 'Öffnen',
  'conversation.card.leave': 'Verlassen',
  'conversation.card.leaving': 'Wird verlassen…',
  'conversation.card.leave.confirm.title': '„{title}“ verlassen?',
  'conversation.card.leave.confirm.body': 'Du erhältst keine Nachrichten mehr. Der Verlauf bleibt lesbar.',
  'conversation.card.cancel': 'Abbrechen',
  'conversation.card.expired': 'Link abgelaufen',
  'conversation.card.expired.body': 'Dieser Einladungslink ist nicht mehr aktiv.',
  'conversation.card.private': 'Private Unterhaltung',
  'conversation.card.private.body': 'Nur Mitglieder können sie sehen.',
  'conversation.card.notFound': 'Link nicht gefunden',
  'conversation.card.notFound.body': 'Dieser Einladungslink existiert nicht oder wurde gelöscht.',
  'conversation.card.error': 'Diese Unterhaltung konnte nicht geladen werden',
  'conversation.card.retry': 'Erneut versuchen',
  'conversation.card.loading': 'Unterhaltung wird geladen',
  'conversation.card.join.error': 'Beitritt fehlgeschlagen. Versuche es erneut.',
  'conversation.card.leave.error': 'Verlassen fehlgeschlagen. Versuche es erneut.',
  'conversation.card.a11y': 'Unterhaltung: {title}',
} satisfies ConversationCardCatalogSlice;

export default deConversationCard;
