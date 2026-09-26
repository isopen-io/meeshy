/**
 * LA CARTE DE CONVERSATION D'UNE BULLE (#8099) — tranche du catalogue, extraite
 * pour tenir le budget de taille (motif `catalog-fr-mentions.ts`) : chaque
 * langue RÉPAND la sienne dans son catalogue.
 */
const frConversationCard = {
  'conversation.card.invite.lead': 'vous invite à rejoindre cette conversation',
  'conversation.card.members.one': '{count} membre',
  'conversation.card.members.other': '{count} membres',
  'conversation.card.messages.one': '{count} message',
  'conversation.card.messages.other': '{count} messages',
  'conversation.card.languages': 'Langues parlées',
  'conversation.card.join': 'Rejoindre',
  'conversation.card.joinAnonymously': 'Rejoindre en anonyme',
  'conversation.card.open': 'Ouvrir',
  'conversation.card.leave': 'Quitter',
  'conversation.card.leaving': 'Départ…',
  'conversation.card.leave.confirm.title': 'Quitter « {title} » ?',
  'conversation.card.leave.confirm.body': 'Vous ne recevrez plus ses messages. L’historique reste lisible.',
  'conversation.card.cancel': 'Annuler',
  'conversation.card.expired': 'Lien expiré',
  'conversation.card.expired.body': 'Ce lien d’invitation n’est plus actif.',
  'conversation.card.private': 'Conversation privée',
  'conversation.card.private.body': 'Seuls ses membres peuvent la voir.',
  'conversation.card.notFound': 'Lien introuvable',
  'conversation.card.notFound.body': 'Ce lien d’invitation n’existe pas ou a été supprimé.',
  'conversation.card.error': 'Impossible de charger cette conversation',
  'conversation.card.retry': 'Réessayer',
  'conversation.card.loading': 'Chargement de la conversation',
  'conversation.card.join.error': 'Impossible de rejoindre. Réessayez.',
  'conversation.card.leave.error': 'Impossible de quitter. Réessayez.',
  'conversation.card.a11y': 'Conversation : {title}',
} as const;

export type ConversationCardCatalogSlice = Readonly<Record<keyof typeof frConversationCard, string>>;

export default frConversationCard;
