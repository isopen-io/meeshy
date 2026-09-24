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
