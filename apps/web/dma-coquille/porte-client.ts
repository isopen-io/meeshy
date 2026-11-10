/**
 * Le client HTTP de la porte « pair externe » (#17116) — ce que la coquille
 * « ami WhatsApp » appelle à la passerelle de STAGING
 * (`services/gateway/src/routes/external-peer.ts`). Les formes sont celles du
 * contrat de la porte (`external-peer-contract.ts`) : clés publiques et
 * messages libsignal sérialisés, rien d'autre.
 *
 * Une erreur nomme l'étape, le statut et le code de la porte ; elle ne recopie
 * jamais ce qui a été soumis ni ce que le serveur a répondu d'autre.
 *
 * Aucune dépendance : ce module se construit seul dans l'image de la
 * passerelle (`scripts/build-dma-coquille.ts`).
 */

export type MeeshyParty = { readonly side: 'meeshy'; readonly userId: string; readonly deviceId: number };
export type ExternalParty = { readonly side: 'external'; readonly network: 'whatsapp'; readonly handle: string; readonly deviceId: number };
export type PorteParty = MeeshyParty | ExternalParty;

export type PorteUser =
  | { readonly side: 'meeshy'; readonly userId: string }
  | { readonly side: 'external'; readonly network: 'whatsapp'; readonly handle: string };

export type SignedKey = { readonly keyId: number; readonly publicKey: string; readonly signature: string };
export type OneTimeKey = { readonly keyId: number; readonly publicKey: string };

export type PortePublication = {
  readonly party: PorteParty;
  readonly registrationId: number;
  readonly identityKey: string;
  readonly signedPreKey: SignedKey;
  readonly kyberLastResort: SignedKey;
  readonly oneTimePreKeys: readonly OneTimeKey[];
  readonly kyberPreKeys: readonly SignedKey[];
};

export type PorteBundle = {
  readonly deviceId: number;
  readonly registrationId: number;
  readonly identityKey: string;
  readonly signedPreKey: SignedKey;
  readonly kyberPreKey: SignedKey & { readonly lastResort: boolean };
  readonly preKey: OneTimeKey | null;
};

export type PorteEnvelope = {
  readonly envelopeId: string;
  readonly from: PorteParty;
  readonly type: 2 | 3;
  readonly body: string;
  readonly acceptedAt: string;
};

export type OutboundEnvelope = { readonly from: PorteParty; readonly to: PorteParty; readonly type: 2 | 3; readonly body: string };

export type FetchLike = (input: string, init: { readonly method: string; readonly headers: Readonly<Record<string, string>>; readonly body?: string }) => Promise<{
  readonly status: number;
  readonly json: () => Promise<unknown>;
  readonly text: () => Promise<string>;
}>;

export class PorteError extends Error {
  constructor(
    readonly step: string,
    readonly status: number,
    readonly code: string | null,
  ) {
    super(`${step} : ${status}${code ? ` ${code}` : ''}`);
    this.name = 'PorteError';
  }
}

export type PorteClient = {
  readonly publish: (publication: PortePublication) => Promise<void>;
  readonly queryBundles: (user: PorteUser) => Promise<readonly PorteBundle[]>;
  readonly deliver: (envelope: OutboundEnvelope) => Promise<{ readonly envelopeId: string }>;
  readonly pending: (party: PorteParty) => Promise<readonly PorteEnvelope[]>;
  readonly acknowledge: (recipient: PorteParty, envelopeIds: readonly string[]) => Promise<number>;
};

export const PORTE_PATH = '/api/v1/external-peer/whatsapp';

export const userOf = (party: PorteParty): PorteUser =>
  party.side === 'meeshy' ? { side: 'meeshy', userId: party.userId } : { side: 'external', network: party.network, handle: party.handle };

const record = (value: unknown): Readonly<Record<string, unknown>> => (typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {});

const codeOf = (payload: unknown): string | null => {
  const code = record(payload).code;
  return typeof code === 'string' ? code : null;
};

const readJson = async (response: { readonly json: () => Promise<unknown> }): Promise<unknown> => response.json().catch(() => null);

export const createPorteClient = ({ baseUrl, token, fetch }: { readonly baseUrl: string; readonly token: string; readonly fetch: FetchLike }): PorteClient => {
  const call = async (step: string, path: string, body: unknown): Promise<Readonly<Record<string, unknown>>> => {
    const response = await fetch(`${baseUrl}${PORTE_PATH}${path}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const payload = await readJson(response);
    if (response.status < 200 || response.status >= 300) throw new PorteError(step, response.status, codeOf(payload));
    return record(record(payload).data);
  };

  return {
    publish: async (publication) => {
      await call('publication du bundle', '/bundles', publication);
    },
    queryBundles: async (user) => (await call('lecture des bundles', '/bundles/query', user)).bundles as readonly PorteBundle[],
    deliver: async (envelope) => (await call('remise de l’enveloppe', '/envelopes', envelope)) as { readonly envelopeId: string },
    pending: async (party) => (await call('relève des enveloppes', '/envelopes/pending', party)).envelopes as readonly PorteEnvelope[],
    acknowledge: async (recipient, envelopeIds) => (await call('accusé de réception', '/envelopes/ack', { recipient, envelopeIds })).removed as number,
  };
};

export type SignedIn = { readonly token: string; readonly userId: string };

/** La connexion d'un compte de l'équipe. Un compte qui exige la double authentification est refusé : la coquille ne la joue pas. */
export const signIn = async ({ baseUrl, username, password, fetch }: { readonly baseUrl: string; readonly username: string; readonly password: string; readonly fetch: FetchLike }): Promise<SignedIn> => {
  const response = await fetch(`${baseUrl}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const payload = await readJson(response);
  if (response.status !== 200) throw new PorteError('connexion refusée', response.status, codeOf(payload));
  const data = record(record(payload).data);
  const userId = record(data.user).id;
  if (data.requires2FA === true) throw new PorteError('connexion refusée (double authentification exigée)', response.status, null);
  if (typeof data.token !== 'string' || typeof userId !== 'string') throw new PorteError('connexion refusée (réponse illisible)', response.status, null);
  return { token: data.token, userId };
};

const BASE64_CHUNK = 0x8000;

export const toBase64 = (bytes: Uint8Array): string =>
  btoa(
    Array.from({ length: Math.ceil(bytes.length / BASE64_CHUNK) }, (_, index) =>
      String.fromCharCode(...bytes.subarray(index * BASE64_CHUNK, (index + 1) * BASE64_CHUNK)),
    ).join(''),
  );

export const fromBase64 = (text: string): Uint8Array => Uint8Array.from(atob(text), (character) => character.charCodeAt(0));
