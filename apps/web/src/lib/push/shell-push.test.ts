import { describe, expect, test } from 'bun:test';
import { createStore } from 'zustand/vanilla';

import type { HttpRequest } from '@/lib/api/http';
import type { SessionState } from '@/lib/api/session';
import type { PushTapTarget } from '@/lib/notifications/target';

import {
  SHELL_PUSH_CHANNEL_ID,
  deliveredMessageOf,
  shellPushTargetInput,
  startShellPush,
  type ShellPushPermission,
  type ShellPushPlugin,
} from './shell-push';

/**
 * **LA COQUE ANDROID ET FCM** (#7307). Le plugin natif est bouchonné : ce
 * témoin fait décider le module — quel jeton part, sous quel compte, vers quelle
 * adresse un tap mène, quelle remise s'accuse.
 */

type Handlers = Record<string, (event: never) => void>;

function fakePlugin(options: { readonly permission?: ShellPushPermission; readonly afterRequest?: ShellPushPermission } = {}) {
  const handlers: Handlers = {};
  const calls: string[] = [];
  const channels: string[] = [];
  let tokenSeq = 0;
  const plugin: ShellPushPlugin = {
    checkPermissions: async () => ({ receive: options.permission ?? 'granted' }),
    requestPermissions: async () => {
      calls.push('requestPermissions');
      return { receive: options.afterRequest ?? 'granted' };
    },
    register: async () => {
      calls.push('register');
      tokenSeq += 1;
      handlers.registration?.({ value: `fcm-token-${tokenSeq}-xxxxxxxx` } as never);
    },
    unregister: async () => {
      calls.push('unregister');
    },
    createChannel: async (channel) => {
      channels.push(channel.id);
    },
    addListener: (async (eventName: string, listener: (event: never) => void) => {
      handlers[eventName] = listener;
      return { remove: async () => undefined };
    }) as ShellPushPlugin['addListener'],
  };
  const fire = (eventName: string, event: unknown): void => handlers[eventName]?.(event as never);
  return { plugin, calls, channels, fire };
}

const authenticated = (id: string): SessionState => ({
  status: 'authenticated',
  user: { id, username: id },
  token: `jwt-${id}`,
  sessionToken: 's',
  expiresAt: Date.now() + 3_600_000,
});

const anonymous: SessionState = { status: 'anonymous' };

function harness(session: SessionState, pluginOptions: Parameters<typeof fakePlugin>[0] = {}) {
  const fake = fakePlugin(pluginOptions);
  const store = createStore<{ session: SessionState }>(() => ({ session }));
  const requests: HttpRequest[] = [];
  const visited: string[] = [];
  const env = {
    plugin: fake.plugin,
    sessionStore: store,
    transport: {
      request: async <T,>(request: HttpRequest) => {
        requests.push(request);
        return { ok: true, status: 200, data: {} as T } as const;
      },
    },
    navigate: (url: string) => visited.push(url),
    urlOf: (target: PushTapTarget) => `${target.route}:${JSON.stringify('params' in target ? target.params : 'search' in target ? target.search : {})}`,
    appVersion: '2.0.12',
  };
  return { ...fake, store, requests, visited, start: () => startShellPush(env) };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('startShellPush — le jeton FCM de la coque part sous le compte courant (#7307)', () => {
  test('crée le canal que la passerelle nomme, sans quoi Android jette la bannière en silence', async () => {
    const h = harness(anonymous);
    await h.start();
    expect(h.channels).toEqual([SHELL_PUSH_CHANNEL_ID]);
    expect(SHELL_PUSH_CHANNEL_ID).toBe('meeshy_notifications');
  });

  test('une session enregistrée enregistre le jeton par le port d’iOS, en android/fcm', async () => {
    const h = harness(authenticated('u1'));
    await h.start();
    await flush();
    expect(h.requests).toEqual([
      {
        method: 'POST',
        path: '/api/v1/users/register-device-token',
        body: { token: 'fcm-token-1-xxxxxxxx', platform: 'android', type: 'fcm', appVersion: '2.0.12' },
      },
    ]);
  });

  test('sans session, rien n’est demandé ni enregistré', async () => {
    const h = harness(anonymous, { permission: 'prompt' });
    await h.start();
    await flush();
    expect(h.calls).toEqual([]);
    expect(h.requests).toEqual([]);
  });

  test('une permission jamais demandée l’est à l’ouverture de session', async () => {
    const h = harness(authenticated('u1'), { permission: 'prompt', afterRequest: 'granted' });
    await h.start();
    await flush();
    expect(h.calls).toEqual(['requestPermissions', 'register']);
  });

  test('une permission refusée n’est ni redemandée ni contournée', async () => {
    const h = harness(authenticated('u1'), { permission: 'denied' });
    await h.start();
    await flush();
    expect(h.calls).toEqual([]);
    expect(h.requests).toEqual([]);
  });

  test('un refus au dialogue n’enregistre rien', async () => {
    const h = harness(authenticated('u1'), { permission: 'prompt', afterRequest: 'denied' });
    await h.start();
    await flush();
    expect(h.calls).toEqual(['requestPermissions']);
    expect(h.requests).toEqual([]);
  });

  test('la déconnexion détruit le jeton de l’appareil, sans requête sous un crédential effacé', async () => {
    const h = harness(authenticated('u1'));
    await h.start();
    await flush();
    h.requests.length = 0;
    h.store.setState({ session: anonymous });
    await flush();
    expect(h.calls).toEqual(['register', 'unregister']);
    expect(h.requests).toEqual([]);
  });

  test('un autre compte qui se connecte reçoit un jeton NEUF, jamais celui du précédent', async () => {
    const h = harness(authenticated('u1'));
    await h.start();
    await flush();
    h.store.setState({ session: authenticated('u2') });
    await flush();
    const tokens = h.requests.map((request) => (request.body as { token: string }).token);
    expect(tokens).toEqual(['fcm-token-1-xxxxxxxx', 'fcm-token-2-xxxxxxxx']);
    expect(h.calls).toEqual(['register', 'unregister', 'register']);
  });
});

describe('le tap d’une bannière de la coque aboutit (#7307)', () => {
  test('il mène à la conversation que la charge nomme', async () => {
    const h = harness(authenticated('u1'));
    await h.start();
    h.fire('pushNotificationActionPerformed', {
      actionId: 'tap',
      notification: { data: { type: 'new_message', conversationId: 'c42', messageId: 'm1', postId: '' } },
    });
    expect(h.visited).toEqual(['thread:{"conversation":"c42"}']);
  });

  test('une charge sans destination atterrit sur la liste des notifications', async () => {
    const h = harness(authenticated('u1'));
    await h.start();
    h.fire('pushNotificationActionPerformed', { actionId: 'tap', notification: { data: {} } });
    expect(h.visited).toEqual(['notifications:{}']);
  });
});

describe('la coque accuse la remise d’un message reçu (#7307, report de #7368)', () => {
  test('une arrivée de message poste l’accusé « delivered » sur la route canonique', async () => {
    const h = harness(authenticated('u1'));
    await h.start();
    await flush();
    h.requests.length = 0;
    h.fire('pushNotificationReceived', { id: 'n', data: { type: 'new_message', conversationId: 'c42', messageId: 'm7' } });
    expect(h.requests).toEqual([
      { method: 'POST', path: '/api/v1/conversations/c42/receipts', body: { type: 'delivered', messageIds: ['m7'] } },
    ]);
  });

  test('une réaction porte le message RÉAGI : aucun accusé', async () => {
    const h = harness(authenticated('u1'));
    await h.start();
    await flush();
    h.requests.length = 0;
    h.fire('pushNotificationReceived', { id: 'n', data: { type: 'message_reaction', conversationId: 'c42', messageId: 'm7' } });
    expect(h.requests).toEqual([]);
  });
});

describe('ce que la coque lit de la charge', () => {
  test('seuls les champs de navigation passent au résolveur — jamais le contenu', () => {
    const input = shellPushTargetInput({
      type: 'new_message',
      conversationId: 'c1',
      translatedContent: 'Bonjour',
      content: 'Hello',
      encryptedContent: 'xx',
    });
    expect(Object.values(input)).not.toContain('Bonjour');
    expect(Object.values(input)).not.toContain('Hello');
    expect(input.conversationId).toBe('c1');
  });

  test('une remise sans message ni conversation n’est pas une remise', () => {
    expect(deliveredMessageOf({ type: 'new_message', conversationId: 'c1', messageId: '' })).toBeNull();
    expect(deliveredMessageOf(null)).toBeNull();
  });
});
