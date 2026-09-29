import { beforeAll, describe, expect, test } from 'bun:test';

import { amina, attachmentDefaults, message, translation } from '@/lib/api/fixtures-base';
import type { Attachment, Message } from '@/lib/api/types';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';

import { cardAuthorOf, messageCardFileName, messageCardLanguagesOf, messageCardSubjectOf } from './message-card-subject';

beforeAll(async () => {
  await loadInterfaceCatalog('fr');
});

const NOW = new Date('2026-09-28T12:00:00.000Z').getTime();
const VIEWER = { id: 'u-jacques', displayName: 'Jacques', handle: 'jacques' };

const quoted = (overrides: Partial<Message> = {}): Message =>
  message({
    id: 'm-quoted',
    senderId: amina.userId ?? 'u-amina',
    sender: amina,
    content: 'Where do we meet tonight?',
    originalLanguage: 'en',
    translations: [translation('m-quoted', 'fr', 'On se retrouve où ce soir ?')],
    createdAt: new Date('2026-09-28T11:00:00.000Z'),
    ...overrides,
  });

const standalone = (overrides: Partial<Message> = {}): Message =>
  message({
    id: 'm-reply',
    senderId: VIEWER.id,
    content: 'Chez Lina, à 20 h !',
    originalLanguage: 'fr',
    translations: [],
    createdAt: new Date('2026-09-28T11:01:00.000Z'),
    ...overrides,
  });

const reply = (overrides: Partial<Message> = {}): Message => standalone({ replyTo: quoted(), ...overrides });

const subjectOf = (target: Message, servedText?: string) =>
  messageCardSubjectOf({
    message: target,
    servedText,
    viewer: VIEWER,
    readerLanguages: ['fr'],
    interfaceLanguage: 'fr',
    now: NOW,
  });

describe('messageCardSubjectOf — ce que la carte a le droit de montrer', () => {
  test('une réponse porte sa citation, servie dans la langue du lecteur', () => {
    expect(subjectOf(reply())).toEqual({
      quoted: { author: amina.displayName ?? '', text: 'On se retrouve où ce soir ?', handle: null },
      reply: { author: 'Jacques', text: 'Chez Lina, à 20 h !', handle: 'jacques' },
      sentAt: new Date('2026-09-28T11:01:00.000Z'),
      quotedAt: new Date('2026-09-28T11:00:00.000Z'),
      media: [],
    });
  });

  test('le pseudo de chaque auteur voyage avec son nom — « pseudo au lieu du nom affiché »', () => {
    const subject = subjectOf(reply({ replyTo: quoted({ sender: { ...amina, username: 'amina.d' } as NonNullable<Message['sender']> }) }));
    expect(subject?.quoted?.handle).toBe('amina.d');
  });

  test('le texte de la réponse est celui que le lecteur VOIT (traduction imposée comprise)', () => {
    expect(subjectOf(reply(), 'At Lina’s, 8 pm!')?.reply.text).toBe('At Lina’s, 8 pm!');
  });

  test('un message isolé n’a pas de citation', () => {
    expect(subjectOf(standalone())?.quoted).toBeNull();
  });

  test('un message PROTÉGÉ ne s’exporte pas — flouté, vue unique, supprimé', () => {
    expect(subjectOf(reply({ isBlurred: true }))).toBeNull();
    expect(subjectOf(reply({ isViewOnce: true }))).toBeNull();
    expect(subjectOf(reply({ deletedAt: new Date('2026-09-28T11:30:00.000Z') }))).toBeNull();
  });

  test('un éphémère échu ne s’exporte plus', () => {
    expect(subjectOf(reply({ expiresAt: new Date(NOW - 1000) }))).toBeNull();
  });

  test('une citation protégée ne montre que son placeholder, jamais son contenu', () => {
    const subject = subjectOf(reply({ replyTo: quoted({ isViewOnce: true, content: '👁️' }) }));
    expect(subject?.quoted?.text).toBe('👁️');
    expect(JSON.stringify(subject)).not.toContain('On se retrouve');
  });

  test('un message sans texte n’a rien à peindre', () => {
    expect(subjectOf(reply({ content: '   ' }))).toBeNull();
  });
});

describe('les médias qu’une carte peut montrer (#8693)', () => {
  const piece = (overrides: Partial<Attachment>): Attachment => ({
    ...attachmentDefaults,
    id: 'a-1',
    messageId: 'm-reply',
    fileName: 'photo.jpg',
    originalName: 'photo.jpg',
    mimeType: 'image/jpeg',
    fileSize: 1000,
    fileUrl: '/api/v1/attachments/a-1/file',
    uploadedBy: VIEWER.id,
    createdAt: '2026-09-28T11:01:00.000Z',
    width: 1200,
    height: 900,
    ...overrides,
  });

  test('images, vidéos et audios deviennent des médias de carte ; un document n’en est pas un', () => {
    const subject = subjectOf(
      standalone({
        attachments: [
          piece({ id: 'a-img' }),
          piece({ id: 'a-vid', mimeType: 'video/mp4', width: 1920, height: 1080, thumbnailUrl: '/thumb.jpg' }),
          piece({ id: 'a-aud', mimeType: 'audio/mp4', originalName: 'note.m4a', duration: 12_000 }),
          piece({ id: 'a-pdf', mimeType: 'application/pdf' }),
        ],
      }),
    );
    expect(subject?.media.map((item) => item.card.kind)).toEqual(['image', 'video', 'audio']);
    const voice = subject?.media[2]?.card;
    expect(voice?.kind === 'audio' ? [voice.durationMs, voice.name, voice.peaks.length > 0] : null).toEqual([12_000, 'note.m4a', true]);
    expect(subject?.media[1]?.posterUrl).toBe('/thumb.jpg');
  });

  test('un message fait d’une seule photo s’image, même sans texte', () => {
    const subject = subjectOf(standalone({ content: '', attachments: [piece({})] }));
    expect(subject?.reply.text).toBe('');
    expect(subject?.media).toHaveLength(1);
  });

  test('une pièce à VUE UNIQUE ou FLOUTÉE n’est jamais peinte — et seule, elle ne donne pas de carte', () => {
    const subject = subjectOf(standalone({ attachments: [piece({ id: 'a-open' }), piece({ id: 'a-once', isViewOnce: true }), piece({ id: 'a-blur', isBlurred: true })] }));
    expect(subject?.media.map((item) => item.id)).toEqual(['a-open']);
    expect(subjectOf(standalone({ content: '', attachments: [piece({ isBlurred: true })] }))).toBeNull();
  });
});

describe('cardAuthorOf — qui signe chaque bloc', () => {
  test('le lecteur est nommé par SON nom, jamais « Vous »', () => {
    expect(cardAuthorOf({ senderId: VIEWER.id }, VIEWER)).toBe('Jacques');
  });

  test('un correspondant par son nom affiché, sinon son identifiant', () => {
    expect(cardAuthorOf({ senderId: 'u-awa', sender: { displayName: 'Awa' } }, VIEWER)).toBe('Awa');
    expect(cardAuthorOf({ senderId: 'u-awa', sender: { displayName: ' ', username: 'awa' } }, VIEWER)).toBe('awa');
  });
});

describe('messageCardFileName — un nom lisible, rien du contenu', () => {
  test('horodaté, en .png', () => {
    expect(messageCardFileName(new Date(2026, 8, 28, 9, 5, 7))).toBe('meeshy-20260928-090507.png');
    expect(messageCardFileName(new Date(2026, 8, 28, 9, 5, 7), 'mp4')).toBe('meeshy-20260928-090507.mp4');
  });
});

describe('la langue d’export — choisie après le format', () => {
  const bilingual = () =>
    reply({
      translations: [translation('m-reply', 'en', 'At Lina’s, 8 pm!'), translation('m-reply', 'es', '¡En casa de Lina, a las 20 h!')],
    });

  test('les langues offertes : l’original d’abord, puis chaque traduction', () => {
    expect(messageCardLanguagesOf(bilingual())).toEqual(['fr', 'en', 'es']);
    expect(messageCardLanguagesOf(standalone({ originalLanguage: '' }))).toEqual([]);
  });

  test('une langue choisie sert la réponse ET la citation dans cette langue', () => {
    const subject = messageCardSubjectOf({ message: bilingual(), servedText: 'Chez Lina, à 20 h !', viewer: VIEWER, readerLanguages: ['fr'], interfaceLanguage: 'fr', now: NOW, language: 'en' });
    expect(subject?.reply.text).toBe('At Lina’s, 8 pm!');
    expect(subject?.quoted?.text).toBe('Where do we meet tonight?');
  });

  test('une citation sans cette langue retombe sur le prisme du lecteur, jamais sur un vide', () => {
    const subject = messageCardSubjectOf({ message: bilingual(), servedText: undefined, viewer: VIEWER, readerLanguages: ['fr'], interfaceLanguage: 'fr', now: NOW, language: 'es' });
    expect(subject?.reply.text).toBe('¡En casa de Lina, a las 20 h!');
    expect(subject?.quoted?.text).toBe('On se retrouve où ce soir ?');
  });

  test('la langue de l’original rend l’original, même quand le lecteur lit une traduction', () => {
    const subject = messageCardSubjectOf({ message: bilingual(), servedText: 'At Lina’s, 8 pm!', viewer: VIEWER, readerLanguages: ['en'], interfaceLanguage: 'fr', now: NOW, language: 'fr' });
    expect(subject?.reply.text).toBe('Chez Lina, à 20 h !');
  });

  test('un message protégé ne s’exporte dans aucune langue', () => {
    const subject = messageCardSubjectOf({ message: bilingual(), servedText: undefined, viewer: VIEWER, readerLanguages: ['fr'], interfaceLanguage: 'fr', now: NOW, language: 'en' });
    expect(subject === null).toBe(false);
    const hidden = messageCardSubjectOf({ message: { ...bilingual(), isBlurred: true }, servedText: undefined, viewer: VIEWER, readerLanguages: ['fr'], interfaceLanguage: 'fr', now: NOW, language: 'en' });
    expect(hidden).toBeNull();
  });
});
