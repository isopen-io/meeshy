import { afterEach, describe, expect, test } from 'bun:test';
import { CLIENT_EVENTS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/event-names';

import { flush, harness, DIRECT, PEER, type FakeLink } from '@/test-support/call-engine-harness';

import { decodeConversationChanged } from './call-decode';
import { CALL_SERVER_EVENTS } from './call-socket-bridge';
import { createCallStore, liveCallIn, switchCallConversation, withMember, type ActiveCall, type CallStoreState } from './call-store';
import { resetCallTransportForTests } from './call-transport';
import { baseCall } from './engine-session';

/**
 * UN TÊTE-À-TÊTE QUI INVITE BASCULE VERS LE GROUPE DES PRÉSENTS (#19650) —
 * `call:conversation-changed` rattache l'appel au groupe trouvé ou créé : le
 * média ne se coupe pas (la signalisation est par callId), seul le lieu de
 * l'appel change. Le fil du groupe dit « Revenir à l'appel », celui du
 * tête-à-tête d'origine ne le dit plus.
 */

afterEach(() => resetCallTransportForTests());

const DIRECT_ID = 'conv-direct';
const GROUP_ID = 'conv-group';
const CALL = 'call-1';

const nadia = { userId: PEER, name: 'Nadia', avatar: null, micMuted: false, cameraOn: false, screenSharing: false, weakNetwork: false, capturing: false, link: 'connected' as const };

const directCall = (): ActiveCall =>
  withMember({ ...baseCall({ conversationId: DIRECT_ID, media: 'audio', title: 'Nadia', avatar: null, isGroup: false }, 'outgoing', { kind: 'connected' }), callId: CALL }, nadia);

const stateWith = (call: ActiveCall | null): CallStoreState => ({ ...createCallStore().getState(), call });

const changed = (patch: Record<string, unknown> = {}) => ({
  callId: CALL,
  conversationId: GROUP_ID,
  previousConversationId: DIRECT_ID,
  conversationType: 'group',
  conversationTitle: 'Soirée',
  memberUserIds: ['u-me', PEER, 'u-bruno'],
  created: true,
  reason: 'invitation',
  ...patch,
});

describe('la bascule de l’appel courant vers le groupe', () => {
  test('l’appel vit dans le groupe, plus dans le tête-à-tête ; il devient de groupe et porte son titre', () => {
    const change = decodeConversationChanged(changed());
    expect(change).not.toBeNull();
    const next = switchCallConversation(stateWith(directCall()), change as NonNullable<typeof change>);
    expect(liveCallIn(next, GROUP_ID)?.callId).toBe(CALL);
    expect(liveCallIn(next, DIRECT_ID)).toBeNull();
    expect(next.call?.isGroup).toBe(true);
    expect(next.call?.title).toBe('Soirée');
    expect(next.call?.members[PEER]).toEqual(nadia);
  });

  test('un groupe sans titre prend les noms des présents, jamais le seul nom du pair', () => {
    const call = withMember(directCall(), { ...nadia, userId: 'u-bruno', name: 'Bruno', link: 'ringing' });
    const change = decodeConversationChanged(changed({ conversationTitle: null }));
    const next = switchCallConversation(stateWith(call), change as NonNullable<typeof change>);
    expect(next.call?.title).toBe('Nadia, Bruno');
    expect(next.call?.conversationId).toBe(GROUP_ID);
  });
});

describe('ce qui ne bascule rien', () => {
  test('la bascule d’un autre appel laisse l’état tel quel', () => {
    const state = stateWith(directCall());
    const change = decodeConversationChanged(changed({ callId: 'call-other' }));
    expect(switchCallConversation(state, change as NonNullable<typeof change>)).toBe(state);
    expect(switchCallConversation(stateWith(null), change as NonNullable<typeof change>).call).toBeNull();
  });

  test('une charge malformée ne se décode pas', () => {
    expect(decodeConversationChanged(null)).toBeNull();
    expect(decodeConversationChanged('call:conversation-changed')).toBeNull();
    expect(decodeConversationChanged(changed({ callId: 42 }))).toBeNull();
    expect(decodeConversationChanged(changed({ conversationId: '' }))).toBeNull();
    expect(decodeConversationChanged(changed({ conversationId: undefined }))).toBeNull();
  });
});

describe('le pont et le moteur', () => {
  test('le pont écoute call:conversation-changed', () => {
    expect(SERVER_EVENTS.CALL_CONVERSATION_CHANGED).toBe('call:conversation-changed');
    expect(CALL_SERVER_EVENTS).toContain(SERVER_EVENTS.CALL_CONVERSATION_CHANGED);
  });

  test('un appel direct décroché bascule sans rien couper : mêmes liens, même phase, autre conversation', async () => {
    const h = harness();
    await h.engine.start(DIRECT);
    h.engine.handle(SERVER_EVENTS.CALL_PARTICIPANT_JOINED, { callId: CALL, participant: { id: 'p-2', userId: PEER, username: PEER, displayName: 'Nadia' } });
    h.linkState(h.links[0] as FakeLink, 'connected');
    await flush();
    h.engine.handle(SERVER_EVENTS.CALL_CONVERSATION_CHANGED, changed({ previousConversationId: DIRECT.conversationId }));
    expect(h.call()?.conversationId).toBe(GROUP_ID);
    expect(h.call()?.isGroup).toBe(true);
    expect(h.call()?.phase.kind).toBe('connected');
    expect(h.links).toHaveLength(1);
    expect((h.links[0] as FakeLink).closed).toBe(false);
  });

  test('rejoindre depuis le tête-à-tête d’origine (alias serveur) rattache l’appel au groupe que la session sert', async () => {
    const session = { conversationId: GROUP_ID, initiatorId: PEER, participants: [{ id: 'p-2', userId: PEER, leftAt: null, user: { username: PEER, displayName: 'Nadia' } }] };
    const h = harness({ activeCallId: 'call-live', acks: { [CLIENT_EVENTS.CALL_JOIN]: { success: true, data: { callSession: session, iceServers: [] } } } });
    await h.engine.start(DIRECT);
    expect(h.call()?.callId).toBe('call-live');
    expect(h.call()?.conversationId).toBe(GROUP_ID);
    expect(h.call()?.isGroup).toBe(true);
    expect(h.call()?.initiatorId).toBe(PEER);
  });

  test('une session servie dans sa propre conversation ne change ni le lieu ni le caractère de l’appel', async () => {
    const session = { conversationId: DIRECT.conversationId, initiatorId: PEER, participants: [] };
    const h = harness({ activeCallId: 'call-live', acks: { [CLIENT_EVENTS.CALL_JOIN]: { success: true, data: { callSession: session, iceServers: [] } } } });
    await h.engine.start(DIRECT);
    expect(h.call()?.conversationId).toBe(DIRECT.conversationId);
    expect(h.call()?.isGroup).toBe(false);
    expect(h.call()?.title).toBe(DIRECT.title);
  });
});
