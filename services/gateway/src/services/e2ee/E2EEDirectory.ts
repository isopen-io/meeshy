/**
 * L'ANNUAIRE DE CLÉS PUBLIQUES PAR APPAREIL (#3706, spec § 3.2 et 3.3).
 *
 * La passerelle n'y tient que des clés publiques : identité, pré-clé signée,
 * pré-clé Kyber de dernier recours, pré-clés uniques EC et Kyber. Elle vérifie
 * leurs signatures XEdDSA à la publication (hygiène, § 3.2) et réserve chaque
 * pré-clé unique UNE fois, par une seule commande atomique `findAndModify` sur
 * `usedAt: null` — jamais une lecture suivie d'une écriture.
 *
 * Un appareil est lié à la session (`UserSession`, claim `sid`) qui l'a enrôlé :
 * seule elle publie ses clés. Son `deviceId` (1…127) vient d'un compteur
 * atomique par compte et n'est jamais réutilisé.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import {
  E2EE_DEVICE_ID_MAX,
  E2EE_ERROR_CODES,
  type E2EEDeviceBundle,
  type E2EEEnrollDeviceRequest,
  type E2EEErrorCode,
  type E2EEPublishKeysRequest,
} from '@meeshy/shared/types/e2ee-directory';
import type { SignatureVerifier } from './signature-verifier';

export type DirectoryPrisma = Pick<PrismaClient, 'e2EEDevice' | 'e2EEOneTimePreKey' | '$runCommandRaw'>;

export type E2EEDirectoryDeps = {
  readonly prisma: DirectoryPrisma;
  readonly verifier: SignatureVerifier;
  readonly now?: () => Date;
};

export class E2EEDirectoryError extends Error {
  constructor(
    readonly code: E2EEErrorCode,
    readonly status: 400 | 403 | 404 | 409 | 503,
    message: string,
  ) {
    super(message);
    this.name = 'E2EEDirectoryError';
  }
}

type SignedKey = { readonly keyId: number; readonly publicKey: string; readonly signature: string };
type OneTimeKey = { readonly keyId: number; readonly publicKey: string };
type OneTimeBatches = { readonly oneTimePreKeys?: readonly OneTimeKey[]; readonly kyberPreKeys?: readonly SignedKey[] };

export type PreKeyStock = { readonly deviceId: number; readonly oneTimePreKeys: number; readonly kyberPreKeys: number };

const ACTIVE = { retiredAt: null } as const;

const objectIdOf = (value: unknown): string | null => {
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value !== null && typeof (value as { $oid?: unknown }).$oid === 'string') {
    return (value as { $oid: string }).$oid;
  }
  return null;
};

async function assertSigned(verifier: SignatureVerifier, identityKey: string, keys: readonly SignedKey[]): Promise<void> {
  const verdicts = await Promise.all(
    keys.map((key) => verifier.verify({ identityKey, message: key.publicKey, signature: key.signature })),
  ).catch(() => {
    throw new E2EEDirectoryError(E2EE_ERROR_CODES.SIGNATURE_UNVERIFIABLE, 503, 'Vérification des signatures indisponible');
  });
  if (verdicts.some((valid) => !valid)) {
    throw new E2EEDirectoryError(E2EE_ERROR_CODES.SIGNATURE_INVALID, 400, 'Une pré-clé ne porte pas la signature de son identité');
  }
}

const signedKeysOf = (request: { signedPreKey?: SignedKey; kyberLastResort?: SignedKey } & OneTimeBatches): SignedKey[] => [
  ...(request.signedPreKey ? [request.signedPreKey] : []),
  ...(request.kyberLastResort ? [request.kyberLastResort] : []),
  ...(request.kyberPreKeys ?? []),
];

const signedPreKeyFields = (key: SignedKey, now: Date) => ({
  signedPreKeyId: key.keyId,
  signedPreKey: key.publicKey,
  signedPreKeySignature: key.signature,
  signedPreKeyRotatedAt: now,
});

const kyberLastResortFields = (key: SignedKey) => ({
  kyberLastResortId: key.keyId,
  kyberLastResort: key.publicKey,
  kyberLastResortSignature: key.signature,
});

export function createE2EEDirectory(deps: E2EEDirectoryDeps) {
  const { prisma, verifier } = deps;
  const now = deps.now ?? (() => new Date());

  async function addOneTimeKeys(userId: string, deviceId: number, batches: OneTimeBatches): Promise<void> {
    const candidates = [
      ...(batches.oneTimePreKeys ?? []).map((key) => ({ kind: 'ec', keyId: key.keyId, publicKey: key.publicKey, signature: null })),
      ...(batches.kyberPreKeys ?? []).map((key) => ({ kind: 'kyber', keyId: key.keyId, publicKey: key.publicKey, signature: key.signature })),
    ];
    if (candidates.length === 0) return;
    const existing = await prisma.e2EEOneTimePreKey.findMany({
      where: { userId, deviceId, keyId: { in: candidates.map((key) => key.keyId) } },
      select: { kind: true, keyId: true },
    });
    const taken = new Set(existing.map((key) => `${key.kind}:${key.keyId}`));
    const unique = new Map(candidates.filter((key) => !taken.has(`${key.kind}:${key.keyId}`)).map((key) => [`${key.kind}:${key.keyId}`, key]));
    if (unique.size === 0) return;
    await prisma.e2EEOneTimePreKey.createMany({ data: [...unique.values()].map((key) => ({ userId, deviceId, ...key })) });
  }

  async function retireDevices(where: { userId: string; deviceId?: number; sessionId?: string; id?: { not: string } }): Promise<number[]> {
    const doomed = await prisma.e2EEDevice.findMany({ where: { ...where, ...ACTIVE }, select: { deviceId: true } });
    if (doomed.length === 0) return [];
    const deviceIds = doomed.map((device) => device.deviceId);
    await prisma.e2EEDevice.updateMany({ where: { userId: where.userId, deviceId: { in: deviceIds }, ...ACTIVE }, data: { retiredAt: now() } });
    await prisma.e2EEOneTimePreKey.deleteMany({ where: { userId: where.userId, deviceId: { in: deviceIds } } });
    return deviceIds;
  }

  async function allocateDeviceId(userId: string): Promise<number> {
    const result = (await prisma.$runCommandRaw({
      findAndModify: 'E2EEDeviceCounter',
      query: { userId: { $oid: userId } },
      update: { $inc: { lastDeviceId: 1 } },
      upsert: true,
      new: true,
      fields: { lastDeviceId: 1 },
    } as never)) as { value?: { lastDeviceId?: unknown } | null } | null;
    const allocated = Number(result?.value?.lastDeviceId);
    if (!Number.isInteger(allocated) || allocated < 1 || allocated > E2EE_DEVICE_ID_MAX) {
      throw new E2EEDirectoryError(E2EE_ERROR_CODES.DEVICE_LIMIT_REACHED, 409, 'Ce compte a atteint le nombre maximal d’appareils chiffrés');
    }
    return allocated;
  }

  async function enrollDevice(params: { userId: string; sessionId: string; request: E2EEEnrollDeviceRequest }): Promise<{ deviceId: number; created: boolean }> {
    const { userId, sessionId, request } = params;
    await assertSigned(verifier, request.identityKey, signedKeysOf(request));
    const at = now();
    const keyFields = { ...signedPreKeyFields(request.signedPreKey, at), ...kyberLastResortFields(request.kyberLastResort) };
    const profile = { platform: request.platform, label: request.label ?? null, lastSeenAt: at };

    const existing = await prisma.e2EEDevice.findFirst({
      where: { userId, identityKey: request.identityKey, registrationId: request.registrationId, ...ACTIVE },
    });
    if (existing) {
      await retireDevices({ userId, sessionId, id: { not: existing.id } });
      await prisma.e2EEDevice.update({ where: { id: existing.id }, data: { sessionId, ...keyFields, ...profile } });
      await addOneTimeKeys(userId, existing.deviceId, request);
      return { deviceId: existing.deviceId, created: false };
    }

    const deviceId = await allocateDeviceId(userId);
    await retireDevices({ userId, sessionId });
    await prisma.e2EEDevice.create({
      data: { userId, deviceId, registrationId: request.registrationId, identityKey: request.identityKey, sessionId, ...keyFields, ...profile },
    });
    await addOneTimeKeys(userId, deviceId, request);
    return { deviceId, created: true };
  }

  async function boundDevice(params: { userId: string; sessionId: string; deviceId?: number }) {
    const device = await prisma.e2EEDevice.findFirst({
      where: { userId: params.userId, sessionId: params.sessionId, ...(params.deviceId === undefined ? {} : { deviceId: params.deviceId }), ...ACTIVE },
    });
    if (!device) {
      throw new E2EEDirectoryError(E2EE_ERROR_CODES.DEVICE_NOT_BOUND, 403, 'Cet appareil chiffré n’appartient pas à cette session');
    }
    return device;
  }

  async function stockOf(userId: string, deviceId: number): Promise<PreKeyStock> {
    const unused = (kind: string) => prisma.e2EEOneTimePreKey.count({ where: { userId, deviceId, kind, usedAt: null } });
    const [oneTimePreKeys, kyberPreKeys] = await Promise.all([unused('ec'), unused('kyber')]);
    return { deviceId, oneTimePreKeys, kyberPreKeys };
  }

  async function publishKeys(params: { userId: string; sessionId: string; deviceId: number; request: E2EEPublishKeysRequest }): Promise<PreKeyStock> {
    const device = await boundDevice(params);
    const { request } = params;
    await assertSigned(verifier, device.identityKey, signedKeysOf(request));
    const at = now();
    await prisma.e2EEDevice.update({
      where: { id: device.id },
      data: {
        lastSeenAt: at,
        ...(request.signedPreKey ? signedPreKeyFields(request.signedPreKey, at) : {}),
        ...(request.kyberLastResort ? kyberLastResortFields(request.kyberLastResort) : {}),
      },
    });
    await addOneTimeKeys(params.userId, device.deviceId, request);
    return stockOf(params.userId, device.deviceId);
  }

  async function prekeyStock(params: { userId: string; sessionId: string }): Promise<PreKeyStock> {
    const device = await boundDevice(params);
    return stockOf(params.userId, device.deviceId);
  }

  async function reserveOneTimeKey(params: { userId: string; deviceId: number; kind: 'ec' | 'kyber'; requesterUserId: string }) {
    const result = (await prisma.$runCommandRaw({
      findAndModify: 'E2EEOneTimePreKey',
      query: { userId: { $oid: params.userId }, deviceId: params.deviceId, kind: params.kind, usedAt: null },
      sort: { keyId: 1 },
      update: { $set: { usedAt: { $date: now().toISOString() }, usedBy: { $oid: params.requesterUserId } } },
      new: true,
      fields: { _id: 1 },
    } as never)) as { value?: { _id?: unknown } | null } | null;
    const id = objectIdOf(result?.value?._id);
    if (!id) return null;
    return prisma.e2EEOneTimePreKey.findUnique({ where: { id }, select: { keyId: true, publicKey: true, signature: true } });
  }

  type ActiveDevice = Awaited<ReturnType<typeof prisma.e2EEDevice.findMany>>[number];

  async function bundleOf(device: ActiveDevice, requesterUserId: string): Promise<E2EEDeviceBundle> {
    const address = { userId: device.userId, deviceId: device.deviceId, requesterUserId };
    const [ec, kyber] = await Promise.all([
      reserveOneTimeKey({ ...address, kind: 'ec' }),
      reserveOneTimeKey({ ...address, kind: 'kyber' }),
    ]);
    const kyberPreKey = kyber?.signature
      ? { keyId: kyber.keyId, publicKey: kyber.publicKey, signature: kyber.signature, lastResort: false }
      : { keyId: device.kyberLastResortId, publicKey: device.kyberLastResort, signature: device.kyberLastResortSignature, lastResort: true };
    return {
      deviceId: device.deviceId,
      registrationId: device.registrationId,
      identityKey: device.identityKey,
      signedPreKey: { keyId: device.signedPreKeyId, publicKey: device.signedPreKey, signature: device.signedPreKeySignature },
      kyberPreKey,
      preKey: ec ? { keyId: ec.keyId, publicKey: ec.publicKey } : null,
    };
  }

  async function activeDevices(userId: string, deviceIds?: readonly number[]) {
    return prisma.e2EEDevice.findMany({
      where: { userId, ...ACTIVE, ...(deviceIds ? { deviceId: { in: [...deviceIds] } } : {}) },
      orderBy: { deviceId: 'asc' },
    });
  }

  async function reserveBundles(params: { requesterUserId: string; targetUserId: string; deviceIds?: readonly number[] }): Promise<E2EEDeviceBundle[]> {
    const devices = await activeDevices(params.targetUserId, params.deviceIds);
    return Promise.all(devices.map((device) => bundleOf(device, params.requesterUserId)));
  }

  async function listDevices(userId: string): Promise<{ deviceId: number; registrationId: number }[]> {
    const devices = await activeDevices(userId);
    return devices.map((device) => ({ deviceId: device.deviceId, registrationId: device.registrationId }));
  }

  async function retireDevice(params: { userId: string; deviceId: number }): Promise<void> {
    const retired = await retireDevices({ userId: params.userId, deviceId: params.deviceId });
    if (retired.length === 0) {
      throw new E2EEDirectoryError(E2EE_ERROR_CODES.DEVICE_NOT_BOUND, 404, 'Appareil chiffré introuvable sur ce compte');
    }
  }

  return { enrollDevice, publishKeys, prekeyStock, boundDevice, reserveBundles, listDevices, retireDevice, activeDevices };
}

export type E2EEDirectory = ReturnType<typeof createE2EEDirectory>;
