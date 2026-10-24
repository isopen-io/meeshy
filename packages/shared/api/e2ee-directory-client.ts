/**
 * Le client TS des huit routes de l'annuaire E2EE par appareil et du relais
 * d'enveloppes (#3706, #12536), miroir de `E2EEDirectoryClient` du SDK Swift.
 *
 * Il ne connaît pas le réseau : un TRANSPORT (fetch authentifié du web, client
 * de test Node) reçoit la requête composée et rend le champ `data` de la
 * réponse. Le client VALIDE ce qu'il reçoit : une enveloppe ou un bundle hors
 * contrat est refusé, jamais remis à libsignal sous une forme devinée.
 *
 * Tout ce qui voyage ici est public (clés publiques, signatures XEdDSA) ou
 * opaque (enveloppes libsignal) ; aucune clé privée ne passe par ce module.
 */
import { z } from 'zod';
import * as e2EeEndpoints from '../api/endpoints/e2-ee';
import type {
  E2EEDeviceBundle,
  E2EEEnrollDeviceRequest,
  E2EEPublishKeysRequest,
  E2EEServedEnvelope,
} from '../types/e2ee-directory';

export type E2EETransportRequest = {
  readonly method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  readonly path: string;
  readonly query?: Readonly<Record<string, string>>;
  readonly body?: unknown;
};

/** Rend le champ `data` de la réponse de la passerelle, ou lève. */
export type E2EETransport = (request: E2EETransportRequest) => Promise<unknown>;

const signedKey = z.object({ keyId: z.number().int(), publicKey: z.string(), signature: z.string() });
const oneTimeKey = z.object({ keyId: z.number().int(), publicKey: z.string() });
const deviceId = z.number().int().min(1).max(127);

const enrollmentSchema = z.object({ deviceId, created: z.boolean() });
const stockSchema = z.object({ deviceId, oneTimePreKeys: z.number().int(), kyberPreKeys: z.number().int() });
const retirementSchema = z.object({ deviceId, retired: z.literal(true) });

const bundleSchema = z.object({
  deviceId,
  registrationId: z.number().int(),
  identityKey: z.string(),
  signedPreKey: signedKey,
  kyberPreKey: signedKey.extend({ lastResort: z.boolean() }),
  preKey: oneTimeKey.nullable(),
});

const userBundlesSchema = z.object({ userId: z.string(), devices: z.array(bundleSchema) });
const userDevicesSchema = z.object({
  userId: z.string(),
  devices: z.array(z.object({ deviceId, registrationId: z.number().int() })),
});

const envelopeSchema = z.object({
  id: z.string(),
  messageId: z.string(),
  conversationId: z.string(),
  recipientRegistrationId: z.number().int(),
  senderUserId: z.string(),
  senderDeviceId: deviceId,
  type: z.union([z.literal(2), z.literal(3)]),
  body: z.string(),
  createdAt: z.string(),
});

const envelopePageSchema = z.object({ envelopes: z.array(envelopeSchema), nextCursor: z.string().nullable() });
const ackSchema = z.object({ deleted: z.number().int() });

export type E2EEEnrollment = z.infer<typeof enrollmentSchema>;
export type E2EEPreKeyStock = z.infer<typeof stockSchema>;
export type E2EERetirement = z.infer<typeof retirementSchema>;
export type E2EEUserBundles = { readonly userId: string; readonly devices: readonly E2EEDeviceBundle[] };
export type E2EEUserDevices = z.infer<typeof userDevicesSchema>;
export type E2EEEnvelopePage = { readonly envelopes: readonly E2EEServedEnvelope[]; readonly nextCursor: string | null };

export type E2EEDirectoryClient = {
  enroll(request: E2EEEnrollDeviceRequest): Promise<E2EEEnrollment>;
  publishKeys(deviceId: number, request: E2EEPublishKeysRequest): Promise<E2EEPreKeyStock>;
  preKeyStock(): Promise<E2EEPreKeyStock>;
  retireDevice(deviceId: number): Promise<E2EERetirement>;
  bundles(userId: string, deviceIds?: readonly number[]): Promise<E2EEUserBundles>;
  devices(userId: string): Promise<E2EEUserDevices>;
  envelopes(page?: { readonly after?: string; readonly limit?: number }): Promise<E2EEEnvelopePage>;
  acknowledge(ids: readonly string[]): Promise<{ deleted: number }>;
};

const definedEntries = (entries: Record<string, string | undefined>): Record<string, string> | undefined => {
  const kept = Object.entries(entries).filter((entry): entry is [string, string] => entry[1] !== undefined);
  return kept.length === 0 ? undefined : Object.fromEntries(kept);
};

export function createE2EEDirectoryClient(transport: E2EETransport): E2EEDirectoryClient {
  const call = async <T>(schema: z.ZodType<T>, request: E2EETransportRequest): Promise<T> => schema.parse(await transport(request));

  return {
    enroll: (request) => call(enrollmentSchema, { method: 'POST', path: e2EeEndpoints.devices, body: request }),
    publishKeys: (id, request) =>
      call(stockSchema, { method: 'PUT', path: e2EeEndpoints.devicesByDeviceIdKeys(String(id)), body: request }),
    preKeyStock: () => call(stockSchema, { method: 'GET', path: e2EeEndpoints.devicesSelfPrekeyCount }),
    retireDevice: (id) => call(retirementSchema, { method: 'DELETE', path: e2EeEndpoints.devicesByDeviceId(String(id)) }),
    bundles: (userId, deviceIds) =>
      call(userBundlesSchema, {
        method: 'GET',
        path: e2EeEndpoints.keysByUserId(userId),
        ...(deviceIds ? { query: { deviceIds: deviceIds.join(',') } } : {}),
      }),
    devices: (userId) => call(userDevicesSchema, { method: 'GET', path: e2EeEndpoints.keysByUserIdDevices(userId) }),
    envelopes: (page = {}) => {
      const query = definedEntries({ after: page.after, limit: page.limit?.toString() });
      return call(envelopePageSchema, { method: 'GET', path: e2EeEndpoints.envelopes, ...(query ? { query } : {}) });
    },
    acknowledge: (ids) => call(ackSchema, { method: 'POST', path: e2EeEndpoints.envelopesAck, body: { ids: [...ids] } }),
  };
}
