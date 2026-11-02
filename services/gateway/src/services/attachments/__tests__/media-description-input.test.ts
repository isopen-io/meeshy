/**
 * #11329 — la description d'un média se saisit à l'envoi : nettoyée, bornée,
 * sa langue détectée, par la porte multipart (la porte TUS a son témoin dans
 * `routes/uploads/__tests__/tus-handler-media-queue.test.ts`). Sans saisie,
 * rien n'est posé : la transcription la remplace à la lecture.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest, afterEach } from '@jest/globals';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import sharp from 'sharp';
import { UploadProcessor } from '../UploadProcessor';
import { mediaDescriptionFields } from '../mediaDescriptionInput';
import { detectContentLanguage } from '../../../utils/content-language';

const dirs: string[] = [];
const ORIGINAL_UPLOAD_PATH = process.env.UPLOAD_PATH;
afterEach(async () => {
  if (ORIGINAL_UPLOAD_PATH === undefined) delete process.env.UPLOAD_PATH;
  else process.env.UPLOAD_PATH = ORIGINAL_UPLOAD_PATH;
  await Promise.all(dirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

async function uploadWith(providedMetadata: unknown) {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'media-description-'));
  dirs.push(base);
  process.env.UPLOAD_PATH = base;
  const create = jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'aaaaaaaaaaaaaaaaaaaaaaa9', createdAt: new Date(), ...data }));
  const processor = new UploadProcessor({ messageAttachment: { create } } as never, { mediaQueue: null });
  const buffer = await sharp({ create: { width: 64, height: 64, channels: 3, background: '#357' } }).jpeg().toBuffer();
  await processor.uploadFile({ buffer, filename: 'p.jpg', mimeType: 'image/jpeg', size: buffer.length }, '507f1f77bcf86cd799439011', false, undefined, providedMetadata);
  return create.mock.calls[0][0].data;
}

describe('mediaDescriptionFields', () => {
  it('pose la description nettoyée et sa langue ; rien quand rien n’est saisi', () => {
    expect(mediaDescriptionFields('  Un chat roux dort sur le canapé du salon  ')).toEqual({ alt: 'Un chat roux dort sur le canapé du salon', altLanguage: 'fr' });
    expect(mediaDescriptionFields('   ')).toEqual({});
    expect(mediaDescriptionFields(undefined)).toEqual({});
  });
});

describe('UploadProcessor — la description saisie à l’envoi (#11329)', () => {
  it('la porte multipart persiste `alt` et `altLanguage`', async () => {
    const data = await uploadWith({ alt: 'The photograph shows a beautiful orange cat sleeping peacefully on the comfortable sofa in the living room' });
    expect(data.alt).toBe('The photograph shows a beautiful orange cat sleeping peacefully on the comfortable sofa in the living room');
    expect(data.altLanguage).toBe(detectContentLanguage(data.alt as string));
    expect(typeof data.altLanguage).toBe('string');
  }, 60_000);

  it('sans saisie, aucune description n’est fabriquée', async () => {
    const data = await uploadWith(undefined);
    expect(data.alt).toBeUndefined();
    expect(data.altLanguage).toBeUndefined();
  }, 60_000);
});
