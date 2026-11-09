/**
 * Le FAUX WhatsApp (#17115) : une implémentation de la porte « pair externe »
 * qui tient le rôle des serveurs de WhatsApp pour le staging et les tests — un
 * annuaire de bundles par appareil et un relais d'enveloppes et de pièces
 * OPAQUES. Il ne chiffre rien, ne déchiffre rien, n'appelle aucun hôte : son état
 * vit dans un `PeerStore` (le Redis du staging par `CacheStore`, ou la mémoire).
 *
 * Ce qu'il imite de l'offre publique de Meta et ce qui reste « à confirmer après
 * signature » : `services/gateway/docs/pair-externe-fidelite-offre-meta.md`.
 *
 * Les clés de stockage ne portent jamais un numéro en clair : un utilisateur y
 * est désigné par le SHA-256 de son identifiant. Ce n'est pas une protection (un
 * numéro s'énumère), seulement de quoi garder les numéros hors des listes de clés.
 */
import { createHash, randomUUID } from 'crypto';
import { E2EE_ENVELOPE_BOUNDS, E2EE_ENVELOPE_RETENTION_DAYS } from '@meeshy/shared/types/e2ee-directory';
import type { CacheStore } from '../CacheStore';
import {
  EXTERNAL_PEER_ERROR_CODES,
  ExternalPeerError,
  type ExternalNetwork,
  type ExternalPeer,
  type InboundEnvelope,
  type PeerDeviceBundle,
  type PeerParty,
  type PeerUser,
  type StoredAttachment,
} from './external-peer-contract';

/** Le sous-ensemble de `CacheStore` dont le faux a besoin ; `setnx` porte la réservation atomique. */
export type PeerStore = Pick<CacheStore, 'get' | 'set' | 'del' | 'keys' | 'setnx'>;

const RETENTION_SECONDS = E2EE_ENVELOPE_RETENTION_DAYS * 24 * 60 * 60;

type StoredBundle = Omit<PeerDeviceBundle, 'kyberPreKey' | 'preKey'> & {
  readonly kyberLastResort: PeerDeviceBundle['signedPreKey'];
};
type StoredEnvelope = InboundEnvelope;
type OneTimeKind = 'ec' | 'kyber';

const digestHex = (text: string): string => createHash('sha256').update(text).digest('hex');

const userKey = (user: PeerUser): string =>
  digestHex(user.side === 'meeshy' ? `meeshy:${user.userId}` : `external:${user.network}:${user.handle}`);

const userOf = (party: PeerParty): PeerUser =>
  party.side === 'meeshy' ? { side: 'meeshy', userId: party.userId } : { side: 'external', network: party.network, handle: party.handle };

const partyKey = (party: PeerParty): string => `${userKey(userOf(party))}:${party.deviceId}`;

const parse = <T>(raw: string | null): T | null => (raw === null ? null : (JSON.parse(raw) as T));

const lastSegment = (key: string): string => key.slice(key.lastIndexOf(':') + 1);

/** Un horodatage strictement croissant dans ce processus : l'ordre de remise survit aux remises d'une même milliseconde. */
const monotonicStamp = (() => {
  let last = 0;
  return (): number => {
    last = Math.max(last + 1, Date.now() * 1000);
    return last;
  };
})();

/** Les clés de stockage d'un réseau : aucune ne porte un numéro en clair. */
const storageKeys = (network: ExternalNetwork) => {
  const prefix = `extpeer:${network}`;
  return {
    bundle: (user: string, deviceId: number) => `${prefix}:bundle:${user}:${deviceId}`,
    bundlesOf: (user: string) => `${prefix}:bundle:${user}:*`,
    oneTime: (kind: OneTimeKind, device: string, registrationId: number, keyId: number) =>
      `${prefix}:otpk:${kind}:${device}:${registrationId}:${keyId}`,
    oneTimeOf: (kind: OneTimeKind, device: string, registrationId: number) => `${prefix}:otpk:${kind}:${device}:${registrationId}:*`,
    anyOneTimeOf: (device: string) => `${prefix}:otpk:*:${device}:*`,
    claim: (kind: OneTimeKind, device: string, registrationId: number, keyId: number) =>
      `${prefix}:claim:${kind}:${device}:${registrationId}:${keyId}`,
    anyClaimOf: (device: string) => `${prefix}:claim:*:${device}:*`,
    envelope: (recipient: string, stamp: number, envelopeId: string) =>
      `${prefix}:env:${recipient}:${String(stamp).padStart(20, '0')}:${envelopeId}`,
    envelopesOf: (recipient: string) => `${prefix}:env:${recipient}:*`,
    media: (attachmentId: string) => `${prefix}:media:${attachmentId}`,
  };
};
type StorageKeys = ReturnType<typeof storageKeys>;

/** Réserve la plus petite pré-clé unique libre : `setnx` sur sa réservation est le seul arbitre. */
async function reserveOneTime<T>(
  store: PeerStore,
  keys: StorageKeys,
  slot: { readonly kind: OneTimeKind; readonly device: string; readonly registrationId: number },
): Promise<T | null> {
  const { kind, device, registrationId } = slot;
  const candidates = (await store.keys(keys.oneTimeOf(kind, device, registrationId))).map((key) => Number(lastSegment(key))).sort((a, b) => a - b);
  const claimNext = async (remaining: readonly number[]): Promise<T | null> => {
    if (remaining.length === 0) return null;
    const [keyId, ...rest] = remaining;
    if (!(await store.setnx(keys.claim(kind, device, registrationId, keyId), '1', RETENTION_SECONDS))) return claimNext(rest);
    const key = keys.oneTime(kind, device, registrationId, keyId);
    const value = parse<T>(await store.get(key));
    await store.del(key);
    return value ?? claimNext(rest);
  };
  return claimNext(candidates);
}

function preKeyDirectory(store: PeerStore, keys: StorageKeys): Pick<ExternalPeer, 'publishPreKeyBundle' | 'fetchPreKeyBundles'> {
  const bundleFor = async (user: string, stored: StoredBundle): Promise<PeerDeviceBundle> => {
    const slot = { device: `${user}:${stored.deviceId}`, registrationId: stored.registrationId };
    const preKey = await reserveOneTime<PeerDeviceBundle['preKey']>(store, keys, { ...slot, kind: 'ec' });
    const kyber = await reserveOneTime<PeerDeviceBundle['signedPreKey']>(store, keys, { ...slot, kind: 'kyber' });
    const { kyberLastResort, ...publicPart } = stored;
    return { ...publicPart, preKey, kyberPreKey: kyber ? { ...kyber, lastResort: false } : { ...kyberLastResort, lastResort: true } };
  };

  return {
    publishPreKeyBundle: async (publication) => {
      const user = userKey(userOf(publication.party));
      const { registrationId, party: { deviceId } } = publication;
      const device = `${user}:${deviceId}`;
      const previous = parse<StoredBundle>(await store.get(keys.bundle(user, deviceId)));
      const identityChanged = previous !== null && previous.identityKey !== publication.identityKey;
      const stale = identityChanged
        ? [...(await store.keys(keys.anyOneTimeOf(device))), ...(await store.keys(keys.anyClaimOf(device)))]
        : (await store.keys(keys.anyOneTimeOf(device))).filter((key) => !key.includes(`:${device}:${registrationId}:`));
      await Promise.all(stale.map((key) => store.del(key)));
      const stored: StoredBundle = {
        deviceId,
        registrationId,
        identityKey: publication.identityKey,
        signedPreKey: publication.signedPreKey,
        kyberLastResort: publication.kyberLastResort,
      };
      await store.set(keys.bundle(user, deviceId), JSON.stringify(stored), RETENTION_SECONDS);
      const offer = (kind: OneTimeKind, keyId: number, value: unknown) =>
        store.setnx(keys.oneTime(kind, device, registrationId, keyId), JSON.stringify(value), RETENTION_SECONDS);
      await Promise.all([
        ...(publication.oneTimePreKeys ?? []).map((key) => offer('ec', key.keyId, key)),
        ...(publication.kyberPreKeys ?? []).map((key) => offer('kyber', key.keyId, key)),
      ]);
    },

    fetchPreKeyBundles: async (target) => {
      const user = userKey(target);
      const found = (await store.keys(keys.bundlesOf(user))).sort((a, b) => Number(lastSegment(a)) - Number(lastSegment(b)));
      const stored = (await Promise.all(found.map(async (key) => parse<StoredBundle>(await store.get(key))))).filter(
        (bundle): bundle is StoredBundle => bundle !== null,
      );
      if (stored.length === 0) throw new ExternalPeerError(EXTERNAL_PEER_ERROR_CODES.PEER_UNKNOWN);
      return Promise.all(stored.map((bundle) => bundleFor(user, bundle)));
    },
  };
}

function envelopeRelay(store: PeerStore, keys: StorageKeys): Pick<ExternalPeer, 'deliverEnvelope' | 'receiveEnvelopes' | 'acknowledge'> {
  return {
    deliverEnvelope: async ({ from, to, type, body }) => {
      const envelopeId = randomUUID();
      const stamp = monotonicStamp();
      const acceptedAt = new Date(Math.floor(stamp / 1000)).toISOString();
      const stored: StoredEnvelope = { envelopeId, from, type, body, acceptedAt };
      await store.set(keys.envelope(partyKey(to), stamp, envelopeId), JSON.stringify(stored), RETENTION_SECONDS);
      return { envelopeId, acceptedAt };
    },

    receiveEnvelopes: async (recipient) => {
      const found = (await store.keys(keys.envelopesOf(partyKey(recipient)))).sort().slice(0, E2EE_ENVELOPE_BOUNDS.maxEnvelopes);
      const envelopes = await Promise.all(found.map(async (key) => parse<StoredEnvelope>(await store.get(key))));
      return envelopes.filter((envelope): envelope is StoredEnvelope => envelope !== null);
    },

    acknowledge: async ({ recipient, envelopeIds }) => {
      const mine = await store.keys(keys.envelopesOf(partyKey(recipient)));
      const acknowledged = mine.filter((key) => envelopeIds.includes(lastSegment(key)));
      await Promise.all(acknowledged.map((key) => store.del(key)));
      return acknowledged.length;
    },
  };
}

function attachmentShelf(store: PeerStore, keys: StorageKeys): Pick<ExternalPeer, 'deliverAttachment' | 'fetchAttachment'> {
  return {
    deliverAttachment: async ({ digest, bytes }) => {
      const actual = createHash('sha256').update(Buffer.from(bytes, 'base64')).digest('base64');
      if (actual !== digest) throw new ExternalPeerError(EXTERNAL_PEER_ERROR_CODES.DIGEST_MISMATCH);
      const attachmentId = randomUUID();
      await store.set(keys.media(attachmentId), JSON.stringify({ digest, bytes }), RETENTION_SECONDS);
      return { attachmentId, digest };
    },

    fetchAttachment: async (attachmentId) => {
      const stored = parse<StoredAttachment>(await store.get(keys.media(attachmentId)));
      if (stored === null) throw new ExternalPeerError(EXTERNAL_PEER_ERROR_CODES.ATTACHMENT_UNKNOWN);
      return stored;
    },
  };
}

export type FakeWhatsAppOptions = { readonly store: PeerStore };

export function createFakeWhatsAppPeer({ store }: FakeWhatsAppOptions): ExternalPeer {
  const network: ExternalNetwork = 'whatsapp';
  const keys = storageKeys(network);
  return { network, ...preKeyDirectory(store, keys), ...envelopeRelay(store, keys), ...attachmentShelf(store, keys) };
}

type MemoryEntry = { readonly value: string; readonly expiresAt: number | null };

/** Le `PeerStore` en mémoire du processus : développement et témoins. Le staging passe le `CacheStore` (Redis). */
export function memoryPeerStore(now: () => number = Date.now): PeerStore {
  const entries = new Map<string, MemoryEntry>();
  const live = (key: string): MemoryEntry | null => {
    const entry = entries.get(key);
    if (!entry) return null;
    if (entry.expiresAt !== null && entry.expiresAt <= now()) {
      entries.delete(key);
      return null;
    }
    return entry;
  };
  const write = (key: string, value: string, ttlSeconds?: number): void => {
    entries.set(key, { value, expiresAt: ttlSeconds ? now() + ttlSeconds * 1000 : null });
  };
  return {
    get: async (key) => live(key)?.value ?? null,
    set: async (key, value, ttlSeconds) => write(key, value, ttlSeconds),
    del: async (key) => {
      entries.delete(key);
    },
    keys: async (pattern) => {
      const matcher = new RegExp(`^${pattern.split('*').map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`);
      return [...entries.keys()].filter((key) => matcher.test(key) && live(key) !== null);
    },
    setnx: async (key, value, ttlSeconds) => {
      if (live(key) !== null) return false;
      write(key, value, ttlSeconds);
      return true;
    },
  };
}
