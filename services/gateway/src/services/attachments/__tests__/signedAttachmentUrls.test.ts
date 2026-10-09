/**
 * #9600 — les adresses SERVIES d'une pièce jointe protégée portent la
 * signature de leur lecteur ; celles d'un contenu ordinaire ne changent pas.
 *
 * « Protégé » est la nature de la loi de sortie (#9572) lue sur le message
 * porteur ET sur cette pièce : flamme à durée, flamme après lecture, vue
 * unique. Le flou n'est pas une nature — il ne disparaît pour personne.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';

import { checkReaderFileToken, readSigningKeys, readerFileUrlSigner } from '../readerFileSignature';
import { forwardPreviewAttachments, signReaderAttachmentUrls, type ReaderBoundMessage } from '../signedAttachmentUrls';

const KEYS = readSigningKeys({ ATTACHMENT_URL_SIGNING_KEY: Buffer.alloc(32, 3).toString('base64') });
const NOW = new Date('2026-10-08T10:00:00.000Z');
const SIGNER = readerFileUrlSigner({ keys: KEYS, now: NOW });

const PIECE = 'aaaaaaaaaaaaaaaaaaaaaaa1';
const READER = 'cccccccccccccccccccccc01';
const KEY = '2026/10/68f2a81417a557e8ce4ddfc1/photo_8b1f0c1e.jpg';
const THUMB = '2026/10/68f2a81417a557e8ce4ddfc1/photo_8b1f0c1e_thumb.webp';
const VARIANT = '2026/10/68f2a81417a557e8ce4ddfc1/photo_8b1f0c1e_640w.webp';
const TRACK = `translated/${PIECE}_en.mp3`;

const ORDINARY: ReaderBoundMessage = {
  isViewOnce: false,
  isBlurred: false,
  effectFlags: 0,
  ephemeralDuration: null,
  expiresAt: null,
};

const piece = (overrides: Record<string, unknown> = {}) => ({
  id: PIECE,
  fileUrl: KEY,
  thumbnailUrl: `/api/attachments/file/${encodeURIComponent(THUMB)}`,
  imageVariants: [{ width: 640, height: 480, url: VARIANT, size: 10, format: 'webp' }],
  translations: { en: { url: `/api/v1/attachments/file/${TRACK}`, transcription: 'hello', format: 'mp3' } },
  isViewOnce: false,
  isBlurred: false,
  effectFlags: 0,
  mimeType: 'image/jpeg',
  ...overrides,
});

const signed = (attachment: ReturnType<typeof piece>, message: ReaderBoundMessage, reader: string | null = READER) =>
  signReaderAttachmentUrls(attachment, { message, readerParticipantId: reader, signer: SIGNER });

/** Relit une adresse signée comme le ferait la route, et rend la clé qu'elle porte. */
function grantOf(url: unknown): { storageKey: string; attachmentId: string; readerParticipantId: string } {
  expect(typeof url).toBe('string');
  const match = /^\/api\/v1\/attachments\/signed\/([^/]+)\/([^/]+)$/.exec(url as string);
  expect(match).not.toBeNull();
  const [, token, encodedKey] = match as RegExpExecArray;
  const storageKey = decodeURIComponent(encodedKey as string);
  const check = checkReaderFileToken({ token: token as string, storageKey, keys: KEYS, now: NOW });
  if (check.kind !== 'valid') throw new Error(`signature invalide : ${check.reason}`);
  return { storageKey, attachmentId: check.attachmentId, readerParticipantId: check.readerParticipantId };
}

describe('signReaderAttachmentUrls', () => {
  it("laisse INTACTE la pièce d'un message ordinaire — même objet, caches clients inchangés", () => {
    const attachment = piece();
    expect(signed(attachment, ORDINARY)).toBe(attachment);
  });

  it('laisse intacte une pièce seulement floutée : le flou ne disparaît pour personne', () => {
    const attachment = piece({ isBlurred: true, effectFlags: MESSAGE_EFFECT_FLAGS.BLURRED });
    expect(signed(attachment, { ...ORDINARY, isBlurred: true })).toBe(attachment);
  });

  it('signe pour CE lecteur toutes les adresses de la pièce d\'un message à vue unique', () => {
    const out = signed(piece(), { ...ORDINARY, isViewOnce: true });
    const expected = { attachmentId: PIECE, readerParticipantId: READER };
    expect(grantOf(out.fileUrl)).toEqual({ ...expected, storageKey: KEY });
    expect(grantOf(out.thumbnailUrl)).toEqual({ ...expected, storageKey: THUMB });
    expect(grantOf((out.imageVariants as Array<{ url: string }>)[0]?.url)).toEqual({ ...expected, storageKey: VARIANT });
    expect(grantOf((out.translations as Record<string, { url: string }>).en?.url)).toEqual({ ...expected, storageKey: TRACK });
  });

  it('garde les autres champs de la variante et de la piste', () => {
    const out = signed(piece(), { ...ORDINARY, isViewOnce: true });
    expect((out.imageVariants as Array<Record<string, unknown>>)[0]).toMatchObject({ width: 640, height: 480, format: 'webp' });
    expect((out.translations as Record<string, Record<string, unknown>>).en).toMatchObject({ transcription: 'hello', format: 'mp3' });
    expect(out.mimeType).toBe('image/jpeg');
  });

  it.each([
    ['une pièce à vue unique sous un message ordinaire', piece({ isViewOnce: true }), ORDINARY],
    ['une flamme à durée', piece(), { ...ORDINARY, effectFlags: MESSAGE_EFFECT_FLAGS.EPHEMERAL, ephemeralDuration: 30, expiresAt: NOW }],
    ['une flamme après lecture', piece(), { ...ORDINARY, effectFlags: MESSAGE_EFFECT_FLAGS.EPHEMERAL_AFTER_READ, expiresAt: NOW }],
    ['la copie transférée d\'une flamme (durée ET après lecture)', piece(), {
      ...ORDINARY,
      effectFlags: MESSAGE_EFFECT_FLAGS.EPHEMERAL | MESSAGE_EFFECT_FLAGS.EPHEMERAL_AFTER_READ,
      ephemeralDuration: 30,
      expiresAt: NOW,
    }],
  ])('signe %s', (_label, attachment, message) => {
    expect(grantOf(signed(attachment, message).fileUrl).readerParticipantId).toBe(READER);
  });

  it("signe quand la protection du message n'a pas été LUE — l'absence ne prouve pas l'ordinaire", () => {
    const { ephemeralDuration: _omitted, ...partial } = ORDINARY;
    expect(grantOf(signed(piece(), partial as ReaderBoundMessage).fileUrl).storageKey).toBe(KEY);
  });

  it("ne touche à rien sans lecteur ni sans clé — l'adresse d'avant reste servie", () => {
    const attachment = piece();
    expect(signed(attachment, { ...ORDINARY, isViewOnce: true }, null)).toBe(attachment);
    expect(signReaderAttachmentUrls(attachment, { message: { ...ORDINARY, isViewOnce: true }, readerParticipantId: READER, signer: null })).toBe(attachment);
  });

  it.each([
    ['clé nue', KEY],
    ['route relative versionnée', `/api/v1/attachments/file/${encodeURIComponent(KEY)}`],
    ['route legacy non versionnée', `/api/attachments/file/${encodeURIComponent(KEY)}`],
    ['adresse absolue d\'un autre déploiement', `https://gate.meeshy.me/api/v1/attachments/file/${encodeURIComponent(KEY)}`],
  ])('reconnaît la clé sous la forme « %s »', (_label, fileUrl) => {
    const out = signed(piece({ fileUrl }), { ...ORDINARY, isViewOnce: true });
    expect(grantOf(out.fileUrl).storageKey).toBe(KEY);
  });

  it.each([
    ['une adresse par identifiant (transfert dont la source est tue)', `/api/v1/attachments/${PIECE}`],
    ['un hôte tiers', 'https://cdn.example.com/photo.jpg'],
    ['le magasin statique', 'https://static.meeshy.me/u/i/2025/11/photo.jpg'],
    ['une référence statique', 'static:u/i/2025/11/photo.jpg'],
    ['une remontée', '2026/10/../../etc/passwd'],
    ['une chaîne vide', ''],
  ])('ne réécrit jamais %s', (_label, fileUrl) => {
    const out = signed(piece({ fileUrl }), { ...ORDINARY, isViewOnce: true });
    expect(out.fileUrl).toBe(fileUrl);
  });
});

describe('forwardPreviewAttachments', () => {
  it("retire de l'aperçu de transfert la pièce d'une source qui disparaît, garde celle d'une source ordinaire", () => {
    const flame = { ...ORDINARY, effectFlags: MESSAGE_EFFECT_FLAGS.EPHEMERAL, ephemeralDuration: 30, expiresAt: NOW };
    expect(forwardPreviewAttachments(flame, [piece()])).toEqual([]);
    expect(forwardPreviewAttachments(ORDINARY, [piece()])).toEqual([piece()]);
    expect(forwardPreviewAttachments(ORDINARY, [piece({ isViewOnce: true })])).toEqual([]);
  });

  it("retire aussi quand la protection de la source n'a pas été lue", () => {
    const { ephemeralDuration: _omitted, ...partial } = ORDINARY;
    expect(forwardPreviewAttachments(partial as ReaderBoundMessage, [piece()])).toEqual([]);
  });
});
