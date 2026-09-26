import { resolveParticipantAvatar } from '@meeshy/shared/utils/participant-helpers';
import { getUserPresenceStatus } from '@meeshy/shared/utils/user-presence';

import { customNameOf } from '@/lib/api/preferences';
import type { Conversation, Participant, UserPresenceStatus } from '@/lib/api/types';

/**
 * CE QUE LA VUE DÉRIVE DU DOMAINE — et rien d'autre.
 *
 * Le POC portait ces valeurs comme des CHAMPS : `isGrouped`, `unread`,
 * `initials`, `presence`, `participants`. Aucune n'existe dans le domaine ;
 * toutes se calculent. Les stocker obligeait la fixture à les tenir à jour à
 * la main, et — plus grave — laissait croire que la passerelle les servait.
 *
 * Le seul qui n'est PAS un calcul local est la présence : sa loi (fenêtres
 * 1 / 3 / 5 minutes, garde anti-stale) vit dans `@meeshy/shared`, avec ses
 * jumeaux iOS et Android. La réécrire ici en ferait une quatrième.
 */

/**
 * `direct` est le seul type à DEUX personnes. Un `public`, un `global` et un
 * `broadcast` sont des groupes du point de vue de la vue — ce qui gouverne
 * l'affichage est « montre-t-on un nom d'expéditeur et un compte de membres »,
 * pas la nature du salon.
 */
export const isGroup = (conversation: Conversation): boolean => conversation.type !== 'direct';

/** ABSENT ⇒ 0 : le serveur qui ne compte pas n'annonce pas « non lu ». */
export const unreadOf = (conversation: Conversation): number => conversation.unreadCount ?? 0;

/**
 * **UNE CONVERSATION DIRECTE PORTE LE NOM DE L'AUTRE, ET RIEN D'AUTRE** (#6790).
 *
 * `customName` (préférence PAR LECTEUR, `flagsOf`/`customNameOf` §3.1) PRIME
 * sur tout le reste — c'est le nom que CE lecteur a choisi de donner à la
 * conversation, avant même le titre serveur (loi iOS `ConversationListView…`,
 * même précédence : un renommage local ne doit jamais être éclipsé par le
 * titre de groupe ou le nom du pair).
 *
 * **Ensuite, la précédence DÉPEND DU TYPE**, et c'est le correctif de #6790.
 * Un GROUPE a un titre propre, qu'il faut servir ; un DIRECT n'en a pas — il
 * porte le nom de l'autre. Jusqu'ici la règle lisait `conversation.title`
 * d'abord dans les deux cas, ce que le doc-comment d'origine contredisait déjà
 * en toutes lettres (« elle porte le nom de l'autre »).
 *
 * Le défaut ne vient PAS de la v2, qui ne pose aucun titre à la création d'un
 * direct (`api/conversations.ts § createDirectConversation` : `{ type,
 * participantIds }`, sans titre). Il vient du LEGACY, qui composait un titre
 * CÔTÉ CLIENT et l'envoyait (`apps/web/components/conversations/
 * create-conversation-modal.tsx:102-130`) — d'où les « X & Y » gravés sur des
 * lignes créées avant la bascule. Les ignorer à l'affichage corrige le symptôme
 * sans toucher une seule donnée ; le nettoyage en base, s'il est décidé, reste
 * porté par #6790.
 *
 * `identifier` ferme la marche pour qu'une ligne ne soit jamais vide.
 */
export const titleOf = (conversation: Conversation, viewerId: string): string => {
  const peerName = peerOf(conversation, viewerId)?.displayName ?? undefined;
  const served =
    conversation.type === 'direct' ? (peerName ?? conversation.title) : (conversation.title ?? peerName);
  return customNameOf(conversation) ?? served ?? conversation.identifier ?? '';
};

/**
 * L'AUTRE, dans une conversation directe. `undefined` partout ailleurs — et
 * `participants` est tronqué à cinq par la passerelle, donc s'en servir pour
 * autre chose que ça serait faux.
 */
export const peerOf = (conversation: Conversation, viewerId: string): Participant | undefined =>
  conversation.type === 'direct'
    ? conversation.participants.find((p) => p.userId !== viewerId)
    : undefined;

/**
 * LA FORME MINIMALE D'UN PORTEUR DE PHOTO, DITE DANS LES TERMES DE CE CLIENT.
 *
 * `AvatarBearingParticipant` (shared) déclare `avatar?: string | null` — juste
 * là où elle est écrite, refusée ici : web-v2 compile en
 * `exactOptionalPropertyTypes`, et ses propres types (dérivés de Zod) portent
 * `string | undefined`. Les deux formes décrivent le MÊME champ ; seule la
 * variance des optionnels diffère. Ce type l'admet explicitement plutôt que de
 * la masquer par une assertion.
 */
type AvatarBearer = {
  readonly avatar?: string | null | undefined;
  readonly user?: { readonly avatar?: string | null | undefined } | null | undefined;
};

/**
 * **LA PHOTO, PAR LA LOI PARTAGÉE — SITE UNIQUE DU CLIENT** (#6975).
 *
 * `resolveParticipantAvatar` (`packages/shared/utils/participant-helpers.ts`)
 * est la loi du dépôt : avatar **LOCAL** du participant (surcharge par
 * conversation), puis avatar du **COMPTE** lié, puis rien — une chaîne blanche
 * comptant pour absente, sans quoi un `avatar: ''` fuirait en `<img src="">`
 * (soit un rechargement de la page courante).
 *
 * **Elle n'était appliquée par AUCUN client web avant ce lot.** La passerelle
 * sérialise ses participants par `{...m}`
 * (`services/gateway/src/routes/conversations/core-list.ts:699`) SANS la
 * descendre : les deux champs arrivent, et c'est au client de choisir. Un
 * client qui lirait `participant.avatar` seul raterait donc la photo de compte
 * de tout participant sans surcharge locale — le cas NOMINAL, puisque
 * personne ne pose d'avatar par conversation.
 *
 * **POURQUOI UN SEUL SITE, ET PAS UNE LIGNE PAR SURFACE.** Dix-sept surfaces
 * de cette application montaient `Avatar` sans `src`. Les recâbler chacune
 * avec sa propre `participant.avatar ?? participant.user?.avatar` est
 * exactement le motif qui a produit TROIS familles divergentes de résolution
 * du Prisme en trois cycles (`CLAUDE.md` § Prisme Linguistique) : la
 * quatrième surface écrite oublie le second rang, et rien ne rougit — une
 * photo absente ressemble à un compte sans photo.
 */
export const participantAvatarOf = (bearer?: AvatarBearer | null): string | undefined =>
  /* LES DEUX RANGS SONT REMIS À LA LOI, PAS ÉVALUÉS ICI — l'ORDRE et la règle
     « une chaîne blanche n'est pas une URL » restent le seul fait de
     `resolveParticipantAvatar`. Ce qui se fait ici est une NORMALISATION de
     variance (`undefined` → `null`), jamais une seconde descente. */
  resolveParticipantAvatar({ avatar: bearer?.avatar ?? null, user: { avatar: bearer?.user?.avatar ?? null } }) ??
  undefined;

/**
 * LA PHOTO D'UNE LIGNE DE CONVERSATION — le pair d'abord, la conversation
 * ensuite.
 *
 * Miroir exact de `titleOf` juste au-dessus, et pour la même raison : **un
 * DIRECT porte le visage de l'autre**, un GROUPE porte le sien. `peerOf` rend
 * `undefined` hors d'un direct, donc la descente retombe naturellement sur
 * `conversation.avatar` sans qu'aucun test de type n'ait à être écrit ici.
 *
 * Le repli passe par la MÊME loi que le pair (`participantAvatarOf({ avatar:
 * … })`) plutôt que par un `??` : c'est ce qui fait qu'un `avatar: ''` posé
 * sur une conversation compte pour absent là aussi, sans normalisation
 * recopiée.
 */
export const avatarOf = (conversation: Conversation, viewerId: string): string | undefined =>
  participantAvatarOf(peerOf(conversation, viewerId)) ?? participantAvatarOf({ avatar: conversation.avatar });

/**
 * Deux lettres, jamais plus : « Amina Diallo » → « AD », « Équipe » → « ÉQ ».
 * Un seul mot rend ses deux premières lettres plutôt qu'une seule, parce
 * qu'une initiale seule dans un cercle de 44 px lit comme une erreur.
 *
 * DES LETTRES, RIEN D'AUTRE (#8131, #8143) — un nom de carnet porte souvent
 * parenthèses, guillemets, emojis ou chiffres : « Théo (foot) » donnait
 * « T( ». Un mot est donc une suite de LETTRES Unicode (latin accentué, arabe,
 * CJK…), la ponctuation et les symboles le séparent sans y entrer. Sans aucune
 * lettre, « ? » — jamais un signe dans le cercle.
 */
const LETTER_WORD = /\p{L}+/gu;

export const letterWordsOf = (name: string): readonly string[] => name.normalize('NFC').match(LETTER_WORD) ?? [];

export const initialsOf = (name: string): string => {
  const words = letterWordsOf(name);
  const [first, second] = words;
  if (first === undefined) return '?';
  if (second === undefined) return [...first].slice(0, 2).join('').toUpperCase();
  return `${[...first][0] ?? ''}${[...second][0] ?? ''}`.toUpperCase();
};

/**
 * La présence SERVIE. Une entrée absente rend `offline`, donc AUCUNE pastille
 * — c'est la règle produit du dépôt (« offline = pas de pastille »), et c'est
 * aussi ce qu'impose la visibilité de la présence : hors amitié acceptée, le
 * serveur ne sert ni `isOnline` ni `lastActiveAt`, et un client ne fabrique
 * jamais ce que le serveur retire.
 *
 * `now` est INJECTABLE (repli `Date.now()`) : la loi 1/3/5 de
 * `getUserPresenceStatus` prend son horloge en paramètre, jamais en lecture
 * interne — sans l'injection ici, aucun témoin ne peut fixer les fenêtres
 * `away`/`idle` sans dépendre de l'horloge RÉELLE au moment du test.
 */
export const presenceOf = (
  participant: Participant | undefined,
  now: number = Date.now(),
): UserPresenceStatus =>
  getUserPresenceStatus(
    participant === undefined
      ? null
      : {
          isOnline: participant.isOnline,
          ...(participant.lastActiveAt === undefined ? {} : { lastActiveAt: participant.lastActiveAt }),
        },
    now,
  );

/**
 * LA FORME DE L'APERÇU DE LISTE — miroir de `LastMessageSummaryKind.swift:6-37`
 * (D-23, #5676) : un aperçu PROTÉGÉ ne descend PAS le Prisme, jamais
 * `lastMessage.content` ni `lastMessageTranslations` — `previewKindOf` est le
 * SEUL point de décision, appelé AVANT `served()` (`lens-row.tsx`).
 *
 * ORDRE, exactement celui d'iOS : `expired` (échu) → `hidden` (flouté) →
 * `view-once` → `ephemeral` (en cours) → `standard`. Un `lastMessage` absent
 * (conversation sans historique) rend `standard` — rien à protéger.
 */
export type PreviewKind = 'standard' | 'hidden' | 'view-once' | 'expired' | 'ephemeral';

export function previewKindOf(conversation: Conversation, now: number = Date.now()): PreviewKind {
  const last = conversation.lastMessage;
  // #5650, revue-correction : la passerelle sert `null` (pas seulement
  // `undefined`) pour une conversation sans premier message — mesuré en
  // direct sur `gate.staging.meeshy.me`. `Conversation.lastMessage` est
  // typé `Message | undefined` ; `null` n'y était pas gardé et faisait
  // lever `last.expiresAt` juste en dessous.
  if (last === undefined || last === null) return 'standard';
  if (last.expiresAt !== undefined && new Date(last.expiresAt).getTime() <= now) return 'expired';
  if (last.isBlurred) return 'hidden';
  if (last.isViewOnce) return 'view-once';
  if (last.expiresAt !== undefined && new Date(last.expiresAt).getTime() > now) return 'ephemeral';
  return 'standard';
}
