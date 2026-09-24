import { newClientMessageId } from './client-message-id';
import type { ConversationsDeps } from './conversations';
import { sendMessage, type SendMessageBody } from './messages';
import type { Message } from './types';

/**
 * LE TRANSPORT DU TRANSFERT (#5866) — chemin UNIQUE, miroir de
 * `MessageForwardService.forward` (`apps/ios/Meeshy/Features/Main/Services/
 * MessageForwardService.swift`).
 *
 * **AUCUNE ROUTE DÉDIÉE.** La passerelle n'a pas de `POST /messages/forward` :
 * un transfert est un ENVOI ORDINAIRE qui DÉSIGNE sa source
 * (`messages-send.ts:71-72`, `forwardedFromId` / `forwardedFromConversationId`).
 * Rien n'était à ajouter côté serveur.
 *
 * **L'INVARIANT QUI TIENT TOUT LE LOT : jamais d'`attachmentIds`.**
 * `MessageProcessor.handleAttachments` (`MessageProcessor.ts:726-727`) est un
 * `else if` — poser `attachmentIds` DÉSACTIVE `copyForwardedAttachments`. Le
 * réflexe « il faut bien renvoyer les pièces » est exactement ce qui casse la
 * capacité visée : le serveur COPIE la ligne `MessageAttachment` et réutilise
 * LE MÊME blob (`filePath`/`fileUrl` recopiés tels quels), donc un transfert
 * ne coûte aucun octet de réseau et aucun ré-upload. iOS le déclare dans le
 * même mot (`MessageForwardService.swift:42-44`).
 *
 * **UNE SOURCE ABSENTE S'OMET**, jamais `''` : la chaîne vide cassait
 * l'écriture Prisma `@db.ObjectId` côté serveur (invariant iOS, même fichier).
 *
 * **UN `clientMessageId` PAR (message → cible)** : l'index unique
 * `(conversationId, clientMessageId)` de la passerelle dédoublonne un renvoi.
 * Il est neuf à chaque appel de `forwardMessages` — re-transférer DÉLIBÉRÉMENT
 * le même message vers la même conversation doit créer un SECOND message,
 * jamais retomber sur le chemin idempotent qui rendrait la ligne existante en
 * succès sans rien créer.
 */

/** Ce qu'un transfert lit du message source — et rien de plus. */
export type ForwardSource = Pick<Message, 'id' | 'content' | 'originalLanguage'>;

export type ForwardResult =
  | { readonly ok: true; readonly count: number }
  | { readonly ok: false; readonly error: string };

/**
 * LE CORPS — `content` OMIS quand le texte est vide (un média seul, un vocal :
 * `forwardedFromId` suffit à rendre le corps non vide pour le `.refine()` du
 * schéma serveur, `messages-send.ts:107-116`), et AUCUN `attachmentIds`.
 *
 * **NI `messageType`, ET C'EST DÉLIBÉRÉ.** Le transfert d'une photo ne
 * s'annonce pas `'image'` ici : la passerelle DÉRIVE le type des pièces
 * jointes FINALES, après la copie (`MessageProcessor.ts:617-643`,
 * `deriveMessageTypeForAttachments` — « le seul point du service où les
 * pièces jointes finales sont connues, quel que soit le chemin qui les a
 * produites : liaison par `attachmentIds`, **copie de transfert**, copie de
 * diffusion »). Un type déclaré par le client serait la seconde écriture
 * d'une règle qui a déjà son site unique, et il serait FAUX sur un lot
 * hétérogène (que la règle dit `'file'`).
 */
export function forwardBodyOf(params: {
  readonly message: ForwardSource;
  readonly sourceConversationId?: string;
  readonly clientMessageId: string;
}): SendMessageBody {
  const { message, sourceConversationId, clientMessageId } = params;
  return {
    ...(message.content.trim().length > 0 ? { content: message.content } : {}),
    originalLanguage: message.originalLanguage,
    clientMessageId,
    forwardedFromId: message.id,
    ...(sourceConversationId === undefined || sourceConversationId === ''
      ? {}
      : { forwardedFromConversationId: sourceConversationId }),
  };
}

/**
 * N messages sélectionnés ⇒ N envois, SÉQUENTIELS et dans l'ordre du fil :
 * `createdAt` est posé par la passerelle à la réception, donc des envois
 * parallèles arriveraient chez le destinataire dans un ordre que personne ne
 * contrôle. Le premier refus arrête le lot et porte le motif du serveur —
 * celui que `describeForwardRefusal` compose (`forwardAdmission.ts:164-174`),
 * déjà écrit dans la langue du produit.
 */
export async function forwardMessages(
  params: ConversationsDeps & {
    readonly messages: readonly ForwardSource[];
    readonly sourceConversationId?: string;
    readonly targetConversationId: string;
    /** Injectable pour les témoins — jamais un second générateur d'identité. */
    readonly nextClientMessageId?: () => string;
  },
): Promise<ForwardResult> {
  const { source, transport, messages, sourceConversationId, targetConversationId } = params;
  const nextId = params.nextClientMessageId ?? newClientMessageId;

  let sent = 0;
  for (const message of messages) {
    const result = await sendMessage({
      source,
      transport,
      conversationId: targetConversationId,
      body: forwardBodyOf({
        message,
        ...(sourceConversationId === undefined ? {} : { sourceConversationId }),
        clientMessageId: nextId(),
      }),
    });
    if (!result.ok) return { ok: false, error: result.error };
    sent += 1;
  }
  return { ok: true, count: sent };
}
