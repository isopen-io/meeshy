/**
 * ÉCRIRE À UN AMI WHATSAPP (#17118) — la source des clés `externalConversation.*`. Chargée avec l'entrée de
 * la nouvelle conversation, seulement là où elle est visible (`lib/i18n-external-conversation-catalog.ts`),
 * jamais au démarrage.
 */
const fr = {
  'externalConversation.entry.title': 'Écrire à un ami WhatsApp',
  'externalConversation.entry.detail': 'Par son numéro, chiffré de bout en bout',
  'externalConversation.handle.label': 'Numéro WhatsApp de votre ami',
  'externalConversation.handle.hint': 'Au format international, avec l’indicatif du pays : +33 6 12 34 56 78.',
  'externalConversation.handle.invalid': 'Ce numéro n’est pas au format international. Commencez par + et l’indicatif du pays.',
  'externalConversation.submit': 'Écrire',
  'externalConversation.pending': 'Ouverture…',
  'externalConversation.cancel': 'Annuler',
  'externalConversation.encrypted': 'Chiffré de bout en bout : Meeshy ne lit pas vos messages. La traduction se fait sur votre appareil, et les fonctions qui exigent de lire le message sur nos serveurs n’existent pas dans cette conversation.',
  'externalConversation.phoneUnverified': 'Vérifiez votre numéro pour écrire à un ami WhatsApp.',
  'externalConversation.phoneVerified': 'Numéro vérifié. Touchez « Écrire » pour ouvrir la conversation.',
  'externalConversation.refused.disabled': 'Écrire à un ami WhatsApp n’est pas encore disponible ici.',
  'externalConversation.refused.reserved': 'Pendant la phase de test, les conversations chiffrées de bout en bout sont réservées à certains comptes.',
  'externalConversation.refused.limit': 'Vous avez déjà le nombre maximal de conversations WhatsApp ouvertes. Fermez-en une pour en ouvrir une autre.',
  'externalConversation.refused.rateLimited': 'Trop de conversations ouvertes en peu de temps. Réessayez dans une heure.',
  'externalConversation.refused.offline': 'Hors ligne : reconnectez-vous, puis touchez de nouveau « Écrire ».',
  'externalConversation.refused.failed': 'Impossible d’ouvrir cette conversation. Réessayez dans un instant.',
} as const;

export default fr;
