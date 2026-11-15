/**
 * Un audio déjà en AAC n'est plus réencodé, un Opus/WebM est transcodé en
 * M4A pour iOS, et le gain est une MESURE, pas un +9 dB (#11259).
 *
 * Témoins sur un ffmpeg RÉEL (installé dans le job de test de la passerelle,
 * #11258) : la sonde, le remux, la mesure de sonie (EBU R128) et la
 * normalisation `loudnorm` en deux passes.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { spawn } from 'child_process';
import { randomUUID } from 'crypto';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { audioNormalizationPlan, normalizeAudioBuffer, normalizeStoredAudio, TARGET_LOUDNESS_LUFS } from '../audio-normalization';

type Run = { readonly code: number | null; readonly stdout: Buffer; readonly stderr: string };

function run(command: string, args: readonly string[]): Promise<Run> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, [...args]);
    const out: Buffer[] = [];
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => out.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout: Buffer.concat(out), stderr }));
  });
}

async function tempFile(extension: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'audio-norm-test-'));
  return path.join(dir, `${randomUUID()}${extension}`);
}

/** Une voix de synthèse (deux sinus) de 4 s, au gain voulu, dans le codec voulu. */
async function speech(params: { gainDb: number; codec: 'aac' | 'opus'; channels?: number; bitrate?: string }): Promise<Buffer> {
  const extension = params.codec === 'aac' ? '.m4a' : '.webm';
  const output = await tempFile(extension);
  const result = await run('ffmpeg', [
    '-v', 'error',
    '-f', 'lavfi', '-i', 'sine=frequency=220:duration=4:sample_rate=48000',
    '-f', 'lavfi', '-i', 'sine=frequency=330:duration=4:sample_rate=48000',
    '-filter_complex', `amix=inputs=2,volume=${params.gainDb}dB`,
    '-ac', String(params.channels ?? 1),
    ...(params.codec === 'aac' ? ['-c:a', 'aac', '-b:a', params.bitrate ?? '64k', '-f', 'ipod'] : ['-c:a', 'libopus', '-b:a', '32k', '-f', 'webm']),
    '-y', output,
  ]);
  if (result.code !== 0) throw new Error(result.stderr);
  return fs.readFile(output);
}

async function withFile<T>(buffer: Buffer, extension: string, use: (file: string) => Promise<T>): Promise<T> {
  const file = await tempFile(extension);
  await fs.writeFile(file, buffer);
  return use(file);
}

async function audioPacketsMd5(buffer: Buffer): Promise<string> {
  return withFile(buffer, '.m4a', async (file) => (await run('ffmpeg', ['-v', 'error', '-i', file, '-map', '0:a:0', '-c', 'copy', '-f', 'md5', '-'])).stdout.toString().trim());
}

async function measured(buffer: Buffer): Promise<{ readonly integrated: number; readonly truePeak: number }> {
  return withFile(buffer, '.m4a', async (file) => {
    const { stderr } = await run('ffmpeg', ['-v', 'info', '-nostats', '-i', file, '-af', 'ebur128=peak=true', '-f', 'null', '-']);
    const summary = stderr.slice(stderr.lastIndexOf('Summary:'));
    return {
      integrated: Number(summary.match(/I:\s+(-?[\d.]+) LUFS/)?.[1]),
      truePeak: Number(summary.match(/Peak:\s+(-?[\d.]+) dBFS/)?.[1]),
    };
  });
}

async function probedCodec(buffer: Buffer): Promise<{ readonly codec: string; readonly channels: number }> {
  return withFile(buffer, '.m4a', async (file) => {
    const { stdout } = await run('ffprobe', ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=codec_name,channels', '-of', 'json', file]);
    const stream = JSON.parse(stdout.toString()).streams[0];
    return { codec: stream.codec_name, channels: stream.channels };
  });
}

describe('audioNormalizationPlan (#11259)', () => {
  it('copie un AAC mono à 96 kb/s au plus', () => {
    expect(audioNormalizationPlan({ codec: 'aac', channels: 1, bitRate: 64_000 })).toBe('copy');
    expect(audioNormalizationPlan({ codec: 'aac', channels: 1, bitRate: 96_000 })).toBe('copy');
  });

  it('transcode tout le reste : Opus, AAC stéréo ou trop riche, sonde muette', () => {
    expect(audioNormalizationPlan({ codec: 'opus', channels: 1, bitRate: 32_000 })).toBe('transcode');
    expect(audioNormalizationPlan({ codec: 'aac', channels: 2, bitRate: 64_000 })).toBe('transcode');
    expect(audioNormalizationPlan({ codec: 'aac', channels: 1, bitRate: 128_000 })).toBe('transcode');
    expect(audioNormalizationPlan({ codec: 'aac', channels: 1, bitRate: null })).toBe('transcode');
    expect(audioNormalizationPlan(null)).toBe('transcode');
  });
});

describe('normalizeAudioBuffer — ffmpeg réel (#11259)', () => {
  it('un AAC mono 64 kb/s n’est PAS réencodé : mêmes paquets audio, sonie mesurée et rendue', async () => {
    const original = await speech({ gainDb: -24, codec: 'aac' });

    const result = await normalizeAudioBuffer(original, 'vocal.m4a');

    expect(result).not.toBeNull();
    expect(result?.plan).toBe('copy');
    expect(await audioPacketsMd5(result?.buffer ?? Buffer.alloc(0))).toBe(await audioPacketsMd5(original));
    const reference = await measured(original);
    expect(result?.loudnessLufs).toBeCloseTo(reference.integrated, 0);
  }, 60_000);

  it('un Opus/WebM est transcodé en AAC mono, amené à −16 LUFS', async () => {
    const original = await speech({ gainDb: -30, codec: 'opus' });

    const result = await normalizeAudioBuffer(original, 'vocal.webm');
    const output = result?.buffer ?? Buffer.alloc(0);

    expect(result?.plan).toBe('transcode');
    expect(await probedCodec(output)).toEqual({ codec: 'aac', channels: 1 });
    expect(Math.abs((await measured(output)).integrated - TARGET_LOUDNESS_LUFS)).toBeLessThan(1.5);
    expect(Math.abs((result?.loudnessLufs ?? 0) - TARGET_LOUDNESS_LUFS)).toBeLessThan(1.5);
  }, 60_000);

  it('un enregistrement déjà FORT est baissé vers −16 LUFS sans écrêtage (le +9 dB l’aurait saturé)', async () => {
    const original = await speech({ gainDb: -2, codec: 'aac', channels: 2, bitrate: '128k' });

    const result = await normalizeAudioBuffer(original, 'vocal.m4a');
    const after = await measured(result?.buffer ?? Buffer.alloc(0));

    expect(result?.plan).toBe('transcode');
    expect(Math.abs(after.integrated - TARGET_LOUDNESS_LUFS)).toBeLessThan(1.5);
    expect(after.truePeak).toBeLessThan(0);
  }, 60_000);

  it('un silence est transcodé sans gain, et sa sonie n’est pas inventée', async () => {
    const output = await tempFile('.webm');
    await run('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=mono', '-t', '2', '-c:a', 'libopus', '-f', 'webm', '-y', output]);

    const result = await normalizeAudioBuffer(await fs.readFile(output), 'silence.webm');

    expect(result?.plan).toBe('transcode');
    expect(await probedCodec(result?.buffer ?? Buffer.alloc(0))).toEqual({ codec: 'aac', channels: 1 });
    expect(result?.loudnessLufs).toBeNull();
  }, 60_000);

  it('rend null sur un fichier illisible (l’appelant garde l’original)', async () => {
    expect(await normalizeAudioBuffer(Buffer.from('not audio at all'), 'x.webm')).toBeNull();
  });
});

describe('normalizeStoredAudio — la porte résumable, sur disque (#11259)', () => {
  it('remplace un Opus/WebM posé par son M4A normalisé, et retire l’original', async () => {
    const source = await tempFile('.webm');
    await fs.writeFile(source, await speech({ gainDb: -30, codec: 'opus' }));

    const result = await normalizeStoredAudio(source);

    expect(result?.filePath).toBe(source.replace(/\.webm$/, '.m4a'));
    expect(result?.mimeType).toBe('audio/mp4');
    expect((await fs.stat(result?.filePath ?? '')).size).toBe(result?.size);
    await expect(fs.stat(source)).rejects.toThrow();
    expect(Math.abs((result?.loudnessLufs ?? 0) - TARGET_LOUDNESS_LUFS)).toBeLessThan(1.5);
  }, 60_000);
});
