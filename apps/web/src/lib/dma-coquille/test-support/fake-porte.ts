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

export type FakePorteOptions = {
  readonly accounts: Readonly<Record<string, Account>>;
  readonly acceptsPlaintext?: boolean;
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

export const createFakePorte = ({ accounts, acceptsPlaintext = false }: FakePorteOptions) => {
  const tokens = new Map<string, Account>(Object.entries(accounts).map(([name, account]) => [`jeton-${name}`, account]));
  const bundles = new Map<string, PortePublication>();
  const claimed = new Set<string>();
  const queues = new Map<string, readonly PorteEnvelope[]>();
  const published: PortePublication[] = [];
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

  const serve = (user: PorteUser): readonly PorteBundle[] =>
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

  const porte = (path: string, account: Account, body: Readonly<Record<string, unknown>>): Reply => {
    if (!TEAM_ROLES.has(account.role)) return refused(403, 'EXTERNAL_PEER_TEAM_ONLY');
    const actor = (path === '/bundles' ? body.party : path === '/envelopes' ? body.from : path === '/envelopes/ack' ? body.recipient : body) as PorteParty | undefined;
    if (path !== '/bundles/query' && actor?.side === 'meeshy' && actor.userId !== account.userId) return refused(403, 'EXTERNAL_PEER_NOT_YOUR_DEVICE');
    switch (path) {
      case '/bundles': {
        const publication = body as unknown as PortePublication;
        published.push(publication);
        bundles.set(partyKey(publication.party), publication);
        return ok({ published: true }, 201);
      }
      case '/bundles/query': {
        const served = serve(body as unknown as PorteUser);
        return served.length === 0 ? refused(404, 'EXTERNAL_PEER_UNKNOWN') : ok({ bundles: served });
      }
      case '/envelopes': {
        const envelope = body as unknown as OutboundEnvelope;
        const first = atob(envelope.body).charCodeAt(0);
        if (!acceptsPlaintext && !LIBSIGNAL_VERSION_BYTES.has(first)) return refused(422, 'EXTERNAL_PEER_PLAINTEXT_REFUSED');
        return ok({ envelopeId: enqueue(envelope), acceptedAt: new Date().toISOString() }, 202);
      }
      case '/envelopes/pending':
        return ok({ envelopes: queues.get(partyKey(body as unknown as PorteParty)) ?? [] });
      case '/envelopes/ack': {
        const recipient = partyKey(body.recipient as PorteParty);
        const ids = new Set(body.envelopeIds as readonly string[]);
        const before = queues.get(recipient) ?? [];
        queues.set(recipient, before.filter((envelope) => !ids.has(envelope.envelopeId)));
        return ok({ removed: before.length - (queues.get(recipient)?.length ?? 0) });
      }
      default:
        return refused(404, 'NOT_FOUND');
    }
  };

  const route = (url: string, method: string, headers: Readonly<Record<string, string>>, body: Readonly<Record<string, unknown>>): Reply | { readonly status: number; readonly html: string } => {
    const path = new URL(url).pathname;
    if (method === 'GET' && path === '/api/v1/external-peer/whatsapp/coquille/') return { status: 200, html: '<!doctype html><main data-coquille></main>' };
    if (path === '/api/v1/auth/login') {
      const account = accounts[String(body.username)];
      return account && account.password === body.password ? ok({ token: `jeton-${String(body.username)}`, user: { id: account.userId } }) : refused(401, 'INVALID_CREDENTIALS');
    }
    const account = tokens.get((headers.authorization ?? '').replace(/^Bearer /, ''));
    if (!account) return refused(401, 'UNAUTHORIZED');
    return porte(path.replace('/api/v1/external-peer/whatsapp', ''), account, body);
  };

  const fetch: FetchLike = async (url, init) => {
    const body = init.body ? (JSON.parse(init.body) as Record<string, unknown>) : {};
    if (init.body) wire.push(init.body);
    const reply = route(url, init.method, init.headers, body);
    const text = 'html' in reply ? reply.html : JSON.stringify(reply.payload);
    wire.push(text);
    return { status: reply.status, json: async () => JSON.parse(text) as unknown, text: async () => text };
  };

  return {
    fetch,
    tokenOf: (name: string): string => `jeton-${name}`,
    publications: (): readonly PortePublication[] => published,
    pendingCount: (): number => [...queues.values()].reduce((total, queue) => total + queue.length, 0),
    wire: (): string => wire.join('\n'),
    inject: (envelope: OutboundEnvelope): void => {
      enqueue(envelope);
    },
  };
};
