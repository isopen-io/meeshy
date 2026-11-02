/**
 * Directive porteur du 2026-11-01 : une conversation naît chiffrée au repos,
 * sous une clé obtenue AVANT sa création. Le double de `EncryptionService`
 * que les suites de création montent pour la fournir :
 * `jest.mock('<…>/services/EncryptionService', () => serverKeyStub());`
 */
export const SERVER_KEY_STUB_ID = 'server-key';

export function serverKeyStub() {
  return { getEncryptionService: async () => ({ activationKeyId: async () => SERVER_KEY_STUB_ID }) };
}
