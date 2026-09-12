import { describe, expect, test } from 'bun:test';

import { decodeConversation, decodeMessage, toDate } from './decode';
import { CONVERSATION_ID, VIEWER_ID, amina, attachmentDefaults, conversationDefaults, message, translation, viewer } from './fixtures-base';
import { protectionOf } from '../reading-mode/protection';
import { composeMessageLabel } from '../view/message-a11y-label';
import { forwardAttributionOf } from '../view/message-badges';
import { storyCitationOf } from '../view/message-body';
import { electDescription } from '../view/media';
import type { Conversation, Message } from './types';

describe('toDate — idempotent', () => {
  test('sur une Date déjà décodée, rend la MÊME instance', () => {
    const d = new Date('2026-09-08T09:00:00.000Z');
    expect(toDate(d)).toBe(d);
  });

  test('sur une chaîne ISO valide, rend une Date valide au bon instant', () => {
    const d = toDate('2026-09-08T09:00:00.000Z');
    expect(d instanceof Date).toBe(true);
    expect(Number.isNaN(d.getTime())).toBe(false);
    expect(d.toISOString()).toBe('2026-09-08T09:00:00.000Z');
  });

  test('sur une chaîne invalide, rend Invalid Date — jamais une exception', () => {
    expect(() => toDate('pas-une-date')).not.toThrow();
    expect(Number.isNaN(toDate('pas-une-date').getTime())).toBe(true);
  });
});

describe('decodeConversation', () => {
  const base: Conversation = {
    ...conversationDefaults,
    id: CONVERSATION_ID,
    title: 'Équipe déploiement',
    type: 'group',
    memberCount: 3,
    participants: [],
    createdAt: '2026-09-01T08:00:00.000Z' as unknown as Date,
    updatedAt: '2026-09-08T09:00:00.000Z' as unknown as Date,
    lastMessageAt: '2026-09-08T09:00:00.000Z' as unknown as Date,
    currentUserJoinedAt: '2026-09-01T08:00:00.000Z',
    userPreferences: [{ isPinned: true }],
    lastMessageTranslations: { en: 'Hello' },
  };

  test('revit createdAt, updatedAt, lastMessageAt, currentUserJoinedAt', () => {
    const decoded = decodeConversation(base);
    expect(decoded.createdAt).toBeInstanceOf(Date);
    expect(decoded.createdAt.toISOString()).toBe('2026-09-01T08:00:00.000Z');
    expect(decoded.updatedAt).toBeInstanceOf(Date);
    expect(decoded.lastMessageAt).toBeInstanceOf(Date);
    expect(decoded.currentUserJoinedAt).toBeInstanceOf(Date);
  });

  test('ne touche pas userPreferences (tableau) ni lastMessageTranslations', () => {
    const decoded = decodeConversation(base);
    expect(decoded.userPreferences).toEqual([{ isPinned: true }]);
    expect(decoded.lastMessageTranslations).toEqual({ en: 'Hello' });
  });

  test('les clés ABSENTES restent absentes', () => {
    const { lastMessageAt: _lastMessageAt, currentUserJoinedAt: _currentUserJoinedAt, ...withoutOptional } = base;
    const decoded = decodeConversation(withoutOptional as Conversation);
    expect('lastMessageAt' in decoded).toBe(false);
    expect('currentUserJoinedAt' in decoded).toBe(false);
  });

  test('décode aussi lastMessage.createdAt quand présent', () => {
    const withLastMessage: Conversation = {
      ...base,
      lastMessage: {
        ...message({ id: 'm1', senderId: VIEWER_ID, sender: viewer, content: 'salut', originalLanguage: 'fr', translations: [], createdAt: new Date(0) }),
        createdAt: '2026-09-08T09:00:00.000Z' as unknown as Date,
      },
    };
    const decoded = decodeConversation(withLastMessage);
    expect(decoded.lastMessage?.createdAt).toBeInstanceOf(Date);
  });

  test('lastMessage EMBARQUÉ — l’aperçu ALLÉGÉ que sert réellement GET /conversations, SANS translations ni sender.lastActiveAt — ne jette PAS', () => {
    // Mesuré en direct sur gate.staging.meeshy.me (#5650, revue-correction) :
    // l'objet `lastMessage` d'une conversation ne porte NI `translations`
    // NI `conversationId` NI `originalLanguage` — un `Message` COMPLET
    // (`GET /conversations/:id/messages`) et cet APERÇU sont deux formes
    // distinctes que ce décodeur doit servir toutes les deux.
    const embeddedPreview = {
      id: 'm-preview',
      content: 'À jeudi.',
      senderId: 'u-someone',
      messageType: 'text',
      createdAt: '2026-09-08T07:02:34.617Z',
      sender: {
        id: 'p-someone',
        userId: 'u-someone',
        username: 'someone',
        displayName: 'Someone',
        avatar: null,
        isOnline: false,
        type: 'user',
      },
      attachments: [],
    } as unknown as Message;

    const withLastMessage: Conversation = { ...base, lastMessage: embeddedPreview };
    expect(() => decodeConversation(withLastMessage)).not.toThrow();
    const decoded = decodeConversation(withLastMessage);
    expect(decoded.lastMessage?.createdAt).toBeInstanceOf(Date);
    expect(decoded.lastMessage?.translations).toEqual([]);
  });
});

describe('decodeMessage', () => {
  test('revit createdAt, updatedAt, editedAt, deletedAt, expiresAt, pinnedAt, deliveredToAllAt, readByAllAt', () => {
    const raw = {
      ...message({
        id: 'm1',
        senderId: 'u-amina',
        sender: amina,
        content: 'hello',
        originalLanguage: 'en',
        translations: [translation('m1', 'fr', 'bonjour')],
        createdAt: '2026-09-08T09:00:00.000Z' as unknown as Date,
      }),
      updatedAt: '2026-09-08T09:01:00.000Z' as unknown as Date,
      editedAt: '2026-09-08T09:01:00.000Z' as unknown as Date,
      deletedAt: '2026-09-08T09:02:00.000Z' as unknown as Date,
      expiresAt: '2026-09-09T09:00:00.000Z' as unknown as Date,
      pinnedAt: '2026-09-08T09:03:00.000Z' as unknown as Date,
      deliveredToAllAt: '2026-09-08T09:04:00.000Z' as unknown as Date,
      readByAllAt: '2026-09-08T09:05:00.000Z' as unknown as Date,
    };
    const decoded = decodeMessage(raw);
    for (const key of [
      'createdAt',
      'updatedAt',
      'editedAt',
      'deletedAt',
      'expiresAt',
      'pinnedAt',
      'deliveredToAllAt',
      'readByAllAt',
    ] as const) {
      expect(decoded[key]).toBeInstanceOf(Date);
    }
  });

  test('revit translations[].createdAt et sender.lastActiveAt', () => {
    const raw = message({
      id: 'm1',
      senderId: 'u-amina',
      sender: { ...amina, lastActiveAt: '2026-09-08T09:00:00.000Z' as unknown as Date },
      content: 'hello',
      originalLanguage: 'en',
      translations: [{ ...translation('m1', 'fr', 'bonjour'), createdAt: '2026-09-08T09:00:00.000Z' as unknown as Date }],
      createdAt: new Date(),
    });
    const decoded = decodeMessage(raw);
    expect(decoded.translations[0]?.createdAt).toBeInstanceOf(Date);
    expect(decoded.sender?.lastActiveAt).toBeInstanceOf(Date);
  });

  test('décode replyTo (récursif, un niveau)', () => {
    const raw = message({
      id: 'm2',
      senderId: VIEWER_ID,
      sender: viewer,
      content: 'reply',
      originalLanguage: 'fr',
      translations: [],
      createdAt: new Date(),
      replyTo: message({
        id: 'm1',
        senderId: 'u-amina',
        sender: amina,
        content: 'original',
        originalLanguage: 'en',
        translations: [],
        createdAt: '2026-09-08T09:00:00.000Z' as unknown as Date,
      }),
    });
    const decoded = decodeMessage(raw);
    expect(decoded.replyTo?.createdAt).toBeInstanceOf(Date);
  });

  test('viewOnceCount et isBlurred traversent intacts', () => {
    const raw = message({
      id: 'm3',
      senderId: VIEWER_ID,
      sender: viewer,
      content: 'secret',
      originalLanguage: 'fr',
      translations: [],
      createdAt: new Date(),
      isViewOnce: true,
      viewOnceCount: 2,
      isBlurred: true,
    });
    const decoded = decodeMessage(raw);
    expect(decoded.viewOnceCount).toBe(2);
    expect(decoded.isBlurred).toBe(true);
  });
});

/**
 * REVUE-CORRECTION (#5650) — LE `null` EXPLICITE DU FIL, SUR LES DEUX
 * PORTEURS DE MESSAGE IMBRIQUÉ.
 *
 * `Conversation.lastMessage` était gardé contre `null` par ce lot sans
 * qu'aucun témoin ne le prouve : retirer `|| raw.lastMessage === null`
 * laissait la suite VERTE. `Message.replyTo` — l'AUTRE porteur imbriqué,
 * décodé par le MÊME appel récursif, écrit dans la MÊME expression — ne
 * l'était pas du tout. Un `replyTo: null` (la forme que sert
 * `messages-list-query.ts:718-745` sur la ligne Prisma quand le message
 * cité a disparu, et que le champ `sender: replySender ? … : null` juste
 * en-dessous prouve possible dans cette charge) faisait lever
 * `decodeMessage(null)` sur `raw.sender` — le fil ENTIER tombait en erreur
 * pour UN message dont la citation manquait.
 *
 * « Que transporte-t-on À CÔTÉ de ce qu'on vient de garder ? » — la garde
 * posée sur un porteur se pose sur TOUS les porteurs du même type.
 */
describe('decode — le `null` explicite de la passerelle, sur les deux porteurs imbriqués', () => {
  const baseConversation: Conversation = {
    ...conversationDefaults,
    id: CONVERSATION_ID,
    title: 'Équipe déploiement',
    type: 'group',
    memberCount: 3,
    participants: [],
    createdAt: '2026-09-01T08:00:00.000Z' as unknown as Date,
    updatedAt: '2026-09-08T09:00:00.000Z' as unknown as Date,
  };

  test('decodeConversation avec lastMessage: null ⇒ pas d’exception, clé ABSENTE', () => {
    const withNull = { ...baseConversation, lastMessage: null } as unknown as Conversation;
    expect(() => decodeConversation(withNull)).not.toThrow();
    expect('lastMessage' in decodeConversation(withNull)).toBe(false);
  });

  test('decodeMessage avec replyTo: null ⇒ pas d’exception, clé ABSENTE', () => {
    const raw = {
      ...message({
        id: 'm9',
        senderId: VIEWER_ID,
        sender: viewer,
        content: 'réponse orpheline',
        originalLanguage: 'fr',
        translations: [],
        createdAt: '2026-09-08T09:00:00.000Z' as unknown as Date,
      }),
      replyTo: null,
    } as unknown as Message;
    expect(() => decodeMessage(raw)).not.toThrow();
    expect('replyTo' in decodeMessage(raw)).toBe(false);
  });

  test('decodeMessage avec sender: null ⇒ pas d’exception (la passerelle sert `sender: null`)', () => {
    const raw = {
      ...message({
        id: 'm10',
        senderId: 'u-parti',
        sender: viewer,
        content: 'auteur disparu',
        originalLanguage: 'fr',
        translations: [],
        createdAt: '2026-09-08T09:00:00.000Z' as unknown as Date,
      }),
      sender: null,
    } as unknown as Message;
    expect(() => decodeMessage(raw)).not.toThrow();
    expect(decodeMessage(raw).createdAt).toBeInstanceOf(Date);
  });
});

/**
 * Défaut 4, revue #5668 : la passerelle sert `deletedAt: null` (et les six
 * autres champs de date optionnels) pour un message JAMAIS supprimé —
 * mesuré en direct sur `gate.staging.meeshy.me`. `...rest` étalait la clé
 * AVANT que `dateFieldOf(…, null)` ne rende `{}` ; un objet vide spreadé
 * ensuite ne défait rien de ce que `...rest` vient d'écrire. Résultat :
 * TOUT message servi par la passerelle réelle s'affichait « Message
 * supprimé » (`protectionOf` teste `deletedAt !== undefined`, et
 * `null !== undefined` est vrai). Ce témoin échoue sans le correctif.
 */
describe('decodeMessage — les sept clés de date optionnelles, servies `null` par la passerelle réelle (défaut 4, #5668)', () => {
  const rawNullDates = {
    ...message({
      id: 'm11',
      senderId: VIEWER_ID,
      sender: viewer,
      content: 'jamais supprimé',
      originalLanguage: 'fr',
      translations: [],
      createdAt: '2026-09-09T09:00:00.000Z' as unknown as Date,
    }),
    updatedAt: null,
    editedAt: null,
    deletedAt: null,
    expiresAt: null,
    pinnedAt: null,
    deliveredToAllAt: null,
    readByAllAt: null,
  } as unknown as Message;

  test('aucune des sept clés ne survit à `null` — toutes ABSENTES du message décodé', () => {
    const decoded = decodeMessage(rawNullDates);
    expect('updatedAt' in decoded).toBe(false);
    expect('editedAt' in decoded).toBe(false);
    expect('deletedAt' in decoded).toBe(false);
    expect('expiresAt' in decoded).toBe(false);
    expect('pinnedAt' in decoded).toBe(false);
    expect('deliveredToAllAt' in decoded).toBe(false);
    expect('readByAllAt' in decoded).toBe(false);
  });

  test('un message avec `deletedAt: null` ⇒ protection STANDARD, jamais « deleted »', () => {
    const decoded = decodeMessage(rawNullDates);
    expect(protectionOf(decoded, Date.now())).toBe('standard');
  });
});

/**
 * #6086 — LE MÊME DÉFAUT QUE #5668, SUR LES CLÉS QUI NE SONT PAS DES DATES.
 *
 * Le lot #5668 a défait le `null` de SEPT clés, et le doc-comment de
 * `decode.ts` en a tiré une promesse générale : « on DÉFAIT TOUTES les clés
 * que la passerelle peut servir à `null` […] aucune vue n'a plus à le
 * connaître ». Le code ne tenait cette promesse que pour les DATES — le seul
 * outil disponible s'appelait `dateFieldOf`. Tout champ nullable d'un AUTRE
 * type traversait donc intact.
 *
 * Ce que ça coûtait, mesuré sur `staging.meeshy.me` le 2026-09-11 :
 * `reactionSummary Json?` (`schema.prisma:872`) vaut `null` pour tout message
 * SANS réaction — le cas nominal. `reactionsSegment`
 * (`lib/view/message-a11y-label.ts`) testait `=== undefined` puis appelait
 * `Object.entries` : **ouvrir n'importe quelle conversation jetait
 * `TypeError: Cannot convert undefined or null to object`**, et le fil ne se
 * rendait pas du tout.
 *
 * `forwardedFromId`/`forwardedFromConversationId` portent le même piège avec
 * un symptôme INVERSE — pas une exception, un faux positif silencieux : le
 * doc-comment de `forwardAttributionOf` annonce « `null` ⇒ ce message n'est
 * pas un transfert » pendant que son code teste `=== undefined`, si bien
 * qu'un message ORDINAIRE sautait l'early-return et repartait en
 * `{ kind: 'anonymous' }` — le badge « Transféré » sur un message qui ne l'est
 * pas. Un crash se voit ; celui-là non.
 */
describe('decodeMessage — les clés NON-DATE servies `null` par la passerelle réelle (#6086)', () => {
  const rawNullNonDates = {
    ...message({
      id: 'm12',
      senderId: VIEWER_ID,
      sender: viewer,
      content: 'aucune réaction, aucun transfert',
      originalLanguage: 'fr',
      translations: [],
      createdAt: '2026-09-11T09:00:00.000Z' as unknown as Date,
    }),
    reactionSummary: null,
    forwardedFromId: null,
    forwardedFromConversationId: null,
    storyReplyToId: null,
  } as unknown as Message;

  test('aucune des quatre clés ne survit à `null` — toutes ABSENTES du message décodé', () => {
    const decoded = decodeMessage(rawNullNonDates);
    expect('reactionSummary' in decoded).toBe(false);
    expect('forwardedFromId' in decoded).toBe(false);
    expect('forwardedFromConversationId' in decoded).toBe(false);
    expect('storyReplyToId' in decoded).toBe(false);
  });

  test('le libellé d’accessibilité se compose — c’est le crash du fil, reproduit', () => {
    const decoded = decodeMessage(rawNullNonDates);
    expect(() =>
      composeMessageLabel({
        message: decoded,
        isMine: true,
        servedText: 'aucune réaction, aucun transfert',
        delivery: 'sent',
        protection: 'standard',
      }),
    ).not.toThrow();
  });

  test('un message ordinaire ne porte AUCUNE attribution de transfert', () => {
    expect(forwardAttributionOf(decodeMessage(rawNullNonDates))).toBeNull();
  });

  test('un message ordinaire ne cite AUCUNE story', () => {
    expect(storyCitationOf(decodeMessage(rawNullNonDates))).toBeNull();
  });
});

/**
 * DÉFAUT BLOQUANT, REVUE #5805 — LA PIÈCE JOINTE N'A JAMAIS EU DE DÉCODEUR.
 *
 * `decodeMessage` défait `null` sur ONZE clés du MESSAGE (défaut 4 #5668,
 * #6086) mais ne touchait JAMAIS `message.attachments` : chaque pièce
 * jointe traversait BRUTE. Relevé le 2026-09-12 sur `gate.staging.meeshy.me`
 * (conv `690d64275c50e29d3c0c6f29`) : TOUTE pièce SANS transcription sert
 * `transcription: null`, `translations: null`, `alt: null`,
 * `thumbnailUrl: null` — EXPLICITES, jamais absents — et
 * `electDescription`/`electAudio` (`view/media.ts`) lèvent sur
 * `transcription.type`. Sur un fil de 12 messages réels, UNE seule rangée
 * survivait.
 *
 * `decodeAttachment` (`decode.ts`) est le site qui défait ces quatre `null` ;
 * `decodeMessage` l'applique à `attachments` (et, RÉCURSIVEMENT, à celles de
 * `replyTo` — même appel qui décode déjà `replyTo` lui-même).
 */
describe('decodeMessage — les pièces jointes, `null` explicite sur transcription/translations/alt/thumbnailUrl (#5805)', () => {
  const attachmentAsServedByTheGateway = {
    ...attachmentDefaults,
    id: 'a1',
    messageId: 'm13',
    fileName: 'capture.png',
    originalName: 'capture.png',
    mimeType: 'image/png',
    fileSize: 96,
    fileUrl: 'data:image/png;base64,ABC',
    uploadedBy: 'u-amina',
    createdAt: '2026-09-12T09:00:00.000Z',
    transcription: null,
    translations: null,
    alt: null,
    thumbnailUrl: null,
  };

  const rawWithAttachment = {
    ...message({
      id: 'm13',
      senderId: 'u-amina',
      sender: amina,
      content: '',
      originalLanguage: 'fr',
      translations: [],
      createdAt: '2026-09-12T09:00:00.000Z' as unknown as Date,
    }),
    attachments: [attachmentAsServedByTheGateway],
  } as unknown as Message;

  test('aucune des quatre clés ne survit à `null` sur la pièce jointe — toutes ABSENTES', () => {
    const decoded = decodeMessage(rawWithAttachment);
    const attachment = decoded.attachments?.[0];
    expect(attachment).toBeDefined();
    expect('transcription' in (attachment as object)).toBe(false);
    expect('translations' in (attachment as object)).toBe(false);
    expect('alt' in (attachment as object)).toBe(false);
    expect('thumbnailUrl' in (attachment as object)).toBe(false);
  });

  test('le fil ne s’effondre plus : électer la description de la pièce décodée ne lève pas', () => {
    const decoded = decodeMessage(rawWithAttachment);
    const attachment = decoded.attachments?.[0];
    expect(attachment).toBeDefined();
    expect(() =>
      attachment === undefined
        ? undefined
        : electDescription({ attachment, readerLanguages: ['fr', 'en'], fallbackLanguage: 'fr' }),
    ).not.toThrow();
  });

  test('une pièce SANS null (cas nominal des fixtures) reste intacte', () => {
    const rawOrdinary = {
      ...message({
        id: 'm14',
        senderId: 'u-amina',
        sender: amina,
        content: '',
        originalLanguage: 'fr',
        translations: [],
        createdAt: '2026-09-12T09:00:00.000Z' as unknown as Date,
      }),
      attachments: [
        {
          ...attachmentDefaults,
          id: 'a2',
          messageId: 'm14',
          fileName: 'capture.png',
          originalName: 'capture.png',
          mimeType: 'image/png',
          fileSize: 96,
          fileUrl: 'data:image/png;base64,ABC',
          uploadedBy: 'u-amina',
          createdAt: '2026-09-12T09:00:00.000Z',
          alt: 'Une capture',
        },
      ],
    } as unknown as Message;
    const decoded = decodeMessage(rawOrdinary);
    expect(decoded.attachments?.[0]?.alt).toBe('Une capture');
  });

  test('récursif — une pièce jointe `null` sur `replyTo` est décodée aussi', () => {
    const rawWithReply = {
      ...message({
        id: 'm15',
        senderId: VIEWER_ID,
        sender: viewer,
        content: 'réponse',
        originalLanguage: 'fr',
        translations: [],
        createdAt: '2026-09-12T09:05:00.000Z' as unknown as Date,
        replyTo: rawWithAttachment,
      }),
    } as unknown as Message;
    const decoded = decodeMessage(rawWithReply);
    const replyAttachment = decoded.replyTo?.attachments?.[0];
    expect(replyAttachment).toBeDefined();
    expect('transcription' in (replyAttachment as object)).toBe(false);
  });
});
