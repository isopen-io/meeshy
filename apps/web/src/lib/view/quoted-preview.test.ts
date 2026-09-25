import { describe, expect, test } from 'bun:test';

import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';

import { attachmentDefaults } from '@/lib/api/fixtures-base';
import type { Attachment, Message } from '@/lib/api/types';

import { quotedPreviewOf } from './quoted-preview';

/**
 * #7556 — UNE CITATION MONTRE CE QU'ELLE CITE.
 *
 * Deux défauts, un seul site. `Quote` (`components/message-blocks.tsx`) ne
 * rendait que `quote.content` : répondre à une photo SANS légende produisait
 * une citation VIDE (un filet, un nom, rien), et le texte cité restait en
 * langue d'ORIGINE pendant que le bandeau du composeur, lui, descendait le
 * Prisme (`use-reply-preview.ts`). Le plus trompeur est que la donnée
 * arrivait INTACTE — `decode.ts` décode `attachments` sur `replyTo` et un
 * témoin VERT le garde (`decode.test.ts`) : il prouve le TRANSPORT, pas le
 * PIXEL.
 *
 * Ce module est le SITE UNIQUE de la question « que montre une citation ? » —
 * le miroir de `ConversationViewModel+ReplyReference.swift:49-63`, où la
 * résolution vit elle aussi en un seul endroit. `Quote` et
 * `useReplyToPreview` en sont deux PROJECTIONS : deux descentes serviraient
 * deux langues pour un même message cité, exactement le défaut 2.
 */

const attachment = (partial: Partial<Attachment>): Attachment =>
  ({
    ...attachmentDefaults,
    id: 'a-1',
    messageId: 'm-quoted',
    fileName: 'piece.bin',
    originalName: 'piece.bin',
    mimeType: 'application/octet-stream',
    fileSize: 1024,
    fileUrl: 'https://cdn.meeshy.me/piece.bin',
    uploadedBy: 'u-amina',
    createdAt: '2026-09-23T09:00:00.000Z',
    ...partial,
  }) as Attachment;

const quoted = (partial: Partial<Message> = {}): Message =>
  ({
    id: 'm-quoted',
    conversationId: 'c-a',
    senderId: 'u-amina',
    content: '',
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
    createdAt: new Date('2026-09-23T09:00:00.000Z'),
    ...partial,
  }) as Message;

const preview = (message: Message, readerLanguages: readonly string[] = ['fr']) =>
  quotedPreviewOf({ quoted: message, readerLanguages, interfaceLanguage: 'fr' });

const PHOTO = attachment({
  id: 'a-photo',
  mimeType: 'image/jpeg',
  fileName: 'plage.jpg',
  originalName: 'plage.jpg',
  fileUrl: 'https://cdn.meeshy.me/plage.jpg',
  thumbnailUrl: 'https://cdn.meeshy.me/plage-thumb.jpg',
  width: 1024,
  height: 768,
});

const VIDEO = attachment({
  id: 'a-video',
  mimeType: 'video/mp4',
  fileName: 'sortie.mp4',
  originalName: 'sortie.mp4',
  fileUrl: 'https://cdn.meeshy.me/sortie.mp4',
  thumbnailUrl: 'https://cdn.meeshy.me/sortie-thumb.jpg',
  duration: 42_000,
});

const VOCAL = attachment({
  id: 'a-vocal',
  mimeType: 'audio/mp4',
  fileName: 'note.m4a',
  originalName: 'note.m4a',
  fileUrl: 'https://cdn.meeshy.me/note.m4a',
  duration: 12_000,
});

const DOCUMENT = attachment({
  id: 'a-doc',
  mimeType: 'application/pdf',
  fileName: 'contrat.pdf',
  originalName: 'contrat.pdf',
  fileUrl: 'https://cdn.meeshy.me/contrat.pdf',
  pageCount: 4,
});

describe('quotedPreviewOf — un média SANS légende se cite par son genre (#7556)', () => {
  test('une PHOTO sans légende cite « Photo », jamais le vide', () => {
    const result = preview(quoted({ attachments: [PHOTO] }));
    expect(result.text).toBe('Photo');
    expect(result.media?.kind).toBe('image');
  });

  test('une VIDÉO sans légende cite « Vidéo » ET sa durée', () => {
    const result = preview(quoted({ attachments: [VIDEO] }));
    expect(result.text).toBe('Vidéo');
    expect(result.media?.kind).toBe('video');
    expect(result.media?.durationLabel).toBe('0:42');
  });

  test('un VOCAL sans légende cite « Audio » ET sa durée', () => {
    const result = preview(quoted({ attachments: [VOCAL] }));
    expect(result.text).toBe('Audio');
    expect(result.media?.kind).toBe('audio');
    expect(result.media?.durationLabel).toBe('0:12');
  });

  test('un DOCUMENT sans légende cite « Fichier », et n’invente aucune durée', () => {
    const result = preview(quoted({ attachments: [DOCUMENT] }));
    expect(result.text).toBe('Fichier');
    expect(result.media?.kind).toBe('file');
    expect(result.media?.durationLabel).toBeNull();
  });

  test('la LÉGENDE gagne sur le genre — le libellé court est un REPLI, pas un préfixe', () => {
    const result = preview(quoted({ content: 'Regarde ça', attachments: [PHOTO] }));
    expect(result.text).toBe('Regarde ça');
  });

  /** `quotedThumbnailUrl` (`ConversationViewModel+ReplyReference.swift:171-173`). */
  test('la vignette d’une image SANS miniature serveur retombe sur le fichier lui-même', () => {
    const nue = attachment({ id: 'a-nue', mimeType: 'image/png', fileUrl: 'https://cdn.meeshy.me/nue.png' });
    expect(preview(quoted({ attachments: [nue] })).media?.thumbnailSrc).toContain('nue.png');
  });

  test('un VOCAL n’a pas de vignette — son fichier n’est pas une image', () => {
    expect(preview(quoted({ attachments: [VOCAL] })).media?.thumbnailSrc).toBeNull();
  });

  test('aucune pièce jointe ⇒ aucun média, et le texte reste le texte', () => {
    const result = preview(quoted({ content: 'Bonjour' }));
    expect(result.media).toBeNull();
    expect(result.text).toBe('Bonjour');
  });
});

/**
 * LE TÉMOIN DE RANG S'ÉCRIT SUR UN RANG AUTRE QUE LE PREMIER (CLAUDE.md
 * § Prisme, leçon 261) : au rang 1, le court-circuit interdit et la règle
 * juste rendent le MÊME verdict, donc un témoin posé là ne peut pas tomber.
 * Prisme `['de','fr']`, message ANGLAIS, traduction FRANÇAISE disponible ⇒
 * « Bonjour », jamais « Hello ».
 */
describe('quotedPreviewOf — le Prisme descend, la citation ne sert pas l’original (#7556)', () => {
  const anglais = quoted({
    content: 'Hello',
    originalLanguage: 'en',
    translations: [
      {
        id: 't-fr',
        messageId: 'm-quoted',
        sourceLanguage: 'en',
        targetLanguage: 'fr',
        translatedContent: 'Bonjour',
        translationModel: 'medium',
        createdAt: new Date('2026-09-23T09:00:00.000Z'),
      },
    ],
  });

  test('rang 2 servi : le texte cité est la traduction, pas le contenu d’origine', () => {
    const result = preview(anglais, ['de', 'fr']);
    expect(result.text).toBe('Bonjour');
    expect(result.language).toBe('fr');
  });

  test('aucune langue du lecteur n’est traduite ⇒ l’original, à son rang', () => {
    const result = preview(anglais, ['de', 'it']);
    expect(result.text).toBe('Hello');
    expect(result.language).toBe('en');
  });

  test('la langue d’origine concourt à son RANG — elle ne court-circuite pas le rang supérieur', () => {
    // Prisme `['fr','en']` sur un message ANGLAIS traduit en français : un
    // résolveur qui court-circuite sur « la langue d'origine est dans le
    // prisme » rendrait « Hello ».
    expect(preview(anglais, ['fr', 'en']).text).toBe('Bonjour');
  });
});

/**
 * UN MESSAGE CITÉ PROTÉGÉ NE SE TRADUIT PAS ET NE MONTRE RIEN.
 *
 * La passerelle masque déjà la charge (`servedQuotedMessage.ts` : placeholder
 * en `content`, traductions retirées, pièces réduites à leur discriminant) —
 * ce témoin garde le CLIENT, qui ne doit pas rendre ce qu'il reçoit sans le
 * vérifier : `firstAttachmentUrl` du cycle 125 partait, lui aussi, « à côté »
 * d'une garde parfaitement posée.
 */
describe('quotedPreviewOf — une citation protégée ne décrit pas son secret (#7556)', () => {
  const secret = quoted({
    content: '👁️ 🖼️',
    isViewOnce: true,
    attachments: [PHOTO],
  });

  test('ni vignette, ni durée, ni dimensions — le placeholder seul', () => {
    const result = preview(secret);
    expect(result.text).toBe('👁️ 🖼️');
    expect(result.media?.thumbnailSrc).toBeNull();
    expect(result.media?.durationLabel).toBeNull();
  });

  test('aucune langue déclarée sur un placeholder — ce n’est pas du contenu', () => {
    expect(preview(secret).language).toBe('');
  });

  test('le bitfield SEUL suffit à déclarer la protection (`effectFlags`)', () => {
    const parBitfield = quoted({
      content: '🌫️ 🖼️',
      effectFlags: MESSAGE_EFFECT_FLAGS.BLURRED,
      attachments: [PHOTO],
    });
    expect(preview(parBitfield).media?.thumbnailSrc).toBeNull();
  });

  /** `mediaMayTravel` (passerelle) : les DEUX niveaux déclarent — le MESSAGE et la PIÈCE. */
  test('une PIÈCE à vue unique dans un message ordinaire retient aussi sa vignette', () => {
    const photoSecrete = attachment({ ...PHOTO, isViewOnce: true } as Partial<Attachment>);
    const result = preview(quoted({ content: 'Devine', attachments: [photoSecrete] }));
    expect(result.text).toBe('Devine');
    expect(result.media?.thumbnailSrc).toBeNull();
  });
});

/**
 * L'ÉTIQUETTE ACCESSIBLE RÉUTILISE `attachmentSegments`
 * (`message-a11y-label.ts`) — pas une seconde écriture : « un second
 * vocabulaire ferait dire deux choses différentes à l'œil et à l'oreille pour
 * un même état ».
 */
describe('quotedPreviewOf — l’inventaire parlé vient du site unique (#7556)', () => {
  test('une photo et une vidéo s’annoncent dans le vocabulaire de la rangée', () => {
    expect(preview(quoted({ attachments: [PHOTO, VIDEO] })).inventory).toEqual(['1 image', '1 vidéo']);
  });

  test('un message cité PROTÉGÉ n’annonce aucun inventaire — le voile le remplace', () => {
    expect(preview(quoted({ content: '👁️ 🖼️', isViewOnce: true, attachments: [PHOTO] })).inventory).toEqual([]);
  });
});

/**
 * LA PIÈCE NOMMÉE PRIME (#7881, #6164) — répondre au 2e vocal d'un message
 * qui en porte deux : la passerelle sert `replyTo.attachmentReplyTo =
 * { attachmentId, kind }` (`servedQuotedMessage.ts`), iOS l'élit
 * (`citing` prime sur le représentatif). Le web citait la PREMIÈRE pièce :
 * « Audio 0:09 » au-dessus d'une réponse au vocal de 0:12.
 */
describe('quotedPreviewOf — la pièce NOMMÉE prime sur la première', () => {
  const twoPieces = (): Message =>
    Object.assign(
      quoted({
        attachments: [
          attachment({ id: 'a-1', mimeType: 'image/png', fileName: 'p.png', originalName: 'p.png' }),
          attachment({ id: 'a-2', mimeType: 'audio/wav', fileName: 'v.wav', originalName: 'v.wav', duration: 12_000 }),
        ],
      }),
      { attachmentReplyTo: { attachmentId: 'a-2', kind: 'audio' } },
    );

  test('la citation montre la pièce visée, pas la première', () => {
    const preview = quotedPreviewOf({ quoted: twoPieces(), readerLanguages: ['fr'], interfaceLanguage: 'fr' });
    expect(preview.media?.kind).toBe('audio');
    expect(preview.media?.durationLabel).toBe('0:12');
  });

  test('une pièce nommée ABSENTE (retirée, masquée) retombe sur la première', () => {
    const orphan = Object.assign(quoted({ attachments: [attachment({ id: 'a-1', mimeType: 'image/png' })] }), {
      attachmentReplyTo: { attachmentId: 'a-9', kind: 'audio' },
    });
    expect(quotedPreviewOf({ quoted: orphan, readerLanguages: ['fr'], interfaceLanguage: 'fr' }).media?.kind).toBe('image');
  });
});

/**
 * #7929 (complément porteur du 2026-09-25) — LA RÉPONSE À UNE PIÈCE UNIQUE
 * montre une MINIATURE aussi large que la carte de story, dont la hauteur
 * suit le rapport d'aspect ORIGINAL du média. `frame` est la moitié DONNÉE de
 * cette règle : le cadre existe pour une image ou une vidéo seule (ou la pièce
 * NOMMÉE d'un carrousel), jamais pour un média protégé — ses dimensions
 * décrivent un contenu que le lecteur n'a pas le droit de voir.
 */
describe('quotedPreviewOf — le cadre d’une pièce unique citée (#7929)', () => {
  const photo = (dims: { readonly width?: number; readonly height?: number; readonly id?: string } = {}) =>
    attachment({
      id: dims.id ?? 'a-photo',
      mimeType: 'image/jpeg',
      fileUrl: `https://cdn.meeshy.me/${dims.id ?? 'a-photo'}.jpg`,
      ...(dims.width === undefined ? {} : { width: dims.width }),
      ...(dims.height === undefined ? {} : { height: dims.height }),
    });

  test('une photo PAYSAGE seule : le rapport largeur / hauteur du média, mesuré', () => {
    expect(preview(quoted({ attachments: [photo({ width: 1200, height: 900 })] })).media?.frame).toEqual({
      aspectRatio: 1200 / 900,
      measured: true,
    });
  });

  test('une photo PORTRAIT seule : le rapport du média, mesuré', () => {
    expect(preview(quoted({ attachments: [photo({ width: 900, height: 1600 })] })).media?.frame).toEqual({
      aspectRatio: 900 / 1600,
      measured: true,
    });
  });

  test('une vidéo seule : le cadre existe aussi, même sans vignette servie', () => {
    const clip = attachment({ id: 'a-clip', mimeType: 'video/mp4', fileUrl: 'https://cdn.meeshy.me/c.mp4', width: 160, height: 90 });
    expect(preview(quoted({ attachments: [clip] })).media?.frame).toEqual({ aspectRatio: 160 / 90, measured: true });
  });

  test('sans dimensions : repli CARRÉ, déclaré non mesuré', () => {
    expect(preview(quoted({ attachments: [photo()] })).media?.frame).toEqual({ aspectRatio: 1, measured: false });
  });

  test('la pièce NOMMÉE d’un carrousel est une pièce unique : son propre rapport', () => {
    const carrousel = Object.assign(
      quoted({ attachments: [photo({ width: 1200, height: 900, id: 'a-1' }), photo({ width: 900, height: 1600, id: 'a-2' })] }),
      { attachmentReplyTo: { attachmentId: 'a-2', kind: 'image' } },
    );
    expect(preview(carrousel).media?.frame).toEqual({ aspectRatio: 900 / 1600, measured: true });
  });

  test('un carrousel cité EN ENTIER garde la petite vignette : aucun cadre', () => {
    const carrousel = quoted({ attachments: [photo({ width: 1200, height: 900, id: 'a-1' }), photo({ id: 'a-2' })] });
    expect(preview(carrousel).media?.frame).toBeNull();
  });

  test('un vocal n’a pas de cadre', () => {
    const vocal = attachment({ id: 'a-v', mimeType: 'audio/mp4', fileUrl: 'https://cdn.meeshy.me/v.m4a' });
    expect(preview(quoted({ attachments: [vocal] })).media?.frame).toBeNull();
  });

  test('un média PROTÉGÉ ne livre ni cadre ni rapport, au niveau du message comme de la pièce', () => {
    expect(preview(quoted({ isViewOnce: true, attachments: [photo({ width: 1200, height: 900 })] })).media?.frame).toBeNull();
    const floue = { ...photo({ width: 1200, height: 900 }), isBlurred: true } as Attachment;
    expect(preview(quoted({ attachments: [floue] })).media?.frame).toBeNull();
  });

  test('un rapport extrême est borné : jamais plus haut que la scène de story (9:16), jamais plus plat que 3:1', () => {
    expect(preview(quoted({ attachments: [photo({ width: 100, height: 1000 })] })).media?.frame?.aspectRatio).toBe(9 / 16);
    expect(preview(quoted({ attachments: [photo({ width: 4000, height: 500 })] })).media?.frame?.aspectRatio).toBe(3);
  });
});
