import { describe, expect, test } from 'bun:test';

import type { CoqueNative } from '@/lib/native-shell';

import type { SessionStoreLike } from './delivery-receipt-credential';
import { bindShellCredential, startShellCredentialSync } from './shell-credential';

/**
 * #10662 — la coque Android connaît la session de la page à CHAQUE lancement,
 * indépendamment du socket et des appels (coupés dans la coque, #10611) : c'est
 * ce credential qui laisse un vocal s'écouter depuis sa notification (#10641),
 * accuser sa remise et rapporter son écoute sans la page.
 */

type Sent = { readonly method: string; readonly options: object };

const AUTHENTICATED = { status: 'authenticated', token: 'jwt', user: { id: 'u1' } };
const GUEST = (sessionToken: string) => ({ status: 'guest', sessionToken, guest: { conversationId: 'c1' } });
const SIGNED_OUT = { status: 'anonymous' };

function sessionHarness(initial: unknown) {
  let session = initial;
  const listeners: Array<(state: { readonly session: never }) => void> = [];
  const store = {
    getState: () => ({ session }),
    subscribe: (listener: (state: { readonly session: never }) => void) => {
      listeners.push(listener);
      return () => void listeners.splice(listeners.indexOf(listener), 1);
    },
  } as unknown as SessionStoreLike;
  const set = (next: unknown): void => {
    session = next;
    listeners.forEach((listener) => listener({ session: next as never }));
  };
  return { store, set, listeners };
}

function coque(platform: string, plugins: readonly string[], sent: Sent[]): CoqueNative {
  return {
    getPlatform: () => platform,
    PluginHeaders: plugins.map((name) => ({ name, methods: [] })),
    nativePromise: (_plugin: string, method: string, options: object) => {
      sent.push({ method, options });
      return Promise.resolve({});
    },
  } as unknown as CoqueNative;
}

describe('bindShellCredential — le credential suit la session, sans socket', () => {
  test('posé à l’instant pour une session tenue, retiré à la déconnexion', () => {
    const sent: Sent[] = [];
    const session = sessionHarness(AUTHENTICATED);
    bindShellCredential({
      native: (method, options) => {
        sent.push({ method, options });
        return Promise.resolve({});
      },
      sessionStore: session.store,
    });
    session.set(SIGNED_OUT);
    expect(sent.map((entry) => entry.method)).toEqual(['setCredential', 'clearCredential']);
    expect(sent[0]?.options).toMatchObject({ kind: 'registered', token: 'jwt' });
  });

  test('une session anonyme pose son jeton de session', () => {
    const sent: Sent[] = [];
    const session = sessionHarness(GUEST('s1'));
    bindShellCredential({
      native: (method, options) => {
        sent.push({ method, options });
        return Promise.resolve({});
      },
      sessionStore: session.store,
    });
    expect(sent[0]).toMatchObject({ method: 'setCredential', options: { kind: 'anonymous', token: 's1' } });
  });

  test('un plugin qui rejette ne casse pas l’abonnement', async () => {
    const sent: string[] = [];
    const session = sessionHarness(SIGNED_OUT);
    bindShellCredential({
      native: (method) => {
        sent.push(method);
        return Promise.reject(new Error('natif'));
      },
      sessionStore: session.store,
    });
    await Promise.resolve();
    session.set(GUEST('s2'));
    expect(sent).toEqual(['clearCredential', 'setCredential']);
  });
});

describe('startShellCredentialSync — démarré par la coque, une seule fois', () => {
  test('une coque Android qui déclare le pont reçoit le credential au lancement', () => {
    const sent: Sent[] = [];
    const session = sessionHarness(GUEST('s1'));
    const stop = startShellCredentialSync({ coque: coque('android', ['MeeshyCall'], sent), sessionStore: session.store });
    expect(sent.map((entry) => entry.method)).toEqual(['setCredential']);
    stop();
  });

  test('un second démarrage n’abonne pas deux fois', () => {
    const sent: Sent[] = [];
    const session = sessionHarness(GUEST('s1'));
    const shell = coque('android', ['MeeshyCall'], sent);
    const stop = startShellCredentialSync({ coque: shell, sessionStore: session.store });
    startShellCredentialSync({ coque: shell, sessionStore: session.store });
    expect(session.listeners.length).toBe(1);
    stop();
    expect(session.listeners.length).toBe(0);
  });

  test('iOS, le navigateur ou une coque sans le pont : rien ne part', () => {
    const sent: Sent[] = [];
    const session = sessionHarness(AUTHENTICATED);
    startShellCredentialSync({ coque: coque('ios', ['MeeshyCall'], sent), sessionStore: session.store })();
    startShellCredentialSync({ coque: coque('android', [], sent), sessionStore: session.store })();
    startShellCredentialSync({ coque: undefined, sessionStore: session.store })();
    expect(sent).toEqual([]);
  });
});
