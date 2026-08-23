/**
 * Dérivation du `Message.messageType` à partir des types MIME des pièces
 * jointes. Source UNIQUE de cette règle pour TOUS les écrivains — passerelle
 * ET clients.
 *
 * Elle a d'abord vécu côté serveur seul (`services/gateway/src/services/
 * messaging/attachmentMessageType.ts`), parce que le client ne peut pas
 * toujours l'indiquer et que l'un d'eux ne le peut JAMAIS :
 *
 * - Le schéma Zod `SocketMessageSendWithAttachmentsSchema` n'expose aucun champ
 *   `messageType` (contrairement au path texte `message:send` et à la route
 *   REST `POST /messages`, qui acceptent `enum ['text','image','file','audio','video']`).
 *   Un `messageType` envoyé sur ce path est STRIPPÉ par `z.object`.
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
 * ─── Pourquoi la règle a dû REMONTER dans `packages/shared` ────────────────
 *
 * Parce que la dérivation serveur est délibérément ADDITIVE
 * (`deriveMessageTypeForAttachments` ne parle que lorsque la colonne porte
 * encore son défaut `'text'`), elle ne peut RIEN corriger d'un client qui
 * DÉCLARE un type. Un client qui écrit la règle à la main n'est donc pas
 * « redondant avec le serveur » : sa version est la seule qui compte dès
 * qu'elle rend autre chose que `'text'`. Le web en portait un exemplaire
 * manuscrit qui ne regardait que la PREMIÈRE pièce jointe — un lot hétérogène
 * (photo + PDF) partait en `'image'` là où cette règle-ci dit `'file'`, et le
 * serveur, voyant une déclaration explicite, se taisait par construction.
 *
 * Règle de dérivation (une seule catégorie médias par message, comme le
 * `messageType` unique du REST) :
 *   - aucune pièce jointe            → `undefined` (l'appelant conserve 'text')
 *   - une seule catégorie présente   → cette catégorie ('image' | 'audio' | 'video' | 'file')
 *   - plusieurs catégories mélangées → 'file' (bundle hétérogène = pièce jointe générique)
 *
 * Un MIME non image/audio/video (document, inconnu, vide) tombe dans 'file' —
 * la catégorie générique des pièces jointes (icône 📎), jamais 'text'. En
 * particulier `text/plain` : un fichier `.txt` est une PIÈCE JOINTE, pas un
 * message texte, et le rendre `'text'` place un ballon de conversation là où
 * l'utilisateur a joint un document.
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
 * Le type qu'un CLIENT doit déclarer pour un message dont il connaît les pièces
 * jointes — jamais `undefined`.
 *
 * Deux choses séparent cette fonction de `messageTypeFromMimeTypes`, et les
 * deux appartiennent à l'appelant client :
 *
 * 1. **Il y a des pièces jointes, mais aucun MIME connu.** Le tableau vide dit
 *    « je n'ai pas l'information », pas « il n'y a rien à joindre » : le
 *    repli est `'file'`, la catégorie générique, jamais `'text'` — qui
 *    afficherait un ballon de conversation sur un message qui porte un
 *    fichier.
 * 2. **Il n'y a aucune pièce jointe.** C'est le seul cas où `'text'` est vrai,
 *    et c'est l'appelant qui le sait (`attachmentIds`), pas la liste des MIME.
 *
 * Le serveur n'a pas de jumelle de cette fonction, et ce n'est pas un oubli :
 * `deriveMessageTypeForAttachments` ci-dessous est ADDITIVE là où celle-ci est
 * DÉCLARATIVE. Les deux moitiés de la même règle, chacune à sa place.
 */
export function messageTypeForClientAttachments(input: {
  readonly hasAttachments: boolean;
  readonly mimeTypes: ReadonlyArray<string | null | undefined>;
}): 'text' | AttachmentMessageType {
  if (!input.hasAttachments) return 'text';
  return messageTypeFromMimeTypes(input.mimeTypes) ?? 'file';
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
 * Corollaire opposable à tout client : **ce que vous DÉCLAREZ, le serveur ne le
 * corrigera pas.** C'est pourquoi la règle vit ici et non dans la passerelle.
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
