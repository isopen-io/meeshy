import { describe, expect, test } from 'bun:test';

import { encryptionExplanation, encryptionRegime, type ExplanationFact } from './conversation-encryption-explanation';

/**
 * CE QUE LA SECTION « CHIFFREMENT » EXPLIQUE DE LA CONVERSATION OUVERTE (#12880)
 * — miroir de `ConversationEncryptionExplanation` (iOS) : le mode en mots
 * simples, qui peut lire, ce qui manque, la bascule, les appareils, ce qui
 * n'est pas encore livré, et ce que le web ne sait pas encore faire.
 */
const facts = (mode: string | null, isDirect = true): readonly ExplanationFact[] =>
  encryptionExplanation({ mode, isDirect }).sections.flatMap((section) => section.facts);

describe('le régime se lit comme la loi de lecture du serveur', () => {
  test('sans casse ni blancs ; un mode inconnu se lit comme le bout en bout', () => {
    expect(encryptionRegime(null)).toBe('none');
    expect(encryptionRegime(' ')).toBe('none');
    expect(encryptionRegime(' Server ')).toBe('server');
    expect(encryptionRegime('HYBRID')).toBe('hybrid');
    expect(encryptionRegime('e2ee')).toBe('end-to-end');
    expect(encryptionRegime('signal_v9')).toBe('end-to-end');
  });
});

describe('chaque mode dit qui lit et ce qui fonctionne', () => {
  test('sans chiffrement : stocké sans chiffrement, toutes les fonctions', () => {
    expect(facts(null)).toContain('storedWithoutEncryption');
    expect(facts(null)).toContain('everyServerFeature');
  });

  test('serveur : chiffré sur le serveur, que le serveur lit', () => {
    expect(facts('server')).toContain('encryptedOnServerServerReads');
    expect(facts('server')).not.toContain('onlyParticipantsRead');
  });

  test('hybride : dit identique au mode Serveur, jamais de bout en bout', () => {
    expect(facts('hybrid')).toContain('hybridIsServerToday');
    expect(facts('hybrid')).not.toContain('onlyParticipantsRead');
  });

  test('bout en bout : seuls les appareils lisent, ce qui manque, ce qui n’est pas livré, et le web le dit', () => {
    const e2ee = facts('e2ee');
    for (const fact of ['onlyParticipantsRead', 'translatedOnDevice', 'noServerTranscription', 'noNotificationPreview', 'noSearch', 'noEdit', 'noForward', 'noOfflineSending', 'webCannotReadYet', 'notYetAttachments', 'notYetDecryptedNotifications', 'notYetGroups', 'notYetSafetyNumbers', 'oneKeyPerDevice', 'deviceLimit', 'restoredDeviceIsNew', 'switchNeverResendsInClear'] as const) {
      expect({ fact, present: e2ee.includes(fact) }).toEqual({ fact, present: true });
    }
    expect(e2ee).not.toContain('everyServerFeature');
    expect(facts('e2ee', false)).toContain('groupSendingUnavailable');
    expect(e2ee).not.toContain('groupSendingUnavailable');
  });

  test('chaque mode dit qui peut basculer et ce que fait la bascule', () => {
    for (const mode of [null, 'server', 'hybrid', 'e2ee']) {
      for (const fact of ['whoMayToggle', 'switchKeepsHistory', 'switchIsShownInThread'] as const) {
        expect({ mode, fact, present: facts(mode).includes(fact) }).toEqual({ mode, fact, present: true });
      }
    }
  });
});
