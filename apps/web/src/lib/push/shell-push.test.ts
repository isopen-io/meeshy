import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'bun:test';
import { createStore } from 'zustand/vanilla';

import type { HttpRequest } from '@/lib/api/http';
import type { SocialEventV2Input } from '@/lib/api/social-events-v2-types';
import type { SessionState } from '@/lib/api/session';
import { pushTapTarget, type PushTapTarget } from '@/lib/notifications/target';

import {
  SHELL_PUSH_CHANNEL_ID,
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
  const channelOptions: Parameters<ShellPushPlugin['createChannel']>[0][] = [];
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
      channelOptions.push(channel);
    },
    addListener: (async (eventName: string, listener: (event: never) => void) => {
      handlers[eventName] = listener;
      return { remove: async () => undefined };
    }) as ShellPushPlugin['addListener'],
  };
  const fire = (eventName: string, event: unknown): void => handlers[eventName]?.(event as never);
  return { plugin, calls, channels, channelOptions, fire };
}

const authenticated = (id: string): SessionState => ({
  status: 'authenticated',
  user: { id, username: id },
  token: `jwt-${id}`,
  sessionToken: 's',
  expiresAt: Date.now() + 3_600_000,
});

const anonymous: SessionState = { status: 'anonymous' };

function harness(
  session: SessionState,
  pluginOptions: Parameters<typeof fakePlugin>[0] = {},
  deviceIdentity: () => Promise<unknown> = async () => ({}),
) {
  const fake = fakePlugin(pluginOptions);
  const store = createStore<{ session: SessionState }>(() => ({ session }));
  const requests: HttpRequest[] = [];
  const visited: string[] = [];
  const recorded: SocialEventV2Input[] = [];
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
    deviceIdentity,
    record: (event: SocialEventV2Input) => recorded.push(event),
  };
  return { ...fake, store, requests, visited, recorded, start: () => startShellPush(env) };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('startShellPush — le jeton FCM de la coque part sous le compte courant (#7307)', () => {
  test('crée le canal que la passerelle nomme, sans quoi Android jette la bannière en silence', async () => {
    const h = harness(anonymous);
    await h.start();
    expect(h.channels).toEqual([SHELL_PUSH_CHANNEL_ID]);
    expect(SHELL_PUSH_CHANNEL_ID).toBe('meeshy_notifications');
  });

  test('le canal des messages vibre, comme une bannière web sur Android et iOS en mode vibreur (#12566)', async () => {
    const h = harness(anonymous);
    await h.start();
    expect(h.channelOptions.map((channel) => channel.vibration)).toEqual([true]);
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
        credential: { kind: 'registered', token: 'jwt-u1' },
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

describe('le jeton part avec l’identité de l’appareil (#10858)', () => {
  const registeredBody = async (deviceIdentity: () => Promise<unknown>) => {
    const h = harness(authenticated('u1'), {}, deviceIdentity);
    await h.start();
    await flush();
    return h.requests.map((request) => request.body);
  };

  test('l’identifiant stable de l’appareil accompagne le jeton, pour que la passerelle retire l’ancien', async () => {
    const bodies = await registeredBody(async () => ({ deviceId: 'a1b2c3d4e5f60718', deviceName: 'Pixel 8' }));
    expect(bodies).toEqual([
      {
        token: 'fcm-token-1-xxxxxxxx',
        platform: 'android',
        type: 'fcm',
        appVersion: '2.0.12',
        deviceId: 'a1b2c3d4e5f60718',
        deviceName: 'Pixel 8',
      },
    ]);
  });

  test('une coque sans le pont d’identité enregistre quand même son jeton', async () => {
    const bodies = await registeredBody(async () => {
      throw new Error('not implemented');
    });
    expect(bodies).toEqual([{ token: 'fcm-token-1-xxxxxxxx', platform: 'android', type: 'fcm', appVersion: '2.0.12' }]);
  });

  test('ce que le pont rend d’inattendu ne part pas', async () => {
    const bodies = await registeredBody(async () => ({ deviceId: '', deviceName: 42, extra: 'x' }));
    expect(bodies).toEqual([{ token: 'fcm-token-1-xxxxxxxx', platform: 'android', type: 'fcm', appVersion: '2.0.12' }]);
  });
});

describe('une identité anonyme tenue par le compte (#8816)', () => {
  const heldBy = (account: SessionState): SessionState =>
    account.status === 'authenticated'
      ? {
          status: 'guest',
          sessionToken: 'anon_1',
          guest: { participantId: 'p1', nickname: 'Masque', conversationId: 'c-anon', link: 'mshy_x', mayWrite: true },
          expiresAt: Date.now() + 3_600_000,
          account,
        }
      : account;

  test('lire une conversation en anonyme ne détruit pas le jeton du compte', async () => {
    const h = harness(authenticated('u1'));
    await h.start();
    await flush();
    h.store.setState({ session: heldBy(authenticated('u1')) });
    await flush();
    expect(h.calls).toEqual(['register']);
  });

  test('le jeton part sous le COMPTE, jamais sous l’identité anonyme', async () => {
    const h = harness(authenticated('u1'));
    await h.start();
    await flush();
    h.store.setState({ session: heldBy(authenticated('u1')) });
    h.requests.length = 0;
    h.fire('registration', { value: 'fcm-token-refreshed' });
    expect(h.requests.map((request) => request.credential)).toEqual([{ kind: 'registered', token: 'jwt-u1' }]);
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

describe('la coque accuse la remise d’un message reçu UNE fois, en natif (#11122)', () => {
  test('une arrivée de message ne poste aucun accusé depuis la page : `onMessageReceived` l’a déjà envoyé', async () => {
    const h = harness(authenticated('u1'));
    await h.start();
    await flush();
    h.requests.length = 0;
    h.fire('pushNotificationReceived', { id: 'n', data: { type: 'new_message', conversationId: 'c42', messageId: 'm7' } });
    expect(h.requests).toEqual([]);
  });

  test('le natif accuse toujours la remise d’un push relayé à la page', () => {
    const service = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../../../android/app/src/main/java/me/meeshy/app/MeeshyMessagingService.java'),
      'utf8',
    );
    const received = service.slice(service.indexOf('public void onMessageReceived('), service.indexOf('private void acknowledgeDelivery('));
    expect(received).toContain('forward("sendRemoteMessage"');
    expect(received).toContain('acknowledgeDelivery(PushDeliveryReceipt.of(');
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

  test('« X a rejoint Meeshy » mène la coque au profil de l’arrivant (#8105)', () => {
    expect(pushTapTarget(shellPushTargetInput({ type: 'contact_joined', senderUsername: 'awa' }))).toEqual({
      route: 'userProfile',
      params: { username: 'awa' },
    });
  });

  test('« X était sur Meeshy récemment » mène la coque au profil du contact revenu (#8285)', () => {
    expect(pushTapTarget(shellPushTargetInput({ type: 'contact_recently_active', senderUsername: 'marie' }))).toEqual({
      route: 'userProfile',
      params: { username: 'marie' },
    });
  });
});

describe('startShellPush — l’entonnoir des notifications compte la coque (#10910)', () => {
  const NOTIFICATION_ID = '65f0c0ffee0000000000abcd';
  const POST_ID = '65f0c0ffee0000000000beef';

  test('toucher une bannière note « opened » sur le canal fcm, comme le worker web sur webpush', async () => {
    const h = harness(authenticated('u1'));
    await h.start();
    h.fire('pushNotificationActionPerformed', {
      actionId: 'tap',
      notification: { data: { notificationId: NOTIFICATION_ID, type: 'post_like', postId: POST_ID, title: 'Nour aime', body: 'secret' } },
    });
    expect(h.recorded).toEqual([
      {
        type: 'notification',
        action: 'opened',
        target: { kind: 'notification', id: NOTIFICATION_ID, parent: { kind: 'post', id: POST_ID } },
        surface: 'notifications',
        channel: 'fcm',
        notificationType: 'post_like',
      },
    ]);
  });

  test('un push reçu app ouverte note « received »', async () => {
    const h = harness(authenticated('u1'));
    await h.start();
    h.fire('pushNotificationReceived', { data: { notificationId: NOTIFICATION_ID, type: 'new_message', conversationId: 'c1', messageId: 'm1' } });
    expect(h.recorded).toEqual([
      {
        type: 'notification',
        action: 'received',
        target: { kind: 'notification', id: NOTIFICATION_ID },
        surface: 'notifications',
        channel: 'fcm',
        notificationType: 'new_message',
      },
    ]);
  });

  test('sans identifiant de notification valide, rien n’est noté ; un type illisible ne part pas', async () => {
    const h = harness(authenticated('u1'));
    await h.start();
    h.fire('pushNotificationActionPerformed', { actionId: 'tap', notification: { data: { notificationId: 'pas-un-id', type: 'post_like' } } });
    h.fire('pushNotificationReceived', { data: {} });
    h.fire('pushNotificationActionPerformed', { actionId: 'tap', notification: { data: { notificationId: NOTIFICATION_ID, type: 'type avec espaces' } } });
    expect(h.recorded).toEqual([
      { type: 'notification', action: 'opened', target: { kind: 'notification', id: NOTIFICATION_ID }, surface: 'notifications', channel: 'fcm' },
    ]);
  });
});
