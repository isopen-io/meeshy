import { e2eeUpgradeRequired } from '../e2ee-upgrade-required';

describe("l'invitation à mettre à jour d'un message chiffré (#3706, #9223)", () => {
  it('est vraie pour un message chiffré de bout en bout, quel que soit son protocole', () => {
    expect(e2eeUpgradeRequired({ isEncrypted: true, encryptionMode: 'e2ee' })).toBe(true);
  });

  it.each([
    [{ isEncrypted: false, encryptionMode: null }],
    [{ isEncrypted: true, encryptionMode: 'server' }],
    [{ isEncrypted: false, encryptionMode: 'e2ee' }],
  ])('est fausse pour %j', (message) => {
    expect(e2eeUpgradeRequired(message)).toBe(false);
  });
});
