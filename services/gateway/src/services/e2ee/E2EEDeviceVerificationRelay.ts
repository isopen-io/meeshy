/**
 * LE RELAIS DES MESSAGES DE COMPARAISON — confirmation d'un appareil par code court (#19156).
 *
 * Spécification `docs/superpowers/specs/2026-11-17-e2ee-ajout-appareil-par-code.md`, § 5.2 ;
 * décision `services/gateway/decisions/2026-11-17-un-appareil-s-ajoute-par-un-code-a-confirmer.md`.
 *
 * `request`, `accept`, `reveal`, `method` et `cancel` sont PUBLICS par construction : ils
 * voyagent en clair (sous TLS), entre deux générations d'appareil du MÊME compte, jamais par
 * libsignal (une enveloppe d'un appareil non approuvé ne s'ouvre jamais). La passerelle reste
 * un relais aveugle : **aucune de ses vérifications n'est une garantie de sécurité**, ce sont
 * des contrôles d'HYGIÈNE (la sécurité vient de la comparaison des codes) :
 *  - l'émetteur est la génération liée à la session (`relayedFrom`), jamais une déclaration ;
 *  - les destinataires se résolvent parmi les appareils ACTIFS et CAPABLES de l'appelant :
 *    aucun message ne franchit la frontière d'un compte ;
 *  - `from` de `request` et `accept` décrit exactement l'émetteur tel que l'annuaire le tient
 *    (clé, plateforme, libellé) ; les schémas refusent ce que les clients refusent, et le
 *    relais ne corrige jamais un message ;
 *  - débits par génération émettrice, en fenêtres glissantes d'une heure : 4 `request`,
 *    30 messages, 8 envois par `tx` ; aucune borne par compte (le détenteur du mot de passe
 *    l'épuisait, revue de confirmation) ;
 *  - dix minutes de vie ; l'accusé et le balayage ne touchent que la génération de l'appelant ;
 *  - une `request` prise (le relais transmet un `reveal`) : ses autres copies deviennent un
 *    `cancel(accepted-elsewhere)` qui nomme la génération qui a répondu (`answeredBy`) ;
 *  - les journaux ne portent que `tx` tronqué, le genre et les générations.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { containsPrivateKeyField, E2EE_ERROR_CODES, readCapabilities } from '@meeshy/shared/types/e2ee-directory';
import {
  DEVICE_TRUST_CAPABILITY,
  DEVICE_VERIFICATION_ERROR_CODES,
  DEVICE_VERIFICATION_TTL_MS,
  deviceVerificationMessageSchema,
  deviceVerificationSendSchema,
  isComparablePlatform,
  type DeviceGenerationRefWire,
  type DeviceVerificationMessage,
  type DeviceVerificationSent,
  type ServedDeviceVerification,
} from '@meeshy/shared/types/e2ee-device-trust';
import { ObjectId } from 'mongodb';
import { enhancedLogger } from '../../utils/logger-enhanced';
import type { SlidingWindowCounter } from './sliding-window';

const logger = enhancedLogger.child({ module: 'E2EEDeviceVerificationRelay' });

export const DEVICE_VERIFICATION_RATES = {
  requestsPerHour: 4,
  messagesPerHour: 30,
  sendsPerTx: 8,
} as const;

const HOUR_MS = 60 * 60 * 1000;
const LIST_PAGE = 100;

export type VerificationRelayPrisma = Pick<PrismaClient, 'e2EEDevice' | 'e2EEDeviceVerificationMessage'>;

export type VerificationCaller = { readonly userId: string; readonly sessionId: string };

/** Un message déposé pour UNE génération, prêt à partir vers sa room. */
export type VerificationDelivery = {
  readonly recipient: { readonly userId: string; readonly deviceId: number; readonly registrationId: number };
  readonly served: ServedDeviceVerification;
};

export type E2EEDeviceVerificationRelayDeps = {
  readonly prisma: VerificationRelayPrisma;
  readonly counters: SlidingWindowCounter;
  readonly now?: () => Date;
  readonly deliver?: (deliveries: readonly VerificationDelivery[]) => void;
  /** Une `request` vient d'être relayée par cette génération : l'annonce décide d'un push (§ 5.3). */
  readonly onRequest?: (sender: { readonly userId: string; readonly deviceId: number; readonly registrationId: number }) => Promise<void>;
};

export type VerificationRefusalStatus = 400 | 403 | 409 | 429;

export class DeviceVerificationRefusedError extends Error {
  constructor(
    readonly code: string,
    readonly status: VerificationRefusalStatus,
    message: string,
    readonly retryAfter?: number,
  ) {
    super(message);
    this.name = 'DeviceVerificationRefusedError';
  }
}

const invalid = () => new DeviceVerificationRefusedError(DEVICE_VERIFICATION_ERROR_CODES.INVALID, 400, 'Message de comparaison invalide');

type DeviceRow = {
  readonly deviceId: number;
  readonly registrationId: number;
  readonly identityKey: string;
  readonly platform: string;
  readonly label: string | null;
  readonly capabilities?: unknown;
};

type Generation = { readonly userId: string; readonly deviceId: number; readonly registrationId: number };

const isCapable = (device: DeviceRow): boolean =>
  readCapabilities(device.capabilities).includes(DEVICE_TRUST_CAPABILITY) && isComparablePlatform(device.platform);

const sameGeneration = (left: { deviceId: number; registrationId: number }, right: { deviceId: number; registrationId: number }): boolean =>
  left.deviceId === right.deviceId && left.registrationId === right.registrationId;

const refOf = (device: { deviceId: number; registrationId: number }): DeviceGenerationRefWire => ({
  deviceId: device.deviceId,
  registrationId: device.registrationId,
});

/** `accept`, `reveal` et `method` ne vont qu'à UNE génération nommée : celle de la transaction. */
const NAMED_ONLY: ReadonlySet<DeviceVerificationMessage['type']> = new Set(['accept', 'reveal', 'method']);

/** `from` décrit exactement l'émetteur tel que l'annuaire le tient : libellé absent ⇔ libellé omis. */
function describesSender(message: DeviceVerificationMessage, sender: DeviceRow, userId: string): boolean {
  if (message.type !== 'request' && message.type !== 'accept') return true;
  const { from } = message;
  return (
    from.userId === userId &&
    sameGeneration(from, sender) &&
    from.identityKey === sender.identityKey &&
    from.platform === sender.platform &&
    (from.label ?? null) === (sender.label ?? null)
  );
}

const tracedTx = (tx: string): string => tx.slice(0, 6);

type StoredRow = {
  readonly id: string;
  readonly senderDeviceId: number;
  readonly senderRegistrationId: number;
  readonly answeredByDeviceId: number | null;
  readonly answeredByRegistrationId: number | null;
  readonly body: string;
  readonly createdAt: Date;
};

/** Relit le corps rangé : il a passé les schémas au dépôt ; une ligne qui ne les passe plus n'est jamais servie. */
function servedOf(row: StoredRow): ServedDeviceVerification | null {
  const parsed = (() => {
    try {
      return deviceVerificationMessageSchema.safeParse(JSON.parse(row.body));
    } catch {
      return null;
    }
  })();
  if (!parsed?.success) return null;
  const answeredBy =
    row.answeredByDeviceId !== null && row.answeredByRegistrationId !== null
      ? { deviceId: row.answeredByDeviceId, registrationId: row.answeredByRegistrationId }
      : undefined;
  return {
    id: row.id,
    relayedFrom: { deviceId: row.senderDeviceId, registrationId: row.senderRegistrationId },
    message: parsed.data,
    ...(answeredBy ? { answeredBy } : {}),
    createdAt: row.createdAt.toISOString(),
  };
}

const rateLimited = (retryAfter: number): DeviceVerificationRefusedError =>
  new DeviceVerificationRefusedError(
    DEVICE_VERIFICATION_ERROR_CODES.RATE_LIMITED,
    429,
    'Trop de messages de comparaison depuis cet appareil. Patientez avant de réessayer.',
    retryAfter,
  );

export class E2EEDeviceVerificationRelay {
  private readonly prisma: VerificationRelayPrisma;
  private readonly counters: SlidingWindowCounter;
  private readonly now: () => Date;
  private readonly deliver: (deliveries: readonly VerificationDelivery[]) => void;
  private readonly onRequest?: E2EEDeviceVerificationRelayDeps['onRequest'];

  constructor(deps: E2EEDeviceVerificationRelayDeps) {
    this.prisma = deps.prisma;
    this.counters = deps.counters;
    this.now = deps.now ?? (() => new Date());
    this.deliver = deps.deliver ?? (() => undefined);
    this.onRequest = deps.onRequest;
  }

  async send(params: { readonly caller: VerificationCaller; readonly payload: unknown }): Promise<DeviceVerificationSent> {
    if (containsPrivateKeyField(params.payload)) throw invalid();
    const parsed = deviceVerificationSendSchema.safeParse(params.payload);
    if (!parsed.success) throw invalid();
    const { to, message } = parsed.data;
    if (to === 'others' && NAMED_ONLY.has(message.type)) throw invalid();
    const { userId } = params.caller;
    const sender = await this.boundDevice(params.caller);
    if (!isCapable(sender)) {
      throw new DeviceVerificationRefusedError(
        DEVICE_VERIFICATION_ERROR_CODES.NOT_CAPABLE,
        409,
        'Cet appareil doit se réenrôler en déclarant la confirmation par code avant de comparer',
      );
    }
    if (!describesSender(message, sender, userId)) {
      throw new DeviceVerificationRefusedError(
        DEVICE_VERIFICATION_ERROR_CODES.FROM_MISMATCH,
        403,
        'Le message ne décrit pas cet appareil tel que l’annuaire le tient',
      );
    }
    const recipients = await this.recipientsOf(userId, sender, to);
    await this.spend({ userId, ...refOf(sender) }, message);
    const at = this.now();
    const stored = await this.store({ userId, sender, recipients, message, at });
    const substituted = await this.substitute({ userId, sender, recipients, message, at });
    this.deliver([...stored, ...substituted]);
    logger.info('e2ee device verification relayed', {
      tx: tracedTx(message.tx),
      kind: message.type,
      from: `${sender.deviceId}:${sender.registrationId}`,
      to: recipients.map((recipient) => `${recipient.deviceId}:${recipient.registrationId}`),
    });
    if (message.type === 'request' && this.onRequest) {
      // Le push éventuel ne retient pas l'accusé du dépôt.
      this.onRequest({ userId, ...refOf(sender) }).catch((error: unknown) => logger.warn('e2ee device verification push not sent', { error }));
    }
    return { ids: stored.map((delivery) => delivery.served.id), recipients: recipients.map(refOf) };
  }

  /** Les messages non expirés, non accusés, adressés à la génération de CET appareil. */
  async list(params: { readonly caller: VerificationCaller; readonly after?: string }): Promise<ServedDeviceVerification[]> {
    const device = await this.boundDevice(params.caller);
    const rows = await this.prisma.e2EEDeviceVerificationMessage.findMany({
      where: {
        userId: params.caller.userId,
        recipientDeviceId: device.deviceId,
        recipientRegistrationId: device.registrationId,
        ackedAt: null,
        expiresAt: { gt: this.now() },
        ...(params.after ? { id: { gt: params.after } } : {}),
      },
      orderBy: { id: 'asc' },
      take: LIST_PAGE,
    });
    return rows.map(servedOf).filter((served): served is ServedDeviceVerification => served !== null);
  }

  /** Retire de ce qui est servi, parmi ces ids, ceux qui sont adressés à la génération de l'appelant — et eux seuls. */
  async ack(params: { readonly caller: VerificationCaller; readonly ids: readonly string[] }): Promise<number> {
    const device = await this.boundDevice(params.caller);
    const { count } = await this.prisma.e2EEDeviceVerificationMessage.updateMany({
      where: {
        id: { in: [...params.ids] },
        userId: params.caller.userId,
        recipientDeviceId: device.deviceId,
        recipientRegistrationId: device.registrationId,
        ackedAt: null,
      },
      data: { ackedAt: this.now() },
    });
    return count;
  }

  /** Le balayage : tout message échu disparaît, servi ou non. */
  async sweep(): Promise<number> {
    const { count } = await this.prisma.e2EEDeviceVerificationMessage.deleteMany({ where: { expiresAt: { lt: this.now() } } });
    return count;
  }

  private async boundDevice(caller: VerificationCaller): Promise<DeviceRow> {
    const device = await this.prisma.e2EEDevice.findFirst({
      where: { userId: caller.userId, sessionId: caller.sessionId, retiredAt: null },
      select: { deviceId: true, registrationId: true, identityKey: true, platform: true, label: true, capabilities: true },
    });
    if (!device) {
      throw new DeviceVerificationRefusedError(E2EE_ERROR_CODES.DEVICE_NOT_BOUND, 403, 'Cet appareil chiffré n’appartient pas à cette session');
    }
    return device;
  }

  private async spend(sender: Generation, message: DeviceVerificationMessage): Promise<void> {
    const at = this.now().getTime();
    const key = `verification:${sender.userId}:${sender.deviceId}:${sender.registrationId}`;
    const windows = [
      { key: `${key}:tx:${message.tx}`, max: DEVICE_VERIFICATION_RATES.sendsPerTx },
      ...(message.type === 'request' ? [{ key: `${key}:requests`, max: DEVICE_VERIFICATION_RATES.requestsPerHour }] : []),
      { key: `${key}:messages`, max: DEVICE_VERIFICATION_RATES.messagesPerHour },
    ];
    // Toutes les fenêtres sont lues AVANT d'en débiter une : un dépôt refusé ne compte nulle part,
    // et ne crée aucune clé (pas même celle de sa transaction).
    const verdicts = await Promise.all(windows.map((window) => this.counters.peek(window.key, { max: window.max, windowMs: HOUR_MS, now: at })));
    const refused = verdicts.find((verdict) => !verdict.allowed);
    if (refused) throw rateLimited(refused.retryAfter);
    for (const window of windows) {
      const verdict = await this.counters.hit(window.key, { max: window.max, windowMs: HOUR_MS, now: at });
      if (!verdict.allowed) throw rateLimited(verdict.retryAfter);
    }
  }

  /** `others` : mes autres appareils actifs et capables ; une génération nommée : active, capable, et pas moi. */
  private async recipientsOf(userId: string, sender: DeviceRow, to: 'others' | DeviceGenerationRefWire): Promise<DeviceRow[]> {
    const active: DeviceRow[] = await this.prisma.e2EEDevice.findMany({
      where: { userId, retiredAt: null },
      select: { deviceId: true, registrationId: true, identityKey: true, platform: true, label: true, capabilities: true },
      orderBy: { deviceId: 'asc' },
    });
    const candidates = active.filter((device) => !sameGeneration(device, sender) && isCapable(device));
    if (to === 'others') return candidates;
    const named = candidates.find((device) => sameGeneration(device, to));
    if (!named) {
      throw new DeviceVerificationRefusedError(
        E2EE_ERROR_CODES.DEVICE_CHANGED,
        409,
        'Cet appareil n’est plus actif, ou ne sait pas confirmer par code : relisez la liste de vos appareils',
      );
    }
    return [named];
  }

  private async store(params: {
    readonly userId: string;
    readonly sender: DeviceRow;
    readonly recipients: readonly DeviceGenerationRefWire[];
    readonly message: DeviceVerificationMessage;
    readonly at: Date;
    readonly answeredBy?: DeviceGenerationRefWire;
  }): Promise<VerificationDelivery[]> {
    const { userId, sender, message, at, answeredBy } = params;
    const expiresAt = new Date(at.getTime() + DEVICE_VERIFICATION_TTL_MS);
    const body = JSON.stringify(message);
    return Promise.all(
      params.recipients.map(async (recipient) => {
        const row = await this.prisma.e2EEDeviceVerificationMessage.create({
          data: {
            id: new ObjectId().toHexString(),
            userId,
            tx: message.tx,
            kind: message.type,
            senderDeviceId: sender.deviceId,
            senderRegistrationId: sender.registrationId,
            recipientDeviceId: recipient.deviceId,
            recipientRegistrationId: recipient.registrationId,
            answeredByDeviceId: answeredBy?.deviceId ?? null,
            answeredByRegistrationId: answeredBy?.registrationId ?? null,
            body,
            createdAt: at,
            expiresAt,
            ackedAt: null,
          },
        });
        const served = servedOf(row);
        if (!served) throw invalid();
        return { recipient: { userId, ...refOf(recipient) }, served };
      }),
    );
  }

  /**
   * Les copies d'une `request` de cet émetteur, pour ce `tx`, adressées à d'AUTRES générations :
   *  - quand un `reveal` part (la demande est PRISE), chacune devient un
   *    `cancel(accepted-elsewhere)` qui nomme la génération qui a répondu (`answeredBy`), servi
   *    même à un appareil qui avait déjà accusé la demande — c'est lui qui montrait l'invite ;
   *  - quand l'émetteur annule, sa `cancel` les remplace (la copie de la demande disparaît).
   */
  private async substitute(params: {
    readonly userId: string;
    readonly sender: DeviceRow;
    readonly recipients: readonly DeviceRow[];
    readonly message: DeviceVerificationMessage;
    readonly at: Date;
  }): Promise<VerificationDelivery[]> {
    const { userId, sender, message } = params;
    if (message.type !== 'reveal' && message.type !== 'cancel') return [];
    const pending = await this.prisma.e2EEDeviceVerificationMessage.findMany({
      where: { userId, tx: message.tx, kind: 'request', senderDeviceId: sender.deviceId, senderRegistrationId: sender.registrationId },
      select: { id: true, recipientDeviceId: true, recipientRegistrationId: true },
    });
    const addressedTo = (row: { recipientDeviceId: number; recipientRegistrationId: number }) => ({
      deviceId: row.recipientDeviceId,
      registrationId: row.recipientRegistrationId,
    });
    const isRecipient = (row: { recipientDeviceId: number; recipientRegistrationId: number }) =>
      params.recipients.some((recipient) => sameGeneration(recipient, addressedTo(row)));
    if (message.type === 'cancel') {
      const replaced = pending.filter(isRecipient).map((row) => row.id);
      if (replaced.length > 0) await this.prisma.e2EEDeviceVerificationMessage.deleteMany({ where: { id: { in: replaced }, userId } });
      return [];
    }
    const answerer = params.recipients[0];
    const taken = pending.filter((row) => !isRecipient(row));
    if (!answerer || taken.length === 0) return [];
    await this.prisma.e2EEDeviceVerificationMessage.deleteMany({ where: { id: { in: taken.map((row) => row.id) }, userId } });
    const cancel: DeviceVerificationMessage = { v: 1, type: 'cancel', tx: message.tx, reason: 'accepted-elsewhere' };
    return this.store({ userId, sender, recipients: taken.map(addressedTo), message: cancel, at: params.at, answeredBy: refOf(answerer) });
  }
}

export const createE2EEDeviceVerificationRelay = (deps: E2EEDeviceVerificationRelayDeps): E2EEDeviceVerificationRelay =>
  new E2EEDeviceVerificationRelay(deps);

