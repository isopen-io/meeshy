/**
 * Le format dans lequel tout audio téléversé en clair est STOCKÉ (#8039) :
 * AAC dans un conteneur M4A, le seul que lisent à la fois AVFoundation (iOS),
 * Android et tous les navigateurs. `ipod` est le nom du muxer M4A de ffmpeg.
 *
 * Une seule génération d'encodage (#11259, verdict #11247) : la source est
 * SONDÉE d'abord.
 * - Un AAC mono à 96 kb/s au plus (le vocal d'iOS, d'Android, du web Safari)
 *   est déjà ce qu'on stockerait : il est REMUXÉ (`-c:a copy`, `+faststart`),
 *   jamais réencodé, et sa sonie (EBU R128, LUFS intégrés) est MESURÉE et
 *   rendue pour que les clients puissent égaliser à la lecture.
 * - Tout le reste (Opus/WebM de Chrome, AAC stéréo ou trop riche, MP3, PCM…)
 *   est transcodé en AAC 64 kb/s mono, et c'est le SEUL cas où un gain
 *   s'applique : `loudnorm` en deux passes vers −16 LUFS, crête vraie −1,5 dB.
 *   Un enregistrement faible monte, un fort descend, aucun n'écrête — là où
 *   l'ancien `volume=9dB` aveugle saturait les vocaux déjà forts.
 * Un silence n'a pas de sonie mesurable : il est transcodé sans gain, et sa
 * sonie reste `null` plutôt qu'inventée. `null` en retour = échec : l'appelant
 * garde l'original, une normalisation ratée ne fait pas échouer l'upload.
 */
import { spawn } from 'child_process';
import { randomUUID } from 'crypto';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { enhancedLogger } from '../../utils/logger-enhanced';
import { runFfmpegReadingStderr } from './ffmpeg-run';

const logger = enhancedLogger.child({ module: 'audio-normalization' });

export const NORMALIZED_AUDIO = {
  mimeType: 'audio/mp4',
  extension: '.m4a',
  ffmpegFormat: 'ipod',
} as const;

export const TARGET_LOUDNESS_LUFS = -16;
const TARGET_TRUE_PEAK_DB = -1.5;
const TARGET_LOUDNESS_RANGE = 11;
const COPYABLE_MAX_BITRATE = 96_000;
const PROBE_TIMEOUT_MS = 15_000;

export function normalizedAudioPath(relativePath: string): string {
  const parsed = relativePath.match(/^(.*?)(\.[^./\\]*)?$/);
  return `${parsed?.[1] ?? relativePath}${NORMALIZED_AUDIO.extension}`;
}

export type AudioProbe = { readonly codec: string | null; readonly channels: number | null; readonly bitRate: number | null };
export type AudioPlan = 'copy' | 'transcode';

export function audioNormalizationPlan(probe: AudioProbe | null): AudioPlan {
  if (probe === null || probe.codec !== 'aac' || probe.channels !== 1 || probe.bitRate === null) return 'transcode';
  return probe.bitRate <= COPYABLE_MAX_BITRATE ? 'copy' : 'transcode';
}

export type NormalizedAudio = { readonly buffer: Buffer; readonly plan: AudioPlan; readonly loudnessLufs: number | null };

const finiteOrNull = (value: unknown): number | null => {
  const parsed = typeof value === 'string' || typeof value === 'number' ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
};

function probeAudio(filePath: string): Promise<AudioProbe | null> {
  return new Promise((resolve) => {
    const child = spawn('ffprobe', ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=codec_name,channels,bit_rate:format=bit_rate', '-of', 'json', filePath], { timeout: PROBE_TIMEOUT_MS });
    const chunks: Buffer[] = [];
    child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
    child.on('error', () => resolve(null));
    child.on('close', (code) => {
      if (code !== 0) return resolve(null);
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString()) as { streams?: Record<string, unknown>[]; format?: Record<string, unknown> };
        const stream = parsed.streams?.[0];
        if (!stream) return resolve(null);
        resolve({
          codec: typeof stream.codec_name === 'string' ? stream.codec_name : null,
          channels: finiteOrNull(stream.channels),
          bitRate: finiteOrNull(stream.bit_rate) ?? finiteOrNull(parsed.format?.bit_rate),
        });
      } catch {
        resolve(null);
      }
    });
  });
}

type LoudnormReport = { readonly input_i: string; readonly input_tp: string; readonly input_lra: string; readonly input_thresh: string; readonly target_offset: string; readonly output_i?: string };

function loudnormReport(stderr: string): LoudnormReport | null {
  const start = stderr.lastIndexOf('{');
  const end = stderr.lastIndexOf('}');
  if (start === -1 || end < start) return null;
  try {
    return JSON.parse(stderr.slice(start, end + 1)) as LoudnormReport;
  } catch {
    return null;
  }
}

const LOUDNORM_TARGET = `I=${TARGET_LOUDNESS_LUFS}:TP=${TARGET_TRUE_PEAK_DB}:LRA=${TARGET_LOUDNESS_RANGE}`;

async function measureLoudness(filePath: string): Promise<LoudnormReport | null> {
  const stderr = await runFfmpegReadingStderr(['-hide_banner', '-nostats', '-i', filePath, '-map', '0:a:0', '-af', `loudnorm=${LOUDNORM_TARGET}:print_format=json`, '-f', 'null', '-']);
  return loudnormReport(stderr);
}

async function remux(input: string, output: string): Promise<number | null> {
  await runFfmpegReadingStderr(['-v', 'error', '-i', input, '-map', '0:a:0', '-map_metadata', '-1', '-c:a', 'copy', '-movflags', '+faststart', '-f', NORMALIZED_AUDIO.ffmpegFormat, '-y', output]);
  const report = await measureLoudness(output);
  return finiteOrNull(report?.input_i);
}

async function transcode(input: string, output: string): Promise<number | null> {
  const measured = await measureLoudness(input);
  const usable = measured !== null && [measured.input_i, measured.input_tp, measured.input_lra, measured.input_thresh].every((v) => finiteOrNull(v) !== null);
  const filter = usable
    ? ['-af', `loudnorm=${LOUDNORM_TARGET}:measured_I=${measured.input_i}:measured_TP=${measured.input_tp}:measured_LRA=${measured.input_lra}:measured_thresh=${measured.input_thresh}:offset=${measured.target_offset}:linear=true:print_format=json`]
    : [];
  const stderr = await runFfmpegReadingStderr([
    '-hide_banner', '-nostats',
    '-i', input,
    '-map', '0:a:0',
    '-map_metadata', '-1',
    ...filter,
    '-c:a', 'aac', '-b:a', '64k', '-ac', '1', '-ar', '48000',
    '-movflags', '+faststart',
    '-f', NORMALIZED_AUDIO.ffmpegFormat,
    '-y', output,
  ]);
  return usable ? finiteOrNull(loudnormReport(stderr)?.output_i) : null;
}

async function normalizeFile(input: string, output: string): Promise<{ readonly plan: AudioPlan; readonly loudnessLufs: number | null }> {
  const plan = audioNormalizationPlan(await probeAudio(input));
  const loudnessLufs = plan === 'copy' ? await remux(input, output) : await transcode(input, output);
  return { plan, loudnessLufs };
}

export async function normalizeAudioBuffer(buffer: Buffer, sourceFilename: string): Promise<NormalizedAudio | null> {
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'audio-norm-'));
  const input = path.join(workDir, `source${path.extname(sourceFilename) || '.bin'}`);
  const output = path.join(workDir, `normalized${NORMALIZED_AUDIO.extension}`);
  try {
    await fs.writeFile(input, buffer);
    const { plan, loudnessLufs } = await normalizeFile(input, output);
    const normalized = await fs.readFile(output);
    logger.debug('Audio normalisé en M4A', { plan, loudnessLufs, inputBytes: buffer.length, outputBytes: normalized.length });
    return { buffer: normalized, plan, loudnessLufs };
  } catch (error) {
    logger.error('Normalisation audio échouée, original conservé', error as Error);
    return null;
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export type StoredNormalizedAudio = { readonly filePath: string; readonly mimeType: string; readonly size: number; readonly plan: AudioPlan; readonly loudnessLufs: number | null };

/**
 * La même normalisation pour un fichier déjà POSÉ (porte résumable) : le M4A
 * prend la place de l'original, qui est retiré. `null` = échec, l'original
 * reste en place.
 */
export async function normalizeStoredAudio(filePath: string): Promise<StoredNormalizedAudio | null> {
  const target = normalizedAudioPath(filePath);
  const output = `${target}.${randomUUID()}.tmp`;
  try {
    const { plan, loudnessLufs } = await normalizeFile(filePath, output);
    await fs.rename(output, target);
    if (target !== filePath) await fs.unlink(filePath).catch(() => undefined);
    const { size } = await fs.stat(target);
    return { filePath: target, mimeType: NORMALIZED_AUDIO.mimeType, size, plan, loudnessLufs };
  } catch (error) {
    await fs.unlink(output).catch(() => undefined);
    logger.error('Normalisation audio échouée, original conservé', error as Error);
    return null;
  }
}
