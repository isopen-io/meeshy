import {
  composeConversationPreview,
  renderConversationPreviewText,
  type ConversationPreview,
} from '@meeshy/shared/utils/conversation-preview';

import { accentOf } from '@/lib/accent';
import { listRankOf } from '@/lib/api/list-preview';
import { attachmentSrc } from '@/lib/api/media-url';
import type { Conversation } from '@/lib/api/types';
import { effectiveFlagsOf, effectiveUnreadOf, type ConversationOverride } from '@/lib/conversation-store';
import { avatarOf, initialsOf, peerOf, presenceOf, titleOf } from '@/lib/view/conversation';
import { previewInputOf } from '@/lib/view/conversation-preview-input';
import { countUnreadConversations } from '@/lib/view/use-app-badge';

/**
 * **CE QUE LES WIDGETS DE LA COQUE ANDROID AFFICHENT** (#10626) — l'instantané
 * que la page publie, miroir de `WidgetDataManager.swift`.
 *
 * Les widgets n'ont ni API, ni session, ni cache : ils lisent CE JSON et rien
 * d'autre (`MeeshyWidgetsPlugin.java`). Tout ce qui demande une loi de l'app
 * est donc tranché ICI, par les sites uniques de l'app — le nom (`titleOf`),
 * le non-lu EFFECTIF et le total du badge (`effectiveUnreadOf`,
 * `countUnreadConversations`, #6998), l'aperçu composé et servi par le Prisme
 * (`composeConversationPreview`), la présence SERVIE (`presenceOf`), l'accent
 * de la conversation (`accentOf`).
 *
 * Les favoris suivent iOS (`publishFavoriteContacts`) : les conversations
 * DIRECTES épinglées. Le web connaît aussi un « favori » par emoji (filtre de
 * la Lentille), mais c'est une classification de conversation, pas un carnet
 * de contacts rapides — les deux plateformes montrent ainsi les mêmes visages.
 */
export const WIDGET_CONVERSATIONS_MAX = 50;
export const WIDGET_FAVORITES_MAX = 8;

export type WidgetPresence = 'online' | 'away' | 'idle' | 'offline';

export type WidgetConversationRow = {
  readonly id: string;
  readonly name: string;
  readonly initials: string;
  readonly preview: string;
  /** Rang de la ligne, epoch ms — `null` pour une conversation sans message. */
  readonly at: number | null;
  readonly unread: number;
  readonly muted: boolean;
  readonly pinned: boolean;
  readonly group: boolean;
  readonly accent: string;
  /** Adresse ABSOLUE de la photo, que le natif télécharge et réduit. */
  readonly avatar: string | null;
};

export type WidgetFavorite = {
  readonly id: string;
  readonly name: string;
  readonly initials: string;
  readonly accent: string;
  readonly avatar: string | null;
  readonly presence: WidgetPresence;
};

export type WidgetSnapshot = {
  readonly v: 1;
  readonly unread: number;
  readonly conversations: readonly WidgetConversationRow[];
  readonly favorites: readonly WidgetFavorite[];
};

export type WidgetSnapshotInput = {
  readonly conversations: readonly Conversation[];
  readonly overrides: Readonly<Record<string, ConversationOverride>>;
  readonly viewerId: string;
  readonly languages: readonly string[];
  readonly interfaceLanguage: string;
  readonly now: number;
};

/**
 * L'écran d'accueil n'a aucune couche protégée et garde son texte jusqu'au
 * prochain rafraîchissement — même règle qu'iOS (`OutsidePreview`, #9622) :
 * un éphémère n'y laisse que son libellé, jamais son texte, et aucun compte à
 * rebours qui resterait figé sur « 4 min » une heure plus tard.
 */
function outsidePreview(preview: ConversationPreview, direct: boolean): ConversationPreview {
  const ephemeral = preview.icon === 'ephemeral' || preview.live !== undefined;
  const segments = preview.segments.filter(
    (segment) => segment.kind !== 'countdown' && !(ephemeral && segment.kind === 'text'),
  );
  /* Dans un direct, l'auteur est le nom de la ligne : iOS ne préfixe que les
     groupes (`formatLastMessage`). « Vous : » reste — il dit qui a écrit. */
  const author = direct && preview.author?.kind === 'member' ? null : preview.author;
  return { ...preview, author, segments };
}

function previewLineOf(conversation: Conversation, input: WidgetSnapshotInput): string {
  const composed = composeConversationPreview(
    previewInputOf(conversation, {
      viewerId: input.viewerId,
      language: input.interfaceLanguage,
      preferredLanguages: input.languages,
      now: input.now,
      typing: null,
      draft: null,
    }),
  );
  return renderConversationPreviewText(outsidePreview(composed, conversation.type === 'direct'), input.interfaceLanguage).trim();
}

const absoluteAvatar = (src: string | undefined): string | null => (src === undefined ? null : attachmentSrc(src));

const rankOf = (conversation: Conversation): number => {
  const rank = listRankOf(conversation);
  const ms = rank === undefined ? Number.NaN : new Date(rank).getTime();
  return Number.isNaN(ms) ? 0 : ms;
};

function rowOf(conversation: Conversation, input: WidgetSnapshotInput): WidgetConversationRow {
  const flags = effectiveFlagsOf(conversation, input.overrides);
  const name = titleOf(conversation, input.viewerId);
  const rank = rankOf(conversation);
  return {
    id: conversation.id,
    name,
    initials: initialsOf(name),
    preview: previewLineOf(conversation, input),
    at: rank === 0 ? null : rank,
    unread: effectiveUnreadOf(conversation, input.overrides),
    muted: flags.isMuted,
    pinned: flags.isPinned,
    group: conversation.type !== 'direct',
    accent: accentOf(conversation),
    avatar: absoluteAvatar(avatarOf(conversation, input.viewerId)),
  };
}

function favoriteOf(conversation: Conversation, input: WidgetSnapshotInput): WidgetFavorite {
  const name = titleOf(conversation, input.viewerId);
  return {
    id: conversation.id,
    name,
    initials: initialsOf(name),
    accent: accentOf(conversation),
    avatar: absoluteAvatar(avatarOf(conversation, input.viewerId)),
    presence: presenceOf(peerOf(conversation, input.viewerId), input.now),
  };
}

export function widgetSnapshotOf(input: WidgetSnapshotInput): WidgetSnapshot {
  const visible = input.conversations.filter((conversation) => !effectiveFlagsOf(conversation, input.overrides).isArchived);
  const ordered = visible
    .map((conversation) => ({ conversation, pinned: effectiveFlagsOf(conversation, input.overrides).isPinned, rank: rankOf(conversation) }))
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.rank - a.rank)
    .map((entry) => entry.conversation);

  return {
    v: 1,
    unread: countUnreadConversations(input.conversations, input.overrides) ?? 0,
    conversations: ordered.slice(0, WIDGET_CONVERSATIONS_MAX).map((conversation) => rowOf(conversation, input)),
    favorites: ordered
      .filter((conversation) => conversation.type === 'direct' && effectiveFlagsOf(conversation, input.overrides).isPinned)
      .slice(0, WIDGET_FAVORITES_MAX)
      .map((conversation) => favoriteOf(conversation, input)),
  };
}
