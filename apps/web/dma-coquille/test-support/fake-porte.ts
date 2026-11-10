/**
 * La DOUBLURE HTTP de la passerelle de staging pour les témoins de la coquille
 * (#17116) : connexion, page de la coquille et routes de la porte « pair
 * externe », avec les mêmes refus que `services/gateway/src/routes/external-peer.ts`
 * (équipe seulement, appareil Meeshy d'un autre compte, pair inconnu, pré-clé
 * unique servie une fois).
 *
 * Le refus d'un clair y est une APPROXIMATION : la passerelle lit le corps par
 * libsignal ; la doublure n'accepte qu'un premier octet de version libsignal
 * (0x33, 0x44). Elle ne prouve donc rien de la porte réelle, seulement le
 * comportement de la coquille face à ses réponses.
 */
import type { FetchLike, OutboundEnvelope, PorteBundle, PorteEnvelope, PorteParty, PortePublication, PorteUser } from '../porte-client';

type Account = { readonly password: string; readonly userId: string; readonly role: string };

/** Ce que la doublure sert de la coquille : sa page toujours, son module et le WASM du pont sauf mention contraire. */
export type FakeCoquille = { readonly module?: boolean; readonly wasm?: boolean; readonly csp?: string };

export type FakePorteOptions = {
  readonly accounts: Readonly<Record<string, Account>>;
  readonly acceptsPlaintext?: boolean;
  readonly coquille?: FakeCoquille;
};

/** La politique de contenu de la vraie coquille (`services/gateway/src/routes/external-peer.ts`), dans ce qu'elle a d'utile au témoin. */
const COQUILLE_CSP = "default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self'; frame-ancestors 'none'";
const WASM_MAGIC = Uint8Array.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);
const COQUILLE_PATH = '/api/v1/external-peer/whatsapp/coquille/';

type Served = { readonly status: number; readonly contentType: string; readonly bytes: Uint8Array; readonly csp: string | null };

const servedFile = (status: number, contentType: string, bytes: Uint8Array, csp: string | null): Served => ({ status, contentType, bytes, csp });

const coquilleFile = (name: string, { module = true, wasm = true, csp = COQUILLE_CSP }: FakeCoquille): Served | null => {
  const encoded = (text: string) => new TextEncoder().encode(text);
  if (name === '') return servedFile(200, 'text/html; charset=utf-8', encoded('<!doctype html><main data-coquille></main><script type="module" src="./coquille.js"></script>'), csp);
  if (name === 'coquille.js' && module) return servedFile(200, 'text/javascript; charset=utf-8', encoded('export {};'), csp);
  if (name === 'libsignal_wasm_bg.wasm' && wasm) return servedFile(200, 'application/wasm', WASM_MAGIC, csp);
  if (name === 'coquille.js' || name === 'libsignal_wasm_bg.wasm') return servedFile(404, 'application/json; charset=utf-8', encoded('{"success":false}'), null);
  return null;
};

type Reply = { readonly status: number; readonly payload: unknown };

const TEAM_ROLES = new Set(['MODERATOR', 'ADMIN', 'BIGBOSS']);
const LIBSIGNAL_VERSION_BYTES = new Set([0x33, 0x44]);

const ok = (data: unknown, status = 200): Reply => ({ status, payload: { success: true, data } });
const refused = (status: number, code: string): Reply => ({ status, payload: { success: false, error: code, code } });

const userKey = (user: PorteUser): string => (user.side === 'meeshy' ? `m:${user.userId}` : `x:${user.handle}`);
const partyKey = (party: PorteParty): string => `${userKey(party.side === 'meeshy' ? { side: 'meeshy', userId: party.userId } : { side: 'external', network: 'whatsapp', handle: party.handle })}:${party.deviceId}`;

const decoded = (base64: string): string => {
  try {
    return new TextDecoder().decode(Uint8Array.from(atob(base64), (character) => character.charCodeAt(0)));
  } catch {
    return '';
  }
};

type FakeState = {
  readonly bundles: Map<string, PortePublication>;
  readonly claimed: Set<string>;
  readonly queues: Map<string, readonly PorteEnvelope[]>;
  readonly published: PortePublication[];
  readonly wire: string[];
  readonly enqueue: (envelope: OutboundEnvelope) => string;
};

const serveBundles = ({ bundles, claimed }: FakeState, user: PorteUser): readonly PorteBundle[] =>
  [...bundles.entries()]
    .filter(([key]) => key.startsWith(`${userKey(user)}:`))
    .map(([key, publication]) => {
      const preKey = publication.oneTimePreKeys.find((candidate) => !claimed.has(`${key}:ec:${candidate.keyId}`)) ?? null;
      const kyber = publication.kyberPreKeys.find((candidate) => !claimed.has(`${key}:kyber:${candidate.keyId}`));
      if (preKey) claimed.add(`${key}:ec:${preKey.keyId}`);
      if (kyber) claimed.add(`${key}:kyber:${kyber.keyId}`);
      return {
        deviceId: publication.party.deviceId,
        registrationId: publication.registrationId,
        identityKey: publication.identityKey,
        signedPreKey: publication.signedPreKey,
        kyberPreKey: kyber ? { ...kyber, lastResort: false } : { ...publication.kyberLastResort, lastResort: true },
        preKey,
      };
    });

const actorOf = (path: string, body: Readonly<Record<string, unknown>>): PorteParty | undefined =>
  ((path === '/bundles' ? body.party : path === '/envelopes' ? body.from : path === '/envelopes/ack' ? body.recipient : body) as PorteParty | undefined);

const acknowledge = ({ queues }: FakeState, body: Readonly<Record<string, unknown>>): Reply => {
  const recipient = partyKey(body.recipient as PorteParty);
  const ids = new Set(body.envelopeIds as readonly string[]);
  const before = queues.get(recipient) ?? [];
  queues.set(recipient, before.filter((envelope) => !ids.has(envelope.envelopeId)));
  return ok({ removed: before.length - (queues.get(recipient)?.length ?? 0) });
};

const porteRoute = (state: FakeState, acceptsPlaintext: boolean, path: string, account: Account, body: Readonly<Record<string, unknown>>): Reply => {
  if (!TEAM_ROLES.has(account.role)) return refused(403, 'EXTERNAL_PEER_TEAM_ONLY');
  const actor = actorOf(path, body);
  if (path !== '/bundles/query' && actor?.side === 'meeshy' && actor.userId !== account.userId) return refused(403, 'EXTERNAL_PEER_NOT_YOUR_DEVICE');
  switch (path) {
    case '/bundles': {
      const publication = body as unknown as PortePublication;
      state.published.push(publication);
      state.bundles.set(partyKey(publication.party), publication);
      return ok({ published: true }, 201);
    }
    case '/bundles/query': {
      const served = serveBundles(state, body as unknown as PorteUser);
      return served.length === 0 ? refused(404, 'EXTERNAL_PEER_UNKNOWN') : ok({ bundles: served });
    }
    case '/envelopes': {
      const envelope = body as unknown as OutboundEnvelope;
      if (!acceptsPlaintext && !LIBSIGNAL_VERSION_BYTES.has(atob(envelope.body).charCodeAt(0))) return refused(422, 'EXTERNAL_PEER_PLAINTEXT_REFUSED');
      return ok({ envelopeId: state.enqueue(envelope), acceptedAt: new Date().toISOString() }, 202);
    }
    case '/envelopes/pending':
      return ok({ envelopes: state.queues.get(partyKey(body as unknown as PorteParty)) ?? [] });
    case '/envelopes/ack':
      return acknowledge(state, body);
    default:
      return refused(404, 'NOT_FOUND');
  }
};

const newState = (): FakeState => {
  const queues = new Map<string, readonly PorteEnvelope[]>();
  const wire: string[] = [];
  let counter = 0;
  const enqueue = (envelope: OutboundEnvelope): string => {
    counter += 1;
    const envelopeId = `00000000-0000-4000-8000-${String(counter).padStart(12, '0')}`;
    const queued: PorteEnvelope = { envelopeId, from: envelope.from, type: envelope.type, body: envelope.body, acceptedAt: new Date(counter).toISOString() };
    queues.set(partyKey(envelope.to), [...(queues.get(partyKey(envelope.to)) ?? []), queued]);
    wire.push(decoded(envelope.body));
    return envelopeId;
  };
  return { bundles: new Map(), claimed: new Set(), queues, published: [], wire, enqueue };
};

export const createFakePorte = ({ accounts, acceptsPlaintext = false, coquille = {} }: FakePorteOptions) => {
  const tokens = new Map<string, Account>(Object.entries(accounts).map(([name, account]) => [`jeton-${name}`, account]));
  const state = newState();

  const route = (url: string, method: string, headers: Readonly<Record<string, string>>, body: Readonly<Record<string, unknown>>): Reply | Served => {
    const path = new URL(url).pathname;
    const file = method === 'GET' && path.startsWith(COQUILLE_PATH) ? coquilleFile(path.slice(COQUILLE_PATH.length), coquille) : null;
    if (file) return file;
    if (path === '/api/v1/auth/login') {
      const account = accounts[String(body.username)];
      return account && account.password === body.password ? ok({ token: `jeton-${String(body.username)}`, user: { id: account.userId } }) : refused(401, 'INVALID_CREDENTIALS');
    }
    const account = tokens.get((headers.authorization ?? '').replace(/^Bearer /, ''));
    if (!account) return refused(401, 'UNAUTHORIZED');
    return porteRoute(state, acceptsPlaintext, path.replace('/api/v1/external-peer/whatsapp', ''), account, body);
  };

  const fetch: FetchLike = async (url, init) => {
    const body = init.body ? (JSON.parse(init.body) as Record<string, unknown>) : {};
    if (init.body) state.wire.push(init.body);
    const reply = route(url, init.method, init.headers, body);
    const served = 'bytes' in reply ? reply : servedFile(reply.status, 'application/json; charset=utf-8', new TextEncoder().encode(JSON.stringify(reply.payload)), null);
    const text = new TextDecoder().decode(served.bytes);
    state.wire.push(text);
    const headerOf: Readonly<Record<string, string | null>> = { 'content-type': served.contentType, 'content-security-policy': served.csp };
    return {
      status: served.status,
      headers: { get: (name: string) => headerOf[name.toLowerCase()] ?? null },
      json: async () => JSON.parse(text) as unknown,
      text: async () => text,
      arrayBuffer: async () => served.bytes.slice().buffer,
    };
  };

  return {
    fetch,
    tokenOf: (name: string): string => `jeton-${name}`,
    publications: (): readonly PortePublication[] => state.published,
    pendingCount: (): number => [...state.queues.values()].reduce((total, queue) => total + queue.length, 0),
    wire: (): string => state.wire.join('\n'),
    inject: (envelope: OutboundEnvelope): void => {
      state.enqueue(envelope);
    },
  };
};
