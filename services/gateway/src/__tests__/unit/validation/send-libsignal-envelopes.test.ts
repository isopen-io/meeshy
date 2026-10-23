/**
 * Un envoi libsignal (#3706, spec § 4.3) se déclare UNE fois pour les deux
 * transports : la route REST et l'événement socket acceptent les mêmes champs,
 * refusent les mêmes formes, et recomposent la même charge — enveloppes à part,
 * jamais dans `encryptionMetadata`.
 */
import { SendMessageBodySchema } from '../../../routes/conversations/messages-send';
import { SocketMessageSendSchema } from '../../../validation/socket-event-schemas';
import { toEncryptedPayload } from '../../../validation/encryption-envelope';

const BOB = 'b2'.repeat(12);

const libsignalSend = (overrides: Record<string, unknown> = {}) => ({
  conversationId: 'f6'.repeat(12),
  clientMessageId: 'cid_7f1d2c3b-4a5e-4f60-8a71-92b3c4d5e6f7',
  content: '',
  encryptionMode: 'e2ee',
  encryptionProtocol: 'libsignal-v1',
  encryptedContent: 'libsignal-v1',
  encryptionMetadata: { protocol: 'libsignal-v1', senderDeviceId: 1, regimeEpoch: 0 },
  envelopes: [{ userId: BOB, deviceId: 1, registrationId: 42, type: 3, body: 'Y2lwaGVydGV4dA==' }],
  ...overrides,
});

const transports = [
  ['REST', SendMessageBodySchema],
  ['socket', SocketMessageSendSchema],
] as const;

describe.each(transports)("l'envoi libsignal par %s", (_name, schema) => {
  it('accepte la forme déclarée et garde les enveloppes', () => {
    const parsed = schema.safeParse(libsignalSend());
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.envelopes).toHaveLength(1);
  });

  it('refuse un protocole libsignal sans enveloppe', () => {
    expect(schema.safeParse(libsignalSend({ envelopes: undefined })).success).toBe(false);
  });

  it("refuse un protocole libsignal sans appareil émetteur déclaré", () => {
    expect(schema.safeParse(libsignalSend({ encryptionMetadata: { protocol: 'libsignal-v1' } })).success).toBe(false);
  });

  it('refuse des enveloppes sans le protocole qui les annonce', () => {
    expect(schema.safeParse(libsignalSend({ encryptionProtocol: undefined })).success).toBe(false);
  });

  it('refuse une enveloppe vers un appareil hors de la plage 1…127', () => {
    const envelopes = [{ userId: BOB, deviceId: 128, registrationId: 42, type: 3, body: 'Y2lwaGVy' }];
    expect(schema.safeParse(libsignalSend({ envelopes })).success).toBe(false);
  });

  it('refuse plus de 32 enveloppes', () => {
    const envelopes = Array.from({ length: 33 }, (_, index) => ({ userId: BOB, deviceId: 1 + (index % 100), registrationId: 42, type: 2, body: 'Y2lwaGVy' }));
    expect(schema.safeParse(libsignalSend({ envelopes })).success).toBe(false);
  });
});

describe('la charge recomposée pour la passerelle', () => {
  it("porte les enveloppes et la session dans `relay`, jamais dans les métadonnées persistées", () => {
    const parsed = SocketMessageSendSchema.parse(libsignalSend({ unapprovedOwnDevices: [3] }));

    const payload = toEncryptedPayload(parsed, { sessionId: 'c3'.repeat(12) }) as unknown as Record<string, unknown>;

    expect(payload.relay).toEqual({
      protocol: 'libsignal-v1',
      senderDeviceId: 1,
      sessionId: 'c3'.repeat(12),
      unapprovedOwnDevices: [3],
      envelopes: parsed.envelopes,
    });
    expect(JSON.stringify({ ...payload, relay: undefined })).not.toContain('Y2lwaGVydGV4dA');
  });

  it("ne pose aucun relais pour un envoi chiffré à l'ancienne", () => {
    const payload = toEncryptedPayload({ encryptedContent: 'abc', encryptionMode: 'e2ee', encryptionMetadata: {} }) as unknown as Record<string, unknown>;
    expect(payload.relay).toBeUndefined();
  });
});
