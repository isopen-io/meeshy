import { QueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import { BLOOD_PROXIMITY_NOTIFICATION_TYPE, bloodProximityNotificationMetadata } from '@meeshy/shared/types/blood-location';
import { NotificationTypeEnum } from '@meeshy/shared/types/notification';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/event-names';

import { decodeAppPreferences, decodeServedPreferences, preferencesPatchBody } from '@/lib/api/app-preferences';
import { NOTIFICATION_COUNTS_QUERY_KEY, notificationListKey, type NotificationCounts, type NotificationsInfiniteData } from '@/lib/api/notifications';
import { createRealtimeConnection } from '@/lib/api/socket';
import { createTypingStore } from '@/lib/api/typing-store';
import { conversationStore } from '@/lib/conversation-store';
import type { SocketClient, SocketHandler } from '@/lib/net/socket';
import { shellPushTargetInput } from '@/lib/push/shell-push';
import { shellPushUrl } from '@/lib/push/shell-push-runtime';
import { createOutboxStore } from '@/lib/send/outbox-store';
import { MAP_PERSON_PARAM, mapHrefOf } from '@/lib/shared-locations/map-person';

import { categoryAccepts } from './categories';
import { inAppBannerStore } from './in-app-banner';
import { decodeNotification } from './record';
import { notificationTarget, pushTapTarget } from './target';

/**
 * **QUAND UN SANG S'APPROCHE, LE TOUCHER OUVRE LA CARTE** (#20540) — volet web. La passerelle pousse
 * `blood_proximity` (titre et corps déjà composés), `data.userId` = l'autre Sang, et range la ligne avec
 * `metadata { action: 'view_profile', userId, distanceMeters }`. Le contrat dit : au toucher, la carte de
 * `userId` — jamais une conversation, jamais un profil. La carte du web est `/positions?person=<id>`
 * (`SharedLocationsScreen`, la même que « Voir sur la carte » de la fiche, #18881).
 */

const LINA = '65f0c0ffee0000000000a11a';
const MAP_OF_LINA = `/positions?${MAP_PERSON_PARAM}=${LINA}`;

const served = (id: string, metadata: Readonly<Record<string, unknown>> = bloodProximityNotificationMetadata({ userId: LINA, distanceMeters: 500 })) => ({
  id,
  userId: 'u-viewer',
  type: BLOOD_PROXIMITY_NOTIFICATION_TYPE,
  priority: 'normal',
  title: 'Lina est tout près',
  content: 'À 500 m — touche pour vous voir tous les deux sur la carte',
  actor: { id: LINA, username: 'lina', displayName: 'Lina' },
  context: {},
  metadata,
  state: { isRead: false, readAt: null, createdAt: '2026-11-24T08:00:00.000Z' },
});

describe('le contrat partagé', () => {
  test('le type que le web route est celui que la passerelle émet', () => {
    expect(BLOOD_PROXIMITY_NOTIFICATION_TYPE).toBe(NotificationTypeEnum.BLOOD_PROXIMITY);
  });

  test('l’adresse de la carte d’une personne est celle de « Voir sur la carte »', () => {
    expect(mapHrefOf(LINA)).toBe(MAP_OF_LINA);
  });
});

describe('la ligne de la cloche ouvre la carte de l’autre Sang', () => {
  test('le décodeur garde l’identifiant de l’autre Sang, jamais la prose', () => {
    const decoded = decodeNotification(served('n1'));
    expect(decoded?.metadata.userId).toBe(LINA);
  });

  test('toucher la ligne ouvre la carte, pas le profil', () => {
    const decoded = decodeNotification(served('n1'));
    expect(decoded === null ? null : notificationTarget(decoded)).toEqual({ route: 'sharedLocations', search: { [MAP_PERSON_PARAM]: LINA } });
  });

  test('une ligne sans `metadata.userId` se replie sur l’acteur, qui est le même Sang', () => {
    const decoded = decodeNotification(served('n1', { action: 'view_profile' }));
    expect(decoded === null ? null : notificationTarget(decoded)).toEqual({ route: 'sharedLocations', search: { [MAP_PERSON_PARAM]: LINA } });
  });

  test('le `userId` d’une AUTRE famille ne détourne pas sa destination', () => {
    const decoded = decodeNotification({ ...served('n2'), type: 'contact_recently_active' });
    expect(decoded === null ? null : notificationTarget(decoded)).toEqual({ route: 'userProfile', params: { username: 'lina' } });
  });
});

describe('le push ouvre la carte, app fermée', () => {
  test('la charge du push porte `userId` : le tap mène à la carte', () => {
    expect(pushTapTarget({ type: BLOOD_PROXIMITY_NOTIFICATION_TYPE, userId: LINA, senderUsername: 'lina' })).toEqual({
      route: 'sharedLocations',
      search: { [MAP_PERSON_PARAM]: LINA },
    });
  });

  test('sans `userId`, le tap atterrit sur la cloche, jamais sur une carte vide', () => {
    expect(pushTapTarget({ type: BLOOD_PROXIMITY_NOTIFICATION_TYPE })).toEqual({ route: 'notifications' });
  });

  test('la coque Capacitor lit `userId` dans `data` et ouvre la même adresse que la fiche', () => {
    const input = shellPushTargetInput({ type: BLOOD_PROXIMITY_NOTIFICATION_TYPE, userId: LINA, senderId: LINA, notificationId: 'n1' });
    expect(input.userId).toBe(LINA);
    expect(shellPushUrl(pushTapTarget(input))).toBe(MAP_OF_LINA);
  });
});

describe('la préférence « Quand un de mes Sangs s’approche »', () => {
  const complete = (notification: Readonly<Record<string, unknown>>) => ({
    application: { theme: 'auto' },
    notification: { pushEnabled: true, soundEnabled: true, contactActivityEnabled: true, ...notification },
    privacy: {
      showOnlineStatus: true,
      showLastSeen: true,
      showReadReceipts: true,
      showTypingIndicator: true,
      hideProfileFromSearch: false,
      acceptCallsFromNonContacts: true,
      notifyContactsOnReturn: true,
    },
  });

  test('absente côté serveur : reçue', () => {
    expect(decodeAppPreferences(complete({}))?.bloodProximityEnabled).toBe(true);
  });

  test('coupée côté serveur : coupée', () => {
    expect(decodeAppPreferences(complete({ bloodProximityEnabled: false }))?.bloodProximityEnabled).toBe(false);
    expect(decodeServedPreferences({ notification: { pushEnabled: true, soundEnabled: true, contactActivityEnabled: true, bloodProximityEnabled: false } })?.bloodProximityEnabled).toBe(false);
  });

  test('la bascule écrit sa clé dans la catégorie notification', () => {
    expect(preferencesPatchBody({ bloodProximityEnabled: false })).toEqual({ notification: { bloodProximityEnabled: false } });
  });

  test('la ligne se range avec les contacts, à côté du retour d’un contact', () => {
    expect(categoryAccepts('contacts', { type: BLOOD_PROXIMITY_NOTIFICATION_TYPE, state: { isRead: false } })).toBe(true);
  });
});

function fakeSocket(): SocketClient & { fire(event: string, payload: unknown): void } {
  const handlers = new Map<string, Set<SocketHandler>>();
  let connected = false;
  return {
    get connected() {
      return connected;
    },
    connect: () => {
      connected = true;
    },
    disconnect: () => {
      connected = false;
    },
    on: (event, handler) => {
      const set = handlers.get(event) ?? new Set();
      set.add(handler as SocketHandler);
      handlers.set(event, set);
    },
    off: (event, handler) => {
      handlers.get(event)?.delete(handler as SocketHandler);
    },
    emit: () => undefined,
    fire: (event, payload) => {
      for (const handler of handlers.get(event) ?? []) handler(payload);
    },
  };
}

function connect() {
  const socket = fakeSocket();
  const queryClient = new QueryClient();
  const empty: NotificationsInfiniteData = { pages: [{ notifications: [], hasMore: false, nextCursor: null }], pageParams: [undefined] };
  queryClient.setQueryData(notificationListKey('all'), empty);
  queryClient.setQueryData<NotificationCounts>(NOTIFICATION_COUNTS_QUERY_KEY, { total: 0, unread: 0, byType: {} });
  createRealtimeConnection(
    { token: 't', sessionToken: 's' },
    {
      base: 'https://gate.staging.meeshy.me',
      socketFactory: () => socket,
      queryClient,
      typing: createTypingStore(),
      conversationStore,
      outbox: createOutboxStore(),
      viewerId: () => 'u-viewer',
      onClearSession: () => undefined,
    },
  );
  return { socket, queryClient };
}

const globals = globalThis as { document?: unknown; window?: unknown };
let saved: { readonly document: unknown; readonly window: unknown };

beforeEach(() => {
  saved = { document: globals.document, window: globals.window };
  globals.document = { hidden: false };
  globals.window = { location: { pathname: '/' }, addEventListener: () => undefined, removeEventListener: () => undefined };
  inAppBannerStore.setState({ current: null });
});

afterEach(() => {
  globals.document = saved.document;
  globals.window = saved.window;
  inAppBannerStore.setState({ current: null });
});

describe('onglet ouvert : UNE bannière, qui ouvre la carte', () => {
  test('`notification:new` de ce type descend dans la bannière in-app, et son toucher mène à la carte', () => {
    const { socket } = connect();
    socket.fire(SERVER_EVENTS.NOTIFICATION_NEW, served('n1'));
    const banner = inAppBannerStore.getState().current;
    expect(banner?.id).toBe('n1');
    expect(banner?.title).toBe('Lina est tout près');
    expect(banner === null || banner === undefined ? null : notificationTarget(banner)).toEqual({ route: 'sharedLocations', search: { [MAP_PERSON_PARAM]: LINA } });
  });

  test('l’alerte socket `location:blood-proximity` qui l’accompagne ne fait pas descendre une seconde bannière', () => {
    const { socket } = connect();
    socket.fire(SERVER_EVENTS.NOTIFICATION_NEW, served('n1'));
    inAppBannerStore.getState().dismiss();
    socket.fire('location:blood-proximity', { userId: LINA, distanceMeters: 500 });
    expect(inAppBannerStore.getState().current).toBeNull();
  });

  test('une rediffusion de la même notification ne redescend pas et ne compte qu’une fois', () => {
    const { socket, queryClient } = connect();
    socket.fire(SERVER_EVENTS.NOTIFICATION_NEW, served('n1'));
    inAppBannerStore.getState().dismiss();
    socket.fire(SERVER_EVENTS.NOTIFICATION_NEW, served('n1'));
    expect(inAppBannerStore.getState().current).toBeNull();
    expect(queryClient.getQueryData<NotificationCounts>(NOTIFICATION_COUNTS_QUERY_KEY)?.unread).toBe(1);
  });
});
