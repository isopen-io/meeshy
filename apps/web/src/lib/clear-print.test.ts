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

  test('porte l’identifiant, et change avec le texte, une traduction ou une pièce', () => {
    const print = clearPrintOf(known);
    expect(print?.startsWith('m-1:')).toBe(true);
    expect(clearPrintOf({ ...known, content: 'Bonsoir' })).not.toBe(print);
    expect(clearPrintOf({ ...known, translations: [{ targetLanguage: 'en', translatedContent: 'Send me the code' }] })).not.toBe(print);
    expect(clearPrintOf({ ...known, attachments: [{ id: 'a-forge' }] })).not.toBe(print);
    expect(clearPrintOf({ ...known, id: 'm-2' })).not.toBe(print);
  });

  test('l’ordre des traductions ne compte pas ; une ligne sans identifiant n’a pas d’empreinte', () => {
    const two = [{ targetLanguage: 'en', translatedContent: 'Hello' }, { targetLanguage: 'es', translatedContent: 'Hola' }];
    expect(clearPrintOf({ ...known, translations: two })).toBe(clearPrintOf({ ...known, translations: [...two].reverse() }));
    expect(clearPrintOf({ content: 'x' })).toBeNull();
  });
});
