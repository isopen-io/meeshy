import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'bun:test';

/**
 * **AUCUN CODE D'ADMINISTRATION NE LIT LA LANGUE D'INTERFACE BRUTE** (D-162).
 *
 * L'administration parle quatre langues (fr, en, es, pt) ; une interface
 * allemande, italienne ou arabe la lit en anglais. La règle est UNE fonction
 * (`adminLanguageOf`, `i18n-admin-catalog.ts`) et le compilateur la tient :
 * toute fonction d'administration reçoit une `AdminLanguage`. Ce témoin tient
 * ce que le compilateur ne voit pas — un fichier qui importerait de nouveau
 * `currentInterfaceLanguage` ou le type `InterfaceLanguage` pour le passer à un
 * `Intl` contournerait la règle le jour où son paramètre serait élargi à
 * `string`, et la page redeviendrait moitié allemande, moitié anglaise sans
 * qu'aucun témoin de composant ne rougisse (ils reçoivent tous `language="fr"`).
 *
 * Il interdit aussi, dans ces fichiers, tout ce qui suppose un document
 * retourné : les variantes `rtl:` et la lecture de `dir`. L'administration est
 * posée `dir="ltr"` à sa racine, sous toute langue d'interface.
 *
 * Lecture textuelle, par `node:fs` : ce fichier passe aussi sous `tsc --noEmit`,
 * qui ne connaît pas le global `Bun`.
 */
const SRC = fileURLToPath(new URL('../../', import.meta.url));

function walk(directory: string): readonly string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const isSource = (path: string): boolean => /\.tsx?$/.test(path) && !/\.test\.tsx?$/.test(path);

const ADMIN_SOURCES: readonly string[] = [
  ...readdirSync(join(SRC, 'routes')).filter((name) => /^admin.*\.tsx?$/.test(name)).map((name) => join(SRC, 'routes', name)),
  ...walk(join(SRC, 'components', 'admin')),
  ...walk(join(SRC, 'lib', 'admin')),
  ...readdirSync(join(SRC, 'lib', 'api')).filter((name) => /^admin.*\.tsx?$/.test(name)).map((name) => join(SRC, 'lib', 'api', name)),
].filter(isSource);

const offenders = (pattern: RegExp): readonly string[] =>
  ADMIN_SOURCES.filter((path) => pattern.test(readFileSync(path, 'utf8'))).map((path) => relative(SRC, path));

describe('le code d’administration ne lit jamais la langue d’interface brute', () => {
  test('la lecture du dépôt voit les fichiers d’administration — sinon elle rendrait zéro, ce qui ressemble à un succès', () => {
    expect(ADMIN_SOURCES.length).toBeGreaterThan(100);
    expect(ADMIN_SOURCES.some((path) => path.endsWith('admin-shell.tsx'))).toBe(true);
    expect(ADMIN_SOURCES.some((path) => path.endsWith('interpret/time.ts'))).toBe(true);
  });

  test('aucun `currentInterfaceLanguage`', () => {
    expect(offenders(/\bcurrentInterfaceLanguage\b/)).toEqual([]);
  });

  test('aucun type `InterfaceLanguage` — c’est `AdminLanguage` qui circule', () => {
    expect(offenders(/\bInterfaceLanguage\b/)).toEqual([]);
  });

  test('aucune variante `rtl:` ni lecture du sens du document — l’administration se lit toujours à l’endroit', () => {
    expect(offenders(/\brtl:/)).toEqual([]);
    expect(offenders(/documentElement\.dir|document\.dir\b/)).toEqual([]);
  });
});
