/**
 * #9616 (constats serveur-notifications-1, serveur-transport-4, android-systeme-1, #18910) —
 * **le jeton push vit et meurt avec la session qui l'a enregistré.** Sans ce lien, l'appareil
 * d'un intrus (ou le téléphone volé) dont la session vient d'être révoquée reste destinataire :
 * aperçu, nom de l'expéditeur, avatar et vignette s'affichent sur son écran verrouillé.
 *
 * Les jetons sont enregistrés PAR LA ROUTE publique, sous le `sid` du JWT, puis la session se
 * ferme par chaque porte (révocation, déconnexion, « partout ») : aucune ligne n'est semée à la
 * main, sauf l'héritage d'avant le lien (sessionId nul).
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { createHash } from 'crypto';
import { pushTokenRoutes } from '../../../routes/push-tokens';
import {
  endCurrentSession,
  initSessionService,
  invalidateAllSessions,
  invalidateSession,
  logout,
  revokeSession,
} from '../../../services/SessionService';
import { createFakeE2EEStore } from '../../../services/e2ee/__tests__/fake-e2ee-store';

const ALICE = 'a1'.repeat(12);
const BOB = 'b2'.repeat(12);
const S1 = 'c3'.repeat(12);
const S2 = 'd4'.repeat(12);
const S3 = 'e5'.repeat(12);
const TOKEN_S1 = 'jeton-de-la-session-1';

type Handler = (request: unknown, reply: unknown) => Promise<unknown>;

function harness() {
  const store = createFakeE2EEStore();
  const hash = (value: string) => createHash('sha256').update(value).digest('hex');
  [[S1, TOKEN_S1], [S2, 'jeton-de-la-session-2']].forEach(([id, token]) => {
    store.collections.UserSession.insert({ id, userId: ALICE, isValid: true, sessionToken: hash(token), expiresAt: new Date(Date.now() + 86_400_000) });
  });
  initSessionService(store.prisma as never);
  const routes: Record<string, Handler> = {};
  const fastify = {
    prisma: store.prisma,
    authenticate: () => undefined,
    log: { info: () => undefined, warn: () => undefined, error: () => undefined },
    get: () => undefined,
    post: (path: string, _options: unknown, handler: Handler) => { routes[`POST ${path}`] = handler; },
    delete: (path: string, _options: unknown, handler: Handler) => { routes[`DELETE ${path}`] = handler; },
  };
  pushTokenRoutes(fastify as never);
  const reply = () => {
    const out = { statusCode: 200, body: undefined as unknown, status(code: number) { out.statusCode = code; return out; }, send(body: unknown) { out.body = body; return out; } };
    return out;
  };
  const request = (sessionId: string | undefined, body: Record<string, unknown>, userId = ALICE) => ({
    body, headers: {}, params: {}, query: {},
    authContext: { isAuthenticated: true, registeredUser: { id: userId }, userId, sessionId },
  });
  const register = async (sessionId: string | undefined, body: Record<string, unknown>) => {
    await routes['POST /users/register-device-token'](request(sessionId, body), reply());
  };
  const active = () => store.collections.PushToken.rows.filter((row) => row.isActive === true).map((row) => `${row.type}:${row.token}`).sort();
  return { store, register, active, request, reply, routes };
}

const apns = (token = 'apns-token-de-la-session-1') => ({ token, type: 'apns', platform: 'ios', deviceId: 'iphone-1' });
const fcm = (token = 'fcm-token-de-la-session-2') => ({ token, type: 'fcm', platform: 'android', deviceId: 'pixel-2' });

describe("l'enregistrement d'un jeton push le rattache à la session appelante", () => {
  it('pose le sid du JWT à la création, et le reprend à la réinscription par une autre session', async () => {
    const { store, register } = harness();

    await register(S1, apns());
    expect(store.collections.PushToken.rows[0].sessionId).toBe(S1);

    await register(S2, apns());
    expect(store.collections.PushToken.rows).toHaveLength(1);
    expect(store.collections.PushToken.rows[0].sessionId).toBe(S2);
  });

  it("un ancien client sans sid enregistre toujours, et ne perd pas le lien déjà posé", async () => {
    const { store, register } = harness();
    await register(S1, apns());

    await register(undefined, apns());

    expect(store.collections.PushToken.rows[0].sessionId).toBe(S1);
    expect(store.collections.PushToken.rows[0].isActive).toBe(true);
  });
});

describe('la fin de session retire les jetons push de CETTE session', () => {
  it("révocation unitaire : le jeton de S1 part, celui de S2 reste", async () => {
    const { register, active } = harness();
    await register(S1, apns());
    await register(S2, fcm());

    await revokeSession(ALICE, S1);

    expect(active()).toEqual(['fcm:fcm-token-de-la-session-2']);
  });

  it("retrait par l'admin (invalidateSession) : tous les types du jeton de la session, voip compris", async () => {
    const { register, active } = harness();
    await register(S1, apns());
    await register(S1, { token: 'voip-token-de-la-session-1', type: 'voip', platform: 'ios', deviceId: 'iphone-1' });
    await register(S2, fcm());

    await invalidateSession(S1, 'admin_revoked');

    expect(active()).toEqual(['fcm:fcm-token-de-la-session-2']);
  });

  it('déconnexion par le jeton de session (condensat)', async () => {
    const { register, active } = harness();
    await register(S1, apns());
    await register(S2, fcm());

    await logout(TOKEN_S1);

    expect(active()).toEqual(['fcm:fcm-token-de-la-session-2']);
  });

  it('déconnexion de la session courante nommée par son sid', async () => {
    const { register, active } = harness();
    await register(S1, apns());
    await register(S2, fcm());

    await endCurrentSession(ALICE, { sessionId: S2, sessionToken: null });

    expect(active()).toEqual(['apns:apns-token-de-la-session-1']);
  });

  it("« ce n'était pas moi » (révoquer tout, sans exception) : plus aucun jeton, la ligne héritée sans session comprise", async () => {
    const { store, register, active } = harness();
    await register(S1, apns());
    await register(S2, fcm());
    store.collections.PushToken.insert({ userId: ALICE, token: 'jeton-herite-sans-session', type: 'fcm', platform: 'android', sessionId: null, isActive: true });

    await invalidateAllSessions(ALICE);

    expect(active()).toEqual([]);
  });

  it('révoquer les AUTRES sessions : le jeton de la session gardée reste, les autres partent', async () => {
    const { register, active } = harness();
    await register(S1, apns());
    await register(S2, fcm());

    await invalidateAllSessions(ALICE, { sessionId: S2, sessionToken: null });

    expect(active()).toEqual(['fcm:fcm-token-de-la-session-2']);
  });

  it("non-régression : une ligne héritée sans session survit à la déconnexion d'UN appareil tant qu'une autre session vit", async () => {
    const { store, register, active } = harness();
    await register(S1, apns());
    store.collections.PushToken.insert({ userId: ALICE, token: 'jeton-herite-sans-session', type: 'fcm', platform: 'android', sessionId: null, isActive: true });

    await logout(TOKEN_S1);

    expect(active()).toEqual(['fcm:jeton-herite-sans-session']);
  });

  it("ne touche jamais le jeton d'un autre compte", async () => {
    const { store, register, active } = harness();
    await register(S1, apns());
    store.collections.PushToken.insert({ userId: BOB, token: 'jeton-de-bob-pour-son-telephone', type: 'fcm', platform: 'android', sessionId: S1, isActive: true });

    await invalidateAllSessions(ALICE);

    expect(active()).toEqual(['fcm:jeton-de-bob-pour-son-telephone']);
  });

  it('un jeton PushToTalk part toujours (suppression), les autres sont désactivés', async () => {
    const { store, register } = harness();
    await register(S1, apns());
    store.collections.PushToken.insert({ userId: ALICE, token: 'jeton-pushtotalk-de-s1', type: 'pushtotalk', platform: 'ios', sessionId: S1, isActive: true });

    await invalidateSession(S1, 'user_revoked');

    expect(store.collections.PushToken.rows.map((row) => `${row.type}:${row.isActive}`)).toEqual(['apns:false']);
  });

  it("un appareil qui se réenregistre après une nouvelle connexion redevient destinataire", async () => {
    const { register, active } = harness();
    await register(S1, apns());
    await invalidateSession(S1, 'user_revoked');
    expect(active()).toEqual([]);

    await register(S2, apns());

    expect(active()).toEqual(['apns:apns-token-de-la-session-1']);
  });
});

describe("une réinscription concurrente de la fin de session n'est pas éteinte par elle", () => {
  type UpdateMany = (args: unknown) => Promise<{ count: number }>;

  /** La fin de session a lu les jetons ; l'appareil se reconnecte et réinscrit le sien juste AVANT qu'elle ne les retire. */
  function interleaved(store: ReturnType<typeof harness>['store'], reconnect: () => Promise<void>) {
    const write = store.prisma.pushToken.updateMany as unknown as UpdateMany;
    let fired = false;
    const updateMany: UpdateMany = async (args) => {
      if (!fired) {
        fired = true;
        await reconnect();
      }
      return write(args);
    };
    initSessionService({ ...store.prisma, pushToken: { ...store.prisma.pushToken, updateMany } } as never);
  }

  it('révocation unitaire : le jeton que la nouvelle session vient de reprendre reste actif', async () => {
    const { store, register, active } = harness();
    await register(S1, apns());
    interleaved(store, () => register(S2, apns()));

    await revokeSession(ALICE, S1);

    expect(active()).toEqual(['apns:apns-token-de-la-session-1']);
    expect(store.collections.PushToken.rows[0].sessionId).toBe(S2);
  });

  it('révoquer les autres sessions : le jeton repris par la session gardée reste actif', async () => {
    const { store, register, active } = harness();
    await register(S1, apns());
    interleaved(store, () => register(S2, apns()));

    await invalidateAllSessions(ALICE, { sessionId: S2, sessionToken: null });

    expect(active()).toEqual(['apns:apns-token-de-la-session-1']);
  });

  it("une ligne héritée reprise par une session vivante n'est pas éteinte par la révocation totale qui l'avait lue", async () => {
    const { store, register, active } = harness();
    store.collections.PushToken.insert({ userId: ALICE, token: 'apns-token-de-la-session-1', type: 'apns', platform: 'ios', sessionId: null, isActive: true });
    interleaved(store, async () => {
      store.collections.UserSession.insert({ id: S3, userId: ALICE, isValid: true, sessionToken: 'condensat-s3', expiresAt: new Date(Date.now() + 86_400_000) });
      await register(S3, apns());
    });

    await invalidateAllSessions(ALICE);

    expect(active()).toEqual(['apns:apns-token-de-la-session-1']);
  });
});

describe('DELETE /users/register-device-token {deviceId}', () => {
  it("retire tous les types de jeton de l'appareil pour ce compte, et lui seul", async () => {
    const { store, register, routes, request, reply } = harness();
    await register(S1, apns());
    await register(S1, { token: 'voip-token-de-la-session-1', type: 'voip', platform: 'ios', deviceId: 'iphone-1' });
    await register(S2, fcm());

    await routes['DELETE /users/register-device-token'](request(S1, { deviceId: 'iphone-1' }), reply());

    expect(store.collections.PushToken.rows.map((row) => row.type)).toEqual(['fcm']);
  });
});
