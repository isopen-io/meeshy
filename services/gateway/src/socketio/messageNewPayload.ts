import type { Message } from '@meeshy/shared/types/index';
import { resolveWireSenderId } from './messageEditedPayload';

/**
 * Source UNIQUE de la charge utile `message:new`.
 *
 * L'événement a DEUX émetteurs — `MessageHandler.broadcastNewMessage` (transport
 * socket `message:send`) et `MeeshySocketIOManager._broadcastNewMessage`
 * (transport REST/ZMQ : `POST /conversations/:id/messages`, retour du
 * traducteur, messages d'agent, routes de lien) — et un seul décodeur par
 * client. Chacun construisait sa charge utile À LA MAIN, dans son fichier, et
 * les deux commentaires jumeaux qui s'en avertissaient (« tout champ ajouté ici
 * doit être répliqué à la main… et inversement — c'est la 3e fois que cette
 * duplication cause un bug de parité ») n'ont gardé, chacun, que l'exemplaire
 * qui les portait.
 *
 * Ce qu'ils avaient fini par ne plus dire du même message :
 *
 * | famille | socket | REST/ZMQ |
 * |---|---|---|
 * | enveloppe E2EE (`isEncrypted`, `encryptionMode`, `encryptedContent`, `encryptionMetadata`, `encryptedPayload`) | servie | **absente** |
 * | plafond de vue-unique (`maxViewOnceCount`) | servi | **absent** |
 * | provenance de transfert (`forwardedFromId`, `forwardedFromConversationId`) | servie | **absente** |
 * | réponse à un post (`storyReplyToId`) | servie | **absente** |
 * | `messageSource`, `updatedAt` | **absents** | servis |
 * | pseudo d'un expéditeur SANS COMPTE | **absent** | servi |
 *
 * La colonne perdante n'est pas la moins fréquentée : le chemin REST est celui
 * de TOUT envoi non éligible au socket-first côté iOS — pièce jointe, **DM
 * chiffré**, **vue-unique**, éphémère, message à effets. Autrement dit, les
 * familles de champs que ce producteur-là omettait sont exactement celles des
 * messages qu'il est seul à porter. Et comme `MessageProcessor` écrit
 * `content: ''` pour un message chiffré (le texte vit dans `encryptedContent`),
 * un destinataire recevait en temps réel une bulle **vide**, sans même le
 * drapeau qui lui aurait dit qu'elle était chiffrée.
 *
 * Les champs GARDÉS hors de cette unité sont ceux dont la forme diffère
 * délibérément d'un transport à l'autre — ils restent des paramètres, avec leur
 * raison écrite au site d'appel :
 *
 * - `replyTo` : passthrough BRUT côté socket, sender RECONSTRUIT et APLATI côté
 *   REST. Les fusionner changerait la forme consommée par un client sans
 *   certitude sur lequel des deux en dépend.
 * - `attachments` : normalisés par `serializeAttachmentForSocket` côté socket,
 *   servis bruts côté REST (le `select` du chemin REST les livre déjà à la
 *   forme rendue).
 * - `translations` : chaque chemin les obtient par sa propre voie (relecture
 *   Mongo côté socket, transformation directe côté REST).
 *
 * Toute famille de champs DÉRIVÉE DE LA LIGNE MESSAGE appartient à cette unité,
 * jamais au site d'appel : c'est la seule disposition où « ajouter un champ »
 * ne peut plus vouloir dire « l'ajouter à un seul des deux transports ».
 * `message-new-producer-parity.test.ts` confronte les deux productions réelles
 * et tombe si un producteur regagne un champ que l'autre n'a pas.
 */
export type MessageNewPayloadInputs = {
  /** ObjectId normalisé — les deux chemins le résolvent avant d'appeler. */
  readonly conversationId: string;
  /** Tableau au format API (`MessageTranslation[]`), jamais la carte Mongo. */
  readonly translations: unknown;
  /** Forme propre au transport (cf. en-tête). */
  readonly attachments: unknown;
  /** Forme propre au transport (cf. en-tête). */
  readonly replyTo: unknown;
};

/**
 * Expéditeur aplati pour le fil.
 *
 * `username` replie sur le `displayName` d'un participant ANONYME : un invité de
 * lien partagé n'a aucune ligne `User`, et son pseudo est la seule chose qui
 * puisse tenir lieu de handle — sans ce repli, la bulle temps réel affiche un
 * « @ » vide.
 *
 * Type de retour INFÉRÉ pour la même raison que celui de `buildMessageNewPayload` :
 * annoter `type: string` élargirait l'union `'user' | 'anonymous' | 'bot'` du
 * contrat `SocketIOMessage`, et l'émission REST cesserait d'être vérifiée.
 */
function buildSenderPayload(message: Message) {
  const participant = message.sender;
  if (!participant) return undefined;
  const user = participant.user;
  return {
    id: participant.id,
    displayName: participant.nickname || participant.displayName,
    avatar: participant.avatar || user?.avatar,
    type: participant.type,
    userId: participant.userId,
    username: user?.username
      ?? (participant.type === 'anonymous' ? participant.displayName : undefined),
    firstName: user?.firstName || '',
    lastName: user?.lastName || '',
  };
}

/**
 * Enveloppe E2EE prête à déchiffrer.
 *
 * Le FAIT du chiffrement, c'est la présence du chiffré — le drapeau seul ne
 * suffit pas, et le chiffré sans le MODE ne dit pas sous quel régime déchiffrer.
 * Les trois voyagent donc ensemble ou pas du tout.
 */
function buildEncryptedPayload(message: Message): Record<string, unknown> | undefined {
  if (!message.isEncrypted || message.encryptionMode !== 'e2ee' || !message.encryptedContent) {
    return undefined;
  }
  const metadata = typeof message.encryptionMetadata === 'object' && message.encryptionMetadata
    ? message.encryptionMetadata as Record<string, unknown>
    : {};
  return { ciphertext: message.encryptedContent, ...metadata };
}

/**
 * Le type de retour est INFÉRÉ, pas annoté en `Record<string, unknown>` : le
 * chemin REST étale ce résultat dans son littéral puis l'émet sur un `emit`
 * typé `message:new`. Une annotation large ferait perdre au littéral son type
 * exact et l'émission cesserait d'être vérifiée — la garde que
 * `stripClientMessageId`, générique et préservant, avait été écrit pour ne pas
 * casser.
 */
export function buildMessageNewPayload(
  message: Message,
  inputs: MessageNewPayloadInputs
) {
  // `Message` ne déclare ni `clientMessageId` ni `effectFlags` ; ils sont lus à
  // travers ce sac de clés. La lecture est GARDÉE plutôt que crue : sans garde,
  // les deux champs partaient sur le fil en `unknown`, c'est-à-dire qu'aucun
  // producteur ne promettait le type que les décodeurs clients attendent — ce
  // que le contrat honnête de `SocketIOMessage` (cycle 101) fait constater au
  // compilateur.
  const raw = message as unknown as Record<string, unknown>;

  return {
    id: message.id,
    conversationId: inputs.conversationId,
    // Résolution PARTAGÉE avec `message:edited` — la même bulle doit être
    // « la mienne » quel que soit l'événement qui l'a touchée en dernier. La
    // règle (et le repli sur le `Participant.id` d'un expéditeur anonyme) est
    // écrite une seule fois, sur `resolveWireSenderId`.
    senderId: resolveWireSenderId(message),
    content: message.content,
    originalLanguage: message.originalLanguage || 'fr',
    messageType: message.messageType || 'text',
    messageSource: message.messageSource || undefined,
    // Phase 4 §6.2 — voyage jusqu'aux appareils de l'EXPÉDITEUR, et à eux
    // seuls : `stripClientMessageId` le retire du payload des pairs juste avant
    // l'émission. Sans lui, une ligne optimiste ne peut être promue que par la
    // réponse HTTP, et reste bloquée en « envoi » quand celle-ci se perd.
    clientMessageId: typeof raw['clientMessageId'] === 'string' ? raw['clientMessageId'] : undefined,
    isBlurred: Boolean(message.isBlurred),
    isViewOnce: Boolean(message.isViewOnce),
    maxViewOnceCount: message.maxViewOnceCount ?? undefined,
    effectFlags: typeof raw['effectFlags'] === 'number' ? raw['effectFlags'] : 0,
    expiresAt: message.expiresAt || undefined,
    isEdited: Boolean(message.isEdited),
    deletedAt: message.deletedAt || undefined,
    createdAt: message.createdAt || new Date(),
    updatedAt: message.updatedAt || new Date(),
    validatedMentions: message.validatedMentions ?? [],
    translations: inputs.translations,
    sender: buildSenderPayload(message),
    attachments: inputs.attachments,
    replyToId: message.replyToId || undefined,
    replyTo: inputs.replyTo,
    storyReplyToId: message.storyReplyToId || undefined,
    forwardedFromId: message.forwardedFromId || undefined,
    forwardedFromConversationId: message.forwardedFromConversationId || undefined,
    isEncrypted: message.isEncrypted,
    encryptionMode: message.encryptionMode,
    encryptedContent: message.encryptedContent,
    encryptionMetadata: message.encryptionMetadata,
    encryptedPayload: buildEncryptedPayload(message),
  };
}
