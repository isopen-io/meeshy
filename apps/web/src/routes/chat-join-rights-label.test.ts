import { beforeAll, describe, expect, test } from 'bun:test';

import { loadInviteCatalog } from '@/lib/i18n-invite-catalog';
import { SUPPORTED_INTERFACE_LANGUAGES } from '@/lib/inline-interface-language-bootstrap.js';
import type { InterfaceLanguage } from '@/lib/interface-language';

import { rightLabelOf } from './chat-join-parts';

/**
 * LA LIGNE « FICHIERS » DE LA CARTE D'INVITATION DIT LES FAMILLES DU LIEN, DANS
 * LES SEPT LANGUES (#10121). World Wide ouvre aux invités le texte `.txt` et
 * l'audio ; la carte écrivait « Envoyer des fichiers » barré.
 *
 * `Intl.ListFormat` est libre d'isoler (U+2066–U+2069) un élément mixte RTL/LTR
 * comme « نصية (.txt) » : JSC (bun, Safari) le fait, V8 (Node, Chrome) non. Le
 * témoin juge le texte lu, pas la ponctuation bidi du moteur.
 */

const ATTENDU: Readonly<Record<InterfaceLanguage, string>> = {
  fr: 'Envoyer des fichiers texte (.txt) et audio',
  en: 'Send text (.txt) and audio files',
  es: 'Enviar archivos de texto (.txt) y audio',
  pt: 'Enviar arquivos de texto (.txt) e áudio',
  de: 'Dateien senden: Text (.txt) und Audio',
  it: 'Inviare file di testo (.txt) e audio',
  ar: 'إرسال ملفات نصية (.txt) وصوتية',
};

const BIDI_ISOLATES = /[\u2066-\u2069]/g;

const withoutBidiIsolates = (label: string): string => label.replace(BIDI_ISOLATES, '');

beforeAll(async () => {
  await Promise.all(SUPPORTED_INTERFACE_LANGUAGES.map((language) => loadInviteCatalog(language)));
});

describe('rightLabelOf — la ligne des fichiers nomme ses familles', () => {
  test('texte (.txt) et audio, dans les sept langues', () => {
    const lus = SUPPORTED_INTERFACE_LANGUAGES.map((language) => [language, withoutBidiIsolates(rightLabelOf(language, { right: 'files', granted: true, kinds: ['text', 'audio'] }))]);
    expect(Object.fromEntries(lus)).toEqual(ATTENDU);
  });

  test('les isolations bidi que le moteur pose autour d’un élément mixte RTL/LTR restent appariées', () => {
    const arabe = rightLabelOf('ar', { right: 'files', granted: true, kinds: ['text', 'audio'] });
    const ouvertures = [...arabe].filter((c) => c >= '\u2066' && c <= '\u2068').length;
    const fermetures = [...arabe].filter((c) => c === '\u2069').length;
    expect(ouvertures).toBe(fermetures);
    expect(withoutBidiIsolates(arabe)).toBe(ATTENDU.ar);
  });

  test('sans familles, la ligne garde son libellé', () => {
    expect(rightLabelOf('fr', { right: 'files', granted: false })).toBe('Envoyer des fichiers');
    expect(rightLabelOf('en', { right: 'images', granted: true })).toBe('Send images');
  });

  test('une famille PDF se nomme aussi', () => {
    expect(rightLabelOf('fr', { right: 'files', granted: true, kinds: ['pdf'] })).toBe('Envoyer des fichiers PDF');
  });
});
