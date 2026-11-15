import { describe, expect, test } from 'bun:test';

import type { LinkDeviceSecrets } from '../links/link-device-secret';
import { createAuthClient } from './auth';
import type { ApiResult, HttpRequest } from './http';
import { createSessionStore } from './session';

/**
 * #10872 — LE LIEN DE CONNEXION EST LIÉ À L'APPAREIL QUI L'A DEMANDÉ. Vrai
 * client d'authentification, vrai magasin de session ; seul le transport est
 * un enregistreur, et le secret un double qui compte ses oublis.
 */

function memoryStore() {
  const raw = new Map<string, string>();
  return createSessionStore({
    storage: {
      getItem: (key) => raw.get(key) ?? null,
      setItem: (key, value) => {
        raw.set(key, value);
      },
      removeItem: (key) => {
        raw.delete(key);
      },
    },
    now: () => Date.UTC(2026, 9, 17, 8, 0, 0),
  });
}

function secretsDouble(initial: string | null) {
  const state = { secret: initial, forgotten: 0 };
  const secrets: LinkDeviceSecrets = {
    issue: async () => {
      state.secret = 'secret-neuf-de-la-demande-0123456789abcdef';
      return 'a'.repeat(64);
    },
    presented: () => state.secret,
    forget: () => {
      state.forgotten += 1;
      state.secret = null;
    },
  };
  return { secrets, state };
}

function client(responses: ReadonlyArray<ApiResult<unknown>>, initialSecret: string | null) {
  const calls: HttpRequest[] = [];
  const store = memoryStore();
  const { secrets, state } = secretsDouble(initialSecret);
  let i = 0;
  const auth = createAuthClient({
    store,
    linkSecrets: secrets,
    transport: {
      request: async <T>(request: HttpRequest) => {
        calls.push(request);
        const response = responses[Math.min(i, responses.length - 1)];
        i += 1;
        return response as ApiResult<T>;
      },
    },
  });
  return { auth, calls, store, state };
}

const ADA = { id: 'u-ada', username: 'ada', displayName: 'Ada' };
const SESSION = { user: ADA, token: 'jwt-ada', sessionToken: 'sess-ada', expiresIn: 3_600 };
const QUESTION = { requiresConfirmation: true, account: { id: 'u-ada', username: 'ada', displayName: 'Ada', avatar: null } };
const SECRET = 'secret-gardé-0123456789abcdefghijklmnop';

describe('la demande attache l’empreinte du secret', () => {
  test('`POST /auth/magic-link/request` porte `linkDeviceHash`', async () => {
    const { auth, calls } = client([{ ok: true, status: 200, data: { expiresInSeconds: 900 } }], null);

    await auth.requestMagicLink({ email: 'ada@x.io' });

    expect(calls[0]?.body).toEqual({ email: 'ada@x.io', linkDeviceHash: 'a'.repeat(64) });
  });
});

type Consume = (auth: ReturnType<typeof client>['auth'], confirm?: boolean) => Promise<ApiResult<object>>;

const LINKS: ReadonlyArray<readonly [string, Consume]> = [
  ['le lien de vérification', (auth, confirm) => auth.verifyEmail({ email: 'ada@x.io', token: 'tok', ...(confirm ? { confirm } : {}) })],
  ['le lien magique', (auth, confirm) => auth.validateMagicLink('tok', confirm ? { confirm } : {})],
];

describe.each(LINKS)('%s', (_cas, consume) => {
  test('même appareil : le secret part avec le jeton, la session se pose sans question, le secret est oublié', async () => {
    const { auth, calls, store, state } = client([{ ok: true, status: 200, data: SESSION }], SECRET);

    await consume(auth);

    expect(calls[0]?.body).toMatchObject({ token: 'tok', linkDeviceSecret: SECRET });
    expect((calls[0]?.body as Record<string, unknown>).confirm).toBeUndefined();
    expect(store.getState().session.status).toBe('authenticated');
    expect(state.forgotten).toBe(1);
  });

  test('ouvert ailleurs : aucune session posée, le secret reste pour le « oui »', async () => {
    const { auth, calls, store, state } = client([{ ok: true, status: 200, data: QUESTION }], null);

    const result = await consume(auth);

    expect(result.ok ? (result.data as { requiresConfirmation?: boolean }).requiresConfirmation : null).toBe(true);
    expect((calls[0]?.body as Record<string, unknown>).linkDeviceSecret).toBeUndefined();
    expect(store.getState().session.status).toBe('anonymous');
    expect(state.forgotten).toBe(0);
  });

  test('le « oui » rejoue avec `confirm: true` et pose la session', async () => {
    const { auth, calls, store } = client([{ ok: true, status: 200, data: SESSION }], null);

    await consume(auth, true);

    expect(calls[0]?.body).toMatchObject({ token: 'tok', confirm: true });
    expect(store.getState().session.status).toBe('authenticated');
  });

  test('un jeton refusé (400) ou une panne réseau GARDENT le secret : un vieux lien ne délie pas le lien en cours (comme iOS)', async () => {
    const refused = client([{ ok: false, status: 400, error: 'Lien invalide' }], SECRET);
    const offline = client([{ ok: false, status: 0, error: 'offline' }], SECRET);

    await consume(refused.auth);
    await consume(offline.auth);

    expect(refused.state.forgotten).toBe(0);
    expect(offline.state.forgotten).toBe(0);
  });
});

describe('le code saisi ne présente jamais le secret', () => {
  test('`verifyEmail({ code })` n’envoie ni secret ni confirmation, et ne l’oublie pas', async () => {
    const { auth, calls, state } = client([{ ok: true, status: 200, data: SESSION }], SECRET);

    await auth.verifyEmail({ email: 'ada@x.io', code: '123456' });

    expect(calls[0]?.body).toEqual({ email: 'ada@x.io', code: '123456' });
    expect(state.forgotten).toBe(0);
  });
});
