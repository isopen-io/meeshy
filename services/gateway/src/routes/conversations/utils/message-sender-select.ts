/**
 * Champs de l'utilisateur imbriqué sous l'expéditeur d'un message.
 *
 * T16 — seuls les champs que la réponse dérive réellement sont lus : le
 * handler superpose username / displayName / avatar de cet utilisateur imbriqué
 * (les champs plats du `Participant` restant prioritaires). `firstName`,
 * `lastName`, `systemLanguage` et `role` ne sont PAS sélectionnés : le schéma de
 * réponse (`messageSenderSchema`) retire entièrement l'utilisateur imbriqué et
 * n'expose jamais systemLanguage/role, et aucun client ne lit firstName /
 * lastName — les charger était du sur-fetch par message.
 *
 * Le fragment vit ICI, et non dans `conversations/messages.ts`, pour la même
 * raison que `conversationActiveMemberCountSelect` : un consommateur hors du
 * groupe « conversations » (le delta `/sync`) doit pouvoir le partager sans
 * importer un module de routes entier, qui traînerait ses propres dépendances
 * jusque dans les doubles jest des suites voisines.
 */
export const messageSenderUserSelect = {
  id: true,
  username: true,
  displayName: true,
  avatar: true
} as const;
