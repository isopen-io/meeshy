/**
 * CE QU'UNE GALERIE N'A PAS LE DROIT DE LISTER —
 * `AttachmentService.getConversationAttachments`.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE FICHIER EXISTE, ET POURQUOI IL EST AU NIVEAU DU SERVICE
 * ────────────────────────────────────────────────────────────────────────────
 *
 * La galerie d'une conversation est un CHEMIN DE TRANSPORT : elle remet
 * `fileUrl` sous forme de lien permanent, rejouable à volonté, dans une liste
 * servie jusqu'à un participant ANONYME. Trois classes de média n'ont rien à y
 * faire, et le service les lisait pourtant en base sans jamais les regarder :
 *
 *   • la pièce jointe à VUE UNIQUE — une galerie persistante et une sémantique
 *     « vue unique » sont incompatibles par nature ;
 *   • la pièce jointe FLOUTÉE — elle n'est visible qu'après un geste explicite
 *     de révélation ; une tuile qui pointe droit sur son `fileUrl` fait
 *     l'économie du geste ;
 *   • le média d'un message ÉPHÉMÈRE dont l'échéance est passée — le message a
 *     disparu, son contenu ne doit pas lui survivre par une autre porte.
 *
 * La garde existait déjà ailleurs — `maskedAttachment` (cycle 125, éventail de
 * notifications), extrait en `mediaAttachmentIsProtected`
 * (`utils/media-protection.ts`) pour les routes d'administration. Elle n'avait
 * jamais été reprise ici. Ce fichier est le témoin qui l'y retient.
 *
 * Il vit au niveau du SERVICE et non de la route : `attachments-galerie-*.test`
 * côté route MOQUE `getConversationAttachments`, donc aucune fixture posée
 * là-haut ne peut faire rougir un filtre écrit ici.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * LES DEUX NIVEAUX QUI DÉCLARENT LA PROTECTION
 * ────────────────────────────────────────────────────────────────────────────
 *
 * `isViewOnce` / `isBlurred` / `effectFlags` existent à la fois sur
 * `MessageAttachment` et sur `Message`, en colonnes HOMONYMES et
 * INDÉPENDANTES. Chaque cas est donc joué sur les deux niveaux : une garde qui
 * n'en lirait qu'un laisserait l'autre moitié des médias protégés partir, et
 * le témoin ne le dirait pas.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';

const mockUploadProcessor = {
  validateFile: jest.fn() as jest.Mock<any>,
  getAttachmentUrl: jest.fn() as jest.Mock<any>,
  getAttachmentPath: jest.fn() as jest.Mock<any>,
  buildFullUrl: jest.fn() as jest.Mock<any>,
} as any;

jest.mock('../../../services/attachments/UploadProcessor', () => ({
  UploadProcessor: jest.fn().mockImplementation(() => mockUploadProcessor),
}));

jest.mock('../../../services/attachments/MetadataManager', () => ({
  MetadataManager: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../../services/AttachmentEncryptionService', () => ({
  getAttachmentEncryptionService: jest.fn(() => ({})),
}));

jest.mock('../../../utils/logger-enhanced.js', () => ({
  enhancedLogger: {
    child: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
  },
}));

import { AttachmentService } from '../../../services/attachments';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';

const CONV_ID = '507f1f77bcf86cd799439003';

/** Le message ORDINAIRE que porte une pièce jointe ordinaire. */
const messageNu = () => ({
  isViewOnce: false,
  isBlurred: false,
  effectFlags: 0,
  expiresAt: null,
  deletedAt: null,
});

const ligne = (overrides: Record<string, unknown> = {}) => ({
  id: 'att-libre',
  messageId: 'msg-1',
  fileName: 'a-1.jpg',
  originalName: 'marche-de-lagos.jpg',
  mimeType: 'image/jpeg',
  fileSize: 420_000,
  fileUrl: '/api/v1/attachments/file/2026%2F08%2Fa-1.jpg',
  thumbnailUrl: null,
  width: null,
  height: null,
  duration: null,
  bitrate: null,
  sampleRate: null,
  codec: null,
  channels: null,
  uploadedBy: '507f1f77bcf86cd799439004',
  isAnonymous: false,
  createdAt: new Date('2026-08-30T12:01:00.000Z'),
  isForwarded: false,
  capturedInApp: false,
  isViewOnce: false,
  viewOnceCount: 0,
  isBlurred: false,
  viewedCount: 0,
  downloadedCount: 0,
  consumedCount: 0,
  isEncrypted: false,
  effectFlags: 0,
  transcription: null,
  translations: null,
  message: messageNu(),
  ...overrides,
});

/** Ce que la galerie sert, réduit aux identifiants — la seule chose qu'on mesure. */
const servis = async (lignes: readonly Record<string, unknown>[]): Promise<readonly string[]> => {
  const prisma = {
    messageAttachment: {
      findMany: (jest.fn() as jest.Mock<any>).mockResolvedValue([...lignes]),
    },
  } as unknown as PrismaClient;

  const service = new AttachmentService(prisma);
  const liste = await service.getConversationAttachments(CONV_ID);

  return liste.map((piece) => piece.id);
};

const LIBRE = ligne();

describe('la galerie ne liste jamais un média protégé', () => {
  it('sert une pièce jointe ordinaire — le témoin doit pouvoir DISTINGUER', async () => {
    expect(await servis([LIBRE])).toEqual(['att-libre']);
  });

  it('retire la pièce jointe à VUE UNIQUE, et garde ses voisines', async () => {
    expect(await servis([LIBRE, ligne({ id: 'att-vue-unique', isViewOnce: true })])).toEqual([
      'att-libre',
    ]);
  });

  it('retire la pièce jointe FLOUTÉE — la révélation est un geste, pas une tuile', async () => {
    expect(await servis([LIBRE, ligne({ id: 'att-floutee', isBlurred: true })])).toEqual([
      'att-libre',
    ]);
  });

  /**
   * `effectFlags` est un CHAMP DE BITS, et c'est la raison pour laquelle le
   * verdict ne peut PAS s'écrire dans le `where` : ni Prisma ni MongoDB ne
   * savent l'interroger. Un filtre de requête serait donc une garde
   * INCOMPLÈTE, qui aurait l'air posée.
   */
  it('retire la pièce jointe protégée par son seul CHAMP DE BITS', async () => {
    expect(
      await servis([
        LIBRE,
        ligne({ id: 'att-drapeau', effectFlags: MESSAGE_EFFECT_FLAGS.VIEW_ONCE }),
        ligne({ id: 'att-drapeau-flou', effectFlags: MESSAGE_EFFECT_FLAGS.BLURRED }),
      ]),
    ).toEqual(['att-libre']);
  });

  /**
   * LE SECOND NIVEAU. Les colonnes homonymes du MESSAGE sont indépendantes de
   * celles de la pièce jointe : ici la pièce jointe ne déclare RIEN.
   */
  it('retire le média d’un message à vue unique, flouté ou marqué par son drapeau', async () => {
    expect(
      await servis([
        LIBRE,
        ligne({ id: 'att-msg-vue-unique', message: { ...messageNu(), isViewOnce: true } }),
        ligne({ id: 'att-msg-floute', message: { ...messageNu(), isBlurred: true } }),
        ligne({
          id: 'att-msg-drapeau',
          message: { ...messageNu(), effectFlags: MESSAGE_EFFECT_FLAGS.VIEW_ONCE },
        }),
      ]),
    ).toEqual(['att-libre']);
  });

  /**
   * L'ÉPHÉMÈRE. Le message a disparu ; son média ne doit pas lui survivre par
   * une autre porte. Une échéance à VENIR, elle, ne retire rien — le message
   * est encore là, et sa galerie avec lui.
   */
  it('retire le média d’un message éphémère EXPIRÉ, garde celui dont l’échéance vient', async () => {
    const expire = new Date(Date.now() - 60_000);
    const aVenir = new Date(Date.now() + 3_600_000);

    expect(
      await servis([
        LIBRE,
        ligne({ id: 'att-expire', message: { ...messageNu(), expiresAt: expire } }),
        ligne({ id: 'att-en-cours', message: { ...messageNu(), expiresAt: aVenir } }),
      ]),
    ).toEqual(['att-libre', 'att-en-cours']);
  });

  /**
   * Une pièce jointe sans message porteur ne perd pas ses propres drapeaux :
   * la relation est NULLABLE en base, et un contexte absent ne doit pas valoir
   * autorisation.
   */
  it('juge une pièce jointe orpheline sur ses propres drapeaux', async () => {
    expect(
      await servis([
        ligne({ id: 'att-orpheline', message: null }),
        ligne({ id: 'att-orpheline-vue-unique', message: null, isViewOnce: true }),
      ]),
    ).toEqual(['att-orpheline']);
  });
});
