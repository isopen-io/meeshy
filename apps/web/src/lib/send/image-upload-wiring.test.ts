import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * **TOUTE IMAGE QUI PART SUR LE RÉSEAU PASSE PAR LA PRÉPARATION** (#11310) —
 * les pièces d'un message (le fil et la feuille d'envoi) et le TUS des posts
 * (feuille d'envoi, commentaires, studio). La loi (bornes, format, EXIF,
 * repli) vit dans `prepare-image-upload.ts` ; cette garde lit les sources
 * des SITES D'ENVOI : un site qui monte une image brute la fait tomber.
 */

const SRC = fileURLToPath(new URL('../..', import.meta.url));
const read = (path: string): string => readFileSync(join(SRC, path), 'utf8');

const PREPARATION = "from '@/lib/media/prepare-image-upload'";

describe('les sites qui envoient une image', () => {
  test.each([
    ['les pièces du fil', 'lib/send/perform-send.ts', /\bprepareUploads\s*\(/],
    ['les pièces de la feuille d’envoi', 'lib/send/send-sheet-ports.ts', /\bprepareUploads\s*\(/],
    ['le TUS de la feuille d’envoi', 'lib/send/send-sheet-ports.ts', /\bprepareImageForUpload\s*\(/],
    ['le TUS des commentaires', 'lib/comments/comment-media.ts', /\bprepareImageForUpload\s*\(/],
    ['le TUS du studio', 'routes/use-studio-uploads.ts', /\bprepareImageForUpload\s*\(/],
  ])('%s', (_label, path, call) => {
    const source = read(path);
    expect(source).toContain(PREPARATION);
    expect(source).toMatch(call);
  });
});

describe('le worker', () => {
  test('est bâti en worker MODULE, nommé, hors du fil principal', () => {
    const client = read('lib/media/image-job-client.ts');
    expect(client).toMatch(/new Worker\(new URL\('\.\/image-job-worker\.ts', import\.meta\.url\), \{ type: 'module'/);
  });

  test('la retouche des pixels (convolution) ne tourne plus sur le fil principal pour une photo de fichier', () => {
    const develop = read('lib/media/photo-develop.ts');
    expect(develop).toMatch(/\boffMain\b/);
  });
});
