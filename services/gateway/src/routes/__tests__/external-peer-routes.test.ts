/**
 * Les routes de la porte « pair externe » (#17116) : ce que la coquille web
 * « ami WhatsApp » appelle au staging. Prouvées par le transport HTTP réel
 * (Fastify) contre le faux WhatsApp en mémoire et la VRAIE lecture libsignal.
 *
 * @jest-environment node
 */
import { describe, it, expect, afterAll } from '@jest/globals';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import { LibsignalDevices, realLibsignalMessages } from '../../services/e2ee/__tests__/libsignal-devices';
import { admitExternalPeer } from '../../services/external-peer/external-peer-gate';
import { createFakeWhatsAppPeer, memoryPeerStore, type PeerStore } from '../../services/external-peer/fake-whatsapp-peer';
import { EXTERNAL_PEER_ROUTE_CODES, externalPeerRoutesFor, registerExternalPeerRoutes } from '../external-peer';

const TEAM = 'a1'.repeat(12);
const MEMBER = 'b2'.repeat(12);
const ACCOUNTS: Record<string, { userId: string; role: string }> = {
  team: { userId: TEAM, role: 'MODERATOR' },
  member: { userId: MEMBER, role: 'USER' },
};
const HANDLE = '+447700900123';
const PLAINTEXT = 'Rendez-vous à 18 h devant la gare';

const friend = { side: 'external', network: 'whatsapp', handle: HANDLE, deviceId: 1 } as const;
const meeshyOf = (userId: string) => ({ side: 'meeshy', userId, deviceId: 7 }) as const;

const devices = new LibsignalDevices();
afterAll(() => devices.close());

type PublicDevice = {
  registrationId: number;
  identityKey: string;
  signedPreKey: { keyId: number; publicKey: string; signature: string };
  kyberLastResort: { keyId: number; publicKey: string; signature: string };
  oneTimePreKeys: { keyId: number; publicKey: string }[];
  kyberPreKeys: { keyId: number; publicKey: string; signature: string }[];
};

const testAuth = async (request: FastifyRequest) => {
  const account = ACCOUNTS[String(request.headers['x-test-user'] ?? '')];
  (request as unknown as { authContext: unknown }).authContext = account
    ? { isAuthenticated: true, isAnonymous: false, userId: account.userId, registeredUser: { id: account.userId, role: account.role } }
    : { isAuthenticated: false, isAnonymous: true };
};

async function buildApp(store: PeerStore = memoryPeerStore()) {
  const app: FastifyInstance = Fastify({ logger: false });
  const peer = admitExternalPeer(createFakeWhatsAppPeer({ store }), { libsignal: () => realLibsignalMessages, logger: { warn: () => undefined } });
  registerExternalPeerRoutes(app, { auth: testAuth, peer });
  await app.ready();
  return app;
}

const publication = (party: object, keys: PublicDevice) => ({
  party,
  registrationId: keys.registrationId,
  identityKey: keys.identityKey,
  signedPreKey: keys.signedPreKey,
  kyberLastResort: keys.kyberLastResort,
  oneTimePreKeys: keys.oneTimePreKeys,
  kyberPreKeys: keys.kyberPreKeys,
});

const post = (app: FastifyInstance, url: string, who: string | null, payload: unknown) =>
  app.inject({ method: 'POST', url: `/external-peer/whatsapp${url}`, headers: who ? { 'x-test-user': who } : {}, payload: payload as object });

describe('routes /external-peer/whatsapp — accès', () => {
  it('refuse un appelant sans compte, puis un compte qui n’est pas de l’équipe', async () => {
    const app = await buildApp();
    const keys = await devices.request<PublicDevice>('create', { name: 'rt-access', userId: TEAM });

    const anonymous = await post(app, '/bundles', null, publication(friend, keys));
    const member = await post(app, '/bundles', 'member', publication(friend, keys));

    expect(anonymous.statusCode).toBe(401);
    expect(member.statusCode).toBe(403);
    expect(member.json()).toMatchObject({ success: false, code: EXTERNAL_PEER_ROUTE_CODES.TEAM_ONLY });
  });

  it('laisse l’équipe jouer un appareil WhatsApp, jamais l’appareil Meeshy d’un autre compte', async () => {
    const app = await buildApp();
    const keys = await devices.request<PublicDevice>('create', { name: 'rt-impersonate', userId: TEAM });

    const asFriend = await post(app, '/bundles', 'team', publication(friend, keys));
    const asOther = await post(app, '/bundles', 'team', publication(meeshyOf(MEMBER), keys));
    const readOther = await post(app, '/envelopes/pending', 'team', meeshyOf(MEMBER));

    expect(asFriend.statusCode).toBe(201);
    expect(asOther.statusCode).toBe(403);
    expect(asOther.json()).toMatchObject({ code: EXTERNAL_PEER_ROUTE_CODES.NOT_YOUR_DEVICE });
    expect(readOther.statusCode).toBe(403);
  });

  it('rend le code de la porte quand elle refuse, sans recopier ce qui a été soumis', async () => {
    const app = await buildApp();

    const res = await post(app, '/bundles/query', 'team', { side: 'external', network: 'whatsapp', handle: HANDLE });
    const malformed = await post(app, '/envelopes', 'team', { from: friend, to: meeshyOf(TEAM), type: 2, body: 'pas du base64 !' });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ code: 'EXTERNAL_PEER_UNKNOWN' });
    expect(malformed.statusCode).toBe(400);
    expect(malformed.body).not.toContain('pas du base64');
  });
});

describe('routes /external-peer/whatsapp — un aller-retour chiffré, aucun clair au serveur', () => {
  it('relaie un message libsignal de Meeshy à l’ami et sa réponse, et refuse un clair', async () => {
    const store = memoryPeerStore();
    const app = await buildApp(store);
    const me = meeshyOf(TEAM);
    const meAddress = { name: TEAM, deviceId: 7 };
    const friendAddress = { name: HANDLE, deviceId: 1 };
    const meKeys = await devices.request<PublicDevice>('create', { name: 'rt-me', userId: TEAM });
    const friendKeys = await devices.request<PublicDevice>('create', { name: 'rt-friend', userId: TEAM });

    expect((await post(app, '/bundles', 'team', publication(me, meKeys))).statusCode).toBe(201);
    expect((await post(app, '/bundles', 'team', publication(friend, friendKeys))).statusCode).toBe(201);
    const query = await post(app, '/bundles/query', 'team', { side: 'external', network: 'whatsapp', handle: HANDLE });
    const [bundle] = query.json().data.bundles;

    const sealed = await devices.request<{ type: 2 | 3; body: string }>('encrypt', {
      from: 'rt-me', fromAddress: meAddress, toAddress: friendAddress, bundle, plaintext: PLAINTEXT,
    });
    const plaintextAttempt = await post(app, '/envelopes', 'team', {
      from: me, to: friend, type: 2, body: Buffer.from(PLAINTEXT).toString('base64'),
    });
    const delivered = await post(app, '/envelopes', 'team', { from: me, to: friend, type: sealed.type, body: sealed.body });
    const pending = await post(app, '/envelopes/pending', 'team', friend);
    const [envelope] = pending.json().data.envelopes;
    const opened = await devices.request<{ plaintext: string }>('decrypt', {
      to: 'rt-friend', toAddress: friendAddress, fromAddress: meAddress, type: envelope.type, body: envelope.body,
    });
    const ack = await post(app, '/envelopes/ack', 'team', { recipient: friend, envelopeIds: [envelope.envelopeId] });

    const reply = await devices.request<{ type: 2 | 3; body: string }>('encrypt', {
      from: 'rt-friend', fromAddress: friendAddress, toAddress: meAddress, plaintext: 'Bien reçu',
    });
    await post(app, '/envelopes', 'team', { from: friend, to: me, type: reply.type, body: reply.body });
    const [answer] = (await post(app, '/envelopes/pending', 'team', me)).json().data.envelopes;
    const read = await devices.request<{ plaintext: string }>('decrypt', {
      to: 'rt-me', toAddress: meAddress, fromAddress: friendAddress, type: answer.type, body: answer.body,
    });

    expect(plaintextAttempt.statusCode).toBe(422);
    expect(plaintextAttempt.json()).toMatchObject({ code: 'EXTERNAL_PEER_PLAINTEXT_REFUSED' });
    expect(delivered.statusCode).toBe(202);
    expect(opened.plaintext).toBe(PLAINTEXT);
    expect(ack.json()).toMatchObject({ success: true, data: { removed: 1 } });
    expect(read.plaintext).toBe('Bien reçu');
    const kept = await Promise.all((await store.keys('*')).map((key) => store.get(key)));
    expect(kept.join('\n')).not.toContain(PLAINTEXT);
    expect(kept.join('\n')).not.toContain(Buffer.from(PLAINTEXT).toString('base64'));
  });
});

describe('routes /external-peer/whatsapp — montées au staging seulement', () => {
  const plugin = (env: Record<string, string | undefined>) =>
    externalPeerRoutesFor({ env, store: memoryPeerStore(), libsignal: () => realLibsignalMessages, auth: testAuth, coquilleDirectory: null });

  it.each([
    ['production déclarée', { NODE_ENV: 'production', EXTERNAL_PEER_PROVIDER: 'fake-whatsapp' }],
    ['staging sans le faux demandé', { NODE_ENV: 'production', MEESHY_ENV: 'staging' }],
    ['environnement inconnu', { EXTERNAL_PEER_PROVIDER: 'fake-whatsapp' }],
  ])('ne monte aucune route en %s', async (_label, env) => {
    const app = Fastify({ logger: false });
    await app.register(plugin(env));
    await app.ready();

    const res = await app.inject({ method: 'POST', url: '/external-peer/whatsapp/envelopes/pending', headers: { 'x-test-user': 'team' }, payload: friend });

    expect(res.statusCode).toBe(404);
  });

  it('monte la porte au staging déclaré qui demande le faux WhatsApp', async () => {
    const app = Fastify({ logger: false });
    await app.register(plugin({ NODE_ENV: 'production', MEESHY_ENV: 'staging', EXTERNAL_PEER_PROVIDER: 'fake-whatsapp' }));
    await app.ready();

    const res = await app.inject({ method: 'POST', url: '/external-peer/whatsapp/envelopes/pending', headers: { 'x-test-user': 'team' }, payload: friend });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ success: true, data: { envelopes: [] } });
  });
});
