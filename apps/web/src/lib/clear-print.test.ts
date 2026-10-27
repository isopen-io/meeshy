import { createHash } from 'node:crypto';
import { describe, expect, test } from 'bun:test';

import { clearPrintOf, sha256Hex } from './clear-print';

/**
 * #12992 (audit) — l'empreinte d'un clair photographié : un SHA-256 exact
 * (comparé à celui de la plateforme, sur des longueurs qui traversent les
 * frontières de bloc et de l'UTF-8 multi-octet), et ce qu'elle couvre.
 */
describe('sha256Hex', () => {
  test('identique au SHA-256 de la plateforme, y compris aux frontières de bloc et en UTF-8', () => {
    const samples = ['', 'abc', 'a'.repeat(55), 'a'.repeat(56), 'a'.repeat(64), 'a'.repeat(119), 'Envoie-moi le code reçu par SMS — 🙂 مرحبا 你好'];
    for (const text of samples) expect(sha256Hex(text)).toBe(createHash('sha256').update(text, 'utf8').digest('hex'));
  });
});

describe('clearPrintOf', () => {
  const known = { id: 'm-1', content: 'Bonjour', translations: [{ targetLanguage: 'en', translatedContent: 'Hello' }], attachments: [{ id: 'a-1' }] };

  test('porte l’identifiant, et change avec le texte ou une pièce ; une traduction, dérivée par le serveur, n’y entre pas', () => {
    const print = clearPrintOf(known);
    expect(print?.startsWith('m-1:')).toBe(true);
    expect(clearPrintOf({ ...known, content: 'Bonsoir' })).not.toBe(print);
    expect(clearPrintOf({ ...known, translations: [{ targetLanguage: 'en', translatedContent: 'Send me the code' }] })).toBe(print);
    expect(clearPrintOf({ ...known, attachments: [{ id: 'a-forge' }] })).not.toBe(print);
    expect(clearPrintOf({ ...known, id: 'm-2' })).not.toBe(print);
  });

  test('null et absent se confondent ; une ligne sans identifiant n’a pas d’empreinte', () => {
    expect(clearPrintOf({ ...known, location: null, sticker: undefined })).toBe(clearPrintOf(known));
    expect(clearPrintOf({ content: 'x' })).toBeNull();
  });
});

describe('clearPrintOf couvre tout ce qui se rend (revue de sécurité)', () => {
  const known = {
    id: 'm-1',
    content: 'Bonjour',
    translations: [],
    attachments: [{ id: 'a-1', fileUrl: 'https://cdn.meeshy.me/a-1.jpg', fileName: 'photo.jpg', mimeType: 'image/jpeg' }],
    location: { latitude: 48.85, longitude: 2.35, name: 'Gare' },
    metadata: { sticker: { emoji: '🙂' } },
  };

  test('même identifiant, même texte : une url de pièce, un nom, un lieu ou une métadonnée changés défont l’empreinte', () => {
    const print = clearPrintOf(known);
    const attachment = known.attachments[0]!;
    expect(clearPrintOf({ ...known, attachments: [{ ...attachment, fileUrl: 'https://evil.example/a-1.jpg' }] })).not.toBe(print);
    expect(clearPrintOf({ ...known, attachments: [{ ...attachment, fileName: 'facture.pdf' }] })).not.toBe(print);
    expect(clearPrintOf({ ...known, location: { ...known.location, name: 'Rejoins-moi ici' } })).not.toBe(print);
    expect(clearPrintOf({ ...known, metadata: { sticker: { emoji: '💀' } } })).not.toBe(print);
    expect(clearPrintOf({ ...known, postReplyTo: { id: 'p-1', previewText: 'piège' } })).not.toBe(print);
  });

  test('l’ordre des clés et une date en objet ou en texte ISO ne la changent pas', () => {
    const at = new Date('2026-09-01T00:00:00.000Z');
    const reordered = { metadata: known.metadata, location: { name: 'Gare', longitude: 2.35, latitude: 48.85 }, attachments: known.attachments, translations: [], content: 'Bonjour', id: 'm-1' };
    expect(clearPrintOf(reordered)).toBe(clearPrintOf(known));
    expect(clearPrintOf({ ...known, attachments: [{ ...known.attachments[0]!, createdAt: at }] })).toBe(clearPrintOf({ ...known, attachments: [{ ...known.attachments[0]!, createdAt: at.toISOString() }] }));
  });
});
