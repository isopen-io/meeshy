/**
 * #13100 — une pièce scellée au repos se lit par lecteur : toutes ses adresses
 * (original, vignette, variantes, rendus, pistes traduites) partent signées
 * pour SON lecteur, sur chaque surface qui signe déjà les contenus protégés
 * (liste, synchronisation, fil, épinglés, détail, temps réel par lecteur). Une
 * pièce ordinaire en clair garde ses adresses nues, sans en changer une.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { attachmentIsReaderBound, carriesSealedFile, signReaderAttachmentUrls } from '../signedAttachmentUrls';
import { readerFileUrlSigner } from '../readerFileSignature';

const ORDINARY = { isViewOnce: false, isBlurred: false, effectFlags: 0, ephemeralDuration: null, expiresAt: null };
const signer = readerFileUrlSigner({ keys: { current: Buffer.alloc(32, 9), previous: null }, now: new Date('2026-10-26T10:00:00Z') })!;
const SEALED = '2026/10/68f2a81417a557e8ce4ddfc1/5f0c2e7a1b9d4c3e8a7b6f5e4d3c2b1a.jpg';
const PLAIN = '2026/10/68f2a81417a557e8ce4ddfc1/photo_0f8fad5b-d9cb-469f-a165-70867728950e.jpg';

const piece = (key: string) => ({
  id: 'aaaaaaaaaaaaaaaaaaaaaaa1',
  fileUrl: key,
  thumbnailUrl: key.replace('.jpg', '_thumb.webp'),
  imageVariants: [{ width: 640, url: key.replace('.jpg', '_640w.webp') }],
  translations: { en: { url: '/api/v1/attachments/file/translated/aaaaaaaaaaaaaaaaaaaaaaa1_en.m4a' } },
  isViewOnce: false,
  isBlurred: false,
  effectFlags: 0,
});

describe('une pièce scellée au repos se lit par lecteur', () => {
  it('reconnue à la forme opaque que seul le scellement produit', () => {
    expect(carriesSealedFile(piece(SEALED))).toBe(true);
    expect(carriesSealedFile(piece(PLAIN))).toBe(false);
    expect(carriesSealedFile({ fileUrl: `/api/v1/attachments/file/${encodeURIComponent(SEALED)}`, thumbnailUrl: null })).toBe(true);
  });

  it('même dans un message ordinaire', () => {
    expect(attachmentIsReaderBound(ORDINARY, piece(SEALED))).toBe(true);
    expect(attachmentIsReaderBound(ORDINARY, piece(PLAIN))).toBe(false);
  });

  it('toutes ses adresses partent signées pour son lecteur', () => {
    const signed = signReaderAttachmentUrls(piece(SEALED), { message: ORDINARY, readerParticipantId: 'cccccccccccccccccccccc01', signer });
    const urls = [signed.fileUrl, signed.thumbnailUrl, signed.imageVariants[0].url, signed.translations.en.url];
    expect(urls.every((url) => typeof url === 'string' && url.startsWith('/api/v1/attachments/signed/'))).toBe(true);
  });

  it('une pièce ordinaire en clair garde ses adresses, objet compris', () => {
    const plain = piece(PLAIN);
    expect(signReaderAttachmentUrls(plain, { message: ORDINARY, readerParticipantId: 'cccccccccccccccccccccc01', signer })).toBe(plain);
  });
});
