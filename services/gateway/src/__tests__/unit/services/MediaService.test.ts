/**
 * @jest-environment node
 *
 * Unit tests for MediaService.
 *
 * Tests the duplicateMedia and deleteMedia helpers that operate on the
 * local-filesystem storage backend (UPLOAD_PATH directory).
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { MediaService } from '../../../services/MediaService';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function createTempUploadDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'meeshy-media-test-'));
}

async function writeTestFile(basePath: string, relativePath: string, content: Buffer = Buffer.from('test-data')): Promise<void> {
  const fullPath = path.join(basePath, relativePath);
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, content);
}

// ---------------------------------------------------------------------------
// relativePathFromUrl
// ---------------------------------------------------------------------------

describe('MediaService.relativePathFromUrl', () => {
  const service = new MediaService('/tmp/uploads', '');

  it('extracts the relative path from a relative fileUrl', () => {
    const result = service.relativePathFromUrl('/api/v1/attachments/file/2026%2F05%2Fuser%2Ffile.jpg');
    expect(result).toBe('2026/05/user/file.jpg');
  });

  it('extracts the relative path from an absolute fileUrl', () => {
    const result = service.relativePathFromUrl('https://gate.meeshy.me/api/v1/attachments/file/2026%2F05%2Fuser%2Ffile.jpg');
    expect(result).toBe('2026/05/user/file.jpg');
  });

  it('returns null for an unrecognised URL pattern', () => {
    const result = service.relativePathFromUrl('https://external-cdn.com/media/file.jpg');
    expect(result).toBeNull();
  });

  it('handles unencoded relative paths without double-decoding errors', () => {
    const result = service.relativePathFromUrl('/api/v1/attachments/file/snapshots%2Fsnapshot_uuid.mp4');
    expect(result).toBe('snapshots/snapshot_uuid.mp4');
  });
});

// ---------------------------------------------------------------------------
// duplicateMedia
// ---------------------------------------------------------------------------

describe('MediaService.duplicateMedia', () => {
  let tmpDir: string;
  let service: MediaService;

  beforeEach(async () => {
    tmpDir = await createTempUploadDir();
    service = new MediaService(tmpDir, '');
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('copies the original file to a new snapshot path and returns metadata', async () => {
    const originalContent = Buffer.from('image-binary-data');
    await writeTestFile(tmpDir, '2026/05/user1/photo.jpg', originalContent);

    const originalUrl = `/api/v1/attachments/file/${encodeURIComponent('2026/05/user1/photo.jpg')}`;
    const result = await service.duplicateMedia(originalUrl);

    expect(result.fileUrl).toContain('/api/v1/attachments/file/');
    expect(result.fileUrl).not.toBe(originalUrl);
    expect(result.fileName).toMatch(/^snapshot_.*\.jpg$/);
    expect(result.filePath).toMatch(/^snapshots[/\\]snapshot_.*\.jpg$/);
    expect(result.fileSize).toBe(originalContent.length);
    expect(result.mimeType).toBe('image/jpeg');
  });

  it('returns a new URL different from the input URL', async () => {
    await writeTestFile(tmpDir, '2026/05/user1/video.mp4');

    const originalUrl = `/api/v1/attachments/file/${encodeURIComponent('2026/05/user1/video.mp4')}`;
    const result = await service.duplicateMedia(originalUrl);

    expect(result.fileUrl).not.toBe(originalUrl);
  });

  it('the duplicated file exists on disk with the same content', async () => {
    const content = Buffer.from('hello-media-content');
    await writeTestFile(tmpDir, '2026/05/user1/audio.mp3', content);

    const originalUrl = `/api/v1/attachments/file/${encodeURIComponent('2026/05/user1/audio.mp3')}`;
    const result = await service.duplicateMedia(originalUrl);

    const destPath = path.join(tmpDir, result.filePath);
    const destContent = await fs.readFile(destPath);
    expect(destContent).toEqual(content);
  });

  it('throws when the original file does not exist', async () => {
    const originalUrl = `/api/v1/attachments/file/${encodeURIComponent('2026/05/user1/missing.jpg')}`;
    await expect(service.duplicateMedia(originalUrl)).rejects.toThrow();
  });

  it('throws when the URL does not match the expected pattern', async () => {
    await expect(service.duplicateMedia('https://external.com/file.jpg')).rejects.toThrow(
      /cannot parse URL/,
    );
  });

  it('assigns the correct MIME type for common extensions', async () => {
    const cases: Array<[string, string]> = [
      ['file.png', 'image/png'],
      ['file.mp4', 'video/mp4'],
      ['file.mp3', 'audio/mpeg'],
      ['file.m4a', 'audio/mp4'],
    ];

    for (const [filename, expectedMime] of cases) {
      await writeTestFile(tmpDir, `2026/05/user1/${filename}`);
      const url = `/api/v1/attachments/file/${encodeURIComponent(`2026/05/user1/${filename}`)}`;
      const result = await service.duplicateMedia(url);
      expect(result.mimeType).toBe(expectedMime);
    }
  });
});

// ---------------------------------------------------------------------------
// deleteMedia
// ---------------------------------------------------------------------------

describe('MediaService.deleteMedia', () => {
  let tmpDir: string;
  let service: MediaService;

  beforeEach(async () => {
    tmpDir = await createTempUploadDir();
    service = new MediaService(tmpDir, '');
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('removes the file at the resolved path', async () => {
    await writeTestFile(tmpDir, 'snapshots/snapshot_abc.jpg');
    const fileUrl = `/api/v1/attachments/file/${encodeURIComponent('snapshots/snapshot_abc.jpg')}`;

    await service.deleteMedia(fileUrl);

    const exists = await fs
      .access(path.join(tmpDir, 'snapshots/snapshot_abc.jpg'))
      .then(() => true)
      .catch(() => false);
    expect(exists).toBe(false);
  });

  it('does not throw when the file does not exist (idempotent)', async () => {
    const fileUrl = `/api/v1/attachments/file/${encodeURIComponent('snapshots/missing.jpg')}`;
    await expect(service.deleteMedia(fileUrl)).resolves.toBeUndefined();
  });

  it('does not throw for an unrecognised URL pattern', async () => {
    await expect(service.deleteMedia('https://external.com/file.jpg')).resolves.toBeUndefined();
  });
});
