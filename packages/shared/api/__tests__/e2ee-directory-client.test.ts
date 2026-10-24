import { describe, it, expect } from 'vitest';
import { createE2EEDirectoryClient, type E2EETransportRequest } from '../e2ee-directory-client';

/**
 * Le client TS des huit routes `/api/v1/e2ee/*` (#12536), miroir du client
 * Swift du SDK. Il ne connaît pas le réseau : il compose la requête, et il
 * REFUSE une réponse qui ne respecte pas le contrat. Une enveloppe ou un bundle
 * mal formés ne doivent jamais atteindre libsignal sous une forme devinée.
 */
function recordingTransport(responses: Record<string, unknown>) {
  const sent: E2EETransportRequest[] = [];
  const transport = async (request: E2EETransportRequest): Promise<unknown> => {
    sent.push(request);
    const key = `${request.method} ${request.path}`;
    if (!(key in responses)) throw new Error(`pas de réponse pour ${key}`);
    return responses[key];
  };
  return { sent, client: createE2EEDirectoryClient(transport) };
}

const USER = 'b2'.repeat(12);
const signed = { keyId: 1, publicKey: 'cHVi', signature: 'c2ln' };

describe("le client de l'annuaire E2EE", () => {
  it("enrôle l'appareil par POST /e2ee/devices et rend son numéro", async () => {
    const { client, sent } = recordingTransport({ 'POST /api/v1/e2ee/devices': { deviceId: 3, created: true } });
    const request = {
      registrationId: 42, identityKey: 'aWs=', signedPreKey: signed, kyberLastResort: signed, platform: 'web' as const,
      binding: { timestamp: 1, signature: 'c2ln' },
    };

    await expect(client.enroll(request)).resolves.toEqual({ deviceId: 3, created: true });
    expect(sent).toEqual([{ method: 'POST', path: '/api/v1/e2ee/devices', body: request }]);
  });

  it('publie des pré-clés sur la route de SON appareil et rend le stock', async () => {
    const { client, sent } = recordingTransport({ 'PUT /api/v1/e2ee/devices/3/keys': { deviceId: 3, oneTimePreKeys: 5, kyberPreKeys: 5 } });

    await expect(client.publishKeys(3, { oneTimePreKeys: [{ keyId: 9, publicKey: 'cGs=' }] })).resolves.toEqual({
      deviceId: 3, oneTimePreKeys: 5, kyberPreKeys: 5,
    });
    expect(sent[0]).toMatchObject({ method: 'PUT', path: '/api/v1/e2ee/devices/3/keys' });
  });

  it('lit le stock, retire un appareil, liste les appareils', async () => {
    const { client, sent } = recordingTransport({
      'GET /api/v1/e2ee/devices/self/prekey-count': { deviceId: 1, oneTimePreKeys: 0, kyberPreKeys: 2 },
      'DELETE /api/v1/e2ee/devices/2': { deviceId: 2, retired: true },
      [`GET /api/v1/e2ee/keys/${USER}/devices`]: { userId: USER, devices: [{ deviceId: 1, registrationId: 7 }] },
    });

    await expect(client.preKeyStock()).resolves.toMatchObject({ kyberPreKeys: 2 });
    await expect(client.retireDevice(2)).resolves.toEqual({ deviceId: 2, retired: true });
    await expect(client.devices(USER)).resolves.toEqual({ userId: USER, devices: [{ deviceId: 1, registrationId: 7 }] });
    expect(sent.map((request) => request.method)).toEqual(['GET', 'DELETE', 'GET']);
  });

  it("demande les bundles des seuls appareils nommés, et accepte un bundle sans pré-clé unique", async () => {
    const bundle = {
      deviceId: 2, registrationId: 7, identityKey: 'aWs=', signedPreKey: signed,
      kyberPreKey: { ...signed, lastResort: true }, preKey: null,
    };
    const { client, sent } = recordingTransport({ [`GET /api/v1/e2ee/keys/${USER}`]: { userId: USER, devices: [bundle] } });

    await expect(client.bundles(USER, [2, 5])).resolves.toEqual({ userId: USER, devices: [bundle] });
    expect(sent[0].query).toEqual({ deviceIds: '2,5' });
  });

  it("lit ses enveloppes par curseur, puis en accuse réception", async () => {
    const envelope = {
      id: '0a'.repeat(12), messageId: '0b'.repeat(12), conversationId: '0c'.repeat(12), recipientRegistrationId: 7,
      senderUserId: USER, senderDeviceId: 1, type: 3, body: 'Y2lwaGVy', createdAt: '2026-10-24T00:00:00.000Z',
    };
    const { client, sent } = recordingTransport({
      'GET /api/v1/e2ee/envelopes': { envelopes: [envelope], nextCursor: envelope.id },
      'POST /api/v1/e2ee/envelopes/ack': { deleted: 1 },
    });

    await expect(client.envelopes({ after: '09'.repeat(12), limit: 50 })).resolves.toEqual({ envelopes: [envelope], nextCursor: envelope.id });
    await expect(client.acknowledge([envelope.id])).resolves.toEqual({ deleted: 1 });
    expect(sent[0].query).toEqual({ after: '09'.repeat(12), limit: '50' });
    expect(sent[1].body).toEqual({ ids: [envelope.id] });
  });

  it('refuse une réponse hors contrat au lieu de la transmettre', async () => {
    const { client } = recordingTransport({
      'GET /api/v1/e2ee/envelopes': { envelopes: [{ id: 'x', type: 9 }], nextCursor: null },
    });

    await expect(client.envelopes()).rejects.toThrow();
  });
});
