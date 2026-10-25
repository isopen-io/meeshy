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
 * seule elle publie ses clés, et il est retiré quand elle finit
 * (`device-retirement.ts`). Un compte a au plus `E2EE_MAX_ACTIVE_DEVICES`
 * appareils actifs, sur les places 1…borne : un nouvel appareil prend la plus
 * petite place libre, jamais sous la `registrationId` d'une AUTRE identité
 * retirée qui l'occupait — c'est elle qui rend le 409 `stale` à l'émetteur dont
 * la session libsignal visait l'ancien occupant (#12543). Une installation qui
 * revient (même identité, même `registrationId`) reprend SA place : les sessions
 * de ses pairs restent valides et ses reconnexions ne consomment rien (#12593).
 * La `registrationId` désigne la GÉNÉRATION d'une place : pré-clés et
 * enveloppes lui appartiennent, jamais à la place (#12592).
 */
import type { Prisma, PrismaClient } from '@meeshy/shared/prisma/client';
import {
  deviceBindingMessage,
  E2EE_DEVICE_BINDING_MAX_SKEW_MS,
  E2EE_DEVICE_ID_MAX,
  E2EE_ERROR_CODES,
  E2EE_MAX_ACTIVE_DEVICES,
  E2EE_ONE_TIME_PREKEY_STOCK_MAX,
  type E2EEDeviceBundle,
  type E2EEEnrollDeviceRequest,
  type E2EEErrorCode,
  type E2EEPublishKeysRequest,
} from '@meeshy/shared/types/e2ee-directory';
import { unsetOrNull } from '../../utils/prisma-unset';
import { RETIRABLE_DEVICE, retireDeviceRows, retireDevicesOfEndedSessions } from './device-retirement';
import type { SignatureVerifier } from './signature-verifier';

export type DirectoryPrisma = Pick<
  PrismaClient,
  'e2EEDevice' | 'e2EEOneTimePreKey' | 'messageEnvelope' | 'userSession' | 'e2EERevokedIdentity' | 'e2EEBindingProof' | '$runCommandRaw'
>;

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

/**
 * Les nuls ÉCRITS à la création. Le connecteur MongoDB de Prisma n'écrit aucun
 * champ facultatif omis, et son filtre `{ champ: null }` ne trouve que le
 * présent-nul : un appareil créé sans `retiredAt` n'était ni actif ni
 * retirable, une pré-clé sans `usedAt` jamais comptée dans le stock (recette
 * staging du 2026-10-24, #12547).
 */
const NEW_DEVICE = { retiredAt: null, pushTokenId: null } as const;
const UNRESERVED = { usedAt: null, usedBy: null } as const;

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

const bindingReplayed = () =>
  new E2EEDirectoryError(E2EE_ERROR_CODES.BINDING_INVALID, 400, 'Cette preuve de possession de la clé d’identité a déjà servi');

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

/** Clé d'identité Curve25519 sérialisée par libsignal : l'octet de type 0x05 puis 32 octets. */
const SERIALIZED_IDENTITY_KEY_BYTES = 33;
const DJB_KEY_TYPE = 0x05;

/**
 * Une seule écriture par clé. `PublicKey.deserialize` de libsignal ignore les
 * octets au-delà des 33 et le décodage base64 tolère un `=` de trop : sans cette
 * garde, la même clé, écrite autrement, échapperait à toute comparaison par
 * chaîne — la révocation d'abord (#12546).
 */
function assertCanonicalIdentityKey(identityKey: string): void {
  const bytes = Buffer.from(identityKey, 'base64');
  const canonical = bytes.length === SERIALIZED_IDENTITY_KEY_BYTES && bytes[0] === DJB_KEY_TYPE && bytes.toString('base64') === identityKey;
  if (!canonical) {
    throw new E2EEDirectoryError(E2EE_ERROR_CODES.IDENTITY_KEY_INVALID, 400, 'La clé d’identité n’a pas la forme sérialisée de libsignal');
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

type ActiveDevice = Awaited<ReturnType<DirectoryPrisma['e2EEDevice']['findMany']>>[number];

type OneTimeRow = { kind: 'ec' | 'kyber'; keyId: number; publicKey: string; signature: string | null };

const oneTimeRowsOf = (batches: OneTimeBatches): OneTimeRow[] => [
  ...(batches.oneTimePreKeys ?? []).map((key) => ({ kind: 'ec' as const, keyId: key.keyId, publicKey: key.publicKey, signature: null })),
  ...(batches.kyberPreKeys ?? []).map((key) => ({ kind: 'kyber' as const, keyId: key.keyId, publicKey: key.publicKey, signature: key.signature })),
];

const rowKey = (key: { kind: string; keyId: number }): string => `${key.kind}:${key.keyId}`;

/** La génération d'une place : ce qu'une installation y a publié n'appartient qu'à elle. */
type Generation = { readonly userId: string; readonly deviceId: number; readonly registrationId: number };

const generationOf = (generation: Generation): Generation => ({
  userId: generation.userId,
  deviceId: generation.deviceId,
  registrationId: generation.registrationId,
});

const deviceLimitReached = () =>
  new E2EEDirectoryError(
    E2EE_ERROR_CODES.DEVICE_LIMIT_REACHED,
    409,
    `Ce compte a déjà ${E2EE_MAX_ACTIVE_DEVICES} appareils chiffrés actifs : retirez-en un pour chiffrer sur celui-ci`,
  );

const isUniqueViolation = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2002';

type SlotRow = { deviceId: number; registrationId: number; identityKey: string; retiredAt: Date | null };

type Installation = { readonly registrationId: number; readonly identityKey: string };

const isSameInstallation = (row: SlotRow, installation: Installation): boolean =>
  row.registrationId === installation.registrationId && row.identityKey === installation.identityKey;

/** Une place retirée sous la même `registrationId` qu'une AUTRE identité masquerait l'appareil périmé (409 `stale`). */
const isBlocked = (row: SlotRow, installation: Installation): boolean =>
  row.retiredAt === null || (row.registrationId === installation.registrationId && !isSameInstallation(row, installation));

const SLOTS = (from: number, to: number): number[] => Array.from({ length: to - from + 1 }, (_, index) => from + index);

/**
 * La place de cette installation : la sienne si elle revient, sinon la plus
 * petite place libre parmi 1…borne, puis — seulement si des places retirées
 * d'autres identités sous la même `registrationId` les bloquent toutes — au-delà.
 * Seul le nombre d'appareils ACTIFS fait refuser.
 */
function freeSlot(rows: readonly SlotRow[], installation: Installation): number | null {
  if (rows.filter((row) => row.retiredAt === null).length >= E2EE_MAX_ACTIVE_DEVICES) return null;
  const own = rows.find((row) => row.retiredAt !== null && isSameInstallation(row, installation));
  if (own) return own.deviceId;
  const blocked = new Set(rows.filter((row) => isBlocked(row, installation)).map((row) => row.deviceId));
  const slot = [...SLOTS(1, E2EE_MAX_ACTIVE_DEVICES), ...SLOTS(E2EE_MAX_ACTIVE_DEVICES + 1, E2EE_DEVICE_ID_MAX)].find((candidate) => !blocked.has(candidate));
  return slot ?? null;
}

type DeviceFields = Omit<Prisma.E2EEDeviceUncheckedCreateInput, 'userId' | 'deviceId'>;

export class E2EEDirectory {
  private readonly prisma: DirectoryPrisma;
  private readonly verifier: SignatureVerifier;
  private readonly now: () => Date;

  constructor(deps: E2EEDirectoryDeps) {
    this.prisma = deps.prisma;
    this.verifier = deps.verifier;
    this.now = deps.now ?? (() => new Date());
  }

  /**
   * Enrôle l'appareil. La révocation se vérifie AVANT et APRÈS la prise de
   * place : le retrait par le propriétaire écrit la révocation puis lit les
   * appareils de l'identité, l'enrôlement écrit l'appareil puis relit la
   * révocation — l'un des deux voit toujours l'autre, et l'identité révoquée ne
   * reste jamais active (#12546).
   */
  async enrollDevice(params: { userId: string; sessionId: string; request: E2EEEnrollDeviceRequest }): Promise<{ deviceId: number; created: boolean }> {
    assertCanonicalIdentityKey(params.request.identityKey);
    const at = this.now();
    await assertBinding(this.verifier, { userId: params.userId, request: params.request, now: at });
    await assertSigned(this.verifier, params.request.identityKey, signedKeysOf(params.request));
    await this.assertNotRevoked(params.userId, params.request.identityKey);
    await this.consumeBinding(params);
    const placed = await this.placeDevice({ ...params, at });
    await this.undoIfRevoked(params.userId, params.request.identityKey);
    return placed;
  }

  /**
   * Une preuve de liaison ne sert qu'une fois par installation (#12933). Elle
   * vaut dix minutes de part et d'autre : rejouée, elle rebranchait l'appareil
   * sur la session du rejoueur et republiait le lot capturé. Elle n'est donc
   * acceptée que si son horodatage signé est STRICTEMENT plus récent que la
   * dernière preuve acceptée pour cette identité et cette `registrationId` —
   * une seule écriture conditionnelle, ou une création que l'index unique
   * départage. Seule la reprise de la même requête par la même session (réponse
   * perdue) passe encore : elle ne peut que refaire ce qui est déjà fait, et le
   * remplacement des pré-clés épargne celles déjà remises.
   */
  private async consumeBinding(params: { userId: string; sessionId: string; request: E2EEEnrollDeviceRequest }): Promise<void> {
    const { userId, sessionId, request } = params;
    const installation = { userId, identityKey: request.identityKey, registrationId: request.registrationId };
    const signedAt = new Date(request.binding.timestamp);
    const { count } = await this.prisma.e2EEBindingProof.updateMany({ where: { ...installation, signedAt: { lt: signedAt } }, data: { signedAt, sessionId } });
    if (count > 0) return;
    const created = await this.prisma.e2EEBindingProof.create({ data: { ...installation, signedAt, sessionId } }).then(
      () => true,
      (error: unknown) => {
        if (isUniqueViolation(error)) return false;
        throw error;
      },
    );
    if (created) return;
    const last = await this.prisma.e2EEBindingProof.findFirst({ where: installation, select: { signedAt: true, sessionId: true } });
    const isRetry = last !== null && last.sessionId === sessionId && last.signedAt.getTime() === signedAt.getTime();
    if (!isRetry) throw bindingReplayed();
  }

  private async placeDevice(params: { userId: string; sessionId: string; request: E2EEEnrollDeviceRequest; at: Date }): Promise<{ deviceId: number; created: boolean }> {
    const { userId, sessionId, request, at } = params;
    const keyFields = { ...signedPreKeyFields(request.signedPreKey, at), ...kyberLastResortFields(request.kyberLastResort) };
    const profile = { platform: request.platform, label: request.label ?? null, lastSeenAt: at };

    const existing = await this.prisma.e2EEDevice.findFirst({
      where: { userId, identityKey: request.identityKey, registrationId: request.registrationId, ...ACTIVE },
    });
    if (existing) {
      await this.retireDevices({ userId, sessionId, id: { not: existing.id } });
      await this.prisma.e2EEDevice.update({ where: { id: existing.id }, data: { sessionId, ...keyFields, ...profile } });
      await this.replaceOneTimeKeys(existing, request);
      await this.addOneTimeKeys(existing, request);
      return { deviceId: existing.deviceId, created: false };
    }

    await retireDevicesOfEndedSessions(this.prisma, { userId, now: at });
    await this.retireDevices({ userId, sessionId });
    const claimed = await this.claimSlot(userId, {
      registrationId: request.registrationId, identityKey: request.identityKey, sessionId, ...keyFields, ...profile,
    });
    await this.addOneTimeKeys({ userId, deviceId: claimed.deviceId, registrationId: request.registrationId }, request);
    return { deviceId: claimed.deviceId, created: !claimed.returning };
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
    await this.addOneTimeKeys(device, request);
    return this.stockOf(device);
  }

  async prekeyStock(params: { userId: string; sessionId: string }): Promise<PreKeyStock> {
    return this.stockOf(await this.boundDevice(params));
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

  /**
   * Le retrait par le propriétaire du compte RÉVOQUE l'identité : elle ne
   * reprend jamais sa place et ne se réenrôle plus sur ce compte, même avec une
   * preuve de liaison fraîche — un appareil révoqué, ou un jeton volé qui l'a
   * révoqué, ne la ramène pas. L'installation doit tirer une nouvelle identité.
   */
  async retireDevice(params: { userId: string; deviceId: number }): Promise<void> {
    const device = await this.prisma.e2EEDevice.findFirst({
      where: { userId: params.userId, deviceId: params.deviceId, ...ACTIVE },
      select: { identityKey: true },
    });
    if (!device) {
      throw new E2EEDirectoryError(E2EE_ERROR_CODES.DEVICE_NOT_BOUND, 404, 'Appareil chiffré introuvable sur ce compte');
    }
    await this.prisma.e2EERevokedIdentity.upsert({
      where: { userId_identityKey: { userId: params.userId, identityKey: device.identityKey } },
      create: { userId: params.userId, identityKey: device.identityKey, revokedAt: this.now() },
      update: {},
    });
    await this.retireDevices({ userId: params.userId, deviceId: params.deviceId });
    await this.retireDevices({ userId: params.userId, identityKey: device.identityKey });
  }

  private async undoIfRevoked(userId: string, identityKey: string): Promise<void> {
    try {
      await this.assertNotRevoked(userId, identityKey);
    } catch (error) {
      await this.retireDevices({ userId, identityKey });
      throw error;
    }
  }

  private async assertNotRevoked(userId: string, identityKey: string): Promise<void> {
    const revoked = await this.prisma.e2EERevokedIdentity.findFirst({ where: { userId, identityKey }, select: { id: true } });
    if (revoked) {
      throw new E2EEDirectoryError(
        E2EE_ERROR_CODES.IDENTITY_REVOKED,
        409,
        'Cet appareil chiffré a été retiré du compte : il doit générer une nouvelle identité pour chiffrer à nouveau',
      );
    }
  }

  async activeDevices(userId: string, deviceIds?: readonly number[]): Promise<ActiveDevice[]> {
    return this.prisma.e2EEDevice.findMany({
      where: { userId, ...ACTIVE, ...(deviceIds ? { deviceId: { in: [...deviceIds] } } : {}) },
      orderBy: { deviceId: 'asc' },
    });
  }

  /**
   * Un enrôlement COMPLET d'une identité déjà active ouvre une nouvelle
   * génération de pré-clés uniques (#12882) : une installation réinstallée
   * garde son identité du trousseau mais a perdu ses clés privées, et son
   * compteur repart de 1. Les clés NON RÉSERVÉES de la nature qu'elle publie
   * sont donc remplacées — aucune clé publique morte ne reste servie.
   *
   * Une clé déjà remise à un pair, elle, n'est jamais effacée (#12933) : sa
   * ligne garde la réservation, et `addOneTimeKeys` écarte ce `keyId` pour
   * toute la génération. Effacer la ligne puis réinsérer le lot la remettait
   * en service : deux pairs ouvraient leur session sur la même pré-clé
   * « unique ». Un réenrôlement sans lot (base intacte, session nouvelle) ne
   * touche à rien.
   */
  private async replaceOneTimeKeys(generation: Generation, batches: OneTimeBatches): Promise<void> {
    const kinds = [...new Set(oneTimeRowsOf(batches).map((key) => key.kind))];
    if (kinds.length === 0) return;
    await this.prisma.e2EEOneTimePreKey.deleteMany({ where: { ...generationOf(generation), kind: { in: kinds }, ...unsetOrNull('usedAt') } });
  }

  private async addOneTimeKeys(generation: Generation, batches: OneTimeBatches): Promise<void> {
    const candidates = oneTimeRowsOf(batches);
    if (candidates.length === 0) return;
    const existing = await this.prisma.e2EEOneTimePreKey.findMany({
      where: { ...generationOf(generation), keyId: { in: candidates.map((key) => key.keyId) } },
      select: { kind: true, keyId: true },
    });
    const taken = new Set(existing.map(rowKey));
    const fresh = [...new Map(candidates.filter((key) => !taken.has(rowKey(key))).map((key) => [rowKey(key), key])).values()];
    if (fresh.length === 0) return;
    await this.assertStockRoom(generation, fresh);
    await this.prisma.e2EEOneTimePreKey.createMany({ data: fresh.map((key) => ({ ...generationOf(generation), ...key, ...UNRESERVED })) });
  }

  private async assertStockRoom(generation: Generation, fresh: readonly OneTimeRow[]): Promise<void> {
    const kinds = [...new Set(fresh.map((key) => key.kind))];
    const overflowing = await Promise.all(
      kinds.map(async (kind) => {
        const unused = await this.prisma.e2EEOneTimePreKey.count({ where: { ...generationOf(generation), kind, usedAt: null } });
        return unused + fresh.filter((key) => key.kind === kind).length > E2EE_ONE_TIME_PREKEY_STOCK_MAX;
      }),
    );
    if (overflowing.some(Boolean)) {
      throw new E2EEDirectoryError(E2EE_ERROR_CODES.PREKEY_STOCK_FULL, 400, 'Le stock de pré-clés uniques de cet appareil est plein');
    }
  }

  private async retireDevices(where: { userId: string; deviceId?: number; sessionId?: string; identityKey?: string; id?: { not: string } }): Promise<number[]> {
    const doomed = await this.prisma.e2EEDevice.findMany({ where: { ...where, ...ACTIVE }, select: RETIRABLE_DEVICE });
    const retired = await retireDeviceRows(this.prisma, { devices: doomed, now: this.now() });
    return retired.map((device) => device.deviceId);
  }

  /**
   * Prend une place pour cet appareil, sans lecture-puis-écriture fautive :
   * une place jamais servie se prend par `create` (l'index unique
   * `(userId, deviceId)` départage deux enrôlements simultanés), une place
   * retirée par un `updateMany` conditionné à `retiredAt` non nul, atomique sur
   * son document. Le perdant relit et prend la suivante, ou bute sur la borne.
   */
  private async claimSlot(userId: string, fields: DeviceFields): Promise<{ deviceId: number; returning: boolean }> {
    const installation = { registrationId: fields.registrationId, identityKey: fields.identityKey };
    for (let attempt = 0; attempt <= E2EE_MAX_ACTIVE_DEVICES; attempt += 1) {
      const rows = await this.prisma.e2EEDevice.findMany({
        where: { userId },
        select: { deviceId: true, registrationId: true, identityKey: true, retiredAt: true },
      });
      const slot = freeSlot(rows, installation);
      if (slot === null) throw deviceLimitReached();
      const previous = rows.find((row) => row.deviceId === slot);
      if (await this.takeSlot(userId, slot, fields, previous)) {
        return { deviceId: slot, returning: previous !== undefined && isSameInstallation(previous, installation) };
      }
    }
    throw deviceLimitReached();
  }

  private async takeSlot(userId: string, deviceId: number, fields: DeviceFields, previous: SlotRow | undefined): Promise<boolean> {
    if (!previous) {
      return this.prisma.e2EEDevice.create({ data: { userId, deviceId, ...fields, ...NEW_DEVICE } }).then(
        () => true,
        (error: unknown) => {
          if (isUniqueViolation(error)) return false;
          throw error;
        },
      );
    }
    const at = this.now();
    const { count } = await this.prisma.e2EEDevice.updateMany({
      where: {
        userId,
        deviceId,
        retiredAt: { not: null },
        registrationId: previous.registrationId,
        identityKey: previous.identityKey,
      },
      data: { ...fields, pushTokenId: null, createdAt: at, retiredAt: null },
    });
    if (count === 0) return false;
    await this.prisma.e2EEOneTimePreKey.deleteMany({ where: { userId, deviceId } });
    await this.prisma.messageEnvelope.deleteMany({
      where: { recipientUserId: userId, recipientDeviceId: deviceId, recipientRegistrationId: { not: fields.registrationId } },
    });
    return true;
  }

  private async stockOf(generation: Generation): Promise<PreKeyStock> {
    const unused = (kind: string) => this.prisma.e2EEOneTimePreKey.count({ where: { ...generationOf(generation), kind, usedAt: null } });
    const [oneTimePreKeys, kyberPreKeys] = await Promise.all([unused('ec'), unused('kyber')]);
    return { deviceId: generation.deviceId, oneTimePreKeys, kyberPreKeys };
  }

  /** UNE commande atomique : la pré-clé n'est jamais lue puis écrite, elle est prise. */
  private async reserveOneTimeKey(params: Generation & { kind: 'ec' | 'kyber'; requesterUserId: string }) {
    const result = (await this.prisma.$runCommandRaw({
      findAndModify: 'E2EEOneTimePreKey',
      query: { userId: { $oid: params.userId }, deviceId: params.deviceId, registrationId: params.registrationId, kind: params.kind, usedAt: null },
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
    const address = { userId: device.userId, deviceId: device.deviceId, registrationId: device.registrationId, requesterUserId };
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
