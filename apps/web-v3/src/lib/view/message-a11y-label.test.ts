import { describe, expect, test } from 'bun:test';

import type { Attachment, Message } from '@/lib/api/types';

import { composeMessageLabel } from './message-a11y-label';

type Sender = NonNullable<Message['sender']>;

const senderOf = (name: string): Sender =>
  ({ userId: 'u-x', displayName: name, isOnline: false }) as unknown as Sender;

const message = (partial: Partial<Message> = {}): Message =>
  ({
    id: 'm1',
    conversationId: 'c-a',
    senderId: 'u-bruno',
    content: 'Bonjour',
    originalLanguage: 'fr',
    messageType: 'text',
    messageSource: 'user',
    isEdited: false,
    isViewOnce: false,
    viewOnceCount: 0,
    isBlurred: false,
    deliveredCount: 0,
    readCount: 0,
    reactionCount: 0,
    isEncrypted: false,
    translations: [],
    createdAt: new Date('2026-09-10T09:02:00.000Z'),
    sender: senderOf('Bruno Bêta'),
    ...partial,
  }) as Message;

/** Une variante SANS `sender` — jamais `sender: undefined` (`exactOptionalPropertyTypes`
 * refuse la valeur `undefined` sur une propriété optionnelle déjà typée sans elle). */
const messageWithoutSender = (partial: Partial<Message> = {}): Message => {
  const { sender: _drop, ...rest } = message(partial);
  return rest as Message;
};

const attachment = (partial: Partial<Attachment> = {}): Attachment =>
  ({
    id: 'a1',
    mimeType: 'image/jpeg',
    ...partial,
  }) as Attachment;

/**
 * LE TÉMOIN DE L'ORDRE — l'exemple exact de la spécification #5774 (travail
 * 2/3) : un message reçu avec citation, 2 images, 1 audio, modifié, épinglé,
 * 2 réactions rend UN SEUL libellé, dans l'ordre iOS.
 */
describe('composeMessageLabel — l’ordre iOS', () => {
  test('reçu, citation, texte, médias, heure, modifié, épinglé, réactions', () => {
    const label = composeMessageLabel({ protection: 'standard',
      message: message({
        replyTo: message({ id: 'q1', sender: senderOf('Amina Diallo') }),
        isEdited: true,
        pinnedAt: new Date('2026-09-10T09:00:00.000Z'),
        reactionSummary: { '👍': 2 },
        attachments: [attachment(), attachment(), attachment({ id: 'a3', mimeType: 'audio/mpeg' })],
      }),
      isMine: false,
      servedText: 'Bonjour',
      delivery: 'sent',
    });

    expect(label).toBe('Bruno Bêta, réponse à Amina Diallo, Bonjour, 2 images, 1 audio, 09:02, modifié, épinglé, réactions : 👍 2');
  });

  test('un message à SOI : le nom est ABSENT, l’accusé est présent', () => {
    const label = composeMessageLabel({ protection: 'standard',
      message: message(),
      isMine: true,
      servedText: 'Bonjour',
      delivery: 'read',
    });

    expect(label).toBe('Bonjour, 09:02, lu');
    expect(label).not.toContain('Bruno');
  });

  test('un envoi ÉCHOUÉ (`delivery: null`) ne porte AUCUN mot d’accusé', () => {
    const label = composeMessageLabel({ protection: 'standard',
      message: message(),
      isMine: true,
      servedText: 'Bonjour',
      delivery: null,
    });

    expect(label).toBe('Bonjour, 09:02');
  });

  test('sans sender connu, sur un message d’autrui : « expéditeur inconnu » absent du libellé racine, mais présent en citation', () => {
    const label = composeMessageLabel({ protection: 'standard',
      message: messageWithoutSender({ replyTo: messageWithoutSender({ id: 'q2' }) }),
      isMine: false,
      servedText: 'Bonjour',
      delivery: 'sent',
    });

    // Pas mien ⇒ AUCUN mot d'accusé, quel que soit `delivery` (iOS : « accusé
    // si à moi » seulement — `BubbleFooter.swift` ne peint jamais la coche
    // d'un message reçu).
    expect(label).toBe('réponse à expéditeur inconnu, Bonjour, 09:02');
  });

  test('éphémère : le badge apparaît quand `expiresAt` est posé', () => {
    const label = composeMessageLabel({ protection: 'standard',
      message: message({ expiresAt: new Date('2026-09-10T10:00:00.000Z') }),
      isMine: false,
      servedText: 'Bonjour',
      delivery: 'sent',
    });

    expect(label).toContain('éphémère');
  });

  test('un texte SERVI vide (média-seul) n’ajoute AUCUN segment texte vide', () => {
    const label = composeMessageLabel({ protection: 'standard',
      message: message({ attachments: [attachment({ mimeType: 'video/mp4' })] }),
      isMine: false,
      servedText: '',
      delivery: 'sent',
    });

    expect(label).toBe('Bruno Bêta, 1 vidéo, 09:02');
  });

  test('des réactions à ZÉRO sont filtrées (compte retombé à zéro après retrait)', () => {
    const label = composeMessageLabel({ protection: 'standard',
      message: message({ reactionSummary: { '👍': 0 } }),
      isMine: false,
      servedText: 'Bonjour',
      delivery: 'sent',
    });

    expect(label).not.toContain('réactions');
  });
});


/**
 * LA PROTECTION GOUVERNE LE LIBELLÉ (revue #5774) — le défaut mesuré sur
 * `/c/c-protection` : `aria-label="Amina Diallo, Le code du coffre est
 * 4817-2290., 10:14"` sur une rangée FLOUTÉE. Le nom accessible est une
 * charge comme une autre : ce que la protection retire au pixel, elle doit
 * le retirer là aussi (leçon 275 du CLAUDE.md racine).
 */
describe('composeMessageLabel — la protection', () => {
  const SECRET = 'Le code du coffre est 4817-2290.';

  test('voilé : le texte servi ne fuit JAMAIS, le placeholder le remplace', () => {
    const label = composeMessageLabel({
      message: message({ isBlurred: true, content: SECRET }),
      isMine: false,
      servedText: SECRET,
      delivery: null,
      protection: 'veiled',
    });
    expect(label.includes(SECRET)).toBe(false);
    expect(label).toBe('Bruno Bêta, Contenu masqué, 09:02');
  });

  test('voilé : l inventaire des pièces jointes ne fuit pas non plus', () => {
    const label = composeMessageLabel({
      message: message({ isViewOnce: true, attachments: [attachment()] }),
      isMine: false,
      servedText: '',
      delivery: null,
      protection: 'veiled',
    });
    expect(label.includes('image')).toBe(false);
  });

  test('supprimé / brûlé / expiré : le tombstone SEUL, rien de la rangée', () => {
    const cases = [
      ['deleted', 'Message supprimé'],
      ['burned', 'Message vu et supprimé'],
      ['expired', 'Message éphémère expiré'],
    ] as const;
    for (const [protection, expected] of cases) {
      const label = composeMessageLabel({
        message: message({ content: SECRET, attachments: [attachment()] }),
        isMine: false,
        servedText: SECRET,
        delivery: null,
        protection,
      });
      expect(label).toBe(expected);
    }
  });

  test('standard : le libellé reste celui de la spécification, inchangé', () => {
    const label = composeMessageLabel({
      message: message(),
      isMine: false,
      servedText: 'Bonjour',
      delivery: null,
      protection: 'standard',
    });
    expect(label).toBe('Bruno Bêta, Bonjour, 09:02');
  });
});
