/**
 * Octets d'en-tête réels, réutilisés par les suites qui uploadent un fichier
 * dont le mimeType déclaré est vérifié par `verifyDeclaredMimeType` (#5615) —
 * `UploadProcessor.test.ts`, `UploadProcessor.extra.test.ts`. Un texte
 * arbitraire ('test file content') ne correspond plus à AUCUN mimeType vérifié
 * (image, audio, PDF, SVG) : ces fixtures ne testent aucun comportement de
 * signature elles-mêmes, elles laissent simplement les tests existants
 * uploader un fichier dont le contenu correspond à sa déclaration, comme le
 * ferait un vrai client.
 */
export const JPEG_SIGNATURE_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
export const PNG_SIGNATURE_BYTES = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from([0x00, 0x00, 0x00, 0x0d]),
  Buffer.from('IHDR', 'ascii'),
]);
export const MP3_SIGNATURE_BYTES = Buffer.from('ID3\x03\x00\x00\x00\x00\x00\x00', 'binary');
export const PDF_SIGNATURE_BYTES = Buffer.from('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n', 'binary');

/** Choisit la bonne fixture selon le mimeType déclaré ; sinon un texte inerte
 * (sûr pour toute famille non vérifiée par `verifyDeclaredMimeType` — vidéo,
 * texte, code…). */
export const SIGNATURE_BYTES_BY_MIME_TYPE: Record<string, Buffer> = {
  'image/jpeg': JPEG_SIGNATURE_BYTES,
  'image/png': PNG_SIGNATURE_BYTES,
  'audio/mpeg': MP3_SIGNATURE_BYTES,
  'application/pdf': PDF_SIGNATURE_BYTES,
};
