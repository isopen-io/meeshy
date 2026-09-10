import { describe, expect, test } from 'bun:test';

import { resolveAttachmentSrc } from './media-url';

/**
 * `resolveAttachmentSrc` — défaut 2 de la revue #5668 : `Attachment.fileUrl`
 * sert un chemin RELATIF (`/api/v1/attachments/file/…`, mesuré sur
 * `gate.staging.meeshy.me`) que le navigateur résout contre l'origine du
 * DOCUMENT, jamais contre la passerelle — sauf en DEV, où le proxy Vite le
 * masque. PURE, comme `resolveApiConfig` (`config.test.ts`) : la base est un
 * paramètre, aucune dépendance à `import.meta.env`.
 */
describe('resolveAttachmentSrc — les quatre formes de fileUrl', () => {
  test('relative (le cas RÉEL de la passerelle) : préfixée par la base', () => {
    expect(resolveAttachmentSrc('/api/v1/attachments/file/2026%2F09%2Fphoto.png', 'https://gate.meeshy.me')).toBe(
      'https://gate.meeshy.me/api/v1/attachments/file/2026%2F09%2Fphoto.png',
    );
  });

  test('relative avec une base VIDE (dev, proxé par Vite) : inchangée', () => {
    expect(resolveAttachmentSrc('/api/v1/attachments/file/photo.png', '')).toBe('/api/v1/attachments/file/photo.png');
  });

  test('absolue (https://…) : jamais re-préfixée', () => {
    expect(resolveAttachmentSrc('https://cdn.example.com/photo.png', 'https://gate.meeshy.me')).toBe(
      'https://cdn.example.com/photo.png',
    );
  });

  test('blob: (aperçu optimiste local, `attachmentPreviewOf`) : jamais re-préfixée', () => {
    expect(resolveAttachmentSrc('blob:https://staging.meeshy.me/abcd-1234', 'https://gate.meeshy.me')).toBe(
      'blob:https://staging.meeshy.me/abcd-1234',
    );
  });

  test('data: : jamais re-préfixée', () => {
    expect(resolveAttachmentSrc('data:image/png;base64,AA==', 'https://gate.meeshy.me')).toBe('data:image/png;base64,AA==');
  });

  test("vide (fixtures sans image) : inchangée — c'est le signal « pas d'image »", () => {
    expect(resolveAttachmentSrc('', 'https://gate.meeshy.me')).toBe('');
  });
});
