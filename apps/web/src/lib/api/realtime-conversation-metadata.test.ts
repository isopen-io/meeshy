import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import type { ConversationUpdatedEventData } from '@meeshy/shared/types/socketio-events/conversation';

import { CONVERSATIONS_QUERY_KEY, conversationQueryKey, findCachedConversation } from './conversations';
import type { ConversationsInfiniteData } from './conversations-pages';
import { applyConversationUpdated } from './realtime-apply';
import type { Conversation } from './types';

/**
 * **UN RENOMMAGE, UNE PHOTO OU UN RÉGLAGE DE GROUPE SE VOIT EN DIRECT** (#18914,
 * WEB-02) — `PUT|PATCH /conversations/:id` émet `conversation:updated` avec le
 * seul groupe MÉTADONNÉES (contrat `ConversationUpdatedEventData`) ; le puits
 * sortait avant de le lire. La ligne de liste et la fiche du fil suivent
 * désormais, champ par champ : clé absente = inchangé, `null` = retiré.
 */

const SERVED_AT = new Date('2026-11-01T08:00:00.000Z');

const group = (partial: Partial<Conversation> = {}): Conversation =>
  ({
    id: 'c-famille',
    title: 'Famille',
    description: 'Les dimanches',
    type: 'group',
    status: 'active',
    visibility: 'private',
    isActive: true,
    memberCount: 4,
    participants: [],
    avatar: '2026/10/c-famille/photo.webp',
    banner: '2026/10/c-famille/banniere.webp',
    defaultWriteRole: 'everyone',
    isAnnouncementChannel: false,
    slowModeSeconds: 0,
    autoTranslateEnabled: true,
    createdAt: SERVED_AT,
    updatedAt: SERVED_AT,
    ...partial,
  }) as Conversation;

const seeded = (conversation: Conversation = group()): QueryClient => {
  const queryClient = new QueryClient();
  queryClient.setQueryData<ConversationsInfiniteData>(CONVERSATIONS_QUERY_KEY, {
    pages: [
      {
        conversations: [conversation],
        pagination: { limit: 30, offset: 0, total: 1, hasMore: false },
        cursorPagination: { limit: 30, hasMore: false, nextCursor: null },
      },
    ],
    pageParams: [undefined],
  });
  queryClient.setQueryData(conversationQueryKey(conversation.id), conversation);
  return queryClient;
};

const metadataEvent = (fields: Partial<ConversationUpdatedEventData>): ConversationUpdatedEventData => ({
  conversationId: 'c-famille',
  updatedBy: { id: 'u-admin' },
  updatedAt: '2026-11-17T10:00:00.000Z',
  ...fields,
});

const listRow = (queryClient: QueryClient): Conversation | undefined => findCachedConversation(queryClient, 'c-famille');
const detail = (queryClient: QueryClient): Conversation | undefined => queryClient.getQueryData<Conversation>(conversationQueryKey('c-famille'));
const keysOf = (conversation: Conversation | undefined): readonly string[] => Object.keys(conversation ?? {});

describe('conversation:updated — le groupe MÉTADONNÉES atteint la liste et la fiche (WEB-02)', () => {
  test('un renommage et un canal d’annonce posés par un admin repeignent la ligne ET la fiche du fil', () => {
    const queryClient = seeded();

    applyConversationUpdated(queryClient, metadataEvent({ title: 'Cousins', isAnnouncementChannel: true }));

    expect(listRow(queryClient)?.title).toBe('Cousins');
    expect(detail(queryClient)?.title).toBe('Cousins');
    expect(listRow(queryClient)?.isAnnouncementChannel).toBe(true);
    expect(detail(queryClient)?.isAnnouncementChannel).toBe(true);
  });

  test('les huit réglages du contrat suivent, et une clé absente ne bouge pas', () => {
    const queryClient = seeded();

    applyConversationUpdated(
      queryClient,
      metadataEvent({
        description: 'Tous les cousins',
        avatar: '2026/11/c-famille/nouvelle.webp',
        banner: '2026/11/c-famille/nouvelle-banniere.webp',
        defaultWriteRole: 'admin',
        slowModeSeconds: 30,
        autoTranslateEnabled: false,
      }),
    );

    const row = listRow(queryClient);
    expect(row?.title).toBe('Famille');
    expect(row?.description).toBe('Tous les cousins');
    expect(row?.avatar).toBe('2026/11/c-famille/nouvelle.webp');
    expect(row?.banner).toBe('2026/11/c-famille/nouvelle-banniere.webp');
    expect(row?.defaultWriteRole).toBe('admin');
    expect(row?.slowModeSeconds).toBe(30);
    expect(row?.autoTranslateEnabled).toBe(false);
    expect(row?.isAnnouncementChannel).toBe(false);
    expect(detail(queryClient)?.slowModeSeconds).toBe(30);
  });

  test('`avatar: null` et `banner: null` RETIRENT la photo et la bannière', () => {
    const queryClient = seeded();

    applyConversationUpdated(queryClient, metadataEvent({ avatar: null, banner: null }));

    expect(keysOf(listRow(queryClient))).not.toContain('avatar');
    expect(keysOf(listRow(queryClient))).not.toContain('banner');
    expect(keysOf(detail(queryClient))).not.toContain('avatar');
  });

  test('la ligne garde l’horodatage de sa lecture SERVEUR : l’événement ne date ni ne signe la conversation', () => {
    const queryClient = seeded();

    applyConversationUpdated(queryClient, metadataEvent({ title: 'Cousins' }));

    expect(listRow(queryClient)?.updatedAt).toEqual(SERVED_AT);
    expect(detail(queryClient)?.updatedAt).toEqual(SERVED_AT);
    expect(keysOf(listRow(queryClient))).not.toContain('updatedBy');
  });

  test('un champ de forme inattendue est ignoré SEUL : les autres s’appliquent (fail-closed champ par champ)', () => {
    const queryClient = seeded();
    const malformed = { ...metadataEvent({ title: 'Cousins' }), slowModeSeconds: 'trente', defaultWriteRole: 'roi', isAnnouncementChannel: 'oui' };

    applyConversationUpdated(queryClient, malformed as unknown as ConversationUpdatedEventData);

    const row = listRow(queryClient);
    expect(row?.title).toBe('Cousins');
    expect(row?.slowModeSeconds).toBe(0);
    expect(row?.defaultWriteRole).toBe('everyone');
    expect(row?.isAnnouncementChannel).toBe(false);
  });
});
