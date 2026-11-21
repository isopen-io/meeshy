/**
 * LE RELAIS D'ENVELOPPES LIBSIGNAL OPAQUES (#3706, spec § 3.4 et § 4.3).
 *
 * La passerelle ne voit ni ne produit aucun clair : elle vérifie qu'un envoi
 * s'adresse exactement aux appareils que l'annuaire connaît (Sesame), range une
 * enveloppe par appareil destinataire, ne la sert qu'à CET appareil (sa
 * session et sa génération : la `registrationId` visée, car une place se
 * reprend — #12592), l'efface à son accusé de réception et au plus tard à 30 jours.
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
  readonly recipient: { readonly userId: string; readonly deviceId: number; readonly registrationId: number };
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
  recipientRegistrationId: number;
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
  recipientRegistrationId: row.recipientRegistrationId,
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

  /** L'appareil ACTIF lié à cette session (et, s'il est nommé, portant ce numéro), avec sa génération. */
  async deviceOfSession(userId: string, sessionId: string | null, deviceId?: number): Promise<{ deviceId: number; registrationId: number }> {
    if (!sessionId) throw notBound();
    const device = await this.prisma.e2EEDevice.findFirst({
      where: { userId, sessionId, retiredAt: null, ...(deviceId === undefined ? {} : { deviceId }) },
      select: { deviceId: true, registrationId: true },
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
        recipientRegistrationId: envelope.registrationId,
        senderUserId: admitted.senderUserId,
        senderDeviceId: admitted.senderDeviceId,
        type: envelope.type,
        body: envelope.body,
      })),
    });
    const rows = await this.prisma.messageEnvelope.findMany({ where: { messageId } });
    return rows.map((row) => ({
      recipient: { userId: row.recipientUserId, deviceId: row.recipientDeviceId, registrationId: row.recipientRegistrationId },
      envelope: served(row),
    }));
  }

  async listFor(params: { userId: string; sessionId: string | null; after?: string; limit?: number }): Promise<E2EEServedEnvelope[]> {
    const device = await this.deviceOfSession(params.userId, params.sessionId);
    const rows = await this.prisma.messageEnvelope.findMany({
      where: {
        recipientUserId: params.userId,
        recipientDeviceId: device.deviceId,
        recipientRegistrationId: device.registrationId,
        ...(params.after ? { id: { gt: params.after } } : {}),
      },
      orderBy: { id: 'asc' },
      take: Math.min(Math.max(params.limit ?? 100, 1), LIST_LIMIT_MAX),
    });
    return rows.map(served);
  }

  async ack(params: { userId: string; sessionId: string | null; ids: readonly string[] }): Promise<number> {
    const device = await this.deviceOfSession(params.userId, params.sessionId);
    const { count } = await this.prisma.messageEnvelope.deleteMany({
      where: {
        id: { in: [...params.ids] },
        recipientUserId: params.userId,
        recipientDeviceId: device.deviceId,
        recipientRegistrationId: device.registrationId,
      },
    });
    return count;
  }

  async sweep(): Promise<number> {
    const cutoff = new Date(this.now().getTime() - E2EE_ENVELOPE_RETENTION_DAYS * DAY_MS);
    const { count } = await this.prisma.messageEnvelope.deleteMany({ where: { createdAt: { lt: cutoff } } });
    return count;
  }

  /**
   * Chaque appareil actif de chaque participant inscrit et ACTIF de la
   * conversation — `isActive` NU, et c'est une DÉCISION, pas un oubli.
   *
   * ── POURQUOI PAS LA LOI ÉTROITE, ALORS QUE C'EST UNE AUDIENCE (#20091) ────
   *
   * Ce site a été resserré sur la loi de participation vivante dans un premier
   * jet de #20091, puis **REMIS à la clause nue par l'audit adversarial du
   * lot**, qui a mesuré FAUSSE la prémisse du resserrement. Elle disait : « le
   * client compose son envoi depuis la participation que les portes servent, et
   * toutes épellent la loi ». Mesuré :
   *
   * | ce qui sert la liste au client | clause |
   * |---|---|
   * | `conversationDetailInclude.participants` (`core-selects.ts`) | `isActive: true` NU |
   * | le `select` de la LISTE de conversations (`core-selects.ts`) | `isActive: true` NU |
   * | `GET …/participants` (`participants-reads.ts`) | `isActive: true` NU |
   * | `mayReadKeysOf` (`key-access.ts`), qui autorise la lecture des clés | `isActive: true` NU |
   *
   * Resserrer ICI ne fait donc pas CONVERGER l'annuaire avec ce que l'émetteur
   * adresse : cela les fait DIVERGER. Et `compareDeviceSets` exige l'égalité
   * EXACTE, donc la divergence n'est pas une dégradation — c'est un
   * `409 E2EE_DEVICES_MISMATCH` sur CHAQUE envoi, que la boucle de résolution
   * Sesame du client ne répare pas (elle oublie les sessions puis rescelle
   * depuis la MÊME liste servie).
   *
   * Et le chiffrement de bout en bout est réservé aux PAIRES
   * (`endToEndDirectOnly`, `pairOfMembers`, `routes/conversation-encryption.ts`).
   * Dans une paire, **le membre banni-mais-actif EST le seul pair** : ce que le
   * resserrement « protège » est la remise du chiffré à la seule personne à qui
   * le message était destiné, et ce qu'il coûte est l'impossibilité DÉFINITIVE
   * d'écrire, dans une conversation que rien ne ramène en clair (#12949).
   *
   * > **Une audience trop large derrière une égalité EXACTE devient une panne ou
   * > une fuite — et il faut mesurer LAQUELLE avant de choisir son bord.** Ici
   * > la « fuite » n'a aucun tiers, et la panne est permanente et mal étiquetée
   * > (« Chiffrement indisponible »). Le resserrement était net-NÉGATIF.
   *
   * Ce qui le rendrait juste est un lot à soi, #20093 : faire converger les
   * QUATRE lectures ci-dessus, puis refuser par un code NOMMÉ que le client sait
   * rediriger — jamais un 409 Sesame générique. D'ici là cette clause reste nue,
   * et son témoin la GÈLE pour que personne ne la resserre seule.
   *
   * `userId: { not: null }` ne désigne personne : c'est le filtre de NULLITÉ qui
   * garde les membres ayant un compte — un participant anonyme n'a pas
   * d'appareil chiffré.
   */
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
