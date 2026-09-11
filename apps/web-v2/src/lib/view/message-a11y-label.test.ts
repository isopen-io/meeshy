import { describe, expect, test } from 'bun:test';

import type { Attachment, Message } from '@/lib/api/types';

import { composeMessageLabel } from './message-a11y-label';

type Sender = NonNullable<Message['sender']>;

const senderOf = (name: string, type: 'user' | 'anonymous' = 'user'): Sender =>
  ({ userId: 'u-x', displayName: name, isOnline: false, type }) as unknown as Sender;

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

/**
 * « SANS COMPTE » DANS LE LIBELLÉ (revue #5935, défauts majeurs 1/4) — le
 * masque `aria-hidden` posé sur `[data-identity]` (`focal-row.tsx`) retire
 * du sous-arbre le glyphe qui portait seul cette information
 * (`role="img"` / `aria-label="Sans compte"`, `GlyphSvg`) : le libellé
 * composé doit donc la porter lui-même, dans l'ordre visuel iOS — AVANT le
 * nom, jamais après (« le fantôme précède le nom », `FocalIdentityHeader
 * .swift:125-128`).
 */
describe('composeMessageLabel — « Sans compte »', () => {
  test('un participant anonymous porte « Sans compte » AVANT son nom', () => {
    const label = composeMessageLabel({ protection: 'standard',
      message: message({ sender: senderOf('Invité', 'anonymous') }),
      isMine: false,
      servedText: 'Bonjour',
      delivery: 'sent',
    });

    expect(label).toBe('Sans compte, Invité, Bonjour, 09:02');
  });

  test('un participant `user` ordinaire ne porte JAMAIS « Sans compte »', () => {
    const label = composeMessageLabel({ protection: 'standard',
      message: message(),
      isMine: false,
      servedText: 'Bonjour',
      delivery: 'sent',
    });

    expect(label).not.toContain('Sans compte');
  });

  test('un message à SOI ne porte jamais « Sans compte », même si `sender.type` est `anonymous`', () => {
    // Cas impossible en pratique (on n'est jamais anonyme de soi-même), mais
    // la garde `!isMine` doit tenir : le segment ne doit dépendre que de
    // `isMine`, jamais uniquement du type du sender.
    const label = composeMessageLabel({ protection: 'standard',
      message: message({ sender: senderOf('Invité', 'anonymous') }),
      isMine: true,
      servedText: 'Bonjour',
      delivery: 'read',
    });

    expect(label).not.toContain('Sans compte');
  });
});

/**
 * T14 — LES ÉTATS DU LOT (#5936) ENTRENT DANS LE LIBELLÉ, sans doubler la
 * lecture : système ⇒ le texte de la notice SEUL ; sticker ⇒ un segment à la
 * place du texte ; lieu ⇒ après les pièces ; story citée ⇒ à la place de
 * « réponse à X » ; transféré ⇒ après épinglé (écart assumé, § 9 Q8).
 */
describe('composeMessageLabel — les états du lot (#5936)', () => {
  test('système : le libellé est le TEXTE de la notice seul, jamais l’auteur', () => {
    const label = composeMessageLabel({
      message: message({
        messageType: 'system',
        messageSource: 'system',
        content: 'Le chiffrement de bout en bout est activé',
      }),
      isMine: false,
      servedText: 'Le chiffrement de bout en bout est activé',
      delivery: null,
      protection: 'standard',
    });
    expect(label).toBe('Le chiffrement de bout en bout est activé');
    expect(label).not.toContain('Bruno');
  });

  test('sticker : un segment « sticker 🔥 » remplace le texte', () => {
    const label = composeMessageLabel({
      message: message({ content: '🔥', metadata: { sticker: { emoji: '🔥' } } }),
      isMine: false,
      servedText: '🔥',
      delivery: 'sent',
      protection: 'standard',
    });
    expect(label).toContain('sticker 🔥');
  });

  test('lieu : « Position : Tour Eiffel » après les pièces jointes', () => {
    const label = composeMessageLabel({
      message: message({
        content: '',
        messageType: 'location',
        attachments: [attachment()],
        metadata: { location: { latitude: 48.8584, longitude: 2.2945, name: 'Tour Eiffel' } },
      }),
      isMine: false,
      servedText: '',
      delivery: 'sent',
      protection: 'standard',
    });
    const attachmentsIndex = label.indexOf('1 image');
    const positionIndex = label.indexOf('Position : Tour Eiffel');
    expect(attachmentsIndex).toBeGreaterThan(-1);
    expect(positionIndex).toBeGreaterThan(attachmentsIndex);
  });

  test('story citée : « réponse à sa story » remplace « réponse à X »', () => {
    const label = composeMessageLabel({
      message: message({
        storyReplyToId: 'p1',
        metadata: { postReplyTo: { id: 'p1', type: 'STORY', moodEmoji: null, previewText: '', thumbnailUrl: null, createdAt: '' } },
      }),
      isMine: false,
      servedText: 'Bonjour',
      delivery: 'sent',
      protection: 'standard',
    });
    expect(label).toContain('réponse à sa story');
    expect(label).not.toContain('réponse à Bruno');
  });

  test('transféré : « transféré depuis Salon » après « épinglé »', () => {
    const label = composeMessageLabel({
      message: message({
        pinnedAt: new Date('2026-09-10T09:00:00.000Z'),
        forwardedFromId: 'm-far',
        forwardedFromConversation: { id: 'c1', title: 'Salon', type: 'public' },
      }),
      isMine: false,
      servedText: 'Bonjour',
      delivery: 'sent',
      protection: 'standard',
    });
    const pinnedIndex = label.indexOf('épinglé');
    const forwardedIndex = label.indexOf('transféré depuis Salon');
    expect(pinnedIndex).toBeGreaterThan(-1);
    expect(forwardedIndex).toBeGreaterThan(pinnedIndex);
  });

  test('emoji seul : le texte brut, jamais une traduction', () => {
    const label = composeMessageLabel({
      message: message({ content: '👍' }),
      isMine: false,
      servedText: 'pouce levé',
      delivery: 'sent',
      protection: 'standard',
    });
    expect(label).toContain('👍');
    expect(label).not.toContain('pouce levé');
  });
});
