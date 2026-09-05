/**
 * Le domaine LINK : messages échangés via un lien de partage (participants
 * anonymes).
 *
 * @see ../socketio-events.ts — la façade qui garde l'adresse historique.
 */

/**
 * `conversationId` et `senderId` sont OBLIGATOIRES : Socket.IO ne transporte pas
 * le nom de la room côté réception, donc la charge utile est le seul routage dont
 * dispose le client. Un message sans `conversationId` est indélivrable — aucun
 * cache ne peut l'accueillir.
 */
export interface LinkMessagePayload {
  readonly id: string;
  readonly conversationId: string;
  readonly senderId: string;
  readonly [key: string]: unknown;
}

export interface LinkMessageNewEventData {
  readonly message: LinkMessagePayload;
}

/**
 * Corps `data` de la réponse 201 des deux routes d'envoi via lien de partage
 * (`POST /links/:identifier/messages[/auth]`).
 *
 * Il porte le MÊME message que `link:message:new`, à un champ près :
 * `clientMessageId`. C'est la seule clé qui relie le message serveur à la ligne
 * optimiste déjà affichée chez l'auteur, et elle ne revient qu'à lui — le
 * payload servi aux pairs en est dépouillé, pour qu'un tiers n'apprenne pas
 * l'espace d'ids de la file d'attente de l'expéditeur (Phase 4 §6.2, même
 * règle que le chemin nominal `message:send` / `message:new`).
 *
 * Un client qui envoie par cette route DOIT lire `message.clientMessageId`
 * pour réconcilier : sans lui, sa ligne optimiste et la copie serveur
 * coexistent et le message apparaît deux fois.
 */
export interface LinkMessageSendResponseData {
  readonly messageId: string;
  readonly message: LinkMessagePayload & { readonly clientMessageId?: string };
}
