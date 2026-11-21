import { beforeAll, describe, expect, test } from 'bun:test';

import { loadConversationEncryptionCatalog, translateConversationEncryption } from '@/lib/i18n-conversation-encryption-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

import {
  creationRefusalText,
  firstNameOf,
  participantWithoutDeviceText,
  peerWithoutDeviceTitle,
  redirectedToReadableNotice,
  writePlainLabel,
} from './end-to-end-peer-without-device';

/**
 * **LES MOTS DU PAIR SANS APPAREIL CHIFFRÉ** (#20075) — ceux d'iOS (#20074,
 * `EndToEndPeerWithoutDeviceBannerRule`, `EndToEndReadableRedirect.notice`,
 * `EndToEndParticipantWithoutDeviceRefusal`) : le prénom du pair quand on le
 * connaît, la phrase sans nom sinon — jamais le nom d'un autre membre.
 */
const t = (language: InterfaceLanguage) => (key: Parameters<typeof translateConversationEncryption>[1], params?: Readonly<Record<string, string>>) =>
  translateConversationEncryption(language, key, params);

const LANGUAGES = ['fr', 'en', 'es', 'pt', 'de', 'it', 'ar'] as const satisfies readonly InterfaceLanguage[];

beforeAll(async () => {
  await Promise.all(LANGUAGES.map((language) => loadConversationEncryptionCatalog(language)));
});

describe('firstNameOf', () => {
  test('le premier mot du nom affiché, sans blancs', () => {
    expect(firstNameOf('  Ana  Diallo ')).toBe('Ana');
    expect(firstNameOf('')).toBe('');
    expect(firstNameOf(undefined)).toBe('');
  });
});

describe('le bandeau au-dessus du composeur', () => {
  test('nomme le pair par son prénom, et dit le geste', () => {
    expect(peerWithoutDeviceTitle(t('fr'), 'Ana Diallo')).toBe('Ana ne peut pas recevoir de messages chiffrés');
    expect(peerWithoutDeviceTitle(t('fr'), ' ')).toBe('Votre correspondant ne peut pas recevoir de messages chiffrés');
    expect(writePlainLabel(t('fr'))).toBe('Écrire sans chiffrement');
    expect(peerWithoutDeviceTitle(t('en'), 'Ana')).toBe('Ana can’t receive encrypted messages');
  });
});

describe('l’avis de l’envoi redirigé', () => {
  test('dit pourquoi le message est parti dans la conversation en clair', () => {
    expect(redirectedToReadableNotice(t('fr'), 'Ana Diallo')).toBe('Ana ne reçoit pas le chiffré : message parti dans votre conversation en clair.');
    expect(redirectedToReadableNotice(t('fr'), '')).toBe('Votre correspondant ne reçoit pas le chiffré : message parti en clair.');
  });
});

describe('le refus 409 E2EE_PARTICIPANT_WITHOUT_DEVICE', () => {
  test('la création ne nomme personne : c’est le pair', () => {
    expect(participantWithoutDeviceText(t('fr'), { peerUserId: 'u-ana', peerName: 'Ana', withoutDeviceUserIds: [] })).toBe(
      'Ana ne peut pas encore recevoir de messages chiffrés : rien n’a été activé.',
    );
  });

  test('la bascule nomme le pair : son prénom ; un autre membre, ou personne de connu : la phrase sans nom', () => {
    expect(participantWithoutDeviceText(t('fr'), { peerUserId: 'u-ana', peerName: 'Ana', withoutDeviceUserIds: ['u-ana'] })).toBe(
      'Ana ne peut pas encore recevoir de messages chiffrés : rien n’a été activé.',
    );
    const anonymous = 'Un membre ne peut pas encore recevoir de messages chiffrés : rien n’est activé.';
    expect(participantWithoutDeviceText(t('fr'), { peerUserId: 'u-ana', peerName: 'Ana', withoutDeviceUserIds: ['u-moi'] })).toBe(anonymous);
    expect(participantWithoutDeviceText(t('fr'), { withoutDeviceUserIds: ['u-ana'] })).toBe(anonymous);
    expect(participantWithoutDeviceText(t('fr'), { peerUserId: 'u-ana', peerName: '', withoutDeviceUserIds: [] })).toBe(anonymous);
  });
});

describe('le refus à la création, dans la langue d’interface', () => {
  test('charge le catalogue et nomme la personne touchée', async () => {
    expect(await creationRefusalText('en', 'Ana Diallo')).toBe('Ana can’t receive encrypted messages yet: nothing was turned on.');
    expect(await creationRefusalText('fr', null)).toBe('Un membre ne peut pas encore recevoir de messages chiffrés : rien n’est activé.');
  });
});

describe('les sept langues', () => {
  test('chaque phrase existe, porte le prénom et tient sous 80 caractères', () => {
    LANGUAGES.forEach((language) => {
      const phrases = [
        peerWithoutDeviceTitle(t(language), 'Ana'),
        peerWithoutDeviceTitle(t(language), ''),
        writePlainLabel(t(language)),
        redirectedToReadableNotice(t(language), 'Ana'),
        redirectedToReadableNotice(t(language), ''),
        participantWithoutDeviceText(t(language), { peerUserId: 'u-ana', peerName: 'Ana', withoutDeviceUserIds: [] }),
        participantWithoutDeviceText(t(language), { withoutDeviceUserIds: [] }),
      ];
      phrases.forEach((phrase) => {
        expect(phrase.trim()).not.toBe('');
        expect(phrase.length).toBeLessThanOrEqual(80);
        expect(phrase).not.toContain('{name}');
      });
      expect(phrases[0]).toContain('Ana');
      expect(phrases[3]).toContain('Ana');
      expect(phrases[5]).toContain('Ana');
    });
  });
});
