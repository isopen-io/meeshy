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
import { E2EE_ENVELOPE_RETENTION_DAYS } from '@meeshy/shared/types/e2ee-directory';
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

export type FakeWhatsAppOptions = { readonly store: PeerStore };

export function createFakeWhatsAppPeer({ store }: FakeWhatsAppOptions): ExternalPeer {
  const network: ExternalNetwork = 'whatsapp';
  const prefix = `extpeer:${network}`;
  const bundleKey = (user: string, deviceId: number) => `${prefix}:bundle:${user}:${deviceId}`;
  const oneTimeKey = (kind: OneTimeKind, device: string, registrationId: number, keyId: number) =>
    `${prefix}:otpk:${kind}:${device}:${registrationId}:${keyId}`;
  const claimKey = (kind: OneTimeKind, device: string, registrationId: number, keyId: number) =>
    `${prefix}:claim:${kind}:${device}:${registrationId}:${keyId}`;
  const envelopeKey = (recipient: string, stamp: number, envelopeId: string) =>
    `${prefix}:env:${recipient}:${String(stamp).padStart(20, '0')}:${envelopeId}`;

  /** Réserve la plus petite pré-clé unique libre : `setnx` sur sa réservation est le seul arbitre. */
  const reserveOneTime = async <T>(kind: OneTimeKind, device: string, registrationId: number): Promise<T | null> => {
    const candidates = (await store.keys(`${prefix}:otpk:${kind}:${device}:${registrationId}:*`))
      .map((key) => Number(lastSegment(key)))
      .sort((a, b) => a - b);
    const claimNext = async (remaining: readonly number[]): Promise<T | null> => {
      if (remaining.length === 0) return null;
      const [keyId, ...rest] = remaining;
      if (!(await store.setnx(claimKey(kind, device, registrationId, keyId), '1', RETENTION_SECONDS))) return claimNext(rest);
      const key = oneTimeKey(kind, device, registrationId, keyId);
      const value = parse<T>(await store.get(key));
      await store.del(key);
      return value ?? claimNext(rest);
    };
    return claimNext(candidates);
  };

  const forgetOtherGenerations = async (device: string, registrationId: number): Promise<void> => {
    const stale = (await store.keys(`${prefix}:otpk:*:${device}:*`)).filter((key) => !key.includes(`:${device}:${registrationId}:`));
    await Promise.all(stale.map((key) => store.del(key)));
  };

  const bundleFor = async (user: string, stored: StoredBundle): Promise<PeerDeviceBundle> => {
    const device = `${user}:${stored.deviceId}`;
    const preKey = await reserveOneTime<PeerDeviceBundle['preKey']>('ec', device, stored.registrationId);
    const kyber = await reserveOneTime<PeerDeviceBundle['signedPreKey']>('kyber', device, stored.registrationId);
    const { kyberLastResort, ...publicPart } = stored;
    return {
      ...publicPart,
      preKey,
      kyberPreKey: kyber ? { ...kyber, lastResort: false } : { ...kyberLastResort, lastResort: true },
    };
  };

  return {
    network,

    publishPreKeyBundle: async (publication) => {
      const user = userKey(userOf(publication.party));
      const deviceId = publication.party.deviceId;
      const device = `${user}:${deviceId}`;
      const { registrationId } = publication;
      await forgetOtherGenerations(device, registrationId);
      const stored: StoredBundle = {
        deviceId,
        registrationId,
        identityKey: publication.identityKey,
        signedPreKey: publication.signedPreKey,
        kyberLastResort: publication.kyberLastResort,
      };
      await store.set(bundleKey(user, deviceId), JSON.stringify(stored), RETENTION_SECONDS);
      await Promise.all([
        ...(publication.oneTimePreKeys ?? []).map((key) =>
          store.setnx(oneTimeKey('ec', device, registrationId, key.keyId), JSON.stringify(key), RETENTION_SECONDS),
        ),
        ...(publication.kyberPreKeys ?? []).map((key) =>
          store.setnx(oneTimeKey('kyber', device, registrationId, key.keyId), JSON.stringify(key), RETENTION_SECONDS),
        ),
      ]);
    },

    fetchPreKeyBundles: async (target) => {
      const user = userKey(target);
      const keys = (await store.keys(`${prefix}:bundle:${user}:*`)).sort((a, b) => Number(lastSegment(a)) - Number(lastSegment(b)));
      const stored = (await Promise.all(keys.map(async (key) => parse<StoredBundle>(await store.get(key))))).filter(
        (bundle): bundle is StoredBundle => bundle !== null,
      );
      if (stored.length === 0) throw new ExternalPeerError(EXTERNAL_PEER_ERROR_CODES.PEER_UNKNOWN);
      return Promise.all(stored.map((bundle) => bundleFor(user, bundle)));
    },

    deliverEnvelope: async ({ from, to, type, body }) => {
      const envelopeId = randomUUID();
      const stamp = monotonicStamp();
      const acceptedAt = new Date(Math.floor(stamp / 1000)).toISOString();
      const stored: StoredEnvelope = { envelopeId, from, type, body, acceptedAt };
      await store.set(envelopeKey(partyKey(to), stamp, envelopeId), JSON.stringify(stored), RETENTION_SECONDS);
      return { envelopeId, acceptedAt };
    },

    receiveEnvelopes: async (recipient) => {
      const keys = (await store.keys(`${prefix}:env:${partyKey(recipient)}:*`)).sort();
      const envelopes = await Promise.all(keys.map(async (key) => parse<StoredEnvelope>(await store.get(key))));
      return envelopes.filter((envelope): envelope is StoredEnvelope => envelope !== null);
    },

    acknowledge: async ({ recipient, envelopeIds }) => {
      const mine = await store.keys(`${prefix}:env:${partyKey(recipient)}:*`);
      const acknowledged = mine.filter((key) => envelopeIds.includes(lastSegment(key)));
      await Promise.all(acknowledged.map((key) => store.del(key)));
      return acknowledged.length;
    },

    deliverAttachment: async ({ digest, bytes }) => {
      const actual = createHash('sha256').update(Buffer.from(bytes, 'base64')).digest('base64');
      if (actual !== digest) throw new ExternalPeerError(EXTERNAL_PEER_ERROR_CODES.DIGEST_MISMATCH);
      const attachmentId = randomUUID();
      await store.set(`${prefix}:media:${attachmentId}`, JSON.stringify({ digest, bytes }), RETENTION_SECONDS);
      return { attachmentId, digest };
    },

    fetchAttachment: async (attachmentId) => {
      const stored = parse<{ digest: string; bytes: string }>(await store.get(`${prefix}:media:${attachmentId}`));
      if (stored === null) throw new ExternalPeerError(EXTERNAL_PEER_ERROR_CODES.ATTACHMENT_UNKNOWN);
      return stored;
    },
  };
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
