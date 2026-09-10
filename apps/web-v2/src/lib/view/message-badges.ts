import { parseJoinNotice } from '@meeshy/shared/utils/join-notice';

import type { Message } from '@/lib/api/types';
import { metadataOf } from './message-metadata';

/**
 * LES ÉTATS DE TÊTE D'UN MESSAGE — épinglé, transféré, système (#5936).
 *
 * Miroir de `BubbleContentBuilder.Kind` (dispatch système),
 * `ForwardBadgePolicy.swift` (attribution d'un transfert) et
 * `FocalRow.badgesSection` / `BubbleStandardLayout` (ordre : épinglé,
 * transféré, éphémère — « modifié » est une méta, pas un badge de tête, il
 * reste hors de cette loi). Loi PURE, consommée par les DEUX peaux
 * (`focal-row.tsx`, `bubble.tsx`) — un seul site, jamais deux.
 */

/**
 * Trois issues, jamais un `String?` — miroir `ForwardBadgePolicy.swift:18-25`
 * (« l'ancienne signature optionnelle laissait l'appelant confondre "pas de
 * groupe à nommer" et "interdit de nommer", et retomber sur le nom de la
 * PERSONNE »).
 */
export type ForwardAttribution =
  | { readonly kind: 'group'; readonly name: string }
  | { readonly kind: 'person'; readonly name: string }
  | { readonly kind: 'anonymous' };

export type MessageBadge =
  | { readonly kind: 'pinned' }
  | { readonly kind: 'forwarded'; readonly attribution: ForwardAttribution }
  | { readonly kind: 'ephemeral'; readonly expiresAt: Date }
  | { readonly kind: 'edited' };

/**
 * Un message système, au sens `event-names.ts:109-116` : « il arrive sous
 * `message:new` comme tous les autres (`messageType: 'system'`) ». Un OU,
 * jamais l'un des deux seul — la notice de chiffrement (`conversation-
 * encryption.ts:252-259`) ne porte QUE `messageType:'system'`, sans
 * `messageSource` (qui reste `'user'` par défaut).
 *
 * Site UNIQUE — remplace les trois lectures locales de `messageSource ===
 * 'system'` (`river/geometry.ts`, `summary/assembly.ts`), qui manquaient la
 * notice de chiffrement.
 */
export function isSystemMessage(message: Pick<Message, 'messageType' | 'messageSource'>): boolean {
  return message.messageType === 'system' || message.messageSource === 'system';
}

/**
 * Ce qu'une rangée système RENDRAIT — sans dire COMMENT (chaque peau dessine
 * sa propre géographie, `SystemNotice`). `deleted`/`burned` restent au
 * domicile de `protectionOf` (D-23) : cette loi ne les redit pas.
 */
export type SystemRow =
  | { readonly kind: 'call'; readonly text: string; readonly callType: 'audio' | 'video' }
  | { readonly kind: 'join'; readonly displayName: string; readonly handle: string | null; readonly isAnonymous: boolean }
  | { readonly kind: 'notice'; readonly text: string };

/**
 * `metadata.kind === 'call' | 'call-live'` (`call-summary.ts:46`) porte le
 * résumé d'appel ; l'avis d'arrivée est lu par `parseJoinNotice` (VALIDE,
 * jamais casté — `@meeshy/shared`) ; sinon un texte plat, ou rien
 * (`content` vide ET aucune métadonnée reconnue — iOS `EmptyView`,
 * `FocalSystemRows.swift:151`).
 */
export function systemRowOf(message: Pick<Message, 'messageType' | 'messageSource' | 'content' | 'metadata'>): SystemRow | null {
  if (!isSystemMessage(message)) return null;

  const metadata = metadataOf(message);
  const kind = metadata !== null ? metadata.kind : undefined;
  if (kind === 'call' || kind === 'call-live') {
    const callType = metadata?.callType === 'video' ? 'video' : 'audio';
    return { kind: 'call', text: message.content, callType };
  }

  const joinNotice = parseJoinNotice(metadata);
  if (joinNotice !== null) {
    /* `JoinNoticePresentation.init` (`BubbleSystemViews.swift:159-173`) : le
       nom DONNÉ au formulaire prime, le pseudo `ano_…` descend en handle —
       omis s'il répète le nom retenu. */
    const givenName = joinNotice.givenName !== undefined && joinNotice.givenName.trim() !== '' ? joinNotice.givenName : undefined;
    const primaryName = givenName ?? joinNotice.displayName;
    const username = joinNotice.username !== undefined && joinNotice.username.trim() !== '' ? joinNotice.username : undefined;
    const handle = username !== undefined && username !== primaryName ? `@${username}` : null;
    return { kind: 'join', displayName: primaryName, handle, isAnonymous: joinNotice.isAnonymous };
  }

  if (message.content !== '') return { kind: 'notice', text: message.content };
  return null;
}

/** Le TEXTE PLAT d'une rangée système — le seul texte qu'un lecteur d'écran
 * doit prononcer (`composeMessageLabel`) et le seul que `SystemNotice`
 * affiche pour `call`/`notice`. L'avis d'arrivée compose le sien
 * (`bubble.joinNotice.joined`, `BubbleSystemViews.swift:313-319`). */
export function systemRowText(row: SystemRow): string {
  switch (row.kind) {
    case 'call':
    case 'notice':
      return row.text;
    case 'join':
      return `${row.displayName} a rejoint la conversation`;
  }
}

/**
 * Liste BLANCHE, jamais noire (`ForwardBadgePolicy.swift:31-44`) : un type de
 * conversation neuf ou absent échoue FERMÉ — une règle de confidentialité ne
 * peut pas autoriser une divulgation qu'elle ne sait pas classer.
 */
const PUBLICLY_REACHABLE_TYPES: ReadonlySet<string> = new Set(['public', 'global', 'broadcast', 'channel', 'community']);

function trimmedName(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * `ForwardBadgePolicy.attribution(for:)` (`:55-65`) — `.person` reste
 * INATTEIGNABLE ici : `forwardedFrom.sender` n'est pas déclaré sur `Message`
 * de `@meeshy/shared` (§ 3.6 de la spécification #5936), donc un tête-à-tête
 * retombe sur `anonymous`, jamais un nom deviné. La branche `.person` existe
 * dans `forwardLabelOf` pour le jour où l'API la sert.
 *
 * `null` ⇒ ce message n'est pas un transfert (ni `forwardedFromId` ni
 * `forwardedFromConversationId`).
 */
export function forwardAttributionOf(
  message: Pick<Message, 'forwardedFromId' | 'forwardedFromConversationId' | 'forwardedFromConversation'>,
): ForwardAttribution | null {
  if (message.forwardedFromId === undefined && message.forwardedFromConversationId === undefined) return null;

  const conversation = message.forwardedFromConversation;
  const type = conversation?.type ?? null;
  if (type === null || !PUBLICLY_REACHABLE_TYPES.has(type)) return { kind: 'anonymous' };

  const name = trimmedName(conversation?.title ?? null) ?? trimmedName(conversation?.identifier ?? null);
  return name === null ? { kind: 'anonymous' } : { kind: 'group', name };
}

/** `BubbleMetaBadges.swift:126-135` — libellés français (la prose du dépôt reste en français, D-13). */
export function forwardLabelOf(attribution: ForwardAttribution): string {
  switch (attribution.kind) {
    case 'group':
      return `Transféré depuis ${attribution.name}`;
    case 'person':
      return `Transféré de ${attribution.name}`;
    case 'anonymous':
      return 'Transféré';
  }
}

type BadgeFields = Pick<
  Message,
  'pinnedAt' | 'forwardedFromId' | 'forwardedFromConversationId' | 'forwardedFromConversation' | 'expiresAt' | 'isEdited'
>;

/**
 * `badgesSection` (`FocalRow.swift:376-407`) : épinglé, puis transféré, puis
 * éphémère — DANS CET ORDRE. « modifié » ferme la liste : ce n'est pas un
 * badge de tête côté iOS (il vit dans la colonne méta / inline dans la
 * bulle), mais cette loi PURE le porte en dernier pour qu'un seul site
 * décide de l'ordre complet d'un message — chaque peau choisit ensuite où
 * elle rend chaque élément.
 */
export function badgesOf(message: BadgeFields, now: number): readonly MessageBadge[] {
  const badges: MessageBadge[] = [];

  if (message.pinnedAt !== undefined) badges.push({ kind: 'pinned' });

  const attribution = forwardAttributionOf(message);
  if (attribution !== null) badges.push({ kind: 'forwarded', attribution });

  if (message.expiresAt !== undefined && new Date(message.expiresAt).getTime() > now) {
    badges.push({ kind: 'ephemeral', expiresAt: new Date(message.expiresAt) });
  }

  if (message.isEdited) badges.push({ kind: 'edited' });

  return badges;
}

/**
 * L'ENTRÉE « ÉPHÉMÈRE » DE LA LOI, PAS UNE SECONDE LECTURE DE
 * `message.expiresAt` (revue #5936, défaut majeur 1) — `EphemeralBadge`
 * (`protected-content.tsx`) tient SON PROPRE minuteur (`ephemeralOf`, qui
 * distingue `running`/`expired`), mais la PRÉSENCE du badge et la `Date`
 * qu'il porte viennent d'ICI : les deux peaux ne relisent plus
 * `message.expiresAt` pour DÉCIDER de monter le badge, seulement pour
 * calculer son COMPTE À REBOURS — le même écart que `editedOf` ci-dessous.
 */
export function ephemeralBadgeOf(badges: readonly MessageBadge[]): Extract<MessageBadge, { kind: 'ephemeral' }> | undefined {
  return badges.find((badge): badge is Extract<MessageBadge, { kind: 'ephemeral' }> => badge.kind === 'ephemeral');
}

/**
 * « MODIFIÉ » EST-IL DANS LA SORTIE DE LA LOI ? (revue #5936, défaut majeur
 * 1) — les deux peaux monta(i)ent `EditedMark` en relisant `message.isEdited`
 * en direct, ce qui rendait l'entrée `edited` de `badgesOf` orpheline :
 * aucun pixel ne dépendait plus de ce qu'elle calcule. Site UNIQUE désormais.
 */
export function editedOf(badges: readonly MessageBadge[]): boolean {
  return badges.some((badge) => badge.kind === 'edited');
}
