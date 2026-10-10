import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/event-names';

import { conversationStore } from '@/lib/conversation-store';
import { resolveReaderLanguages } from '@/lib/reader';
import type { SocketAuth, SocketClient, SocketHandler } from '@/lib/net/socket';
import { handshakeAuth } from '@/lib/net/socket-io-factory';
import { createOutboxStore } from '@/lib/send/outbox-store';
import { localMessage, threadOf, threadPages } from '@/test-support/thread-cache';

import { messagesQueryKey } from './messages';
import { served } from './prism';
import { keepRealtimeConnection, realtimeIdentityOf } from './realtime-identity';
import type { AuthenticatedSession, SessionState } from './session';
import { createRealtimeConnection } from './socket';
import { createTypingStore } from './typing-store';

const account = (overrides: Partial<AuthenticatedSession> = {}): AuthenticatedSession => ({
  status: 'authenticated',
  user: { id: 'u-1', username: 'awa', displayName: 'Awa' },
  token: 'jwt-account',
  sessionToken: 'st-account',
  expiresAt: Date.now() + 3_600_000,
  ...overrides,
});

const guest = (held?: AuthenticatedSession): SessionState => ({
  status: 'guest',
  sessionToken: 'anon_guest',
  guest: { participantId: 'p-guest', nickname: 'Emma', conversationId: 'c-1', link: 'mshy_x', mayWrite: true, language: 'en' },
  expiresAt: Date.now() + 3_600_000,
  ...(held === undefined ? {} : { account: held }),
});

describe('le temps réel suit l’identité qui parle (#9724)', () => {
  test('un invité de lien ouvre SA connexion : la traduction de l’historique, poussée après son arrivée, doit pouvoir l’atteindre', () => {
    const identity = realtimeIdentityOf(guest());
    expect(identity).not.toBeNull();
    expect(identity?.auth).toEqual({ sessionToken: 'anon_guest' });
  });

  test('la poignée de main de l’invité ne porte AUCUN jeton : la passerelle le prend alors pour un anonyme (`_authenticateAnonymousUser`)', () => {
    const identity = realtimeIdentityOf(guest());
    if (identity === null) throw new Error('aucune connexion pour l’invité');
    expect('token' in handshakeAuth(identity.auth, {})).toBe(false);
  });

  test('un compte qui lit en anonyme ne prête rien de lui à la socket de l’invité', () => {
    const identity = realtimeIdentityOf(guest(account()));
    expect(identity?.auth).toEqual({ sessionToken: 'anon_guest' });
    expect(JSON.stringify(identity)).not.toContain('jwt-account');
    expect(JSON.stringify(identity)).not.toContain('st-account');
  });

  test('un compte se connecte par son jeton, comme avant', () => {
    expect(realtimeIdentityOf(account())?.auth).toEqual({ token: 'jwt-account', sessionToken: 'st-account' });
  });

  test('l’invité et le compte qu’il tient n’ont pas la même clé de connexion : la bascule reconstruit la socket', () => {
    const asGuest = realtimeIdentityOf(guest(account()));
    const asAccount = realtimeIdentityOf(account());
    expect(asGuest?.key).not.toBe(asAccount?.key);
  });

  test('un jeton renouvelé reconstruit la connexion du compte', () => {
    expect(realtimeIdentityOf(account())?.key).not.toBe(realtimeIdentityOf(account({ token: 'jwt-renewed' }))?.key);
  });

  test('sans identité — visiteur, double facteur en attente — aucune connexion', () => {
    expect(realtimeIdentityOf({ status: 'anonymous' })).toBeNull();
    expect(
      realtimeIdentityOf({
        status: 'pending2fa',
        twoFactorToken: 't2fa',
        user: { id: 'u-1', username: 'awa', email: 'a@b.c', firstName: 'A', lastName: 'W', displayName: 'Awa' },
      }),
    ).toBeNull();
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
      handlers.set(event, (handlers.get(event) ?? new Set()).add(handler as SocketHandler));
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

describe('le fil d’un invité bascule dans sa langue quand la traduction de l’historique arrive (#9724)', () => {
  test('la traduction poussée sur la socket de l’invité remplace le français déjà affiché, sans recharger', () => {
    const session = guest();
    const identity = realtimeIdentityOf(session);
    if (identity === null) throw new Error('aucune connexion pour l’invité');

    const socket = fakeSocket();
    const handshakes: SocketAuth[] = [];
    const queryClient = new QueryClient();
    const before = localMessage({ id: 'm-hote', originalLanguage: 'fr', content: 'On part à la mer en juillet', translations: [] });
    queryClient.setQueryData(messagesQueryKey('c-1'), threadPages([before]));
    createRealtimeConnection(identity.auth, {
      base: 'https://gate.staging.meeshy.me',
      socketFactory: ({ auth }) => {
        handshakes.push(auth);
        return socket;
      },
      queryClient,
      typing: createTypingStore(),
      conversationStore,
      outbox: createOutboxStore(),
      viewerId: () => 'p-guest',
      onClearSession: () => undefined,
    });
    expect(handshakes).toEqual([{ sessionToken: 'anon_guest' }]);

    const preferredLanguages = resolveReaderLanguages({ source: 'gateway', session });
    const textOf = () => {
      const message = threadOf(queryClient, 'c-1')?.messages.find((m) => m.id === 'm-hote');
      if (message === undefined) throw new Error('message absent du fil');
      return served({ preferredLanguages, originalLanguage: message.originalLanguage, translations: message.translations, original: message.content }).text;
    };
    expect(textOf()).toBe('On part à la mer en juillet');

    socket.fire(SERVER_EVENTS.MESSAGE_TRANSLATION, {
      messageId: 'm-hote',
      translations: [
        { id: 'm-hote-en', messageId: 'm-hote', sourceLanguage: 'fr', targetLanguage: 'en', translatedContent: 'We are going to the sea in July', translationModel: 'medium', cacheKey: 'k', cached: false },
      ],
    });

    expect(textOf()).toBe('We are going to the sea in July');
  });
});

describe('une connexion par identité — la règle que `realtime.ts` amorce (#9724)', () => {
  const keeper = () => {
    const opened: SocketAuth[] = [];
    const destroyed: SocketAuth[] = [];
    const announced: (SocketAuth | null)[] = [];
    const live = keepRealtimeConnection({
      open: (auth) => {
        opened.push(auth);
        return { auth, destroy: () => destroyed.push(auth) };
      },
      onChange: (next) => announced.push(next?.auth ?? null),
    });
    return { live, opened, destroyed, announced };
  };

  test('une session d’invité OUVRE une connexion, par son seul jeton de session', () => {
    const { live, opened, announced } = keeper();
    live.sync(guest());
    expect(opened).toEqual([{ sessionToken: 'anon_guest' }]);
    expect(announced).toEqual([{ sessionToken: 'anon_guest' }]);
  });

  test('la même identité garde sa connexion', () => {
    const { live, opened, destroyed } = keeper();
    live.sync(guest());
    live.sync(guest());
    expect(opened).toHaveLength(1);
    expect(destroyed).toHaveLength(0);
  });

  test('compte → invité → compte : chaque bascule ferme la socket quittée avant d’ouvrir la suivante', () => {
    const { live, opened, destroyed } = keeper();
    live.sync(account());
    live.sync(guest(account()));
    live.sync(account());
    expect(opened).toEqual([
      { token: 'jwt-account', sessionToken: 'st-account' },
      { sessionToken: 'anon_guest' },
      { token: 'jwt-account', sessionToken: 'st-account' },
    ]);
    expect(destroyed).toEqual([{ token: 'jwt-account', sessionToken: 'st-account' }, { sessionToken: 'anon_guest' }]);
  });

  test('l’invité qui part ferme sa connexion, et plus rien ne parle', () => {
    const { live, destroyed, announced } = keeper();
    live.sync(guest());
    live.sync({ status: 'anonymous' });
    expect(destroyed).toEqual([{ sessionToken: 'anon_guest' }]);
    expect(announced.at(-1)).toBeNull();
  });
});
