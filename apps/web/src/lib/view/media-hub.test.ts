import { describe, expect, test } from 'bun:test';

import type { Attachment, Message } from '@/lib/api/types';

import { MEDIA_HUB_KINDS, itemsOfKind, mediaHubViewerOf, type MediaHubItem } from './media-hub';

/**
 * **L'INDEX D'UNE CONVERSATION, GENRE PAR GENRE (#8103).**
 *
 * La passerelle sert des MESSAGES (`view=media&kinds=…`) ; l'écran montre des
 * ÉLÉMENTS — une vignette, un vocal, un document, un lien. Un message peut en
 * porter plusieurs, et d'un AUTRE genre que celui demandé (une photo et un PDF
 * dans le même envoi) : chaque segment ne garde que ce qui est le sien, avec
 * la MÊME partition que la clause serveur (`messages-media-kinds.ts`).
 */

const attachment = (overrides: Partial<Attachment> & { readonly id: string; readonly mimeType: string }): Attachment =>
  ({
    messageId: 'm',
    fileName: `${overrides.id}.bin`,
    originalName: `${overrides.id}.bin`,
    fileSize: 2048,
    fileUrl: `/a/${overrides.id}`,
    uploadedBy: 'u',
    isAnonymous: false,
    createdAt: '2026-09-20T10:00:00.000Z',
    ...overrides,
  }) as unknown as Attachment;

const message = (overrides: Partial<Message> & { readonly id: string }): Message =>
  ({
    conversationId: 'c1',
    senderId: 'u1',
    content: '',
    originalLanguage: 'fr',
    messageType: 'text',
    createdAt: '2026-09-20T10:00:00.000Z',
    translations: [],
    attachments: [],
    ...overrides,
  }) as unknown as Message;

const keysOf = (items: readonly MediaHubItem[]) => items.map((item) => item.key);

describe('les sept genres de l’index', () => {
  test('sont ceux de la passerelle, dans l’ordre des segments', () => {
    expect(MEDIA_HUB_KINDS).toEqual(['visual', 'audio', 'document', 'link', 'contact', 'conversation', 'location']);
  });
});

describe('itemsOfKind — chaque segment ne garde que ce qui est le sien', () => {
  const mixed = message({
    id: 'm1',
    attachments: [
      attachment({ id: 'photo', mimeType: 'image/jpeg' }),
      attachment({ id: 'clip', mimeType: 'video/mp4' }),
      attachment({ id: 'voice', mimeType: 'audio/m4a' }),
      attachment({ id: 'card', mimeType: 'text/vcard' }),
      attachment({ id: 'pdf', mimeType: 'application/pdf' }),
    ],
  });

  test('visuel : image et vidéo, dans l’ordre du message', () => {
    expect(keysOf(itemsOfKind([mixed], 'visual'))).toEqual(['m1:photo', 'm1:clip']);
  });

  test('audio, contact et document sont DISJOINTS, comme côté serveur', () => {
    expect(keysOf(itemsOfKind([mixed], 'audio'))).toEqual(['m1:voice']);
    expect(keysOf(itemsOfKind([mixed], 'contact'))).toEqual(['m1:card']);
    expect(keysOf(itemsOfKind([mixed], 'document'))).toEqual(['m1:pdf']);
  });

  test('une pièce à VUE UNIQUE n’entre jamais dans l’index — ni un message à vue unique', () => {
    const once = message({ id: 'm2', attachments: [attachment({ id: 'secret', mimeType: 'image/png', isViewOnce: true } as never)] });
    const onceMessage = message({ id: 'm3', isViewOnce: true, attachments: [attachment({ id: 'x', mimeType: 'image/png' })] } as never);
    expect(itemsOfKind([once, onceMessage], 'visual')).toEqual([]);
  });

  test('les messages gardent l’ordre SERVI (le plus récent d’abord)', () => {
    const recent = message({ id: 'r', attachments: [attachment({ id: 'a', mimeType: 'image/png' })] });
    const old = message({ id: 'o', attachments: [attachment({ id: 'b', mimeType: 'image/png' })] });
    expect(keysOf(itemsOfKind([recent, old], 'visual'))).toEqual(['r:a', 'o:b']);
  });

  test('lien : chaque adresse http(s) du contenu, une seule fois par message ; un courriel n’en est pas un', () => {
    const links = message({
      id: 'm4',
      content: 'Vois https://example.org/a et http://exemple.fr, encore https://example.org/a, écris à a@b.fr',
    });
    const items = itemsOfKind([links], 'link');
    expect(items.map((item) => (item.kind === 'link' ? item.href : null))).toEqual(['https://example.org/a', 'http://exemple.fr']);
    expect(items[0]).toMatchObject({ kind: 'link', host: 'example.org', messageId: 'm4' });
  });

  test('conversation : seules les adresses de conversation Meeshy', () => {
    const shared = message({
      id: 'm5',
      content: 'Rejoins https://meeshy.me/chat/abc123 ou https://example.org et https://staging.meeshy.me/c/0123456789abcdef01234567',
    });
    const items = itemsOfKind([shared], 'conversation');
    expect(items.map((item) => (item.kind === 'conversation' ? item.href : null))).toEqual([
      'https://meeshy.me/chat/abc123',
      'https://staging.meeshy.me/c/0123456789abcdef01234567',
    ]);
  });

  test('lieu : le lieu partagé du message, coordonnées valides seulement', () => {
    const place = message({
      id: 'm6',
      messageType: 'location',
      location: { latitude: 48.85, longitude: 2.35, name: 'Paris' },
    } as never);
    const broken = message({ id: 'm7', messageType: 'location', location: { latitude: 200, longitude: 2 } } as never);
    const items = itemsOfKind([place, broken], 'location');
    expect(keysOf(items)).toEqual(['m6:place']);
    expect(items[0]).toMatchObject({ kind: 'location', place: { latitude: 48.85, longitude: 2.35, name: 'Paris' } });
  });
});

describe('mediaHubViewerOf — la visionneuse feuillette TOUTE la conversation (#6303)', () => {
  const pages = [
    message({ id: 'r', attachments: [attachment({ id: 'a', mimeType: 'image/png' }), attachment({ id: 'b', mimeType: 'video/mp4' })] }),
    message({ id: 'o', attachments: [attachment({ id: 'a', mimeType: 'image/png' })] }),
  ];

  test('la page ouverte est celle de la tuile touchée, appariée sur le COUPLE (message, pièce)', () => {
    const viewer = mediaHubViewerOf(itemsOfKind(pages, 'visual'), 'o:a');
    expect(viewer.items.map((item) => item.id)).toEqual(['a', 'b', 'a']);
    expect(viewer.startIndex).toBe(2);
    expect(viewer.messageIdAt(2)).toBe('o');
  });

  test('une tuile disparue ouvre au début, jamais une visionneuse vide', () => {
    expect(mediaHubViewerOf(itemsOfKind(pages, 'visual'), 'x:y').startIndex).toBe(0);
  });
});
