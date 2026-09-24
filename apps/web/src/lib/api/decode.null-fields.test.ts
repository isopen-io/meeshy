import { describe, expect, test } from 'bun:test';
import type { Message } from '@meeshy/shared';
import { decodeMessage } from './decode';
import { attachmentSrcSet } from './media-url';
import { thumbHashPlaceholder } from '../media/thumbhash';

/**
 * **#6080 — un `null` servi par la passerelle ne doit atteindre AUCUNE vue.**
 *
 * Le décodeur promet, dans son en-tête, de défaire « TOUTES les clés que la
 * passerelle peut servir à `null` ». Il en défaisait dix sur trente : les vingt
 * autres passaient par `...rest`, et `reactionSummary: null` a fini dans
 * `Object.entries()` — « Cannot convert undefined or null to object », le fil
 * entier blanc pour une réaction absente.
 *
 * Ce témoin ne vérifie pas un champ : il vérifie l'INVARIANT. Une liste de noms
 * aurait le défaut même qu'elle corrige — retenir en silence le prochain champ
 * ajouté à `Message`.
 */
describe('decodeMessage — aucun null ne sort', () => {
  const base = {
    id: 'm1',
    conversationId: 'c1',
    senderId: 'u1',
    content: 'bonjour',
    originalLanguage: 'fr',
    messageType: 'text',
    isEdited: false,
    isDeleted: false,
    viewOnceCount: 0,
    isBlurred: false,
    deliveredCount: 0,
    readCount: 0,
    reactionCount: 0,
    isEncrypted: false,
    createdAt: '2026-09-11T10:00:00.000Z',
    translations: [],
  };

  test('le champ qui a fait blanchir le fil ne sort plus jamais à null', () => {
    const decode = decodeMessage({ ...base, reactionSummary: null } as unknown as Message);
    expect(decode.reactionSummary).toBeUndefined();
    // La forme exacte du crash, rejouée : c'est elle qui jetait.
    expect(() => Object.entries(decode.reactionSummary ?? {})).not.toThrow();
  });

  test('AUCUNE clé ne sort à null, quel que soit le champ servi ainsi', () => {
    const tousNuls = {
      ...base,
      reactionSummary: null,
      attachments: null,
      validatedMentions: null,
      metadata: null,
      effectFlags: null,
      encryptionMetadata: null,
      recipientCount: null,
      replyToId: null,
      title: null,
      identifier: null,
      anonymousSender: null,
      forwardedFromId: null,
      storyReplyToId: null,
      pinnedBy: null,
    };
    const decode = decodeMessage(tousNuls as unknown as Message);
    const restants = Object.entries(decode).filter(([, v]) => v === null).map(([k]) => k);
    expect(restants).toEqual([]);
  });

  test('ce qui n\'est pas null traverse INTACT — la garde ne mange rien', () => {
    const decode = decodeMessage({
      ...base,
      reactionSummary: { '👍': 2 },
      recipientCount: 3,
    } as unknown as Message);
    expect(decode.reactionSummary).toEqual({ '👍': 2 });
    expect(decode.recipientCount).toBe(3);
    expect(decode.content).toBe('bonjour');
  });
});

/**
 * **#6820 — la MÊME loi, sur l'autre décodeur du même fichier.**
 *
 * #6080 (ci-dessus) a converti `decodeMessage` d'une ÉNUMÉRATION en un
 * INVARIANT, et son commentaire le dit : « une énumération tenue à la main est
 * un inventaire qui retient en silence chaque champ ajouté en amont ».
 * `decodeAttachment`, vingt lignes plus haut dans `decode.ts`, est restée une
 * énumération — cinq clés (`transcription`, `translations`, `alt`,
 * `thumbnailUrl`, `thumbHash`) là où `serializeAttachmentForSocket` en sert
 * VINGT ET UNE à `null`. La leçon avait été apprise et appliquée à UN des deux
 * décodeurs du fichier.
 *
 * Ce que la sixième clé manquante a coûté : `imageVariants: null` atteignait
 * `attachmentSrcSet` (`media-url.ts:159`), dont la garde ne connaît que
 * `undefined` — « Cannot read properties of null (reading 'length') », le fil
 * ENTIER par terre dès qu'une image n'a pas de variantes WebP (toute image
 * chiffrée, toute pièce d'avant D4).
 *
 * Le témoin rejoue la charge RÉELLE du sérialiseur socket, ses vingt et une
 * clés à `null` recopiées depuis `serializeAttachmentForSocket.ts:100-129` —
 * pas une liste inventée ici.
 */
describe('decodeAttachment — aucun null ne sort (via decodeMessage)', () => {
  const messageBase = {
    id: 'm1',
    conversationId: 'c1',
    senderId: 'u1',
    content: '',
    originalLanguage: 'fr',
    messageType: 'image',
    isEdited: false,
    isDeleted: false,
    viewOnceCount: 0,
    isBlurred: false,
    deliveredCount: 0,
    readCount: 0,
    reactionCount: 0,
    isEncrypted: false,
    createdAt: '2026-09-16T10:00:00.000Z',
    translations: [],
  };

  /** La charge du fil, telle que `serializeAttachmentForSocket` l'écrit. */
  const pieceDuFil = {
    id: 'a1',
    messageId: 'm1',
    mimeType: 'image/png',
    fileSize: 1024,
    fileUrl: '/api/v1/attachments/file/2026%2F09%2Fu1%2Fphoto.png',
    capturedInApp: false,
    createdAt: '2026-09-16T10:00:00.000Z',
    // Les vingt et une clés servies à `null`, verbatim du sérialiseur.
    fileName: null,
    originalName: null,
    thumbnailUrl: null,
    thumbHash: null,
    imageVariants: null,
    width: null,
    height: null,
    duration: null,
    bitrate: null,
    sampleRate: null,
    codec: null,
    channels: null,
    fps: null,
    videoCodec: null,
    pageCount: null,
    lineCount: null,
    metadata: null,
    uploadedBy: null,
    isAnonymous: null,
    transcription: null,
    translations: null,
  };

  const decodePiece = () => {
    const decode = decodeMessage({ ...messageBase, attachments: [pieceDuFil] } as unknown as Message);
    const piece = decode.attachments?.[0];
    if (piece === undefined) throw new Error('la pièce jointe a disparu du décodage');
    return piece;
  };

  test('AUCUNE clé ne sort à null — l\'invariant, pas une liste de noms', () => {
    const restants = Object.entries(decodePiece()).filter(([, v]) => v === null).map(([k]) => k);
    expect(restants).toEqual([]);
  });

  test('la forme exacte du crash rapporté ne se reproduit plus', () => {
    const piece = decodePiece();
    expect(piece.imageVariants).toBeUndefined();
    // C'est CETTE lecture qui jetait « Cannot read properties of null
    // (reading 'length') » depuis le rendu du fil.
    expect(() => attachmentSrcSet(piece.imageVariants)).not.toThrow();
    expect(attachmentSrcSet(piece.imageVariants)).toBeUndefined();
  });

  test('l\'aplat ThumbHash retombe sur le repli, jamais sur une couleur inventée', () => {
    // `thumbHashPlaceholder(null)` traversait sa garde `=== undefined`, puis
    // `atob(null)` décodait la chaîne « null » en trois octets VALIDES :
    // l'en-tête de 21 bits passait et un aplat ARBITRAIRE se peignait.
    expect(thumbHashPlaceholder(decodePiece().thumbHash)).toBeUndefined();
  });

  test('la géométrie absente reste ABSENTE — jamais « null / null »', () => {
    const piece = decodePiece();
    expect(piece.width).toBeUndefined();
    expect(piece.height).toBeUndefined();
    // La lecture que fait `MediaGrid` (`media-grid.tsx:56`) : avec `null`,
    // elle rendait `true` puis composait l'aspect-ratio « null / null ».
    expect(piece.width !== undefined && piece.height !== undefined).toBe(false);
  });

  test('ce qui n\'est pas null traverse INTACT — la garde ne mange rien', () => {
    const decode = decodeMessage({
      ...messageBase,
      attachments: [{ ...pieceDuFil, width: 640, height: 427, imageVariants: [{ width: 640, height: 427, url: 'k.webp', size: 96, format: 'webp' }] }],
    } as unknown as Message);
    const piece = decode.attachments?.[0];
    expect(piece?.width).toBe(640);
    expect(piece?.imageVariants).toHaveLength(1);
    expect(attachmentSrcSet(piece?.imageVariants)).toContain('640w');
  });
});
