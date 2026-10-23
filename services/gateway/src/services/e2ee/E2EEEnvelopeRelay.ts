/**
 * LE RELAIS D'ENVELOPPES LIBSIGNAL OPAQUES (#3706, spec § 3.4 et § 4.3).
 *
 * La passerelle ne voit ni ne produit aucun clair : elle vérifie qu'un envoi
 * s'adresse exactement aux appareils que l'annuaire connaît (Sesame), range une
 * enveloppe par appareil destinataire, ne la sert qu'à CET appareil (sa
 * session), l'efface à son accusé de réception et au plus tard à 30 jours.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import {
  E2EE_ENVELOPE_RETENTION_DAYS,
  E2EE_ERROR_CODES,
  type E2EEEnvelope,
  type E2EERelayRequest,
  type E2EEServedEnvelope,
} from '@meeshy/shared/types/e2ee-directory';
import { E2eeRelayRefusedError } from './e2ee-relay-errors';
import { compareDeviceSets, isDeviceSetExact } from './sesame';

export type RelayPrisma = Pick<PrismaClient, 'e2EEDevice' | 'participant' | 'messageEnvelope'>;

export type AdmittedRelay = {
  readonly senderUserId: string;
  readonly senderDeviceId: number;
  readonly envelopes: readonly E2EEEnvelope[];
};

export type EnvelopeDelivery = {
  readonly recipient: { readonly userId: string; readonly deviceId: number };
  readonly envelope: E2EEServedEnvelope;
};

const LIST_LIMIT_MAX = 200;
const DAY_MS = 24 * 60 * 60 * 1000;

const notBound = () =>
  new E2eeRelayRefusedError(E2EE_ERROR_CODES.DEVICE_NOT_BOUND, 403, 'Cet appareil chiffré n’appartient pas à cette session');

type EnvelopeRow = {
  id: string;
  messageId: string;
  conversationId: string;
  senderUserId: string;
  senderDeviceId: number;
  type: number;
  body: string;
  createdAt: Date;
};

const served = (row: EnvelopeRow): E2EEServedEnvelope => ({
  id: row.id,
  messageId: row.messageId,
  conversationId: row.conversationId,
  senderUserId: row.senderUserId,
  senderDeviceId: row.senderDeviceId,
  type: row.type === 2 ? 2 : 3,
  body: row.body,
  createdAt: row.createdAt.toISOString(),
});

export class E2EEEnvelopeRelay {
  private readonly prisma: RelayPrisma;
  private readonly now: () => Date;

  constructor(deps: { readonly prisma: RelayPrisma; readonly now?: () => Date }) {
    this.prisma = deps.prisma;
    this.now = deps.now ?? (() => new Date());
  }

  /** L'appareil ACTIF lié à cette session (et, s'il est nommé, portant ce numéro). */
  async deviceOfSession(userId: string, sessionId: string | null, deviceId?: number): Promise<{ deviceId: number }> {
    if (!sessionId) throw notBound();
    const device = await this.prisma.e2EEDevice.findFirst({
      where: { userId, sessionId, retiredAt: null, ...(deviceId === undefined ? {} : { deviceId }) },
      select: { deviceId: true },
    });
    if (!device) throw notBound();
    return device;
  }

  async admit(params: { conversationId: string; senderUserId: string; relay: E2EERelayRequest }): Promise<AdmittedRelay> {
    const { conversationId, senderUserId, relay } = params;
    await this.deviceOfSession(senderUserId, relay.sessionId, relay.senderDeviceId);
    await this.assertOwnExclusions(senderUserId, relay);
    const mismatch = compareDeviceSets({
      directory: await this.directoryOf(conversationId),
      sender: { userId: senderUserId, deviceId: relay.senderDeviceId },
      addressed: relay.envelopes,
      excludedOwnDevices: relay.unapprovedOwnDevices,
    });
    if (!isDeviceSetExact(mismatch)) {
      throw new E2eeRelayRefusedError(
        E2EE_ERROR_CODES.DEVICES_MISMATCH,
        409,
        'La liste des appareils destinataires ne correspond pas à l’annuaire',
        mismatch,
      );
    }
    return { senderUserId, senderDeviceId: relay.senderDeviceId, envelopes: relay.envelopes };
  }

  async persist(params: { messageId: string; conversationId: string; admitted: AdmittedRelay }): Promise<EnvelopeDelivery[]> {
    const { messageId, conversationId, admitted } = params;
    await this.prisma.messageEnvelope.createMany({
      data: admitted.envelopes.map((envelope) => ({
        messageId,
        conversationId,
        recipientUserId: envelope.userId,
        recipientDeviceId: envelope.deviceId,
        senderUserId: admitted.senderUserId,
        senderDeviceId: admitted.senderDeviceId,
        type: envelope.type,
        body: envelope.body,
      })),
    });
    const rows = await this.prisma.messageEnvelope.findMany({ where: { messageId } });
    return rows.map((row) => ({
      recipient: { userId: row.recipientUserId, deviceId: row.recipientDeviceId },
      envelope: served(row),
    }));
  }

  async listFor(params: { userId: string; sessionId: string | null; after?: string; limit?: number }): Promise<E2EEServedEnvelope[]> {
    const device = await this.deviceOfSession(params.userId, params.sessionId);
    const rows = await this.prisma.messageEnvelope.findMany({
      where: { recipientUserId: params.userId, recipientDeviceId: device.deviceId, ...(params.after ? { id: { gt: params.after } } : {}) },
      orderBy: { id: 'asc' },
      take: Math.min(Math.max(params.limit ?? 100, 1), LIST_LIMIT_MAX),
    });
    return rows.map(served);
  }

  async ack(params: { userId: string; sessionId: string | null; ids: readonly string[] }): Promise<number> {
    const device = await this.deviceOfSession(params.userId, params.sessionId);
    const { count } = await this.prisma.messageEnvelope.deleteMany({
      where: { id: { in: [...params.ids] }, recipientUserId: params.userId, recipientDeviceId: device.deviceId },
    });
    return count;
  }

  async sweep(): Promise<number> {
    const cutoff = new Date(this.now().getTime() - E2EE_ENVELOPE_RETENTION_DAYS * DAY_MS);
    const { count } = await this.prisma.messageEnvelope.deleteMany({ where: { createdAt: { lt: cutoff } } });
    return count;
  }

  /** Chaque appareil actif de chaque participant inscrit et actif de la conversation. */
  private async directoryOf(conversationId: string) {
    const participants = await this.prisma.participant.findMany({
      where: { conversationId, isActive: true, userId: { not: null } },
      select: { userId: true },
    });
    const userIds = [...new Set(participants.map((participant) => participant.userId).filter((id): id is string => Boolean(id)))];
    return this.prisma.e2EEDevice.findMany({
      where: { userId: { in: userIds }, retiredAt: null },
      select: { userId: true, deviceId: true, registrationId: true },
    });
  }

  private async assertOwnExclusions(senderUserId: string, request: E2EERelayRequest): Promise<void> {
    if (request.unapprovedOwnDevices.length === 0) return;
    const own = await this.prisma.e2EEDevice.findMany({
      where: { userId: senderUserId, retiredAt: null, deviceId: { in: [...request.unapprovedOwnDevices] } },
      select: { deviceId: true },
    });
    const known = new Set(own.map((device) => device.deviceId));
    const invalid = request.unapprovedOwnDevices.some((deviceId) => !known.has(deviceId) || deviceId === request.senderDeviceId);
    if (invalid) {
      throw new E2eeRelayRefusedError(E2EE_ERROR_CODES.ENVELOPES_INVALID, 400, 'Seuls vos propres appareils peuvent être exclus d’un envoi chiffré');
    }
  }
}

export const createE2EEEnvelopeRelay = (deps: { readonly prisma: RelayPrisma; readonly now?: () => Date }): E2EEEnvelopeRelay =>
  new E2EEEnvelopeRelay(deps);
