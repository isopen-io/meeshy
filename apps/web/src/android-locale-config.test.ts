import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'bun:test';

import { SUPPORTED_INTERFACE_LANGUAGES } from '@/lib/inline-interface-language-bootstrap.js';

/**
 * MEESHY FIGURE DANS « LANGUE DE L'APP » D'ANDROID 13+, COMME CHROME (#9748).
 *
 * Dans Chrome, Réglages › Applications › Chrome › Langue change
 * `navigator.languages`, que le mode « Automatique » de l'interface suit.
 * Android ne liste une application dans ce réglage que si elle déclare
 * `android:localeConfig` : sans lui, la coque n'y apparaissait pas, alors que
 * ses textes natifs existent déjà dans les sept langues de l'interface.
 */

const MAIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'android', 'app', 'src', 'main');
const MANIFEST = join(MAIN, 'AndroidManifest.xml');

function sansCommentaires(xml: string): string {
  return xml.replace(/<!--[\s\S]*?-->/g, '');
}

function balise(xml: string, nom: string): string {
  return new RegExp(`<${nom}\\b[^>]*>`).exec(sansCommentaires(xml))?.[0] ?? '';
}

function ressourceDeclaree(): string | null {
  const reference = /android:localeConfig="@xml\/([a-z0-9_]+)"/.exec(balise(readFileSync(MANIFEST, 'utf8'), 'application'));
  return reference?.[1] === undefined ? null : join(MAIN, 'res', 'xml', `${reference[1]}.xml`);
}

describe('la langue de la coque se choisit dans les réglages d’Android', () => {
  test('l’application déclare une configuration de langues qui existe', () => {
    const fichier = ressourceDeclaree();
    expect(fichier).not.toBeNull();
    expect(fichier !== null && existsSync(fichier)).toBe(true);
  });

  test('les langues proposées sont exactement celles de l’interface', () => {
    const fichier = ressourceDeclaree();
    const xml = fichier !== null && existsSync(fichier) ? sansCommentaires(readFileSync(fichier, 'utf8')) : '';
    const langues = [...xml.matchAll(/<locale\s+android:name="([^"]+)"\s*\/>/g)].map((m) => m[1]);
    expect([...langues].sort()).toEqual([...SUPPORTED_INTERFACE_LANGUAGES].sort());
  });

  test('chaque langue proposée a ses textes natifs, l’anglais servant de défaut', () => {
    const dossiers = SUPPORTED_INTERFACE_LANGUAGES.map((langue) => join(MAIN, 'res', langue === 'en' ? 'values' : `values-${langue}`));
    expect(dossiers.filter((dossier) => !existsSync(join(dossier, 'strings_call.xml')))).toEqual([]);
  });
});
