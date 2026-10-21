/**
 * Une vidéo perd son GPS et ses métadonnées sans être ré-encodée (#11258, #9746).
 *
 * `ffmpeg` et `ffprobe` RÉELS : la preuve n'est pas qu'un argv a été construit
 * mais que le fichier écrit ne porte plus `©xyz` / `location`, que ses paquets
 * sont identiques (aucune génération perdue) et que son index précède ses
 * données (lecture progressive). La CI installe ffmpeg pour cette suite.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { execFileSync } from 'child_process';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { isVideoMetadataStrippable, stripVideoMetadataFile, videoRemuxArgs } from '../VideoMetadataStrip';

const LOCATION = '+48.8566+002.3522/';
const SECRET = 'video-secret-title';

let workDir: string;

beforeAll(async () => {
  workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'video-metadata-strip-'));
});

afterAll(async () => {
  await fs.rm(workDir, { recursive: true, force: true });
});

function makeClip(fileName: string, format: 'mp4' | 'mov'): string {
  const output = path.join(workDir, fileName);
  execFileSync('ffmpeg', [
    '-v', 'error',
    '-f', 'lavfi', '-i', 'testsrc=duration=1:size=64x64:rate=10',
    '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1',
    '-c:v', 'mpeg4', '-c:a', 'aac', '-shortest',
    '-movflags', 'use_metadata_tags',
    '-metadata', `com.apple.quicktime.location.ISO6709=${LOCATION}`,
    '-metadata', `location=${LOCATION}`,
    '-metadata', `title=${SECRET}`,
    '-metadata', 'creation_time=2026-01-02T03:04:05Z',
    '-f', format, '-y', output,
  ]);
  return output;
}

function formatTags(file: string): Record<string, string> {
  const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format_tags', '-of', 'json', file]).toString());
  return probe.format?.tags ?? {};
}

function packetHashes(file: string): string {
  return execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-map', '0', '-c', 'copy', '-f', 'streamhash', '-']).toString();
}

function topLevelBoxes(buffer: Buffer): readonly string[] {
  const walk = (offset: number, found: readonly string[]): readonly string[] =>
    offset + 8 > buffer.length
      ? found
      : walk(offset + buffer.readUInt32BE(offset), [...found, buffer.toString('latin1', offset + 4, offset + 8)]);
  return walk(0, []);
}

describe('VideoMetadataStrip — remux sans ré-encodage (#9746)', () => {
  it.each([
    ['video/mp4', true],
    ['video/quicktime', true],
    ['VIDEO/MP4', true],
    ['video/webm', true],
    ['image/jpeg', false],
    ['audio/mp4', false],
  ])('%s strippable → %s', (mimeType, expected) => {
    expect(isVideoMetadataStrippable(mimeType)).toBe(expected);
  });

  it('demande à ffmpeg une copie de flux sans métadonnées ni chapitres, index en tête', () => {
    const args = videoRemuxArgs({ input: 'in.mov', output: 'out.mov', mimeType: 'video/quicktime' });

    expect(args).toEqual(expect.arrayContaining(['-map_metadata', '-1', '-map_chapters', '-1', '-c', 'copy', '-movflags', '+faststart']));
    expect(args.slice(-1)).toEqual(['out.mov']);
  });

  it.each([
    ['clip.mp4', 'mp4', 'video/mp4'],
    ['clip.mov', 'mov', 'video/quicktime'],
  ] as const)('retire GPS et titre de %s sans toucher aux paquets', async (fileName, format, mimeType) => {
    const clip = makeClip(fileName, format);
    expect(JSON.stringify(formatTags(clip))).toContain('48.8566');
    const before = packetHashes(clip);

    const stripped = await stripVideoMetadataFile({ filePath: clip, mimeType });

    expect(stripped).toBe(true);
    const tags = JSON.stringify(formatTags(clip));
    expect(tags).not.toContain('48.8566');
    expect(tags).not.toContain(SECRET);
    expect(tags).not.toContain('2026-01-02');
    expect(packetHashes(clip)).toBe(before);
    const boxes = topLevelBoxes(await fs.readFile(clip));
    expect(boxes.indexOf('moov')).toBeLessThan(boxes.indexOf('mdat'));
  });

  it('garde la rotation d’affichage (matrice de la piste), qui n’est pas une métadonnée', async () => {
    const source = makeClip('upright.mp4', 'mp4');
    const rotated = path.join(workDir, 'rotated.mp4');
    execFileSync('ffmpeg', ['-v', 'error', '-display_rotation', '90', '-i', source, '-c', 'copy', '-y', rotated]);

    await stripVideoMetadataFile({ filePath: rotated, mimeType: 'video/mp4' });

    const sideData = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream_side_data_list', '-of', 'compact', rotated]).toString();
    expect(sideData).toContain('rotation=90');
  });

  it('garde l’original quand ffmpeg échoue, et le dit', async () => {
    const clip = path.join(workDir, 'broken.mp4');
    await fs.writeFile(clip, Buffer.from('not a video at all'));

    const stripped = await stripVideoMetadataFile({ filePath: clip, mimeType: 'video/mp4' });

    expect(stripped).toBe(false);
    expect((await fs.readFile(clip)).toString()).toBe('not a video at all');
    expect((await fs.readdir(workDir)).filter((name) => name.includes('broken') && name !== 'broken.mp4')).toEqual([]);
  });
});
