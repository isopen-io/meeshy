import type { Message } from '@meeshy/shared/types/index';
import type { SocketIOMessage } from '@meeshy/shared/types/socketio-events';

/**
 * Source UNIQUE du NOYAU de la charge utile `message:edited`.
 *
 * L'événement a TROIS producteurs et un seul décodeur par client :
 *
 * - `MessageHandler.handleMessageEdit` — transport socket, celui qu'emploie le
 *   WEB (`messaging.service.ts` émet `message:edit`), et que son propre
 *   commentaire nomme « le transport d'édition PRIMAIRE » ;
 * - `MeeshySocketIOManager.broadcastMessageEdited` — résumés d'appel ;
 * - `broadcastMessageMutation` — transport REST, celui qu'emploie iOS pour
 *   éditer (`PUT /messages/:messageId`).
 *
 * Chacun composait sa charge à la main, dans son fichier. Le contrat partagé
 * déclare pourtant `message:edited` comme un `SocketIOMessage`, dont SEPT
 * champs sont requis — et le producteur socket n'en servait que quatre :
 *
 * | champ requis | socket | manager | REST |
 * |---|---|---|---|
 * | `id`, `conversationId`, `content`, `originalLanguage` | servis | servis | servis |
 * | `senderId` | **absent** | servi | servi (brut) |
 * | `createdAt` | **absent** | servi | servi |
 * | `messageType` | **absent** | servi | servi |
 *
 * **Ce n'était pas un piège armé, c'était une panne.** Le décodeur iOS
 * (`APIMessage.init(from:)`) lit `senderId` et `createdAt` en `try c.decode` —
 * NON tolérant, contrairement à ses voisins en `decodeIfPresent`. Une clé
 * absente y fait échouer le décodage du message ENTIER, et
 * `MessageSocketManager.decode` abandonne sur un « decode DROP » silencieux.
 * Autrement dit : **toute édition faite depuis le web n'apparaissait jamais en
 * direct sur aucun client iOS du salon.** Web → web marchait (écouteur typé
 * `any`, appliqué en patch), Android aussi (`senderId`/`createdAt` y sont
 * `String? = null`) — seul le client le plus strict tombait, sans bruit.
 *
 * C'est le jumeau exact du défaut de `message:new` (cf. `messageNewPayload.ts`)
 * un événement plus loin : deux producteurs cohérents CHACUN avec lui-même, et
 * faux ENSEMBLE.
 *
 * Ce qui reste HORS de cette unité, et pourquoi — même règle que son jumeau :
 * ces champs ont une forme DÉLIBÉRÉMENT propre à chaque transport, et les
 * fusionner serait un CHANGEMENT de forme, à instruire contre les trois
 * clients, pas un ajout.
 *
 * - `sender` : passthrough BRUT côté socket (le `select` du handler porte
 *   `role`, pas `user`), reconstruit et aplati côté manager ;
 * - `translations` : chaque chemin les obtient par sa propre voie ;
 * - `attachments`, `metadata`, `messageSource` : servis par les seuls chemins
 *   qui les chargent.
 *
 * Toute famille de champs REQUISE PAR LE CONTRAT appartient à cette unité,
 * jamais au site d'appel : c'est la seule disposition où « ce transport sert le
 * contrat » ne peut plus vouloir dire « l'un des trois seulement ».
 */
export type MessageEditedCoreInputs = {
  /** ObjectId normalisé — les trois chemins le résolvent avant d'appeler. */
  readonly conversationId: string;
  /** Le texte APRÈS édition — jamais celui que la ligne portait avant. */
  readonly content: string;
  /** L'état `isEdited` que ce transport constate sur la ligne. */
  readonly isEdited: boolean;
  /** L'instant de l'édition ; sert aussi d'`updatedAt` sur le fil. */
  readonly editedAt: Date;
};

/**
 * `senderId` du FIL : un `User.id`, jamais le `Participant.id` de la colonne.
 *
 * Les clients comparent le `senderId` reçu à leur propre `User.id` pour
 * reconnaître leurs messages et réconcilier une bulle optimiste entre
 * appareils. `buildMessageNewPayload` applique déjà cette résolution à
 * l'envoi ; servir le `Participant.id` sur l'édition ferait de la MÊME bulle
 * « la mienne » puis « celle d'un autre » selon l'événement qui l'a touchée en
 * dernier.
 *
 * Le repli sur `message.senderId` ne sert qu'un expéditeur ANONYME, qui n'a pas
 * d'autre identité.
 *
 * Le chaînage est en `??`, pas en `||` — c'est ce que `buildMessageNewPayload`
 * appliquait déjà, et les deux producteurs de `message:edited` divergeaient
 * silencieusement sur ce point (le manager repliait en `||`). Les deux formes ne
 * se distinguent que sur une CHAÎNE VIDE, qu'aucune colonne de relation Mongo ne
 * peut porter ; unifier sur `??` aligne les trois événements sur la règle du
 * transport le plus chaud, plutôt que de garder deux replis pour un cas
 * inatteignable.
 */
export function resolveWireSenderId(message: Message): string | undefined {
  const participant = message.sender;
  return participant?.userId ?? participant?.user?.id ?? message.senderId ?? undefined;
}

/**
 * Le type de retour est INFÉRÉ, pas annoté : les producteurs étalent ce
 * résultat dans leur littéral puis l'émettent sur un `emit` typé
 * `message:edited`. Une annotation large ferait perdre au littéral son type
 * exact et l'émission cesserait d'être vérifiée — même raison, mot pour mot,
 * que sur `buildMessageNewPayload`.
 */
export function buildMessageEditedCore(
  message: Message,
  inputs: MessageEditedCoreInputs
) {
  return {
    id: message.id,
    conversationId: inputs.conversationId,
    senderId: resolveWireSenderId(message),
    content: inputs.content,
    originalLanguage: message.originalLanguage || 'fr',
    messageType: message.messageType || 'text',
    createdAt: message.createdAt || new Date(),
    updatedAt: inputs.editedAt,
    isEdited: inputs.isEdited,
    editedAt: inputs.editedAt,
  };
}

/**
 * Le CLIQUET, à la compilation.
 *
 * Ce lot a été trouvé parce qu'un handler typé contre `ServerToClientEvents` a
 * fait tomber le compilateur sur l'émission de `message:edited` (cycle 101,
 * suite du cycle 100). Le typage complet du `MessageHandler` reste un lot à
 * part — il bute sur une AUTRE dette, celle de `message:new`. Sans garde,
 * ce cycle-ci se serait donc refermé sur un correctif que rien ne retient.
 *
 * Ces trois lignes tiennent la garantie sans dépendre de ce lot-là : elles
 * dérivent la liste des champs REQUIS depuis le contrat partagé lui-même et
 * vérifient que le noyau les couvre tous. Retirer un champ du noyau, ou en
 * ajouter un requis à `SocketIOMessage`, cesse de compiler ICI — au producteur,
 * là où la décision se prend, et non chez un client qui l'apprendrait par un
 * décodage silencieusement abandonné.
 */
/**
 * Les clés que `SocketIOMessage` déclare REQUISES, détectées par le MODIFICATEUR
 * `?` et non par `undefined extends T`.
 *
 * La formulation par `undefined` est celle qui vient d'abord à l'esprit, et
 * elle est ICI vacante : la passerelle compile sous `strictNullChecks: false`
 * (`tsconfig.json`), où `undefined extends T` est VRAI pour tout `T`. Le jeu
 * de clés y valait donc `never`, et le cliquet passait au vert sous toute
 * mutation — mesuré : retirer `createdAt` du noyau ne le faisait pas tomber.
 * `{} extends Pick<T, K>` teste l'optionalité déclarée, ce que le drapeau
 * n'efface pas.
 */
type RequiredContractKeys = {
  [K in keyof SocketIOMessage]-?: Record<string, never> extends Pick<SocketIOMessage, K> ? never : K;
}[keyof SocketIOMessage];

type ContractKeysMissingFromCore = Exclude<
  RequiredContractKeys,
  keyof ReturnType<typeof buildMessageEditedCore>
>;

const _coreCoversEveryRequiredContractKey: [ContractKeysMissingFromCore] extends [never]
  ? true
  : ['champs requis par SocketIOMessage absents du noyau', ContractKeysMissingFromCore] = true;
void _coreCoversEveryRequiredContractKey;
