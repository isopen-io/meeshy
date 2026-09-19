import { describe, it, expect } from '@jest/globals';
import { serializeAttachmentForSocket, aggregateAttachmentReactions } from '../serializeAttachmentForSocket';
import {
  attachmentProtectionSelect,
  attachmentSocketSelect,
} from '../../services/attachments/attachmentIncludes';
import { attachmentProtectionSelect as attachmentProtectionSelectDepuisAdmin } from '../../routes/admin/media-protection';
import { maskedAttachment } from '@meeshy/shared/utils/attachment-protection';
import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';

/**
 * LA PROTECTION SUR LE CANAL SOCKET (#7014).
 *
 * `maskedAttachment` échoue OUVERTE quand on ne la nourrit pas — c'est écrit
 * dans son doc-comment, et c'est le bon défaut CHEZ ELLE. Le fail-closed vit
 * chez le relais, et ce relais-ci ne servait RIEN : `SocketAttachment`
 * énumérait trente champs à la main, sans `isViewOnce` / `isBlurred` /
 * `effectFlags`. Mesuré avant ce lot, sur une ligne `isViewOnce: true` :
 * `maskedAttachment(ligne) === true`, `maskedAttachment(servi) === false` —
 * une photo à VUE UNIQUE reçue par `message:send-with-attachments` rendait son
 * `<img>` EN CLAIR dans web-v2 jusqu'au prochain `GET /messages`.
 *
 * Les témoins ci-dessous gardent les DEUX moitiés, parce qu'un témoin par NOM
 * laisserait passer le quatrième champ :
 *
 *  - INVENTAIRE : tout champ de `attachmentProtectionSelect` est SERVI par le
 *    sérialiseur, et CHARGÉ par le `select` qui l'alimente ;
 *  - FAIL-CLOSED : une pièce protégée reste masquée de l'autre côté du fil,
 *    quel que soit le canal (drapeau, drapeau, bitmask).
 */
const ligneDeBase = {
  id: 'att-prot',
  messageId: 'msg-prot',
  mimeType: 'image/jpeg',
  fileSize: 42_000,
  fileUrl: 'https://cdn.meeshy.me/uploads/secret.jpg',
  transcription: null,
  translations: null,
  createdAt: new Date('2026-09-18T10:00:00Z'),
} as const;

const servi = (protection: Record<string, unknown>) =>
  serializeAttachmentForSocket({ ...ligneDeBase, ...protection } as Record<string, unknown>);

describe('serializeAttachmentForSocket — la garde d’INVENTAIRE (#7014)', () => {
  /**
   * La garde qui RESTE VRAIE au quatrième champ : elle ne nomme aucun champ,
   * elle lit la SÉLECTION. Un champ ajouté à `attachmentProtectionSelect` et
   * oublié du sérialiseur la fait tomber en le NOMMANT.
   */
  it('sert TOUT champ de attachmentProtectionSelect', () => {
    const attendus = Object.keys(attachmentProtectionSelect);
    const charge = servi({ isViewOnce: false, isBlurred: false, effectFlags: 0 }) as unknown as Record<string, unknown>;

    expect(attendus.length).toBeGreaterThan(0);
    expect(attendus.filter((champ) => !(champ in charge))).toEqual([]);
  });

  /**
   * L'autre moitié de l'inventaire : le `select` du canal socket CHARGE ce que
   * le sérialiseur doit servir. Sans ce témoin, la projection fail-closed
   * masquerait TOUT média en production sans qu'un seul test ne rougisse —
   * c'est la projection trop étroite, jamais l'appel manquant, qui rend une
   * garde impossible en aval (leçon 276).
   */
  it('attachmentSocketSelect CHARGE tout champ de attachmentProtectionSelect', () => {
    const manquants = Object.keys(attachmentProtectionSelect).filter(
      (champ) => (attachmentSocketSelect as Record<string, unknown>)[champ] !== true
    );

    expect(manquants).toEqual([]);
  });

  /**
   * Le REST et le socket lisent la MÊME sélection, pas deux copies. Une seconde
   * écriture de « quels champs font la protection » ne peut que diverger : c'est
   * la classe de défaut que ce lot ferme.
   */
  it('la sélection du gateway est UNE — REST et socket partagent l’objet', () => {
    expect(attachmentProtectionSelectDepuisAdmin).toBe(attachmentProtectionSelect);
  });
});

describe('serializeAttachmentForSocket — FAIL-CLOSED sur la protection (#7014)', () => {
  it('une pièce à VUE UNIQUE reste masquée de l’autre côté du fil', () => {
    expect(maskedAttachment(servi({ isViewOnce: true, isBlurred: false, effectFlags: 0 }))).toBe(true);
  });

  it('une pièce FLOUTÉE reste masquée', () => {
    expect(maskedAttachment(servi({ isViewOnce: false, isBlurred: true, effectFlags: 0 }))).toBe(true);
  });

  it('le BITMASK seul suffit — le canal qu’un témoin « à vue » ne couvrirait pas', () => {
    expect(
      maskedAttachment(
        servi({ isViewOnce: false, isBlurred: false, effectFlags: MESSAGE_EFFECT_FLAGS.VIEW_ONCE })
      )
    ).toBe(true);
  });

  it('une pièce ORDINAIRE traverse sans masque — la garde ne ferme pas ce qui est ouvert', () => {
    expect(maskedAttachment(servi({ isViewOnce: false, isBlurred: false, effectFlags: 0 }))).toBe(false);
  });

  /**
   * Les trois colonnes sont NON NULLABLES et à défaut (`schema.prisma`) : une
   * colonne sélectionnée n'est jamais `undefined`. Son absence PROUVE que la
   * requête ne l'a pas chargée — jamais que la pièce est ordinaire.
   */
  it('une ligne dont la requête a OMIS la protection sort masquée', () => {
    expect(maskedAttachment(servi({}))).toBe(true);
  });
});

describe('serializeAttachmentForSocket', () => {
  it('preserves transcription and translations on audio attachment', () => {
    const attachment = {
      id: 'att-1',
      messageId: 'msg-1',
      fileName: 'voice.m4a',
      originalName: 'voice.m4a',
      mimeType: 'audio/m4a',
      fileSize: 870_400,
      fileUrl: 'https://cdn.meeshy.me/uploads/voice.m4a',
      thumbnailUrl: null,
      thumbHash: null,
      width: null,
      height: null,
      duration: 42_000,
      bitrate: 128_000,
      sampleRate: 44_100,
      codec: 'aac',
      channels: 2,
      fps: null,
      videoCodec: null,
      pageCount: null,
      lineCount: null,
      metadata: null,
      uploadedBy: 'user-1',
      isAnonymous: false,
      createdAt: new Date('2026-05-25T10:00:00Z'),
      transcription: { text: 'Bonjour', language: 'fr', confidence: 0.95 },
      translations: {
        en: { url: 'https://cdn.meeshy.me/tts/en/voice.mp3', transcription: 'Hello', format: 'mp3' },
      },
    };

    const result = serializeAttachmentForSocket(attachment as Record<string, unknown>);

    expect(result.id).toBe('att-1');
    expect(result.fileSize).toBe(870_400);
    expect(result.transcription).toEqual({ text: 'Bonjour', language: 'fr', confidence: 0.95 });
    expect(result.translations).toEqual({
      en: { url: 'https://cdn.meeshy.me/tts/en/voice.mp3', transcription: 'Hello', format: 'mp3' },
    });
    expect(result.duration).toBe(42_000);
    expect(result.codec).toBe('aac');
  });

  it('passes through null transcription and translations without throwing', () => {
    const attachment = {
      id: 'att-2',
      messageId: 'msg-2',
      fileName: 'pic.jpg',
      mimeType: 'image/jpeg',
      fileSize: 12_000,
      fileUrl: 'https://cdn.meeshy.me/uploads/pic.jpg',
      transcription: null,
      translations: null,
      createdAt: new Date(),
    };

    const result = serializeAttachmentForSocket(attachment as Record<string, unknown>);
    expect(result.transcription).toBeNull();
    expect(result.translations).toBeNull();
    expect(result.id).toBe('att-2');
  });

  it('defaults missing fileSize to 0 (defensive)', () => {
    const attachment = {
      id: 'att-3',
      messageId: 'msg-3',
      fileName: 'unknown.bin',
      mimeType: 'application/octet-stream',
      fileUrl: 'https://cdn.meeshy.me/uploads/unknown.bin',
      transcription: null,
      translations: null,
      createdAt: new Date(),
    };

    const result = serializeAttachmentForSocket(attachment as Record<string, unknown>);
    expect(result.fileSize).toBe(0);
  });

  it('serves capturedInApp provenance so WS delivery keeps parity with REST', () => {
    // `attachmentMediaSelect` charge `capturedInApp` À DESSEIN : la feuille de
    // partage le lit pour décider si publier ce média demande confirmation
    // (`publicationNeedsCaptureConfirmation`). Le sérialiseur socket est le SEUL
    // dropper — l'omettre désarme la garde sur le chemin de livraison WebSocket
    // primaire (`message:new`) et le rattrapage à froid (`sync`), exactement ce
    // que le commentaire du `select` met en garde.
    const attachment = {
      id: 'att-cap-1',
      messageId: 'msg-cap-1',
      mimeType: 'image/jpeg',
      fileSize: 20_000,
      fileUrl: 'https://cdn.meeshy.me/uploads/in-app.jpg',
      transcription: null,
      translations: null,
      createdAt: new Date(),
      capturedInApp: true,
    };

    const result = serializeAttachmentForSocket(attachment as Record<string, unknown>);

    expect(result.capturedInApp).toBe(true);
  });

  it('defaults capturedInApp to false when the query omitted it (matches column @default(false))', () => {
    const attachment = {
      id: 'att-cap-2',
      messageId: 'msg-cap-2',
      mimeType: 'image/png',
      fileSize: 3000,
      fileUrl: 'https://cdn.meeshy.me/uploads/legacy.png',
      transcription: null,
      translations: null,
      createdAt: new Date(),
    };

    const result = serializeAttachmentForSocket(attachment as Record<string, unknown>);

    expect(result.capturedInApp).toBe(false);
  });

  it('aggregates reactions into reactionSummary and currentUserReactions', () => {
    const attachment = {
      id: 'att-4',
      messageId: 'msg-4',
      mimeType: 'image/png',
      fileSize: 5000,
      fileUrl: 'https://cdn.meeshy.me/uploads/img.png',
      transcription: null,
      translations: null,
      createdAt: new Date(),
      reactions: [
        { emoji: '❤️', participantId: 'user-A' },
        { emoji: '❤️', participantId: 'user-B' },
        { emoji: '👍', participantId: 'user-A' },
      ],
    };

    const result = serializeAttachmentForSocket(attachment as Record<string, unknown>, 'user-A');

    expect(result.reactionSummary).toEqual({ '❤️': 2, '👍': 1 });
    expect(result.currentUserReactions).toEqual(['❤️', '👍']);
  });

  it('returns empty reactions when no reactions provided', () => {
    const attachment = {
      id: 'att-5',
      messageId: 'msg-5',
      mimeType: 'image/png',
      fileSize: 1000,
      fileUrl: 'https://cdn.meeshy.me/uploads/img2.png',
      transcription: null,
      translations: null,
      createdAt: new Date(),
    };

    const result = serializeAttachmentForSocket(attachment as Record<string, unknown>);

    expect(result.reactionSummary).toEqual({});
    expect(result.currentUserReactions).toEqual([]);
  });

  it('currentUserReactions is empty when currentParticipantId not provided', () => {
    const attachment = {
      id: 'att-6',
      messageId: 'msg-6',
      mimeType: 'image/png',
      fileSize: 1000,
      fileUrl: 'https://cdn.meeshy.me/uploads/img3.png',
      transcription: null,
      translations: null,
      createdAt: new Date(),
      reactions: [
        { emoji: '😊', participantId: 'user-X' },
      ],
    };

    const result = serializeAttachmentForSocket(attachment as Record<string, unknown>);

    expect(result.reactionSummary).toEqual({ '😊': 1 });
    expect(result.currentUserReactions).toEqual([]);
  });
});

describe('aggregateAttachmentReactions', () => {
  it('returns empty results for null rows', () => {
    const result = aggregateAttachmentReactions(null);
    expect(result.reactionSummary).toEqual({});
    expect(result.currentUserReactions).toEqual([]);
  });

  it('returns empty results for undefined rows', () => {
    const result = aggregateAttachmentReactions(undefined);
    expect(result.reactionSummary).toEqual({});
    expect(result.currentUserReactions).toEqual([]);
  });

  it('counts multiple reactions of the same emoji', () => {
    const rows = [
      { emoji: '❤️', participantId: 'u1' },
      { emoji: '❤️', participantId: 'u2' },
      { emoji: '❤️', participantId: 'u3' },
    ];
    const result = aggregateAttachmentReactions(rows);
    expect(result.reactionSummary['❤️']).toBe(3);
  });

  it('does not duplicate an emoji in currentUserReactions if user reacted twice (defensive)', () => {
    const rows = [
      { emoji: '❤️', participantId: 'u1' },
      { emoji: '❤️', participantId: 'u1' },
    ];
    const result = aggregateAttachmentReactions(rows, 'u1');
    expect(result.currentUserReactions).toEqual(['❤️']);
    expect(result.reactionSummary['❤️']).toBe(2);
  });

  it('does not add to currentUserReactions when participant does not match', () => {
    const rows = [{ emoji: '👍', participantId: 'other-user' }];
    const result = aggregateAttachmentReactions(rows, 'u1');
    expect(result.currentUserReactions).toEqual([]);
    expect(result.reactionSummary['👍']).toBe(1);
  });
});
