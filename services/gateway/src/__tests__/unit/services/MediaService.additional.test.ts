/**
 * Additional MediaService tests — covers the gaps not reached by the primary
 * suite: relativePathFromUrl error branches, duplicateMedia EEXIST exhaustion,
 * planDuplicate and its commit() function.
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { MediaService } from '../../../services/MediaService';

// ── Helpers ───────────────────────────────────────────────────────────────────

async function makeTmpDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'meeshy-media-extra-'));
}

async function writeFile(base: string, rel: string, content: Buffer = Buffer.from('data')): Promise<void> {
  const full = path.join(base, rel);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, content);
}

// ── relativePathFromUrl: error branches ──────────────────────────────────────

describe('MediaService.relativePathFromUrl — error branches', () => {
  const service = new MediaService('/tmp/uploads', '');

  it('returns null when an https:// URL is malformed (new URL throws)', () => {
    // A string that starts with https:// but is not a valid URL
    const result = service.relativePathFromUrl('https://[invalid url]');
    expect(result).toBeNull();
  });

  it('returns the raw encoded string when decodeURIComponent throws', () => {
    // %ZZ is not valid percent-encoding and will cause decodeURIComponent to throw
    const result = service.relativePathFromUrl('/api/v1/attachments/file/%ZZ');
    // Should not throw, should return the raw encoded value
    expect(result).toBe('%ZZ');
  });
});

// ── duplicateMedia: EEXIST retry exhaustion ───────────────────────────────────

describe('MediaService.duplicateMedia — EEXIST retry exhaustion', () => {
  let tmpDir: string;
  let service: MediaService;

  beforeEach(async () => {
    tmpDir = await makeTmpDir();
    service = new MediaService(tmpDir, '');
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
    jest.restoreAllMocks();
  });

  it('throws after 3 EEXIST failures', async () => {
    await writeFile(tmpDir, 'originals/photo.jpg');

    const eexistError = Object.assign(new Error('file exists'), { code: 'EEXIST' });
    const copyFileSpy = jest.spyOn(fs, 'copyFile').mockRejectedValue(eexistError as never);

    const url = `/api/v1/attachments/file/${encodeURIComponent('originals/photo.jpg')}`;
    await expect(service.duplicateMedia(url)).rejects.toThrow(
      /failed to find a free snapshot path after 3 retries/,
    );

    expect(copyFileSpy).toHaveBeenCalledTimes(3);
  });

  it('propagates non-EEXIST errors immediately without retry', async () => {
    await writeFile(tmpDir, 'originals/video.mp4');

    const permError = Object.assign(new Error('permission denied'), { code: 'EACCES' });
    const copyFileSpy = jest.spyOn(fs, 'copyFile').mockRejectedValue(permError as never);

    const url = `/api/v1/attachments/file/${encodeURIComponent('originals/video.mp4')}`;
    await expect(service.duplicateMedia(url)).rejects.toThrow('permission denied');

    // Retries only on EEXIST — non-EEXIST stops after the first attempt
    expect(copyFileSpy).toHaveBeenCalledTimes(1);
  });
});

// ── planDuplicate ─────────────────────────────────────────────────────────────

describe('MediaService.planDuplicate', () => {
  let tmpDir: string;
  let service: MediaService;

  beforeEach(async () => {
    tmpDir = await makeTmpDir();
    service = new MediaService(tmpDir, '');
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('returns a plan with plannedFileUrl and plannedFilePath', async () => {
    const url = '/api/v1/attachments/file/originals%2Fphoto.jpg';
    const plan = service.planDuplicate(url);

    expect(plan.plannedFileUrl).toContain('/api/v1/attachments/file/');
    expect(plan.plannedFilePath).toMatch(/^snapshots[/\\]snapshot_.*\.jpg$/);
    expect(typeof plan.commit).toBe('function');
  });

  it('commit() copies the file and returns correct metadata', async () => {
    const content = Buffer.from('plan-duplicate-content');
    await writeFile(tmpDir, 'originals/audio.mp3', content);

    const url = `/api/v1/attachments/file/${encodeURIComponent('originals/audio.mp3')}`;
    const plan = service.planDuplicate(url);

    const result = await plan.commit();

    expect(result.fileUrl).toBe(plan.plannedFileUrl);
    expect(result.filePath).toBe(plan.plannedFilePath);
    expect(result.fileSize).toBe(content.length);
    expect(result.mimeType).toBe('audio/mpeg');
    expect(result.fileName).toMatch(/^snapshot_.*\.mp3$/);

    // File actually exists on disk
    const exists = await fs
      .access(path.join(tmpDir, result.filePath))
      .then(() => true)
      .catch(() => false);
    expect(exists).toBe(true);
  });

  it('commit() creates the snapshots directory if it does not exist', async () => {
    const content = Buffer.from('data');
    await writeFile(tmpDir, 'originals/clip.mp4', content);

    const url = `/api/v1/attachments/file/${encodeURIComponent('originals/clip.mp4')}`;
    const plan = service.planDuplicate(url);

    // snapshots dir does not exist yet
    const snapshotsDir = path.join(tmpDir, 'snapshots');
    await fs.rm(snapshotsDir, { recursive: true, force: true });

    const result = await plan.commit();
    expect(result.filePath).toMatch(/snapshots/);
  });

  it('throws for an unrecognised URL pattern', () => {
    expect(() => service.planDuplicate('https://external.com/file.jpg')).toThrow(
      /cannot parse URL/,
    );
  });
});
