import { describe, expect, test } from 'bun:test';

import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/event-names';
import type { ConversationEngagementSnapshot } from '@meeshy/shared/types/engagement-scale';

import {
  bindConversationEngagement,
  createEngagementStore,
  effectiveEngagementOf,
  freshestEngagement,
  servedEngagementOf,
} from './conversation-engagement';
import { resetIdentityScopedStores } from './identity-scoped-stores';
import { createOutboxStore } from '../send/outbox-store';
import { conversationStore } from '../conversation-store';
import { createTypingStore } from './typing-store';
import type { SocketClient, SocketHandler } from '@/lib/net/socket';

/**
 * « N (M) 🔥 » (#8906) — l'état d'engagement d'une conversation pour son
 * lecteur : servi sur la liste et le détail, poussé en direct par la
 * passerelle, toujours validé par la garde partagée.
 */

const snapshot = (overrides: Partial<ConversationEngagementSnapshot> = {}): ConversationEngagementSnapshot => ({
  conversationId: 'conv-a',
  totalPoints: 120,
  todayPoints: 12,
  streakDays: 4,
  day: '2026-09-30',
  ...overrides,
});

/** Une conversation servie, `viewerEngagement` compris — la forme de la charge, que le type partagé ne déclare pas encore. */
function served(id: string, viewerEngagement: unknown): { readonly id: string } {
  const conversation = { id, viewerEngagement };
  return conversation;
}

function fakeSocket() {
  const handlers = new Map<string, Set<SocketHandler>>();
  const socket: SocketClient = {
    connected: true,
    connect: () => undefined,
    disconnect: () => undefined,
    on: (event, handler) => {
      const set = handlers.get(event) ?? new Set<SocketHandler>();
      set.add(handler as SocketHandler);
      handlers.set(event, set);
    },
    off: (event, handler) => {
      handlers.get(event)?.delete(handler as SocketHandler);
    },
    emit: () => undefined,
  };
  const fire = (event: string, payload: unknown): void => {
    for (const handler of handlers.get(event) ?? []) handler(payload);
  };
  return { socket, fire, listeners: () => [...handlers.values()].reduce((n, s) => n + s.size, 0) };
}

describe('la charge servie — viewerEngagement sur la conversation', () => {
  test('un instantané valide est lu depuis la conversation', () => {
    const fromList = snapshot();
    expect(servedEngagementOf(served('conv-a', fromList))).toBe(fromList);
  });

  test('absent ⇒ aucun instantané', () => {
    expect(servedEngagementOf({ id: 'conv-a' })).toBeUndefined();
  });

  test('une forme inattendue est refusée ENTIÈRE', () => {
    expect(servedEngagementOf(served('conv-a', { ...snapshot(), totalPoints: '120' }))).toBeUndefined();
    expect(servedEngagementOf(served('conv-a', { ...snapshot(), day: '30/09/2026' }))).toBeUndefined();
  });

  test('un instantané d’une AUTRE conversation n’est pas crédité à celle-ci', () => {
    expect(servedEngagementOf(served('conv-b', snapshot()))).toBeUndefined();
  });
});

describe('le plus récent gagne', () => {
  test('un jour plus tardif prime sur un total plus haut', () => {
    const yesterday = snapshot({ day: '2026-09-29', totalPoints: 500 });
    const today = snapshot({ day: '2026-09-30', totalPoints: 510 });
    expect(freshestEngagement(yesterday, today)).toBe(today);
    expect(freshestEngagement(today, yesterday)).toBe(today);
  });

  test('le même jour, le total le plus haut prime', () => {
    const before = snapshot({ totalPoints: 120 });
    const after = snapshot({ totalPoints: 125, todayPoints: 17 });
    expect(freshestEngagement(after, before)).toBe(after);
  });

  test('la liste refetchée plus neuve que le direct l’emporte ; le direct plus neuf que la liste aussi', () => {
    const store = createEngagementStore();
    store.getState().apply(snapshot({ totalPoints: 130 }));
    const staleList = served('conv-a', snapshot({ totalPoints: 120 }));
    const freshList = served('conv-a', snapshot({ totalPoints: 140 }));

    expect(effectiveEngagementOf(store.getState(), staleList)?.totalPoints).toBe(130);
    expect(effectiveEngagementOf(store.getState(), freshList)?.totalPoints).toBe(140);
  });

  test('sans direct, la vue sert la charge ; sans charge, le direct', () => {
    const store = createEngagementStore();
    expect(effectiveEngagementOf(store.getState(), served('conv-a', snapshot()))?.totalPoints).toBe(120);
    store.getState().apply(snapshot({ conversationId: 'conv-b', totalPoints: 7 }));
    expect(effectiveEngagementOf(store.getState(), { id: 'conv-b' })?.totalPoints).toBe(7);
  });

  test('un instantané plus ancien reçu en retard n’écrase pas le magasin', () => {
    const store = createEngagementStore();
    store.getState().apply(snapshot({ totalPoints: 130 }));
    const before = store.getState().byConversation;
    store.getState().apply(snapshot({ totalPoints: 120 }));
    expect(store.getState().byConversation).toBe(before);
  });
});

describe('le temps réel — engagement:conversation-updated', () => {
  test('un événement valide met la conversation à jour', () => {
    const { socket, fire } = fakeSocket();
    const store = createEngagementStore();
    const unbind = bindConversationEngagement({ socket, store });

    fire(SERVER_EVENTS.ENGAGEMENT_CONVERSATION_UPDATED, snapshot({ totalPoints: 125, todayPoints: 17 }));

    expect(store.getState().byConversation['conv-a']).toEqual(snapshot({ totalPoints: 125, todayPoints: 17 }));
    unbind();
  });

  test('la garde refuse une charge malformée — rien n’est peint', () => {
    const { socket, fire } = fakeSocket();
    const store = createEngagementStore();
    const unbind = bindConversationEngagement({ socket, store });

    fire(SERVER_EVENTS.ENGAGEMENT_CONVERSATION_UPDATED, { conversationId: 'conv-a', totalPoints: -3, todayPoints: 0, streakDays: 0, day: null });
    fire(SERVER_EVENTS.ENGAGEMENT_CONVERSATION_UPDATED, null);
    fire(SERVER_EVENTS.ENGAGEMENT_CONVERSATION_UPDATED, { conversationId: 'conv-a', totalPoints: 1.5, todayPoints: 0, streakDays: 0, day: null });

    expect(store.getState().byConversation).toEqual({});
    unbind();
  });

  test('le débranchement retire l’écoute', () => {
    const { socket, fire, listeners } = fakeSocket();
    const store = createEngagementStore();
    const unbind = bindConversationEngagement({ socket, store });
    expect(listeners()).toBe(1);
    unbind();
    expect(listeners()).toBe(0);

    fire(SERVER_EVENTS.ENGAGEMENT_CONVERSATION_UPDATED, snapshot());
    expect(store.getState().byConversation).toEqual({});
  });
});

describe('les points sont à UNE identité', () => {
  test('un changement de compte vide le magasin', () => {
    const engagement = createEngagementStore();
    engagement.getState().apply(snapshot());

    resetIdentityScopedStores({ outbox: createOutboxStore(), conversations: conversationStore, typing: createTypingStore(), engagement });

    expect(engagement.getState().byConversation).toEqual({});
  });
});
