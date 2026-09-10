import type { Message } from '@/lib/api/types';

/**
 * LES BADGES D'UN MESSAGE — épinglé, transféré, modifié, éphémère — et LA
 * RECONNAISSANCE DE SON CORPS — système, emoji seul, texte. Miroir de
 * `FocalRow.badgesSection` (`apps/ios/Meeshy/Features/Main/Focal/Row/FocalRow.swift:392-410`,
 * pinned → forwarded → ephemeral, AU-DESSUS de l'identité) et de
 * `ForwardBadgePolicy` (`apps/ios/Meeshy/Features/Main/Views/Bubble/ForwardBadgePolicy.swift`).
 *
 * `badgesOf` est le SITE UNIQUE de ces quatre badges — appelé par les DEUX
 * peaux (`focal-row.tsx`, `bubble.tsx`) et par `message-a11y-label.ts`, jamais
 * recalculé chez l'un ou l'autre. `composeMessageLabel` (D-31) poussait déjà
 * « modifié »/« épinglé »/« éphémère » dans le libellé mais n'avait AUCUN
 * segment « transféré » — miroir cassé : un lecteur d'écran ne savait jamais
 * qu'un message avait été transféré.
 *
 * ÉCART ASSUMÉ AVEC `ForwardBadgePolicy.swift` — web-v3 ne nomme QUE le
 * groupe source (`forwardedFromConversation.title`), jamais la personne : le
 * type de conversation source (`forwardedFromConversation.type`) n'est pas
 * toujours servi par la passerelle sur cette projection (`threads.ts`), et
 * la règle porteur (2026-08-23, `ForwardBadgePolicy.swift:27-29`) exige
 * précisément de ne JAMAIS nommer une personne — le repli « Transféré » seul
 * est donc TOUJOURS le bon choix quand le titre du groupe manque, jamais un
 * repli sur `forwardedFromConversation.identifier` (que
 * `apps/web/lib/forward-badge.ts` fait à tort, D-33).
 */

export type MessageBadge =
  | { readonly kind: 'pinned' }
  | { readonly kind: 'forwarded'; readonly label: string }
  | { readonly kind: 'edited' }
  | { readonly kind: 'ephemeral' };

type BadgeableMessage = Pick<
  Message,
  'pinnedAt' | 'forwardedFromId' | 'forwardedFromConversationId' | 'forwardedFromConversation' | 'isEdited' | 'expiresAt'
>;

/**
 * Un message est transféré dès que L'UN OU L'AUTRE identifiant de source est
 * posé — `forwardedFromConversation` (l'objet enrichi) peut manquer sur une
 * charge construite par socket (revue #5566) sans que le transfert cesse
 * d'avoir eu lieu.
 */
function isForwarded(message: Pick<Message, 'forwardedFromId' | 'forwardedFromConversationId'>): boolean {
  return message.forwardedFromId !== undefined || message.forwardedFromConversationId !== undefined;
}

/**
 * « Transféré depuis {titre} », JAMAIS un nom de personne — critère de fin
 * #7 : `forwardedFromConversation.title` absent ⇒ « Transféré » seul, jamais
 * un repli sur `identifier` (qui n'est pas un nom LISIBLE) ni sur l'auteur.
 */
function forwardedLabel(message: Pick<Message, 'forwardedFromConversation'>): string {
  const title = message.forwardedFromConversation?.title?.trim();
  return title !== undefined && title !== '' ? `Transféré depuis ${title}` : 'Transféré';
}

/**
 * Ordre iOS : épinglé → transféré → modifié → éphémère. Un état absent
 * n'émet RIEN — jamais un badge vide ni un `undefined` dans la liste.
 */
export function badgesOf(message: BadgeableMessage): readonly MessageBadge[] {
  const badges: MessageBadge[] = [];
  if (message.pinnedAt !== undefined) badges.push({ kind: 'pinned' });
  if (isForwarded(message)) badges.push({ kind: 'forwarded', label: forwardedLabel(message) });
  if (message.isEdited) badges.push({ kind: 'edited' });
  if (message.expiresAt !== undefined) badges.push({ kind: 'ephemeral' });
  return badges;
}

/**
 * UNE RANGÉE SYSTÈME — miroir de `FocalSystemRows.swift` /
 * `BubbleSystemViews.swift` : un message `messageSource: 'system'` (arrivée,
 * résumé d'appel, …) ne porte NI avatar NI méta d'auteur, sur les deux peaux.
 *
 * `deleted`/`burned`/`expired`/`veiled` restent gouvernés par `protectionOf`
 * (D-23) — un message système PROTÉGÉ reste un tombstone, jamais cette
 * rangée : `systemRowOf` n'est consulté qu'au cas `standard` (§ D-23 « un
 * message système protégé rendrait un tombstone, ce qui est fail-closed et
 * n'a donc pas besoin d'être exclu ici »).
 *
 * Le TEXTE de la rangée (résumé d'appel compris — un résumé d'appel EST un
 * `messageSource: 'system'`) vient du contenu SERVI par le Prisme, comme
 * toute autre rangée — jamais recomposé ici : la mise en forme riche d'un
 * résumé d'appel (icône, sens, qualité réseau — `BubbleCallNoticeView.swift`)
 * reste HORS périmètre de ce lot (issue compagnon à ouvrir).
 */
export function systemRowOf(message: Pick<Message, 'messageSource'>): 'notice' | null {
  return message.messageSource === 'system' ? 'notice' : null;
}

/**
 * LE CORPS D'UN MESSAGE — texte ordinaire, ou EMOJI SEUL agrandi (miroir du
 * traitement « grand emoji, sans encart » que la plupart des messageries
 * appliquent à un contenu composé uniquement d'emoji). Sticker et lieu
 * restent HORS périmètre de ce lot : `Message`/`MessageWithTranslations`
 * (`packages/shared/types/conversation.ts`) ne déclarent PAS les champs
 * hissés par la passerelle (`hoistStickerOnto`/`hoistLocationOnto`,
 * `services/gateway/src/routes/conversations/threads.ts:153`) — une capacité
 * gateway non exposée au TYPE ne s'invente pas côté client (issues
 * compagnons à ouvrir : sticker, lieu, citation de story).
 */
export type BodyKind = 'emoji-only' | 'text';

/**
 * Un cluster emoji : le pictogramme lui-même, son sélecteur de variation
 * (U+FE0F) optionnel, une chaîne ZWJ (U+200D — familles, couples, drapeaux
 * professionnels), OU un modificateur de carnation seul, OU une paire
 * d'indicateurs régionaux (drapeau de pays). Le corps ENTIER (espaces
 * retirés) doit se composer exclusivement de tels clusters, un ou plusieurs
 * — un seul caractère latin mêlé au milieu retombe en texte ordinaire.
 *
 * Construit via `String.fromCodePoint` plutôt qu'un littéral portant les
 * caractères invisibles eux-mêmes — un ZWJ ou un sélecteur de variation
 * copié tel quel dans une source est indiscernable à la lecture d'un espace
 * ou d'un octet manquant.
 */
const VARIATION_SELECTOR_16 = String.fromCodePoint(0xfe0f);
const ZERO_WIDTH_JOINER = String.fromCodePoint(0x200d);
const EMOJI_CLUSTER_SOURCE =
  `(?:\\p{Extended_Pictographic}${VARIATION_SELECTOR_16}?(?:${ZERO_WIDTH_JOINER}\\p{Extended_Pictographic}${VARIATION_SELECTOR_16}?)*` +
  `|\\p{Emoji_Modifier}|\\p{Regional_Indicator}{2})`;
const EMOJI_CLUSTER_PATTERN = new RegExp(`^(?:${EMOJI_CLUSTER_SOURCE})+$`, 'u');

export function isEmojiOnly(content: string): boolean {
  const stripped = content.replace(/\s+/g, '');
  if (stripped === '') return false;
  return EMOJI_CLUSTER_PATTERN.test(stripped);
}

export function bodyKindOf(content: string): BodyKind {
  return isEmojiOnly(content) ? 'emoji-only' : 'text';
}
