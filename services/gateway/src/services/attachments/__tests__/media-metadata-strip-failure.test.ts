/**
 * Un retrait de métadonnées qui ÉCHOUE garde l'original — et le JOURNALISE
 * (#11258). Pour la vidéo, l'échec n'était dit à personne : un ffmpeg absent du
 * conteneur aurait laissé partir le GPS de chaque vidéo sans une ligne de log.
 *
 * ffmpeg RÉEL, sur un fichier qui n'est pas une vidéo.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

const mockWarnings: unknown[][] = [];
jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: () => ({
      warn: (...args: unknown[]) => mockWarnings.push(args),
      error: () => undefined,
      info: () => undefined,
      debug: () => undefined,
    }),
  },
}));

import { stripMediaMetadataBuffer, stripStoredMediaMetadata } from '../media-metadata-strip';

const NOT_A_VIDEO = Buffer.from('not a video at all');

describe('retrait des métadonnées — un échec vidéo est journalisé (#11258)', () => {
  let workDir: string;

  beforeEach(async () => {
    mockWarnings.length = 0;
    workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'metadata-strip-failure-'));
  });

  afterEach(async () => {
    await fs.rm(workDir, { recursive: true, force: true });
  });

  it('fichier posé : garde l’original, ne laisse rien derrière, et le journalise avec sa cause', async () => {
    const filePath = path.join(workDir, 'clip.mp4');
    await fs.writeFile(filePath, NOT_A_VIDEO);

    const written = await stripStoredMediaMetadata({ filePath, mimeType: 'video/mp4' });

    expect(written).toBeNull();
    expect((await fs.readFile(filePath)).equals(NOT_A_VIDEO)).toBe(true);
    expect(await fs.readdir(workDir)).toEqual(['clip.mp4']);
    expect(mockWarnings).toHaveLength(1);
    expect(mockWarnings[0][1]).toEqual(expect.objectContaining({ mimeType: 'video/mp4', error: expect.any(Error) }));
  });

  it('tampon en clair : rend l’original et le journalise avec sa cause', async () => {
    const result = await stripMediaMetadataBuffer({ buffer: NOT_A_VIDEO, mimeType: 'video/quicktime', fileName: 'clip.mov' });

    expect(result.equals(NOT_A_VIDEO)).toBe(true);
    expect(mockWarnings).toHaveLength(1);
    expect(mockWarnings[0][1]).toEqual(expect.objectContaining({ mimeType: 'video/quicktime', error: expect.any(Error) }));
  });

  it('un type que rien ne retire ne journalise rien', async () => {
    const pdf = Buffer.from('%PDF-1.4');

    const result = await stripMediaMetadataBuffer({ buffer: pdf, mimeType: 'application/pdf', fileName: 'doc.pdf' });

    expect(result).toBe(pdf);
    expect(mockWarnings).toEqual([]);
  });
});
