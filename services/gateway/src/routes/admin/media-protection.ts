/**
 * Le prédicat PARTAGÉ « ce média a-t-il le droit de voyager ? », extrait pour
 * être réutilisé par TOUTE route d'administration qui liste des pièces
 * jointes brutes (#4333, prolongeant #4157 c.4).
 *
 * ## Ce qu'il ne réinvente pas
 *
 * Il COMPOSE `maskedAttachment` (`services/notifications/NotificationService.ts`)
 * — la MÊME garde que l'éventail de notifications applique déjà (cycle 125,
 * voir `services/gateway/CLAUDE.md` § « La jumelle d'une garde peut être un
 * MÉDIUM »). Une seconde écriture de « ce média est-il masqué ? » ne peut que
 * diverger : c'est exactement la classe de défaut que ce fichier ferme en
 * donnant à la question une réponse UNIQUE, IMPORTÉE d'un module à l'autre.
 *
 * ## Les DEUX niveaux qui déclarent la protection
 *
 * `isViewOnce` / `isBlurred` / `effectFlags` existent à la fois sur `Message`
 * et sur `MessageAttachment` — deux colonnes homonymes, INDÉPENDANTES. Un
 * message à vue unique peut porter une pièce jointe qui, elle, ne déclare
 * rien ; l'inverse est vrai pour un message ordinaire portant une pièce
 * jointe floutée seule. `mediaAttachmentIsProtected` lit les deux : la pièce
 * jointe ELLE-MÊME, et le MESSAGE qui la porte (plus `expiresAt` et
 * `deletedAt`, qu'aucun `MessageAttachment` ne porte).
 *
 * ## Deux appelants, une seule forme
 *
 * - `routes/admin/users.ts` (`GET /admin/users/:userId/media`, #4157 c.4) :
 *   chaque ROW interrogée est une pièce jointe, avec le message NESTED sous
 *   `.message`.
 * - `routes/admin/content.ts` (`GET /admin/messages`, #4333 bonus) : chaque
 *   ROW interrogée est un MESSAGE, avec ses pièces jointes dans un tableau
 *   `.attachments` — le message ambiant sert alors de contexte à CHACUNE.
 *
 * Les deux formes s'appellent `mediaAttachmentIsProtected(attachment, message)` :
 * seul l'appelant décide qui est « l'attachment » et qui est « le message »
 * pour SA ligne.
 */
import { maskedAttachment } from '../../services/notifications/NotificationService';

/** Fragment de `select` Prisma pour les trois colonnes de protection PROPRES à `MessageAttachment`. */
export const attachmentProtectionSelect = {
  isViewOnce: true,
  isBlurred: true,
  effectFlags: true,
} as const;

/**
 * Fragment de `select` Prisma pour les colonnes de protection du `Message`
 * qui porte une pièce jointe — les trois mêmes, plus `expiresAt` (éphémère)
 * et `deletedAt` (message supprimé). À nicher sous `message: { select: ... } }`
 * quand la ligne interrogée EST une pièce jointe (`MessageAttachment`), ou à
 * fusionner directement dans le `select` de `Message` quand la ligne
 * interrogée EST le message.
 */
export const messageProtectionSelect = {
  isViewOnce: true,
  isBlurred: true,
  effectFlags: true,
  expiresAt: true,
  deletedAt: true,
} as const;

export interface AttachmentProtectionFlags {
  readonly isViewOnce?: boolean | null;
  readonly isBlurred?: boolean | null;
  readonly effectFlags?: number | null;
}

export interface MessageProtectionContext extends AttachmentProtectionFlags {
  readonly expiresAt?: Date | string | null;
  readonly deletedAt?: Date | string | null;
}

/**
 * `true` si le CONTENU de cette pièce jointe ne doit pas voyager : la ligne
 * reste LISTABLE (id, taille, date, nom) — un administrateur doit pouvoir
 * constater qu'un média existe — mais `fileUrl` / `thumbnailUrl` doivent
 * tomber à `null` chez l'appelant, qui porte seul cette décision de forme.
 */
export function mediaAttachmentIsProtected(
  attachment: AttachmentProtectionFlags,
  message?: MessageProtectionContext | null
): boolean {
  if (message) {
    if (maskedAttachment(message)) return true;
    if (message.deletedAt) return true;
    if (message.expiresAt && new Date(message.expiresAt).getTime() <= Date.now()) return true;
  }
  return maskedAttachment(attachment);
}

/**
 * Fragment de `select` Prisma pour la question TEXTE, qui exige DEUX colonnes
 * de plus que la question MÉDIA : `isEncrypted` et `encryptionMode`. Un
 * message chiffré n'a pas de pendant côté pièce jointe dans
 * `mediaAttachmentIsProtected`, et sans ces deux colonnes chargées
 * `messageContentIsProtected` ne peut rien trancher — « un champ de
 * protection présent au modèle et absent de toute requête » ne garde rien
 * (#4384, puis #4388 qui le remonte ici).
 */
export const messageContentProtectionSelect = {
  ...messageProtectionSelect,
  isEncrypted: true,
  encryptionMode: true,
} as const;

export interface MessageContentProtectionContext extends MessageProtectionContext {
  readonly isEncrypted?: boolean | null;
  readonly encryptionMode?: string | null;
}

/**
 * `true` si le CONTENU d'un message ne doit pas voyager en clair : vue
 * unique / flou / effet masquant (`maskedAttachment`, colonnes homonymes sur
 * `Message`), expiration éphémère déjà consommée, ou message chiffré (le
 * serveur ne détient de toute façon jamais son texte en clair — voir
 * `MessageProcessor.getEncryptionContext`, qui écrit `content: ''` pour tout
 * message chiffré : cette garde est un SIGNAL explicite pour l'admin, pas un
 * retrait de fuite qui n'existait pas).
 *
 * ## Pourquoi il vit ICI et non dans un fichier de route (#4388)
 *
 * Il a d'abord été écrit dans `routes/admin/conversation-messages-sovereign.ts`,
 * puis exporté par #4384 quand `GET /admin/messages` a posé la même question
 * sur la même colonne — une route importait alors d'une autre route. Rien n'en
 * cassait ; mais le prochain à chercher « ce texte peut-il voyager ? » l'aurait
 * cherché dans CE module, où vit déjà son jumeau MÉDIA, ne l'y aurait pas
 * trouvé, et l'aurait RÉÉCRIT — la classe de défaut exacte que ce fichier a
 * été créé pour fermer, un cran plus haut. Les deux moitiés de la question
 * « ce contenu a-t-il le droit de voyager ? » ont désormais le même toit.
 *
 * L'appelant reste seul juge de la FORME du masquage ; ce prédicat ne rend que
 * le verdict.
 */
export function messageContentIsProtected(message: MessageContentProtectionContext): boolean {
  if (maskedAttachment(message)) return true;
  if (message.expiresAt && new Date(message.expiresAt).getTime() <= Date.now()) return true;
  if (message.isEncrypted === true) return true;
  if (message.encryptionMode) return true;
  return false;
}
