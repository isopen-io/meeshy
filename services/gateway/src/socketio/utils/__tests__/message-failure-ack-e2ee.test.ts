import { E2EE_ERROR_CODES } from '@meeshy/shared/types/e2ee-directory';
import { buildMessageFailureAck } from '../message-ack-shaping';

describe("l'accusé socket d'un envoi libsignal refusé (#3706)", () => {
  it("porte l'écart Sesame à côté du code, comme la réponse REST", () => {
    const e2eeMismatch = { missing: [{ userId: 'b'.repeat(24), deviceId: 2 }], extra: [], stale: [] };

    const ack = buildMessageFailureAck({ error: 'écart', code: E2EE_ERROR_CODES.DEVICES_MISMATCH, e2eeMismatch });

    expect(ack).toEqual({ success: false, error: 'écart', code: E2EE_ERROR_CODES.DEVICES_MISMATCH, ...e2eeMismatch });
  });

  it("rend au client socket le code d'un régime qui a changé, pour qu'il relise et renvoie (#12522, #12562)", () => {
    const ack = buildMessageFailureAck({ error: 'Le chiffrement de cette conversation a changé', code: E2EE_ERROR_CODES.REGIME_CHANGED });

    expect(ack).toEqual({ success: false, error: 'Le chiffrement de cette conversation a changé', code: 'E2EE_REGIME_CHANGED' });
  });

  it("ne pose rien de plus sur un refus ordinaire", () => {
    expect(buildMessageFailureAck({ error: 'non', code: 'X' })).toEqual({ success: false, error: 'non', code: 'X' });
  });
});
