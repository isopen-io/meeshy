/**
 * Le contrat de la LIGNE D'APERÇU d'une conversation (#7545, milestone #111).
 *
 * UN seul contrat, porté À L'IDENTIQUE par `GET /conversations` (sur
 * `lastMessage` et sur la conversation) et par `conversation:updated` (clés
 * plates `lastMessage*`, `lastReaction`, `activeCall`). Le composeur partagé
 * (`composeConversationPreview`, #7546) prend ces champs en entrée ; les
 * clients web-v2 (#7547) et iOS (#7548) les décodent tels quels.
 *
 * Trois règles valent pour tout ce fichier :
 * - **Rien de protégé ne voyage.** Un dernier message à vue unique, flouté,
 *   chiffré ou expiré (`isLastMessageProtected` + `isEncrypted`) part SANS texte,
 *   SANS traduction et SANS pièce jointe : seuls voyagent les drapeaux qui
 *   permettent au client de dessiner son placeholder, et l'`attachmentSummary`
 *   réduit à `null`.
 * - **Rien de localisé ne voyage.** Le serveur envoie des CLÉS et des
 *   paramètres (`systemEvent`, `callSummary`), jamais un libellé français :
 *   chaque client le localise dans ses sept langues.
 * - **Un détail absent est `null`**, jamais `0` ni `''` : le composeur n'affiche
 *   un détail (dimensions, durée, pages, poids) que s'il existe.
 */

import type { CallSummaryMediaType, CallSummaryOutcome } from '../utils/call-summary.js';
import type { MessageSticker } from './message-sticker.js';

/**
 * Le sticker du dernier message (#7591, #7594), hissé de `metadata.sticker` et
 * revalidé serveur (`parseMessageSticker`). `lastMessage.sticker` en REST,
 * `lastMessageSticker` sur `conversation:updated`. Sa présence fait du message
 * un sticker quel que soit son `messageType` ; `null` sans sticker ou quand le
 * message ou sa pièce jointe est protégé.
 */
export type LastMessageSticker = MessageSticker;

/**
 * Famille d'une pièce jointe pour le décompte de la ligne (« 3 photos »,
 * « 📎 4 pièces jointes »). Dérivée du `mimeType` seul (`image/*`, `video/*`,
 * `audio/*`, le reste `file`).
 *
 * PAS de famille `voice` : aucune colonne ni métadonnée ne distingue
 * aujourd'hui un vocal enregistré d'un fichier audio importé — la publier
 * serait promettre un signal que rien ne pose.
 */
export type PreviewAttachmentKind = 'image' | 'video' | 'audio' | 'file';

/**
 * Le résumé de TOUTES les pièces jointes du dernier message — la liste n'en
 * sert que la première en détail.
 *
 * - `count` : nombre total (≥ 1 ; le résumé est `null` sans pièce jointe).
 * - `kinds` : décompte par famille ; une famille absente vaut 0.
 * - `totalSize` : somme des `fileSize` en octets, `null` si AUCUNE taille n'est
 *   connue (une somme partielle se sert quand même : c'est un minorant honnête
 *   et le composeur n'en tire qu'un ordre de grandeur).
 */
export interface LastMessageAttachmentSummary {
  readonly count: number;
  readonly kinds: Readonly<Partial<Record<PreviewAttachmentKind, number>>>;
  readonly totalSize: number | null;
}

/**
 * Un appel TERMINÉ (ou encore en cours, `outcome: 'ongoing'`) dont le message
 * de synthèse est le dernier de la conversation. Lu depuis
 * `Message.metadata` (`CallSummaryMetadata`, `utils/call-summary.ts`) —
 * jamais depuis le texte français stocké dans `content`.
 *
 * - `kind` : média de l'appel.
 * - `outcome` : vocabulaire de `CallSummaryOutcome` (`completed`, `missed`,
 *   `rejected` = refusé, `failed` = interrompu) + `ongoing` pour le message
 *   posé au démarrage et pas encore clos.
 * - `durationSec` : secondes, 0 pour un appel sans conversation.
 * - `initiatorId` : `User.id` de l'appelant ; le client le compare au sien
 *   pour la flèche entrant / sortant.
 * - `endedByInitiator` : `true` pour un appel manqué annulé par l'appelant
 *   lui-même (« Appel annulé » chez lui, « Appel manqué » chez l'appelé).
 */
export interface LastMessageCallSummary {
  readonly callId: string;
  readonly kind: CallSummaryMediaType;
  readonly outcome: CallSummaryOutcome | 'ongoing';
  readonly durationSec: number;
  readonly initiatorId: string;
  readonly endedByInitiator: boolean;
}

/**
 * Les clés d'événement système que le serveur sait nommer. Une clé inconnue
 * d'un client ancien se rend comme `system.generic`.
 *
 * - `system.member-joined` — params `{ name }` (le nom affiché de l'arrivant),
 *   pour une arrivée de SOI-MÊME (lien d'invitation, conversation globale)
 * - `system.member-added` — params `{ actor, target }` (noms affichés) : un
 *   membre en a ajouté un autre (#7593)
 * - `system.member-removed` — params `{ actor, target }` : un membre en a
 *   retiré un autre
 * - `system.member-left` — params `{ actor }` : départ volontaire
 * - `system.conversation-renamed` — params `{ actor }` : le titre a changé
 * - `system.conversation-image` — params `{ actor }` : l'image a changé
 * - `system.encryption-enabled` — params `{ mode }` (`e2ee` | `server` | `hybrid`)
 * - `system.generic` — un message système que le serveur ne sait pas typer ;
 *   aucun paramètre, le client rend un libellé neutre.
 */
export type SystemEventKey =
  | 'system.member-joined'
  | 'system.member-added'
  | 'system.member-removed'
  | 'system.member-left'
  | 'system.conversation-renamed'
  | 'system.conversation-image'
  | 'system.encryption-enabled'
  | 'system.generic';

export interface LastMessageSystemEvent {
  readonly key: SystemEventKey;
  readonly params: Readonly<Record<string, string | number>>;
}

/**
 * Pourquoi un contenu est retenu. L'ORDRE est celui du cumul d'effets validé
 * par le porteur (#7546) : la sécurité l'emporte — `expired` > `view-once` >
 * `blurred` > `encrypted` > `ephemeral`.
 *
 * `ephemeral` ne RETIENT rien : le texte d'un éphémère encore actif reste
 * servi (« 🔥 4 min · texte ») et son décompte part de la réception de chaque
 * lecteur (#7451). Les quatre autres retiennent texte, traductions et pièces
 * jointes.
 */
export type PreviewProtection = 'expired' | 'view-once' | 'blurred' | 'encrypted' | 'ephemeral';

/**
 * La DERNIÈRE réaction posée dans la conversation, résolue pour le lecteur.
 *
 * Espace d'ids : `reactorId` et `targetSenderId` sont des `Participant.id`
 * (la colonne `Reaction.participantId` et `Message.senderId`) ; les deux
 * `…UserId` voisins portent le `User.id` quand il existe (`null` pour un
 * anonyme) — c'est EUX qu'un client compare au sien pour « Vous avez réagi » et
 * « à votre message ».
 *
 * Rang de la ligne (règle CLIENT, identique REST et socket) :
 * max(`lastMessageAt`, `createdAt` quand `targetSenderUserId` est le lecteur).
 *
 * `excerpt` suit la MÊME protection que l'aperçu : pour un message réagi
 * protégé, `excerpt` est `null`, `excerptTranslations` est `null` et
 * `excerptProtection` dit pourquoi — le client dessine son placeholder. Hors
 * protection, l'extrait est plafonné (`truncateMessagePreview`) et sa carte du
 * Prisme l'accompagne sous le même plafond, à descendre par
 * `resolvePrismTranslation`.
 */
export interface ConversationLastReaction {
  readonly emoji: string;
  readonly reactorId: string;
  readonly reactorUserId: string | null;
  readonly reactorName: string;
  readonly messageId: string;
  readonly targetSenderId: string | null;
  readonly targetSenderUserId: string | null;
  readonly excerpt: string | null;
  readonly excerptOriginalLanguage: string | null;
  readonly excerptTranslations: Readonly<Record<string, string>> | null;
  readonly excerptProtection: PreviewProtection | null;
  /** Chaîne ISO. */
  readonly createdAt: string;
}

/**
 * L'appel EN COURS dans la conversation (`Conversation.activeCallId`), ou
 * `null`. `participantCount` compte les participants présents (sans
 * `leftAt`) ; `startedAt` est une chaîne ISO.
 */
export interface ConversationActiveCall {
  readonly id: string;
  readonly kind: CallSummaryMediaType;
  readonly participantCount: number;
  readonly startedAt: string;
}
