/**
 * Composition du rail « vivants » — maquette normative
 * `docs/design/2026-08-15-conversation-list-lentille.html` §3, table
 * « Structure de l'écran », ligne « Rail stories & vivants » :
 *
 *   « Pastilles 48 : d'abord les conversations où il se passe quelque chose
 *     MAINTENANT (Scène live, typing, salve ✦), puis les stories non vues
 *     (anneau brand) … ≤ 6 entrées, disparaît si vide, anneau accent pulsé
 *     si live »
 *
 * RE-PREUVE (2026-08-17, avant ce lot) : `LentilleConversationListMount.tsx`
 * n'alimentait le rail QUE depuis la section `live`. Or `liveCall` n'existe
 * sur aucune plateforme aujourd'hui (`use-lentille-sections.ts:10`,
 * behaviour-matrix:L13 « justifié-absent ») : la section `live` est
 * structurellement vide, donc `LivesRail` rendait TOUJOURS `null` en
 * production — un composant bâti, testé, et jamais montré. Les deux autres
 * familles de « ça vit maintenant » sont, elles, disponibles côté web depuis
 * V4 : le typing (`useLentilleListTyping`, WL-101) et la salve ✦ (un rang non
 * lu qui porte un pont, `useLentilleBridges`).
 *
 * Fonction PURE (aucun DOM, aucun hook) : le montage lui passe ce qu'il a
 * déjà en main, elle rend l'ordre. Le PLAFOND reste chez `LivesRail`
 * (`LENTILLE_LIST_RAIL_MAX_ENTRIES`, token `list.rail.maxEntries`) — un seul
 * endroit tranche « ≤ 6 », comme aujourd'hui.
 *
 * STORIES NON VUES : absentes de ce résolveur, et l'absence est nommée. Le
 * modèle `Conversation` du web ne porte aucun état d'anneau de story
 * (re-preuve : `packages/shared/types/conversation.ts`, aucun champ story) ;
 * iOS lit `StoryViewModel.storyRingState`, une source qui n'a pas d'équivalent
 * monté sur la liste web. Le rail rend donc sa PREMIÈRE moitié — celle qui
 * vit — et jamais une story fabriquée.
 */
import type { Conversation } from '@meeshy/shared/types';
import type { ConversationBridge } from '@meeshy/shared/types/conversation-bridge';

export type LentilleRailKind = 'live' | 'typing' | 'bridge';

export type LentilleRailEntry = {
  readonly id: string;
  readonly name: string;
  readonly avatarUrl?: string;
  readonly kind: LentilleRailKind;
  readonly isLive: boolean;
};

export interface ResolveLentilleRailEntriesInput {
  /** Conversations de la section `live` (Scène en cours) — vides tant que L13 n'a pas de source. */
  readonly liveConversations: readonly Conversation[];
  /** Toutes les conversations affichées, dans l'ordre de la liste. */
  readonly conversations: readonly Conversation[];
  /** Qui écrit, par conversation (`useLentilleListTyping`). */
  readonly typingByConversation: ReadonlyMap<string, readonly unknown[]>;
  /** Ponts résolus par conversation (`useLentilleBridges` / champ de fil). */
  readonly bridgeByConversation: (conversation: Conversation) => ConversationBridge | null | undefined;
}

const conversationName = (conversation: Conversation): string =>
  conversation.title?.trim() || '';

const conversationAvatar = (conversation: Conversation): string | undefined =>
  conversation.avatar || conversation.image || undefined;

/**
 * Ordre de la maquette : live, puis typing, puis salve ✦. Une conversation
 * n'apparaît qu'UNE fois — la famille la plus vivante gagne (une Scène en
 * cours où quelqu'un écrit est une Scène, pas un typing).
 */
export function resolveLentilleRailEntries({
  liveConversations,
  conversations,
  typingByConversation,
  bridgeByConversation,
}: ResolveLentilleRailEntriesInput): readonly LentilleRailEntry[] {
  const seen = new Set<string>();
  const entries: LentilleRailEntry[] = [];

  const push = (conversation: Conversation, kind: LentilleRailKind): void => {
    if (seen.has(conversation.id)) return;
    seen.add(conversation.id);
    entries.push({
      id: conversation.id,
      name: conversationName(conversation),
      avatarUrl: conversationAvatar(conversation),
      kind,
      isLive: kind === 'live',
    });
  };

  for (const conversation of liveConversations) push(conversation, 'live');

  for (const conversation of conversations) {
    const typers = typingByConversation.get(conversation.id);
    if (typers && typers.length > 0) push(conversation, 'typing');
  }

  for (const conversation of conversations) {
    if ((conversation.unreadCount ?? 0) <= 0) continue;
    if (!bridgeByConversation(conversation)) continue;
    push(conversation, 'bridge');
  }

  return entries;
}
