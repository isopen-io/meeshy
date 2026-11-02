/**
 * #11257 — chaque étape de la chaîne média a son histogramme
 * `media_stage_seconds{stage,kind}` : le temps est mesuré sur l'horloge
 * monotone, à la réussite comme à l'échec, et les étiquettes ne portent que
 * des valeurs BORNÉES (aucun identifiant, aucun nom de fichier).
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import {
  MEDIA_KINDS,
  MEDIA_STAGES,
  mediaKindOf,
  mediaStageMetrics,
} from '../mediaStageMetrics';

const fakeClock = (...readings: number[]) => {
  const queue = [...readings];
  return () => queue.shift() ?? 0;
};

const countOf = async (metrics: ReturnType<typeof mediaStageMetrics>, stage: string, kind: string) => {
  const text = await metrics.registry.metrics();
  const line = text.split('\n').find((row) => row.startsWith(`media_stage_seconds_count{stage="${stage}",kind="${kind}"}`));
  return line === undefined ? 0 : Number(line.split(' ').pop());
};

const sumOf = async (metrics: ReturnType<typeof mediaStageMetrics>, stage: string, kind: string) => {
  const text = await metrics.registry.metrics();
  const line = text.split('\n').find((row) => row.startsWith(`media_stage_seconds_sum{stage="${stage}",kind="${kind}"}`));
  return line === undefined ? 0 : Number(line.split(' ').pop());
};

describe('media_stage_seconds{stage,kind}', () => {
  it('nomme les étapes de la chaîne et les genres de média, et rien d’autre', () => {
    expect(MEDIA_STAGES).toEqual(['probe', 'thumbnail', 'variants', 'exif', 'audio', 'transcode']);
    expect(MEDIA_KINDS).toEqual(['image', 'video', 'audio', 'document', 'other']);
  });

  it('mesure la durée d’une étape réussie, en secondes, sur l’horloge monotone', async () => {
    const metrics = mediaStageMetrics({ clock: fakeClock(1_000, 1_250) });

    const result = await metrics.time('thumbnail', 'image', async () => 'vignette');

    expect(result).toBe('vignette');
    expect(await countOf(metrics, 'thumbnail', 'image')).toBe(1);
    expect(await sumOf(metrics, 'thumbnail', 'image')).toBeCloseTo(0.25);
  });

  it('mesure aussi une étape qui échoue, et laisse passer son erreur', async () => {
    const metrics = mediaStageMetrics({ clock: fakeClock(0, 2_000) });

    await expect(metrics.time('transcode', 'video', async () => Promise.reject(new Error('ffmpeg')))).rejects.toThrow('ffmpeg');

    expect(await countOf(metrics, 'transcode', 'video')).toBe(1);
    expect(await sumOf(metrics, 'transcode', 'video')).toBeCloseTo(2);
  });

  it('n’expose que deux étiquettes, aux valeurs bornées : aucune donnée d’un utilisateur ne peut y entrer', async () => {
    const metrics = mediaStageMetrics({ clock: fakeClock(0, 1) });
    await metrics.time('probe', mediaKindOf('application/x-unknown; name=secret-file.bin'), async () => null);

    const text = await metrics.registry.metrics();
    const labels = [...text.matchAll(/media_stage_seconds_count\{([^}]*)\}/g)].map((match) => match[1]);
    expect(labels).toEqual(['stage="probe",kind="other"']);
    expect(text).not.toContain('secret');
  });

  it('range un type MIME dans son genre', () => {
    expect(mediaKindOf('image/heic')).toBe('image');
    expect(mediaKindOf('video/mp4')).toBe('video');
    expect(mediaKindOf('audio/webm;codecs=opus')).toBe('audio');
    expect(mediaKindOf('application/pdf')).toBe('document');
    expect(mediaKindOf('text/plain')).toBe('document');
    expect(mediaKindOf('application/zip')).toBe('other');
    expect(mediaKindOf(undefined)).toBe('other');
  });
});
