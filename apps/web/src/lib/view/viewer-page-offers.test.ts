import { describe, expect, test } from 'bun:test';

import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';

import { attachmentDefaults } from '@/lib/api/fixtures-base';
import { attachmentSrc } from '@/lib/api/media-url';
import type { Attachment } from '@/lib/api/types';

import {
  NO_MEDIA_OFFERS,
  attachmentSendRequest,
  mediaPageOffers,
  standaloneSharePage,
  type MediaViewerCapabilities,
  type ProtectableMessage,
} from './viewer-page-offers';

/**
 * #6303 — LES QUATRE ACTIONS DE LA VISIONNEUSE N'EXISTENT QUE SI ELLES ONT UN
 * EFFET, ET JAMAIS SUR UNE PIÈCE PROTÉGÉE (miroir de la colonne d'iOS).
 */
const MESSAGE_ID = '65f0a1b2c3d4e5f6a7b8c9d0';
const PIECE_ID = '65f0a1b2c3d4e5f6a7b8c9d1';

const piece = (partial: Partial<Attachment> = {}): Attachment =>
  ({
    ...attachmentDefaults,
    id: PIECE_ID,
    messageId: MESSAGE_ID,
    fileName: 'p.jpg',
    originalName: 'p.jpg',
    mimeType: 'image/jpeg',
    fileSize: 2048,
    fileUrl: '/api/v1/attachments/file/p.jpg',
    uploadedBy: 'u-amina',
    createdAt: '2026-09-26T09:00:00.000Z',
    ...partial,
  }) as Attachment;

const message = (partial: Partial<ProtectableMessage> = {}): ProtectableMessage => ({
  id: MESSAGE_ID,
  isViewOnce: false,
  isBlurred: false,
  isEncrypted: false,
  ...partial,
});

const ALL: MediaViewerCapabilities = { save: true, react: true, reply: true, compose: true, share: true };

describe('mediaPageOffers', () => {
  test('une photo ordinaire, un hôte qui sait tout faire : les quatre actions', () => {
    expect(mediaPageOffers({ attachment: piece(), message: message(), capabilities: ALL })).toEqual(ALL);
  });

  test('une vidéo se compose aussi ; un document jamais', () => {
    expect(mediaPageOffers({ attachment: piece({ mimeType: 'video/mp4' }), message: message(), capabilities: ALL }).compose).toBe(true);
    expect(mediaPageOffers({ attachment: piece({ mimeType: 'application/pdf' }), message: message(), capabilities: ALL }).compose).toBe(false);
  });

  const PROTECTED: readonly (readonly [string, Partial<ProtectableMessage>, Partial<Attachment>])[] = [
    ['message à vue unique', { isViewOnce: true }, {}],
    ['message flouté', { isBlurred: true }, {}],
    ['message chiffré', { isEncrypted: true }, {}],
    ['message au drapeau de flou', { effectFlags: MESSAGE_EFFECT_FLAGS.BLURRED }, {}],
    ['pièce à vue unique', {}, { isViewOnce: true } as Partial<Attachment>],
    ['pièce floutée', {}, { isBlurred: true } as Partial<Attachment>],
  ];
  for (const [label, onMessage, onPiece] of PROTECTED) {
    test(`${label} : aucune action (loi 4, la protection au rang de l’existence)`, () => {
      expect(mediaPageOffers({ attachment: piece(onPiece), message: message(onMessage), capabilities: ALL })).toEqual(NO_MEDIA_OFFERS);
    });
  }

  test('ce que l’hôte ne sait pas faire n’existe pas', () => {
    const offers = mediaPageOffers({
      attachment: piece(),
      message: message(),
      capabilities: { save: true, react: false, reply: false, compose: true, share: false },
    });
    expect(offers).toEqual({ save: true, react: false, reply: false, compose: true, share: false });
  });

  test('un envoi encore local n’offre rien : la passerelle n’en connaît pas l’identifiant, ses pièces sont des aperçus locaux', () => {
    const offers = mediaPageOffers({
      attachment: piece({ id: 'local-1', fileUrl: 'blob:http://localhost/1' }),
      message: message({ id: 'cid_4f1c2a9e-8b7d-4c3e-9a1b-2c3d4e5f6a7b' }),
      capabilities: ALL,
    });
    expect(offers).toEqual(NO_MEDIA_OFFERS);
  });

  test('une pièce sans fichier ne s’enregistre ni ne se compose', () => {
    const offers = mediaPageOffers({ attachment: piece({ fileUrl: '' }), message: message(), capabilities: ALL });
    expect(offers.save).toBe(false);
    expect(offers.compose).toBe(false);
    expect(offers.share).toBe(false);
  });

  test('une vidéo et une photo se partagent ; ce que l’hôte ne sait pas envoyer ne s’offre pas (#8884)', () => {
    expect(mediaPageOffers({ attachment: piece({ mimeType: 'video/mp4' }), message: message(), capabilities: ALL }).share).toBe(true);
    expect(mediaPageOffers({ attachment: piece(), message: message(), capabilities: { ...ALL, share: false } }).share).toBe(false);
  });
});

describe('attachmentSendRequest — la pièce d’un message, telle que la feuille d’envoi la reçoit (#8884)', () => {
  const sent = { id: MESSAGE_ID, conversationId: 'c-1' };

  test('la pièce voyage par ses identifiants (jamais par son fichier), et « mine » dit si le lecteur en est l’auteur', () => {
    const mine = attachmentSendRequest({ attachment: piece({ thumbnailUrl: '/t.jpg' }), message: sent, mine: true });
    expect(mine.intent).toBe('share');
    expect(mine.payload).toEqual({
      kind: 'attachment',
      conversationId: 'c-1',
      messageId: MESSAGE_ID,
      attachmentId: PIECE_ID,
      mime: 'image/jpeg',
      previewUrl: attachmentSrc('/t.jpg'),
      mine: true,
      protected: false,
    });
    const theirs = attachmentSendRequest({ attachment: piece(), message: sent, mine: false });
    expect(theirs.payload).toMatchObject({ mine: false });
  });

  test('la pièce d’un message ÉPHÉMÈRE se transfère mais ne se publie pas : la passerelle refuse le média éphémère en publication', () => {
    const ephemeral = { ...sent, expiresAt: new Date(Date.now() + 60_000) };
    const request = attachmentSendRequest({ attachment: piece(), message: ephemeral, mine: true });
    expect(request.payload).toMatchObject({ kind: 'attachment', protected: true });
    const lasting = attachmentSendRequest({ attachment: piece(), message: sent, mine: true });
    expect(lasting.payload).toMatchObject({ protected: false });
  });

  test('sans vignette, l’aperçu est le fichier lui-même', () => {
    const request = attachmentSendRequest({ attachment: piece(), message: sent, mine: true });
    expect(request.payload).toMatchObject({ previewUrl: attachmentSrc('/api/v1/attachments/file/p.jpg') });
  });
});

describe('standaloneSharePage — le média d’une publication ou d’un commentaire, sans message (#8884)', () => {
  test('une image ordinaire se partage comme un média : son adresse, son type, son nom', () => {
    const page = standaloneSharePage(piece({ originalName: 'plage.jpg' }));
    expect(page?.offers).toEqual({ ...NO_MEDIA_OFFERS, share: true });
    expect(page?.share?.payload).toMatchObject({ kind: 'media', mime: 'image/jpeg', name: 'plage.jpg', preview: { kind: 'image' } });
  });

  test('une vidéo a un aperçu vidéo : son fichier, que la feuille lit, jamais sa vignette image', () => {
    const page = standaloneSharePage(piece({ mimeType: 'video/mp4', thumbnailUrl: '/v.jpg' }));
    expect(page?.share?.payload).toMatchObject({ kind: 'media', preview: { kind: 'video', thumbUrl: attachmentSrc('/api/v1/attachments/file/p.jpg') } });
  });

  const REFUSED: readonly (readonly [string, Partial<Attachment>])[] = [
    ['à vue unique', { isViewOnce: true } as Partial<Attachment>],
    ['floutée', { isBlurred: true } as Partial<Attachment>],
    ['sans fichier', { fileUrl: '' }],
    ['encore locale (aperçu blob)', { fileUrl: 'blob:http://localhost/1' }],
  ];
  for (const [label, partial] of REFUSED) {
    test(`une pièce ${label} n’offre aucun partage`, () => {
      expect(standaloneSharePage(piece(partial))).toBeNull();
    });
  }
});
