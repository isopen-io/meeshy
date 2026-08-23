/**
 * Dérivation SERVEUR du `Message.messageType` à partir des types MIME des
 * pièces jointes. Source UNIQUE de cette règle pour TOUS les chemins d'écriture.
 *
 * Pourquoi côté serveur : le client ne peut pas toujours l'indiquer, et l'un
 * d'eux ne le peut JAMAIS.
 *
 * - Le schéma Zod `SocketMessageSendWithAttachmentsSchema` n'expose aucun champ
 *   `messageType` (contrairement au path texte `message:send` et à la route
 *   REST `POST /messages`, qui acceptent `enum ['text','image','file','audio','video']`).
 * - **`SendMessageRequest` du SDK iOS n'a pas de champ `messageType` du tout**
 *   (`packages/MeeshySDK/Sources/MeeshySDK/Models/MessageModels.swift`). Or le
 *   chemin REST est celui de TOUT envoi iOS non éligible au socket-first :
 *   pièce jointe, DM chiffré, vue unique, éphémère (cf. l'en-tête de
 *   `socketio/messageNewPayload.ts`). Autrement dit, le client qui ne peut pas
 *   parler est celui qui porte les messages dont le type compte le plus.
 *
 * Sans dérivation, la colonne reste au défaut `'text'` pour une photo, une
 * vidéo ou une note vocale. Conséquence concrète : `protectedPreview`
 * (`services/notifications/NotificationService.ts`) dérive l'icône de contenu
 * de `messageType` via `contentTypeIcon`, donc la notification d'une photo
 * vue-unique s'affiche `👁️ 💬` (ballon texte) au lieu de `👁️ 🖼️` (image).
 *
 * ─── Pourquoi ce module vit dans `services/messaging/` ────────────────────
 *
 * Il a d'abord vécu sous `socketio/utils/`, quand le seul chemin qui dérivait
 * était le handler socket. Il en avait alors TROIS autres qui écrivaient la
 * même colonne sans lui : la liaison REST par `attachmentIds` (qui ne dérivait
 * rien), la copie de transfert (qui réécrivait la règle À LA MAIN, en ne
 * regardant que la première pièce jointe et en ne connaissant que le préfixe
 * `application/`), et la diffusion `copyAttachmentsFromMessageId` (qui ne
 * dérivait rien non plus). La règle appartient au domaine du message, pas à
 * un transport : `MessageProcessor.saveMessage` — le point unique où les
 * pièces jointes FINALES d'un message sont connues — l'applique désormais pour
 * les trois, et le handler socket la partage.
 *
 * Règle de dérivation (une seule catégorie médias par message, comme le
 * `messageType` unique du REST) :
 *   - aucune pièce jointe            → `undefined` (l'appelant conserve 'text')
 *   - une seule catégorie présente   → cette catégorie ('image' | 'audio' | 'video' | 'file')
 *   - plusieurs catégories mélangées → 'file' (bundle hétérogène = pièce jointe générique)
 *
 * Un MIME non image/audio/video (document, inconnu, vide) tombe dans 'file' —
 * la catégorie générique des pièces jointes (icône 📎), jamais 'text'.
 *
 * Valeurs retournées alignées sur l'enum REST (`text` exclu : l'appelant le pose
 * par défaut quand la dérivation renvoie `undefined`).
 */
export type AttachmentMessageType = 'image' | 'audio' | 'video' | 'file';

function bucketForMime(mimeType: string | null | undefined): AttachmentMessageType {
  const mime = (mimeType ?? '').toLowerCase();
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.startsWith('video/')) return 'video';
  return 'file';
}

export function messageTypeFromMimeTypes(
  mimeTypes: ReadonlyArray<string | null | undefined>
): AttachmentMessageType | undefined {
  if (mimeTypes.length === 0) return undefined;
  const buckets = new Set(mimeTypes.map(bucketForMime));
  if (buckets.size === 1) return [...buckets][0];
  return 'file';
}

/**
 * Le type à ÉCRIRE sur une ligne message dont on vient d'arrêter les pièces
 * jointes — ou `undefined` quand il n'y a rien à corriger.
 *
 * La dérivation est strictement ADDITIVE, et c'est la seule chose que cette
 * fonction ajoute à `messageTypeFromMimeTypes` : elle ne parle QUE lorsque la
 * colonne porte encore son défaut. Un `messageType` déjà explicite est un fait
 * que seul le client connaît — `'location'` et `'system'` ne se lisent dans
 * aucun MIME, et `'image'` posé par le handler socket vient déjà de cette
 * règle-ci. Combler un défaut est réparateur ; écraser une déclaration ne le
 * serait pas.
 *
 * Rendre `undefined` quand il n'y a rien à dire n'est pas une commodité : c'est
 * ce qui garantit qu'aucune écriture superflue ne part sur le chemin le plus
 * chaud du service.
 */
export function deriveMessageTypeForAttachments(input: {
  readonly persistedMessageType: string | null | undefined;
  readonly mimeTypes: ReadonlyArray<string | null | undefined>;
}): AttachmentMessageType | undefined {
  if ((input.persistedMessageType ?? 'text') !== 'text') return undefined;
  return messageTypeFromMimeTypes(input.mimeTypes);
}
