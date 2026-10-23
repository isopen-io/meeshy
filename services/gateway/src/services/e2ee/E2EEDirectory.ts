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
  deviceBindingMessage,
  E2EE_DEVICE_BINDING_MAX_SKEW_MS,
  E2EE_DEVICE_ID_MAX,
  E2EE_ERROR_CODES,
  E2EE_ONE_TIME_PREKEY_STOCK_MAX,
  type E2EEDeviceBundle,
  type E2EEEnrollDeviceRequest,
  type E2EEErrorCode,
  type E2EEPublishKeysRequest,
} from '@meeshy/shared/types/e2ee-directory';
import type { SignatureVerifier } from './signature-verifier';

export type DirectoryPrisma = Pick<PrismaClient, 'e2EEDevice' | 'e2EEOneTimePreKey' | 'messageEnvelope' | '$runCommandRaw'>;

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
    throw unverifiable();
  });
  if (verdicts.some((valid) => !valid)) {
    throw new E2EEDirectoryError(E2EE_ERROR_CODES.SIGNATURE_INVALID, 400, 'Une pré-clé ne porte pas la signature de son identité');
  }
}

const unverifiable = () =>
  new E2EEDirectoryError(E2EE_ERROR_CODES.SIGNATURE_UNVERIFIABLE, 503, 'Vérification des signatures indisponible');

/**
 * La preuve que l'appareil détient la clé privée de l'identité qu'il enrôle,
 * pour CE compte, maintenant (voir `deviceBindingMessage`).
 */
async function assertBinding(
  verifier: SignatureVerifier,
  params: { userId: string; request: E2EEEnrollDeviceRequest; now: Date },
): Promise<void> {
  const { userId, request, now } = params;
  const invalid = new E2EEDirectoryError(E2EE_ERROR_CODES.BINDING_INVALID, 400, 'La preuve de possession de la clé d’identité est absente ou périmée');
  if (Math.abs(now.getTime() - request.binding.timestamp) > E2EE_DEVICE_BINDING_MAX_SKEW_MS) throw invalid;
  const message = Buffer.from(
    deviceBindingMessage({ userId, registrationId: request.registrationId, identityKey: request.identityKey, timestamp: request.binding.timestamp }),
  ).toString('base64');
  const valid = await verifier.verify({ identityKey: request.identityKey, message, signature: request.binding.signature }).catch(() => {
    throw unverifiable();
  });
  if (!valid) throw invalid;
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

type ActiveDevice = Awaited<ReturnType<DirectoryPrisma['e2EEDevice']['findMany']>>[number];

type OneTimeRow = { kind: 'ec' | 'kyber'; keyId: number; publicKey: string; signature: string | null };

const oneTimeRowsOf = (batches: OneTimeBatches): OneTimeRow[] => [
  ...(batches.oneTimePreKeys ?? []).map((key) => ({ kind: 'ec' as const, keyId: key.keyId, publicKey: key.publicKey, signature: null })),
  ...(batches.kyberPreKeys ?? []).map((key) => ({ kind: 'kyber' as const, keyId: key.keyId, publicKey: key.publicKey, signature: key.signature })),
];

const rowKey = (key: { kind: string; keyId: number }): string => `${key.kind}:${key.keyId}`;

export class E2EEDirectory {
  private readonly prisma: DirectoryPrisma;
  private readonly verifier: SignatureVerifier;
  private readonly now: () => Date;

  constructor(deps: E2EEDirectoryDeps) {
    this.prisma = deps.prisma;
    this.verifier = deps.verifier;
    this.now = deps.now ?? (() => new Date());
  }

  async enrollDevice(params: { userId: string; sessionId: string; request: E2EEEnrollDeviceRequest }): Promise<{ deviceId: number; created: boolean }> {
    const { userId, sessionId, request } = params;
    const at = this.now();
    await assertBinding(this.verifier, { userId, request, now: at });
    await assertSigned(this.verifier, request.identityKey, signedKeysOf(request));
    const keyFields = { ...signedPreKeyFields(request.signedPreKey, at), ...kyberLastResortFields(request.kyberLastResort) };
    const profile = { platform: request.platform, label: request.label ?? null, lastSeenAt: at };

    const existing = await this.prisma.e2EEDevice.findFirst({
      where: { userId, identityKey: request.identityKey, registrationId: request.registrationId, ...ACTIVE },
    });
    if (existing) {
      await this.retireDevices({ userId, sessionId, id: { not: existing.id } });
      await this.prisma.e2EEDevice.update({ where: { id: existing.id }, data: { sessionId, ...keyFields, ...profile } });
      await this.addOneTimeKeys(userId, existing.deviceId, request);
      return { deviceId: existing.deviceId, created: false };
    }

    const deviceId = await this.allocateDeviceId(userId);
    await this.retireDevices({ userId, sessionId });
    await this.prisma.e2EEDevice.create({
      data: { userId, deviceId, registrationId: request.registrationId, identityKey: request.identityKey, sessionId, ...keyFields, ...profile },
    });
    await this.addOneTimeKeys(userId, deviceId, request);
    return { deviceId, created: true };
  }

  async publishKeys(params: { userId: string; sessionId: string; deviceId: number; request: E2EEPublishKeysRequest }): Promise<PreKeyStock> {
    const device = await this.boundDevice(params);
    const { request } = params;
    await assertSigned(this.verifier, device.identityKey, signedKeysOf(request));
    const at = this.now();
    await this.prisma.e2EEDevice.update({
      where: { id: device.id },
      data: {
        lastSeenAt: at,
        ...(request.signedPreKey ? signedPreKeyFields(request.signedPreKey, at) : {}),
        ...(request.kyberLastResort ? kyberLastResortFields(request.kyberLastResort) : {}),
      },
    });
    await this.addOneTimeKeys(params.userId, device.deviceId, request);
    return this.stockOf(params.userId, device.deviceId);
  }

  async prekeyStock(params: { userId: string; sessionId: string }): Promise<PreKeyStock> {
    const device = await this.boundDevice(params);
    return this.stockOf(params.userId, device.deviceId);
  }

  async boundDevice(params: { userId: string; sessionId: string; deviceId?: number }): Promise<ActiveDevice> {
    const device = await this.prisma.e2EEDevice.findFirst({
      where: { userId: params.userId, sessionId: params.sessionId, ...(params.deviceId === undefined ? {} : { deviceId: params.deviceId }), ...ACTIVE },
    });
    if (!device) {
      throw new E2EEDirectoryError(E2EE_ERROR_CODES.DEVICE_NOT_BOUND, 403, 'Cet appareil chiffré n’appartient pas à cette session');
    }
    return device;
  }

  async reserveBundles(params: { requesterUserId: string; targetUserId: string; deviceIds?: readonly number[] }): Promise<E2EEDeviceBundle[]> {
    const devices = await this.activeDevices(params.targetUserId, params.deviceIds);
    return Promise.all(devices.map((device) => this.bundleOf(device, params.requesterUserId)));
  }

  async listDevices(userId: string): Promise<{ deviceId: number; registrationId: number }[]> {
    const devices = await this.activeDevices(userId);
    return devices.map((device) => ({ deviceId: device.deviceId, registrationId: device.registrationId }));
  }

  async retireDevice(params: { userId: string; deviceId: number }): Promise<void> {
    const retired = await this.retireDevices({ userId: params.userId, deviceId: params.deviceId });
    if (retired.length === 0) {
      throw new E2EEDirectoryError(E2EE_ERROR_CODES.DEVICE_NOT_BOUND, 404, 'Appareil chiffré introuvable sur ce compte');
    }
  }

  async activeDevices(userId: string, deviceIds?: readonly number[]): Promise<ActiveDevice[]> {
    return this.prisma.e2EEDevice.findMany({
      where: { userId, ...ACTIVE, ...(deviceIds ? { deviceId: { in: [...deviceIds] } } : {}) },
      orderBy: { deviceId: 'asc' },
    });
  }

  private async addOneTimeKeys(userId: string, deviceId: number, batches: OneTimeBatches): Promise<void> {
    const candidates = oneTimeRowsOf(batches);
    if (candidates.length === 0) return;
    const existing = await this.prisma.e2EEOneTimePreKey.findMany({
      where: { userId, deviceId, keyId: { in: candidates.map((key) => key.keyId) } },
      select: { kind: true, keyId: true },
    });
    const taken = new Set(existing.map(rowKey));
    const fresh = [...new Map(candidates.filter((key) => !taken.has(rowKey(key))).map((key) => [rowKey(key), key])).values()];
    if (fresh.length === 0) return;
    await this.assertStockRoom(userId, deviceId, fresh);
    await this.prisma.e2EEOneTimePreKey.createMany({ data: fresh.map((key) => ({ userId, deviceId, ...key })) });
  }

  private async assertStockRoom(userId: string, deviceId: number, fresh: readonly OneTimeRow[]): Promise<void> {
    const kinds = [...new Set(fresh.map((key) => key.kind))];
    const overflowing = await Promise.all(
      kinds.map(async (kind) => {
        const unused = await this.prisma.e2EEOneTimePreKey.count({ where: { userId, deviceId, kind, usedAt: null } });
        return unused + fresh.filter((key) => key.kind === kind).length > E2EE_ONE_TIME_PREKEY_STOCK_MAX;
      }),
    );
    if (overflowing.some(Boolean)) {
      throw new E2EEDirectoryError(E2EE_ERROR_CODES.PREKEY_STOCK_FULL, 400, 'Le stock de pré-clés uniques de cet appareil est plein');
    }
  }

  private async retireDevices(where: { userId: string; deviceId?: number; sessionId?: string; id?: { not: string } }): Promise<number[]> {
    const doomed = await this.prisma.e2EEDevice.findMany({ where: { ...where, ...ACTIVE }, select: { deviceId: true } });
    if (doomed.length === 0) return [];
    const deviceIds = doomed.map((device) => device.deviceId);
    await this.prisma.e2EEDevice.updateMany({ where: { userId: where.userId, deviceId: { in: deviceIds }, ...ACTIVE }, data: { retiredAt: this.now() } });
    await this.prisma.e2EEOneTimePreKey.deleteMany({ where: { userId: where.userId, deviceId: { in: deviceIds } } });
    // Un appareil retiré ne lit plus rien : ses enveloppes en attente n'ont plus de destinataire légitime.
    await this.prisma.messageEnvelope.deleteMany({ where: { recipientUserId: where.userId, recipientDeviceId: { in: deviceIds } } });
    return deviceIds;
  }

  private async allocateDeviceId(userId: string): Promise<number> {
    const result = (await this.prisma.$runCommandRaw({
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

  private async stockOf(userId: string, deviceId: number): Promise<PreKeyStock> {
    const unused = (kind: string) => this.prisma.e2EEOneTimePreKey.count({ where: { userId, deviceId, kind, usedAt: null } });
    const [oneTimePreKeys, kyberPreKeys] = await Promise.all([unused('ec'), unused('kyber')]);
    return { deviceId, oneTimePreKeys, kyberPreKeys };
  }

  /** UNE commande atomique : la pré-clé n'est jamais lue puis écrite, elle est prise. */
  private async reserveOneTimeKey(params: { userId: string; deviceId: number; kind: 'ec' | 'kyber'; requesterUserId: string }) {
    const result = (await this.prisma.$runCommandRaw({
      findAndModify: 'E2EEOneTimePreKey',
      query: { userId: { $oid: params.userId }, deviceId: params.deviceId, kind: params.kind, usedAt: null },
      sort: { keyId: 1 },
      update: { $set: { usedAt: { $date: this.now().toISOString() }, usedBy: { $oid: params.requesterUserId } } },
      new: true,
      fields: { _id: 1 },
    } as never)) as { value?: { _id?: unknown } | null } | null;
    const id = objectIdOf(result?.value?._id);
    if (!id) return null;
    return this.prisma.e2EEOneTimePreKey.findUnique({ where: { id }, select: { keyId: true, publicKey: true, signature: true } });
  }

  private async bundleOf(device: ActiveDevice, requesterUserId: string): Promise<E2EEDeviceBundle> {
    const address = { userId: device.userId, deviceId: device.deviceId, requesterUserId };
    const [ec, kyber] = await Promise.all([
      this.reserveOneTimeKey({ ...address, kind: 'ec' }),
      this.reserveOneTimeKey({ ...address, kind: 'kyber' }),
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
}

export const createE2EEDirectory = (deps: E2EEDirectoryDeps): E2EEDirectory => new E2EEDirectory(deps);
