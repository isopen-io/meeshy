import { describe, expect, test } from 'bun:test';

import type { Conversation, Message, Participant } from '@/lib/api/types';
import type { ConversationOverride } from '@/lib/conversation-store';

import { widgetSnapshotOf, WIDGET_CONVERSATIONS_MAX, WIDGET_FAVORITES_MAX, type WidgetSnapshotInput } from './snapshot';

/**
 * L'INSTANTANÉ DES WIDGETS DE LA COQUE ANDROID (#10626) — ce que la page
 * publie, et que les widgets affichent sans rien recalculer. Miroir de
 * `WidgetDataManager.swift` : mêmes clés de lecture (non-lus, conversations
 * récentes épinglées d'abord, contacts favoris), même Prisme, mêmes
 * protections.
 */
const NOW = Date.parse('2026-10-14T12:00:00.000Z');
const minutesAgo = (minutes: number): Date => new Date(NOW - minutes * 60_000);
const VIEWER = 'u-viewer';
const NO_OVERRIDES: Readonly<Record<string, ConversationOverride>> = {};

const participant = (partial: Partial<Participant>): Participant =>
  ({
    id: `p-${partial.userId ?? 'x'}`,
    conversationId: 'c1',
    userId: 'u1',
    type: 'user',
    role: 'member',
    displayName: 'Fatou Bâ',
    language: 'fr',
    isActive: true,
    joinedAt: minutesAgo(600),
    ...partial,
  }) as Participant;

const message = (partial: Partial<Message> = {}): Message =>
  ({
    id: 'm1',
    conversationId: 'c1',
    senderId: 'p-u1',
    content: 'Hello',
    originalLanguage: 'en',
    messageType: 'text',
    messageSource: 'user',
    isEdited: false,
    isViewOnce: false,
    viewOnceCount: 0,
    isBlurred: false,
    deliveredCount: 0,
    readCount: 0,
    reactionCount: 0,
    isEncrypted: false,
    createdAt: minutesAgo(5),
    timestamp: minutesAgo(5),
    translations: [],
    ...partial,
  }) as Message;

const direct = (id: string, partial: Partial<Conversation> = {}, peer: Partial<Participant> = {}): Conversation =>
  ({
    id,
    type: 'direct',
    createdAt: minutesAgo(1000),
    updatedAt: minutesAgo(5),
    lastMessageAt: minutesAgo(5),
    unreadCount: 0,
    participants: [
      participant({ userId: VIEWER, displayName: 'Moi' }),
      participant({ userId: `peer-${id}`, displayName: `Pair ${id}`, ...peer }),
    ],
    ...partial,
  }) as Conversation;

const pinned = (partial: Partial<Conversation> = {}): Partial<Conversation> => ({
  ...partial,
  userPreferences: [{ isPinned: true, isMuted: false, isArchived: false }],
});

const input = (conversations: readonly Conversation[], partial: Partial<WidgetSnapshotInput> = {}): WidgetSnapshotInput => ({
  conversations,
  overrides: NO_OVERRIDES,
  viewerId: VIEWER,
  languages: ['fr'],
  interfaceLanguage: 'fr',
  now: NOW,
  ...partial,
});

describe('widgetSnapshotOf — les conversations récentes', () => {
  test('épinglées d’abord, puis la plus récente en tête', () => {
    const snapshot = widgetSnapshotOf(
      input([
        direct('ancienne', { lastMessageAt: minutesAgo(60) }),
        direct('recente', { lastMessageAt: minutesAgo(1) }),
        direct('epinglee', pinned({ lastMessageAt: minutesAgo(600) })),
      ]),
    );
    expect(snapshot.conversations.map((row) => row.id)).toEqual(['epinglee', 'recente', 'ancienne']);
    expect(snapshot.conversations[0]?.pinned).toBe(true);
  });

  test('une conversation archivée n’est pas sur l’écran d’accueil', () => {
    const snapshot = widgetSnapshotOf(
      input([direct('a'), direct('b', { userPreferences: [{ isPinned: false, isMuted: false, isArchived: true }] })]),
    );
    expect(snapshot.conversations.map((row) => row.id)).toEqual(['a']);
  });

  test(`plafonnée à ${WIDGET_CONVERSATIONS_MAX} lignes`, () => {
    const many = Array.from({ length: WIDGET_CONVERSATIONS_MAX + 5 }, (_, i) => direct(`c${i}`));
    expect(widgetSnapshotOf(input(many)).conversations).toHaveLength(WIDGET_CONVERSATIONS_MAX);
  });

  test('une ligne porte le nom du pair, ses initiales, l’accent de la conversation et l’horodatage en ms', () => {
    const [row] = widgetSnapshotOf(input([direct('a', {}, { displayName: 'Amina Diallo' })])).conversations;
    expect(row?.name).toBe('Amina Diallo');
    expect(row?.initials).toBe('AD');
    expect(row?.accent).toMatch(/^#[0-9A-Fa-f]{6}$/);
    expect(row?.at).toBe(minutesAgo(5).getTime());
    expect(row?.group).toBe(false);
  });

  test('l’aperçu descend le Prisme du lecteur : un message anglais traduit en français se lit en français', () => {
    const snapshot = widgetSnapshotOf(
      input([
        direct('a', {
          lastMessage: message({ content: 'Hello', originalLanguage: 'en' }),
          lastMessageTranslations: { fr: 'Bonjour' },
        } as Partial<Conversation>),
      ]),
    );
    expect(snapshot.conversations[0]?.preview).toBe('Bonjour');
  });

  test('un message à vue unique ne laisse que son libellé de protection', () => {
    const snapshot = widgetSnapshotOf(
      input([direct('a', { lastMessage: message({ content: 'Le code est 4242', isViewOnce: true }) })]),
    );
    expect(snapshot.conversations[0]?.preview).not.toContain('4242');
    expect(snapshot.conversations[0]?.preview).toContain('Vue unique');
  });

  test('un éphémère ne pose sur l’écran d’accueil ni son texte ni un compte à rebours qui y resterait figé', () => {
    const snapshot = widgetSnapshotOf(
      input([
        direct('a', {
          lastMessage: message({ content: 'Secret du jour', expiresAt: new Date(NOW + 10 * 60_000) }),
        }),
      ]),
    );
    const preview = snapshot.conversations[0]?.preview ?? '';
    expect(preview).not.toContain('Secret');
    expect(preview).not.toMatch(/\d/);
  });

  test('le non-lu est EFFECTIF : « marquer lu » optimiste éteint la ligne et le total avant le serveur', () => {
    const conversations = [direct('a', { unreadCount: 3 }), direct('b', { unreadCount: 1 })];
    const before = widgetSnapshotOf(input(conversations));
    expect(before.unread).toBe(2);
    const after = widgetSnapshotOf(input(conversations, { overrides: { a: { unreadCount: 0 } } }));
    expect(after.unread).toBe(1);
    expect(after.conversations.find((row) => row.id === 'a')?.unread).toBe(0);
  });

  test('le total suit le badge : une conversation muette ne compte pas', () => {
    const snapshot = widgetSnapshotOf(
      input([direct('a', { unreadCount: 2, userPreferences: [{ isPinned: false, isMuted: true, isArchived: false }] })]),
    );
    expect(snapshot.unread).toBe(0);
    expect(snapshot.conversations[0]?.muted).toBe(true);
  });

  test('une photo relative est résolue en adresse absolue, une photo absente reste absente', () => {
    const snapshot = widgetSnapshotOf(
      input([direct('a', {}, { avatar: '/api/v1/attachments/file/avatar.jpg' }), direct('b')]),
    );
    expect(snapshot.conversations[0]?.avatar).toMatch(/^https?:\/\/.+avatar\.jpg$/);
    expect(snapshot.conversations[1]?.avatar).toBeNull();
  });
});

describe('widgetSnapshotOf — les contacts favoris (miroir iOS : directes épinglées)', () => {
  test(`seules les conversations directes épinglées, au plus ${WIDGET_FAVORITES_MAX}`, () => {
    const group = { ...direct('g', pinned()), type: 'group', title: 'Équipe' } as Conversation;
    const pins = Array.from({ length: WIDGET_FAVORITES_MAX + 2 }, (_, i) => direct(`p${i}`, pinned()));
    const snapshot = widgetSnapshotOf(input([group, direct('libre'), ...pins]));
    expect(snapshot.favorites).toHaveLength(WIDGET_FAVORITES_MAX);
    expect(snapshot.favorites.map((f) => f.id)).not.toContain('g');
    expect(snapshot.favorites.map((f) => f.id)).not.toContain('libre');
  });

  test('la présence est celle que le serveur SERT — absente, aucun point', () => {
    const online = direct('en-ligne', pinned(), { isOnline: true, lastActiveAt: minutesAgo(0) } as Partial<Participant>);
    const hidden = direct('masque', pinned());
    const snapshot = widgetSnapshotOf(input([online, hidden]));
    expect(snapshot.favorites.find((f) => f.id === 'en-ligne')?.presence).toBe('online');
    expect(snapshot.favorites.find((f) => f.id === 'masque')?.presence).toBe('offline');
  });
});
