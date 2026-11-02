import {
  deviceBindingMessage,
  E2EE_ERROR_CODES,
  type E2EEDeviceBundle,
  type E2EEDevicesMismatch,
  type E2EEEnrollDeviceRequest,
  type E2EEServedEnvelope,
} from '@meeshy/shared/types/e2ee-directory';

import { fromBase64 } from '../bytes';
import { E2EEDirectoryError, type E2EEDirectoryClient } from '../directory';
import type { SealedMessage } from '../sealer';
import { transparentEngine } from './transparent-engine';

type Device = {
  userId: string;
  deviceId: number;
  registrationId: number;
  identityKey: string;
  signedPreKey: { keyId: number; publicKey: string; signature: string };
  kyberLastResort: { keyId: number; publicKey: string; signature: string };
  oneTime: { keyId: number; publicKey: string; usedAt: number | null }[];
  kyber: { keyId: number; publicKey: string; signature: string; usedAt: number | null }[];
};

/**
 * Une passerelle de banc, fidèle aux règles qui comptent pour le client :
 * preuve de liaison vérifiée (XEdDSA), réservation unique des pré-clés,
 * comparaison Sesame (409 missing/extra/stale), enveloppes par appareil
 * effacées à l'accusé. Tout ce qu'elle garde est observable (`stored`) : un
 * témoin y cherche le clair.
 */
export function fakeE2EEServer() {
  const devices: Device[] = [];
  const envelopes: (E2EEServedEnvelope & { recipientUserId: string; recipientDeviceId: number })[] = [];
  let nextId = 1;
  const id = () => (nextId++).toString(16).padStart(24, '0');
  const refuse = (status: number, code: string) => new E2EEDirectoryError({ ok: false, status, error: code, code });

  const active = (userId: string) => devices.filter((device) => device.userId === userId);

  const clientFor = (userId: string, session: { deviceId: number | null }): E2EEDirectoryClient => ({
    enroll: async (request: E2EEEnrollDeviceRequest) => {
      const engine = transparentEngine();
      const message = new TextEncoder().encode(deviceBindingMessage({ userId, registrationId: request.registrationId, identityKey: request.identityKey, timestamp: request.binding.timestamp }));
      if (!engine.verify(fromBase64(request.identityKey), message, fromBase64(request.binding.signature))) throw refuse(400, E2EE_ERROR_CODES.BINDING_INVALID);
      [request.signedPreKey, request.kyberLastResort, ...(request.kyberPreKeys ?? [])].forEach((key) => {
        if (!engine.verify(fromBase64(request.identityKey), fromBase64(key.publicKey), fromBase64(key.signature))) throw refuse(400, E2EE_ERROR_CODES.SIGNATURE_INVALID);
      });
      const existing = devices.find((device) => device.userId === userId && device.registrationId === request.registrationId && device.identityKey === request.identityKey);
      if (existing) {
        session.deviceId = existing.deviceId;
        return { deviceId: existing.deviceId, created: false };
      }
      const taken = new Set(active(userId).map((device) => device.deviceId));
      const deviceId = Array.from({ length: 16 }, (_, index) => index + 1).find((slot) => !taken.has(slot));
      if (deviceId === undefined) throw refuse(409, E2EE_ERROR_CODES.DEVICE_LIMIT_REACHED);
      devices.push({
        userId,
        deviceId,
        registrationId: request.registrationId,
        identityKey: request.identityKey,
        signedPreKey: request.signedPreKey,
        kyberLastResort: request.kyberLastResort,
        oneTime: (request.oneTimePreKeys ?? []).map((key) => ({ ...key, usedAt: null })),
        kyber: (request.kyberPreKeys ?? []).map((key) => ({ ...key, usedAt: null })),
      });
      session.deviceId = deviceId;
      return { deviceId, created: true };
    },
    publishKeys: async (deviceId, request) => {
      const device = active(userId).find((candidate) => candidate.deviceId === deviceId && deviceId === session.deviceId);
      if (!device) throw refuse(403, E2EE_ERROR_CODES.DEVICE_NOT_BOUND);
      device.oneTime.push(...(request.oneTimePreKeys ?? []).map((key) => ({ ...key, usedAt: null })));
      device.kyber.push(...(request.kyberPreKeys ?? []).map((key) => ({ ...key, usedAt: null })));
    },
    preKeyStock: async () => {
      const device = active(userId).find((candidate) => candidate.deviceId === session.deviceId);
      if (!device) throw refuse(403, E2EE_ERROR_CODES.DEVICE_NOT_BOUND);
      return { deviceId: device.deviceId, oneTimePreKeys: device.oneTime.filter((k) => k.usedAt === null).length, kyberPreKeys: device.kyber.filter((k) => k.usedAt === null).length };
    },
    devices: async (target) => active(target).map((device) => ({ deviceId: device.deviceId, registrationId: device.registrationId })),
    bundles: async (target, deviceIds) =>
      active(target)
        .filter((device) => deviceIds.length === 0 || deviceIds.includes(device.deviceId))
        .map((device): E2EEDeviceBundle => {
          const oneTime = device.oneTime.find((key) => key.usedAt === null);
          if (oneTime) oneTime.usedAt = Date.now();
          const kyber = device.kyber.find((key) => key.usedAt === null);
          if (kyber) kyber.usedAt = Date.now();
          return {
            deviceId: device.deviceId,
            registrationId: device.registrationId,
            identityKey: device.identityKey,
            signedPreKey: device.signedPreKey,
            kyberPreKey: kyber ? { keyId: kyber.keyId, publicKey: kyber.publicKey, signature: kyber.signature, lastResort: false } : { ...device.kyberLastResort, lastResort: true },
            preKey: oneTime ? { keyId: oneTime.keyId, publicKey: oneTime.publicKey } : null,
          };
        }),
    envelopes: async (after, limit) => {
      const mine = envelopes.filter((envelope) => envelope.recipientUserId === userId && envelope.recipientDeviceId === session.deviceId && (after === null || envelope.id > after));
      const page = mine.slice(0, limit);
      return { envelopes: page, nextCursor: page.at(-1)?.id ?? null };
    },
    acknowledge: async (ids) => {
      const before = envelopes.length;
      ids.forEach((ackId) => {
        const index = envelopes.findIndex((envelope) => envelope.id === ackId && envelope.recipientUserId === userId && envelope.recipientDeviceId === session.deviceId);
        if (index >= 0) envelopes.splice(index, 1);
      });
      return before - envelopes.length;
    },
  });

  /** Le relais d'un envoi : Sesame (§ 3.4), puis une enveloppe par appareil. Rend l'identifiant du message. */
  const relay = (params: { senderUserId: string; peerUserId: string; conversationId: string; sealed: SealedMessage }): string => {
    const expected = [
      ...active(params.peerUserId),
      ...active(params.senderUserId).filter((device) => device.deviceId !== params.sealed.senderDeviceId && !params.sealed.unapprovedOwnDevices.includes(device.deviceId)),
    ];
    const sent = params.sealed.envelopes;
    const mismatch: E2EEDevicesMismatch = {
      missing: expected.filter((device) => !sent.some((e) => e.userId === device.userId && e.deviceId === device.deviceId)).map(({ userId, deviceId }) => ({ userId, deviceId })),
      extra: sent.filter((e) => !expected.some((device) => device.userId === e.userId && device.deviceId === e.deviceId)).map(({ userId, deviceId }) => ({ userId, deviceId })),
      stale: sent
        .filter((e) => expected.some((device) => device.userId === e.userId && device.deviceId === e.deviceId && device.registrationId !== e.registrationId))
        .map(({ userId, deviceId }) => ({ userId, deviceId })),
    };
    if (mismatch.missing.length + mismatch.extra.length + mismatch.stale.length > 0) throw Object.assign(refuse(409, E2EE_ERROR_CODES.DEVICES_MISMATCH), { mismatch });
    const messageId = id();
    sent.forEach((envelope) =>
      envelopes.push({
        id: id(),
        messageId,
        conversationId: params.conversationId,
        recipientRegistrationId: envelope.registrationId,
        recipientUserId: envelope.userId,
        recipientDeviceId: envelope.deviceId,
        senderUserId: params.senderUserId,
        senderDeviceId: params.sealed.senderDeviceId,
        type: envelope.type,
        body: envelope.body,
        createdAt: new Date().toISOString(),
      }),
    );
    return messageId;
  };

  return { clientFor, relay, devices, envelopes, stored: () => JSON.stringify({ devices, envelopes }) };
}
