/**
 * Composition du rail « vivants » — maquette normative §3, table « Structure
 * de l'écran » : « d'abord les conversations où il se passe quelque chose
 * MAINTENANT (Scène live, typing, salve ✦), puis les stories non vues ».
 *
 * RE-PREUVE (2026-08-17, avant ce lot) : le montage n'alimentait le rail que
 * depuis la section `live`, structurellement vide côté web (behaviour-matrix:
 * L13, `liveCall` sans source) — `LivesRail` rendait donc TOUJOURS `null` en
 * production. Les deux autres familles de « ça vit maintenant » existent
 * pourtant déjà : le typing et la salve ✦.
 */
import type { Conversation } from '@meeshy/shared/types';
import type { ConversationBridge } from '@meeshy/shared/types/conversation-bridge';
import { resolveLentilleRailEntries } from '../lentille-rail-entries';

const conv = (id: string, overrides: Partial<Conversation> = {}): Conversation =>
  ({
    id,
    type: 'group',
    title: `Conversation ${id}`,
    unreadCount: 0,
    ...overrides,
  }) as unknown as Conversation;

const bridge = { kind: 'fallback', unreadCount: 3 } as unknown as ConversationBridge;

const noTyping = new Map<string, readonly unknown[]>();
const noBridge = () => null;

describe('resolveLentilleRailEntries — ce qui vit maintenant', () => {
  it('rend vide quand rien ne vit (le rail se masque alors de lui-même)', () => {
    expect(
      resolveLentilleRailEntries({
        liveConversations: [],
        conversations: [conv('a'), conv('b')],
        typingByConversation: noTyping,
        bridgeByConversation: noBridge,
      })
    ).toEqual([]);
  });

  it('retient une conversation où quelqu’un ÉCRIT', () => {
    const entries = resolveLentilleRailEntries({
      liveConversations: [],
      conversations: [conv('a'), conv('b')],
      typingByConversation: new Map([['b', [{ userId: 'u2', displayName: 'Karim' }]]]),
      bridgeByConversation: noBridge,
    });

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ id: 'b', kind: 'typing', isLive: false });
  });

  it('retient une SALVE ✦ : non lu ET pont', () => {
    const entries = resolveLentilleRailEntries({
      liveConversations: [],
      conversations: [conv('a', { unreadCount: 4 }), conv('b', { unreadCount: 0 })],
      typingByConversation: noTyping,
      bridgeByConversation: () => bridge,
    });

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ id: 'a', kind: 'bridge' });
  });

  it('un non-lu SANS pont n’entre pas (jamais une salve fabriquée)', () => {
    const entries = resolveLentilleRailEntries({
      liveConversations: [],
      conversations: [conv('a', { unreadCount: 12 })],
      typingByConversation: noTyping,
      bridgeByConversation: noBridge,
    });
    expect(entries).toEqual([]);
  });

  it('ordre de la maquette : live, puis typing, puis salve ✦', () => {
    const live = conv('live-1');
    const typing = conv('typing-1');
    const salve = conv('salve-1', { unreadCount: 2 });

    const entries = resolveLentilleRailEntries({
      liveConversations: [live],
      conversations: [salve, typing, live],
      typingByConversation: new Map([['typing-1', [{ userId: 'u' }]]]),
      bridgeByConversation: (c) => (c.id === 'salve-1' ? bridge : null),
    });

    expect(entries.map((e) => e.id)).toEqual(['live-1', 'typing-1', 'salve-1']);
    expect(entries.map((e) => e.kind)).toEqual(['live', 'typing', 'bridge']);
  });

  it('une conversation n’apparaît qu’une fois — la famille la plus vivante gagne', () => {
    const both = conv('x', { unreadCount: 9 });
    const entries = resolveLentilleRailEntries({
      liveConversations: [both],
      conversations: [both],
      typingByConversation: new Map([['x', [{ userId: 'u' }]]]),
      bridgeByConversation: () => bridge,
    });

    expect(entries).toHaveLength(1);
    expect(entries[0].kind).toBe('live');
  });
});
