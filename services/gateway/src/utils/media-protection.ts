/**
 * Le prédicat PARTAGÉ « ce média a-t-il le droit de voyager ? », extrait pour
 * être réutilisé par TOUTE surface qui liste des pièces jointes brutes
 * (#4333, prolongeant #4157 c.4).
 *
 * ## Pourquoi il vit dans `utils/` et non plus dans `routes/admin/`
 *
 * Ses trois premiers appelants étaient des routes d'administration, et le
 * module a d'abord vécu chez eux. Le quatrième ne l'est pas : la GALERIE d'une
 * conversation (`AttachmentService.getConversationAttachments`, servie à un
 * participant ANONYME par `GET /conversations/:id/attachments`) pose exactement
 * la même question — « ce média a-t-il le droit de partir ? » — sur un chemin
 * de transport qui n'a rien d'administratif. Un service qui importe d'un
 * dossier de routes est une inversion de couche ; recopier le prédicat pour
 * l'éviter serait la divergence que ce fichier existe pour fermer. Il monte
 * donc d'un cran, à côté de `recipient-language.ts`, l'autre loi partagée que
 * plusieurs couches lisent.
 *
 * > La question n'est pas « qui appelle ce prédicat aujourd'hui ? » mais
 * > « quelle surface REMET un média sans le lui demander ? ». La galerie était
 * > la réponse manquante : elle listait `fileUrl` en clair pour un média à vue
 * > unique déjà consommé, un média flouté et un message éphémère expiré, sous
 * > forme de lien permanent et rejouable.
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
 * ## Trois appelants, une seule forme
 *
 * - `routes/admin/users.ts` (`GET /admin/users/:userId/media`, #4157 c.4) :
 *   chaque ROW interrogée est une pièce jointe, avec le message NESTED sous
 *   `.message`.
 * - `routes/admin/content.ts` (`GET /admin/messages`, #4333 bonus) : chaque
 *   ROW interrogée est un MESSAGE, avec ses pièces jointes dans un tableau
 *   `.attachments` — le message ambiant sert alors de contexte à CHACUNE.
 * - `services/attachments/AttachmentService.ts`
 *   (`GET /conversations/:id/attachments`) : même forme que le premier, et une
 *   conséquence PLUS FORTE. Les deux routes d'admin gardent la ligne LISTABLE
 *   et retirent `fileUrl` — un administrateur doit pouvoir constater qu'un
 *   média existe. La galerie, elle, RETIRE LA LIGNE : elle n'a aucun lecteur à
 *   qui l'existence d'un média protégé apprenne quoi que ce soit, et une tuile
 *   sans adresse serait un contrôle sans effet (loi 4).
 *
 * Les trois formes s'appellent `mediaAttachmentIsProtected(attachment, message)` :
 * seul l'appelant décide qui est « l'attachment » et qui est « le message »
 * pour SA ligne, et seul lui décide de la FORME du masquage.
 *
 * ## Le jumeau TEXTE (#4388)
 *
 * `messageContentIsProtected`, plus bas, répond à la MÊME question pour le
 * CONTENU d'un message plutôt que pour une pièce jointe — vue unique / flou /
 * effet masquant, expiration consommée, chiffrement. Il vivait jusqu'ici dans
 * `routes/admin/conversation-messages-sovereign.ts`, un fichier de ROUTE, alors
 * que `content.ts` l'importait déjà en second appelant (#4384) : un prédicat
 * partagé défini dans une route est le même défaut qu'un prédicat recopié, il
 * ne s'est simplement pas encore dupliqué. Il est déplacé ici, à côté de son
 * jumeau média, pour la même raison que celui-ci y vit déjà.
 */
import { maskedAttachment } from '../services/notifications/NotificationService';

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

/**
 * Fragment de `select` Prisma pour les six colonnes que `messageContentIsProtected`
 * (plus bas) exige de son appelant — les quatre partagées avec le contexte
 * média ci-dessus (`isViewOnce`, `isBlurred`, `effectFlags`, `expiresAt`) plus
 * les deux propres au TEXTE (`isEncrypted`, `encryptionMode`). PAS `deletedAt` :
 * cette colonne ne gouverne que le contexte MÉDIA ; le prédicat texte ne la lit
 * pas. #4388 — déplacé depuis `conversation-messages-sovereign.ts`, qui le
 * composait jusque-là en colonnes individuelles à l'intérieur de son propre
 * `select` littéral, sans nom réutilisable — c'est cette absence de nom qui
 * a laissé `content.ts` reconstruire la même liste à la main (#4384).
 */
export const messageContentProtectionSelect = {
  isViewOnce: true,
  isBlurred: true,
  effectFlags: true,
  expiresAt: true,
  isEncrypted: true,
  encryptionMode: true,
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
 * Le plancher structurel que `messageContentIsProtected` exige de son
 * appelant — les six colonnes que `messageContentProtectionSelect` charge.
 * Le reste de la ligne (Prisma-inféré depuis le `select` du site d'appel)
 * n'a pas besoin d'un type nommé : laisser l'inférence porter le contrat
 * évite un second endroit où la forme peut diverger de la requête qui la
 * produit. #4388 — déplacé depuis `conversation-messages-sovereign.ts`.
 */
export interface MessageProtectionFields {
  readonly isViewOnce: boolean;
  readonly isBlurred: boolean;
  readonly effectFlags: number;
  readonly expiresAt: Date | null;
  readonly isEncrypted: boolean;
  readonly encryptionMode: string | null;
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
 * `true` si le CONTENU d'un message ne doit pas voyager en clair : vue
 * unique / flou / effet masquant (`maskedAttachment`, colonnes homonymes sur
 * `Message`), expiration éphémère déjà consommée, ou message chiffré (le
 * serveur ne détient de toute façon jamais son texte en clair — voir
 * `MessageProcessor.getEncryptionContext`, qui écrit `content: ''` pour tout
 * message chiffré : cette garde est un SIGNAL explicite pour l'admin, pas un
 * retrait de fuite qui n'existait pas).
 *
 * Jumeau TEXTE de `mediaAttachmentIsProtected` ci-dessus — même question, un
 * autre médium. #4384 l'avait fait réutiliser par `content.ts` sans le
 * déplacer ; #4388 achève le geste en le posant à côté de son jumeau média.
 * Ses deux SEULS appelants du dépôt — `content.ts` et
 * `conversation-messages-sovereign.ts` — l'importent désormais d'un module
 * partagé plutôt que l'un de l'autre. L'appelant reste seul juge de la FORME
 * du masquage ; ce prédicat ne rend que le verdict.
 */
export function messageContentIsProtected(message: MessageProtectionFields): boolean {
  if (maskedAttachment(message)) return true;
  if (message.expiresAt && message.expiresAt.getTime() <= Date.now()) return true;
  if (message.isEncrypted === true) return true;
  if (message.encryptionMode) return true;
  return false;
}
