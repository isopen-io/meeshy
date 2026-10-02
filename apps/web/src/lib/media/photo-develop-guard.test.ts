import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * **UNE SEULE FAÇON D'ENCODER UNE PRISE DE VUE** (#8695) — toute photo prise
 * dans Meeshy (caméra du composer, studio de story et de réel, captures d'un
 * appel) passe par `developPhoto` (`photo-develop.ts`). Cette garde lit les
 * sources : un encodage d'image (`toBlob`, `convertToBlob`) hors de la liste
 * ci-dessous la fait tomber, et chaque site de prise de vue doit importer le
 * développement ET l'appeler — directement, ou par le relais `developShots`
 * (#9082), dont la garde vérifie qu'il développe bien chaque prise.
 *
 * Les encodeurs admis ne sont PAS des prises de vue : ils ré-encodent une
 * image déjà choisie ou dessinent une carte.
 */

const SRC = fileURLToPath(new URL('../..', import.meta.url));

const NOT_A_CAPTURE: Readonly<Record<string, string>> = {
  'lib/media/photo-develop.ts': 'le développement lui-même',
  'lib/stickers/prepare.ts': 'un autocollant importé de la photothèque',
  'lib/stories/studio-retouch.ts': 'la retouche d’une image déjà posée dans le fil',
  'lib/profile/image-recompress.ts': 'un avatar ou une bannière choisis dans la photothèque',
  'lib/export/message-card-paint.ts': 'la carte d’un message, dessinée',
  'lib/stories/studio-filter-thumbnails.ts': 'la miniature réduite d’un fond déjà posé, pour les effets visuels (#8794)',
  'lib/mee/png.ts': 'l’image fixe d’un sticker de Mee, dessinée (#9034)',
};

const CAPTURE_SITES: readonly string[] = [
  'lib/calls/call-capture.ts',
  'lib/calls/call-capture-live.ts',
  'lib/stories/studio-camera-engine.ts',
  'components/composer-attachment-panel.tsx',
];

const sources = (dir: string): readonly string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });

const DEVELOPMENT = '@/lib/media/photo-develop';

const DEVELOPERS: Readonly<Record<string, RegExp>> = {
  [DEVELOPMENT]: /\bdevelopPhoto(?:File)?\s*\(/,
  '@/lib/media/develop-shots': /\bdevelopShots\s*\(/,
};

const develops = (source: string): boolean =>
  Object.entries(DEVELOPERS).some(([module, call]) => source.includes(`from '${module}'`) && call.test(source));

const ENCODE = /\b(?:toBlob|convertToBlob)\s*\(/;

describe('le développement unique des photos (#8695)', () => {
  test('aucun autre site n’encode une image', () => {
    const encoders = sources(SRC)
      .filter((path) => ENCODE.test(readFileSync(path, 'utf8')))
      .map((path) => relative(SRC, path).split('\\').join('/'));
    expect(encoders.filter((path) => NOT_A_CAPTURE[path] === undefined)).toEqual([]);
  });

  test('le relais des prises de l’appareil photo développe chaque prise', () => {
    const relay = readFileSync(join(SRC, 'lib/media/develop-shots.ts'), 'utf8');
    expect(relay).toContain(`import('${DEVELOPMENT}')`);
    expect(relay).toMatch(/\bdevelopPhotoFile\s*\(/);
  });

  test('chaque prise de vue passe par developPhoto', () => {
    const missing = CAPTURE_SITES.filter((path) => !develops(readFileSync(join(SRC, path), 'utf8')));
    expect(missing).toEqual([]);
  });
});
