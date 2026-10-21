import { useMemo, useState } from 'react';
import type { QueryClient } from '@tanstack/react-query';

import type { ConversationReadingMode } from '@meeshy/shared/types/reading-modes';
import { conversationPreviewString } from '@meeshy/shared/utils/conversation-preview-strings';
import { conversationIsEndToEnd } from '@meeshy/shared/utils/message-action-policy';
import { sharedTranslationServerReadsMessage } from '@meeshy/shared/utils/shared-translation-eligibility';

import { accentOf, withAccent } from '@/lib/accent';
import { messagesQueryKey } from '@/lib/api/messages';
import { flattenMessagePages, type MessagesInfiniteData } from '@/lib/api/messages-pages';
import { appQueryClient } from '@/lib/api/query-client';
import type { Conversation, Message } from '@/lib/api/types';
import { place, type PlacedMessage } from '@/lib/grouping';
import { translate } from '@/lib/i18n-catalog';
import { rowMenuText } from '@/lib/i18n-row-menu-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { resolveThreadMode, toStickyPreference, type FlatRowMode } from '@/lib/reading-mode/decision';
import { readingModeScopeOf } from '@/lib/reading-mode/scope';
import { readingModeStore, type ReadingModeStore } from '@/lib/reading-mode/store';
import { servedRingOf, useRingDesign } from '@/lib/profile-decor/author-ring';
import { avatarOf, initialsOf, isGroup, peerOf, titleOf, unreadOf } from '@/lib/view/conversation';
import { resolveEphemeralDeadline } from '@/lib/view/ephemeral-reception';
import { isMineOf } from '@/lib/view/message';
import { usePresence } from '@/lib/view/use-presence';

import { Avatar } from './avatar';
import { Bubble } from './bubble';
import { FocalRow } from './focal-row';
import { Glyph } from './glyph';

import '@/styles/conversation-peek.css';

/**
 * L'APERÇU D'UNE CONVERSATION TENUE (#11211) — ce que le fil montrerait en
 * l'ouvrant, sans l'ouvrir : les cinq derniers messages au plus, dans le MODE
 * DE LECTURE que le fil élirait (décision #11204), à l'accent de la
 * conversation. Rien n'est demandé au réseau : le cache des messages est LU
 * (`getQueryData`), jamais observé — une conversation jamais ouverte montre son
 * squelette, et c'est le seul cas où il paraît.
 *
 * Les rangées sont celles du fil (`FocalRow`, `Bubble`) : le Prisme, la
 * protection et la mise en forme sont les leurs. Elles sont INERTES ici — la
 * carte entière est un geste, ouvrir la conversation.
 */

/** Ce que l'aperçu dessine : ce que le fil dessinerait, le Résumé retombant sur Focal. */
export type PeekReadingMode = FlatRowMode | 'bubbles';

export const PEEK_MESSAGE_COUNT = 5;

/**
 * LA MÊME DÉCISION QUE LE FIL — `resolveThreadMode`, avec ce que
 * `useThreadReadingMode` lui remet (préférence collante, dernière ouverture,
 * non-lus, effectif), à ceci près que l'aperçu ne NOTE pas d'ouverture : tenir
 * une ligne n'est pas lire. Aucun mode n'est redécidé ici : la Rivière, que le
 * fil ne dessine pas encore, y est ramenée par `resolveThreadMode` lui-même, et
 * l'aperçu montre ce que l'ouverture montrera (revue #11211).
 */
export function peekReadingMode(input: {
  readonly conversation: Conversation;
  readonly sticky: ConversationReadingMode | null;
  readonly lastOpenedAt: Date | null;
  readonly now: number;
  readonly isAnonymous: boolean;
  readonly readingModesEnabled?: boolean;
}): PeekReadingMode {
  const decision = resolveThreadMode({
    unreadCount: unreadOf(input.conversation),
    lastOpenedAt: input.lastOpenedAt,
    now: input.now,
    sticky: toStickyPreference(input.sticky),
    isAnonymous: input.isAnonymous,
    conversationType: input.conversation.type,
    memberCount: input.conversation.memberCount ?? null,
    ...(input.readingModesEnabled === undefined ? {} : { readingModesEnabled: input.readingModesEnabled }),
  });
  return decision.mode === 'summary' ? 'focal' : decision.mode;
}

/** Un message que le serveur ne lit pas (`sharedTranslationServerReadsMessage`) n'a pas de clair à montrer. */
const isSealed = (message: Message): boolean =>
  message.isEncrypted === true &&
  !sharedTranslationServerReadsMessage({ conversationEncryptionMode: null, messageIsEncrypted: true, messageEncryptionMode: message.encryptionMode ?? null });

function cachedMessages(client: QueryClient, conversationId: string): readonly Message[] | null {
  const data = client.getQueryData<MessagesInfiniteData>(messagesQueryKey(conversationId));
  return data === undefined ? null : flattenMessagePages(data).slice(-PEEK_MESSAGE_COUNT);
}

const NOOP = (): void => undefined;

export type ConversationPeekCardProps = {
  readonly conversation: Conversation;
  readonly viewerId: string;
  readonly languages: readonly string[];
  readonly isAnonymous: boolean;
  readonly interfaceLanguage: InterfaceLanguage;
  /** La hauteur que la grappe laisse à la carte (`placeMessageMenuCluster`), 120 à 300. */
  readonly maxHeight: number;
  readonly onOpen: () => void;
  /**
   * LES ATTACHES DU LECTEUR D'ÉCRAN (revue #11211) — la grappe qui porte la
   * carte se nomme par elle (`${idBase}-card`) et son menu se décrit par les
   * derniers messages (`${idBase}-body`) : le corps est inerte, mais un nœud
   * DÉSIGNÉ par `aria-describedby` se lit quand même.
   */
  readonly idBase?: string;
  readonly client?: QueryClient;
  readonly store?: ReadingModeStore;
  readonly readingModesEnabled?: boolean;
  readonly now?: () => number;
};

export function ConversationPeekCard({
  conversation,
  viewerId,
  languages,
  isAnonymous,
  interfaceLanguage,
  maxHeight,
  onOpen,
  idBase,
  client = appQueryClient,
  store = readingModeStore,
  readingModesEnabled,
  now = Date.now,
}: ConversationPeekCardProps) {
  const group = isGroup(conversation);
  const title = titleOf(conversation, viewerId);
  const photo = avatarOf(conversation, viewerId);
  const accent = accentOf(conversation);
  const peer = group ? undefined : peerOf(conversation, viewerId);
  const presence = usePresence(peer, { now });
  const peerRing = useRingDesign(servedRingOf(peer));
  const [openedAt] = useState(now);
  const messages = useMemo(() => cachedMessages(client, conversation.id), [client, conversation.id]);
  const mode = useMemo(() => {
    const scope = readingModeScopeOf({ id: viewerId === '' ? null : viewerId });
    return peekReadingMode({
      conversation,
      sticky: store.getPreference(scope, conversation.id),
      lastOpenedAt: store.lastOpenedAt(scope, conversation.id),
      now: openedAt,
      isAnonymous,
      ...(readingModesEnabled === undefined ? {} : { readingModesEnabled }),
    });
  }, [conversation, viewerId, store, openedAt, isAnonymous, readingModesEnabled]);
  const placed = useMemo(() => (messages === null ? null : place(messages, { locale: interfaceLanguage })), [messages, interfaceLanguage]);
  const label = rowMenuText(interfaceLanguage, 'rowMenu.peek');
  const e2ee = conversationIsEndToEnd({ type: conversation.type, encryptionMode: conversation.encryptionMode ?? null });
  const memberCount = conversation.memberCount ?? 0;

  return (
    <div
      role="group"
      aria-label={`${title}, ${label}`}
      {...(idBase === undefined ? {} : { id: `${idBase}-card` })}
      data-peek-card
      data-peek-mode={mode}
      className="conversation-peek-card"
      style={withAccent(accent, { maxHeight })}
    >
      <div data-peek-header className="conversation-peek-header">
        <Avatar
          initials={initialsOf(title)}
          color={accent}
          size={36}
          {...(photo === undefined ? {} : { src: photo })}
          {...(group ? {} : { presence })}
          {...(peerRing === null ? {} : { ring: peerRing })}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-bubble font-extrabold" style={{ color: 'var(--color-ios-ink)' }}>
            {title}
          </span>
          {group || e2ee ? (
            <span className="flex min-w-0 items-center gap-1.5 text-check" style={{ color: 'var(--color-ios-ink-3)' }}>
              {group ? <span>{translate(interfaceLanguage, memberCount === 1 ? 'community.members.one' : 'community.members.other', { count: String(memberCount) })}</span> : null}
              {e2ee ? (
                <span data-peek-e2ee className="inline-flex items-center gap-1" style={{ color: 'var(--accent)' }}>
                  <Glyph name="lock" size={11} />
                  {rowMenuText(interfaceLanguage, 'rowMenu.peek.e2ee')}
                </span>
              ) : null}
            </span>
          ) : null}
        </div>
      </div>
      <div className="conversation-peek-body" inert {...(idBase === undefined ? {} : { id: `${idBase}-body` })}>
        {placed === null ? <PeekSkeleton /> : null}
        {placed !== null && placed.length === 0 ? (
          <span className="text-title" style={{ color: 'var(--color-ios-ink-3)' }}>
            {rowMenuText(interfaceLanguage, 'rowMenu.peek.empty')}
          </span>
        ) : null}
        {(placed ?? []).map((entry) => (
          <PeekRow key={entry.message.id} entry={entry} mode={mode} group={group} languages={languages} viewerId={viewerId} interfaceLanguage={interfaceLanguage} now={now} />
        ))}
      </div>
      <button type="button" data-peek-open aria-label={rowMenuText(interfaceLanguage, 'rowMenu.peek.open')} className="conversation-peek-open" onClick={onOpen} />
    </div>
  );
}

function PeekRow({
  entry,
  mode,
  group,
  languages,
  viewerId,
  interfaceLanguage,
  now,
}: {
  readonly entry: PlacedMessage;
  readonly mode: PeekReadingMode;
  readonly group: boolean;
  readonly languages: readonly string[];
  readonly viewerId: string;
  readonly interfaceLanguage: InterfaceLanguage;
  readonly now: () => number;
}) {
  const { message } = entry;
  if (isSealed(message)) {
    return (
      <span data-peek-encrypted data-peek-row className="conversation-peek-placeholder text-title">
        <Glyph name="lock" size={12} />
        {conversationPreviewString(interfaceLanguage, 'protection.encrypted')}
      </span>
    );
  }
  const ephemeralDeadline = resolveEphemeralDeadline({ message, isMine: isMineOf(message, viewerId), now: now() });
  return (
    <div data-peek-row>
      {mode === 'bubbles' ? (
        <Bubble place={entry} languages={languages} isGrouped={group} viewerId={viewerId} ephemeralDeadline={ephemeralDeadline} onJumpToMessage={NOOP} now={now} />
      ) : (
        <FocalRow mode={mode} place={entry} group={group} languages={languages} viewerId={viewerId} ephemeralDeadline={ephemeralDeadline} onJumpToMessage={NOOP} now={now} />
      )}
    </div>
  );
}

function PeekSkeleton() {
  return (
    <div data-peek-skeleton aria-hidden className="flex flex-col gap-2">
      <span className="conversation-peek-skeleton" style={{ width: '62%' }} />
      <span className="conversation-peek-skeleton" style={{ width: '78%', alignSelf: 'flex-end' }} />
      <span className="conversation-peek-skeleton" style={{ width: '48%' }} />
    </div>
  );
}

export default ConversationPeekCard;
