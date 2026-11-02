/**
 * LE CLIENT DE L'ANNUAIRE E2EE ET DU RELAIS (#3706, #14592), miroir de
 * `E2EEDirectoryClient.swift` sur `packages/shared/types/e2ee-directory.ts`.
 * Tout ce qui passe ici est PUBLIC (clés publiques, signatures) ou OPAQUE
 * (enveloppes) : aucun type de ce fichier ne porte une clé privée ni un clair.
 */
import * as e2eeEndpoints from '@meeshy/shared/api/endpoints/e2-ee';
import type {
  E2EEDeviceBundle,
  E2EEDevicesMismatch,
  E2EEEnrollDeviceRequest,
  E2EEPublishKeysRequest,
  E2EEServedEnvelope,
} from '@meeshy/shared/types/e2ee-directory';

import type { ApiFailure, HttpTransport } from '@/lib/api/http';

export type E2EEDeviceListing = { readonly deviceId: number; readonly registrationId: number };
export type E2EEPreKeyStock = { readonly deviceId: number; readonly oneTimePreKeys: number; readonly kyberPreKeys: number };
export type E2EEEnvelopePage = { readonly envelopes: readonly E2EEServedEnvelope[]; readonly nextCursor: string | null };

/** Un refus de l'annuaire, avec son code stable (`E2EE_*`) quand il en porte un. */
export class E2EEDirectoryError extends Error {
  readonly status: number;
  readonly code: string | undefined;
  constructor(failure: ApiFailure) {
    super(failure.error);
    this.name = 'E2EEDirectoryError';
    this.status = failure.status;
    this.code = failure.code;
  }
}

export interface E2EEDirectoryClient {
  enroll(request: E2EEEnrollDeviceRequest): Promise<{ readonly deviceId: number; readonly created: boolean }>;
  publishKeys(deviceId: number, request: E2EEPublishKeysRequest): Promise<void>;
  preKeyStock(): Promise<E2EEPreKeyStock>;
  devices(userId: string): Promise<readonly E2EEDeviceListing[]>;
  bundles(userId: string, deviceIds: readonly number[]): Promise<readonly E2EEDeviceBundle[]>;
  envelopes(after: string | null, limit: number): Promise<E2EEEnvelopePage>;
  acknowledge(ids: readonly string[]): Promise<number>;
}

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isInt = (value: unknown, min: number, max: number): value is number => typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
const isText = (value: unknown): value is string => typeof value === 'string' && value !== '';

const listing = (raw: unknown): E2EEDeviceListing | null =>
  isRecord(raw) && isInt(raw.deviceId, 1, 127) && isInt(raw.registrationId, 1, 0x3fff) ? { deviceId: raw.deviceId, registrationId: raw.registrationId } : null;

const signedKey = (raw: unknown): { keyId: number; publicKey: string; signature: string } | null =>
  isRecord(raw) && isInt(raw.keyId, 0, 0x7fffffff) && isText(raw.publicKey) && isText(raw.signature)
    ? { keyId: raw.keyId, publicKey: raw.publicKey, signature: raw.signature }
    : null;

export function decodeBundle(raw: unknown): E2EEDeviceBundle | null {
  if (!isRecord(raw)) return null;
  const device = listing(raw);
  const signedPreKey = signedKey(raw.signedPreKey);
  const kyber = signedKey(raw.kyberPreKey);
  if (!device || !signedPreKey || !kyber || !isText(raw.identityKey)) return null;
  const preKey = isRecord(raw.preKey) && isInt(raw.preKey.keyId, 0, 0x7fffffff) && isText(raw.preKey.publicKey)
    ? { keyId: raw.preKey.keyId, publicKey: raw.preKey.publicKey }
    : null;
  const lastResort = isRecord(raw.kyberPreKey) && raw.kyberPreKey.lastResort === true;
  return { ...device, identityKey: raw.identityKey, signedPreKey, kyberPreKey: { ...kyber, lastResort }, preKey };
}

export function decodeServedEnvelope(raw: unknown): E2EEServedEnvelope | null {
  if (!isRecord(raw)) return null;
  const { id, messageId, conversationId, recipientRegistrationId, senderUserId, senderDeviceId, type, body, createdAt } = raw;
  if (!isText(id) || !isText(messageId) || !isText(conversationId) || !isText(senderUserId) || !isText(body)) return null;
  if (!isInt(senderDeviceId, 1, 127) || (type !== 2 && type !== 3)) return null;
  return {
    id,
    messageId,
    conversationId,
    recipientRegistrationId: isInt(recipientRegistrationId, 1, 0x3fff) ? recipientRegistrationId : 0,
    senderUserId,
    senderDeviceId,
    type,
    body,
    createdAt: typeof createdAt === 'string' ? createdAt : '',
  };
}

const refs = (raw: unknown): readonly { userId: string; deviceId: number }[] | null =>
  Array.isArray(raw)
    ? raw.flatMap((entry: unknown) => (isRecord(entry) && isText(entry.userId) && isInt(entry.deviceId, 1, 127) ? [{ userId: entry.userId, deviceId: entry.deviceId }] : []))
    : null;

/** L'écart Sesame d'un 409 : il n'existe que si les trois listes se lisent — un écart partiel serait résolu à tort. */
export function decodeMismatch(raw: unknown): E2EEDevicesMismatch | null {
  if (!isRecord(raw)) return null;
  const missing = refs(raw.missing);
  const extra = refs(raw.extra);
  const stale = refs(raw.stale);
  return missing && extra && stale ? { missing, extra, stale } : null;
}

export function httpE2EEDirectory(transport: HttpTransport): E2EEDirectoryClient {
  const call = async (method: 'GET' | 'POST' | 'PUT', path: string, body?: unknown): Promise<unknown> => {
    const result = await transport.request<unknown>({ method, path, ...(body === undefined ? {} : { body }) });
    if (!result.ok) throw new E2EEDirectoryError(result);
    return result.data;
  };
  return {
    enroll: async (request) => {
      const data = await call('POST', e2eeEndpoints.devices, request);
      if (!isRecord(data) || !isInt(data.deviceId, 1, 127)) throw new Error('e2ee: enrôlement illisible');
      return { deviceId: data.deviceId, created: data.created === true };
    },
    publishKeys: async (deviceId, request) => {
      await call('PUT', e2eeEndpoints.devicesByDeviceIdKeys(String(deviceId)), request);
    },
    preKeyStock: async () => {
      const data = await call('GET', e2eeEndpoints.devicesSelfPrekeyCount);
      if (!isRecord(data) || !isInt(data.deviceId, 1, 127)) throw new Error('e2ee: stock illisible');
      return {
        deviceId: data.deviceId,
        oneTimePreKeys: typeof data.oneTimePreKeys === 'number' ? data.oneTimePreKeys : 0,
        kyberPreKeys: typeof data.kyberPreKeys === 'number' ? data.kyberPreKeys : 0,
      };
    },
    devices: async (userId) => {
      const data = await call('GET', e2eeEndpoints.keysByUserIdDevices(userId));
      const devices = isRecord(data) && Array.isArray(data.devices) ? data.devices : [];
      return devices.flatMap((raw: unknown) => {
        const device = listing(raw);
        return device ? [device] : [];
      });
    },
    bundles: async (userId, deviceIds) => {
      const query = deviceIds.length > 0 ? `?deviceIds=${deviceIds.join(',')}` : '';
      const data = await call('GET', `${e2eeEndpoints.keysByUserId(userId)}${query}`);
      const devices = isRecord(data) && Array.isArray(data.devices) ? data.devices : [];
      return devices.flatMap((raw: unknown) => {
        const bundle = decodeBundle(raw);
        return bundle ? [bundle] : [];
      });
    },
    envelopes: async (after, limit) => {
      const query = new URLSearchParams({ limit: String(limit), ...(after === null ? {} : { after }) });
      const data = await call('GET', `${e2eeEndpoints.envelopes}?${query.toString()}`);
      const envelopes = (isRecord(data) && Array.isArray(data.envelopes) ? data.envelopes : []).flatMap((raw: unknown) => {
        const envelope = decodeServedEnvelope(raw);
        return envelope ? [envelope] : [];
      });
      const nextCursor = isRecord(data) && typeof data.nextCursor === 'string' ? data.nextCursor : null;
      return { envelopes, nextCursor };
    },
    acknowledge: async (ids) => {
      const data = await call('POST', e2eeEndpoints.envelopesAck, { ids });
      return isRecord(data) && typeof data.deleted === 'number' ? data.deleted : 0;
    },
  };
}
