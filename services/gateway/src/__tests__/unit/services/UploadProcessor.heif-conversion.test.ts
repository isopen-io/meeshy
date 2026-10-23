/**
 * La porte multipart (`UploadProcessor`) sert un HEIC en JPEG et garde
 * l'original ; le chemin chiffré côté serveur — qui reçoit le CLAIR, ce n'est
 * pas du E2EE au sens de #9224 — chiffre le JPEG, jamais le HEIC (#11263).
 * Disque, sharp et heif-convert RÉELS ; seuls Prisma et le chiffrement sont doublés.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest, afterEach } from '@jest/globals';
import { promises as fs, readFileSync } from 'fs';
import os from 'os';
import path from 'path';
import sharp from 'sharp';

const mockEncryptAttachment = jest.fn(async (params: { fileBuffer: Buffer; mimeType: string }) => ({
  encryptedBuffer: params.fileBuffer,
  metadata: { encryptionKey: 'k', iv: 'iv', authTag: 't', hmac: 'h', originalSize: params.fileBuffer.length, originalHash: 'oh', encryptedSize: params.fileBuffer.length, encryptedHash: 'eh', mode: 'server' },
}));
jest.mock('../../../services/AttachmentEncryptionService', () => ({
  getAttachmentEncryptionService: () => ({ encryptAttachment: mockEncryptAttachment }),
}));

import { UploadProcessor } from '../../../services/attachments/UploadProcessor';

const HEIC = readFileSync(path.join(__dirname, '..', '..', '..', 'services', 'attachments', '__tests__', 'fixtures', 'heif', 'photo-p3.heic'));
const dirs: string[] = [];
const ORIGINAL_UPLOAD_PATH = process.env.UPLOAD_PATH;
afterEach(async () => {
  if (ORIGINAL_UPLOAD_PATH === undefined) delete process.env.UPLOAD_PATH;
  else process.env.UPLOAD_PATH = ORIGINAL_UPLOAD_PATH;
  await Promise.all(dirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

async function processor() {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'multipart-heif-'));
  dirs.push(base);
  process.env.UPLOAD_PATH = base;
  const create = jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'att-1', createdAt: new Date(), ...data }));
  return { base, create, processor: new UploadProcessor({ messageAttachment: { create } } as never) };
}

const heicFile = () => ({ buffer: HEIC, filename: 'IMG_0001.HEIC', mimeType: 'image/heic', size: HEIC.length });

describe('UploadProcessor — un HEIC est servi en JPEG (#11263)', () => {
  it('multipart : la ligne désigne un JPEG lisible, l’original HEIC est gardé dans `renditions`', async () => {
    const { base, create, processor: p } = await processor();

    const result = await p.uploadFile(heicFile(), '507f1f77bcf86cd799439011');

    const data = create.mock.calls[0][0].data;
    expect(data.mimeType).toBe('image/jpeg');
    expect(result.mimeType).toBe('image/jpeg');
    expect((await sharp(path.join(base, String(data.filePath))).metadata()).format).toBe('jpeg');
    const [original] = data.renditions as Array<{ codec: string; url: string }>;
    expect(original.codec).toBe('heic');
    expect((await fs.stat(path.join(base, original.url))).size).toBeGreaterThan(0);
  });

  it('chemin chiffré serveur : c’est un JPEG qui est chiffré et persisté, jamais le HEIC', async () => {
    const { create, processor: p } = await processor();

    await p.uploadEncryptedFile(heicFile(), '507f1f77bcf86cd799439011', 'server' as never);

    const encrypted = mockEncryptAttachment.mock.calls[0][0];
    expect(encrypted.mimeType).toBe('image/jpeg');
    expect((await sharp(encrypted.fileBuffer).metadata()).format).toBe('jpeg');
    expect(create.mock.calls[0][0].data.mimeType).toBe('image/jpeg');
  });

  it('multipart : un HEIC illisible est refusé (415), et ne reste pas sur disque', async () => {
    const { base, create, processor: p } = await processor();
    const broken = { ...heicFile(), buffer: Buffer.concat([HEIC.subarray(0, 40), Buffer.alloc(300)]) };

    await expect(p.uploadFile(broken, '507f1f77bcf86cd799439011')).rejects.toMatchObject({ statusCode: 415 });
    expect(create).not.toHaveBeenCalled();
    const stored = await fs.readdir(base, { recursive: true }).catch((): string[] => []);
    expect(stored.filter((name) => /\.(heic|jpg)$/i.test(name))).toEqual([]);
  });
});
