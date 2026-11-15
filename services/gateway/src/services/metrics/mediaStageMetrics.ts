/**
 * LE TEMPS DE CHAQUE ÉTAPE DE LA CHAÎNE MÉDIA (#11257).
 *
 * `media_stage_seconds{stage,kind}` — un histogramme Prometheus par étape
 * (sonde, vignette, variantes, retrait des métadonnées, audio, transcodage) et
 * par genre de média. Le temps se lit sur l'horloge MONOTONE (`performance.now`),
 * à la réussite comme à l'échec : une étape qui tombe a coûté son temps aussi.
 *
 * Les deux étiquettes ne prennent que des valeurs BORNÉES, nommées ici : aucun
 * identifiant, aucun nom de fichier, aucun type MIME brut n'entre dans une
 * série. Rien n'est poussé : le registre se lit sur le port interne
 * (`metricsServer.ts`), jamais sur l'API publique.
 */
import { performance } from 'node:perf_hooks';
import { Histogram, Registry } from 'prom-client';

export const MEDIA_STAGES = ['probe', 'thumbnail', 'variants', 'exif', 'audio', 'transcode'] as const;
export type MediaStage = (typeof MEDIA_STAGES)[number];

export const MEDIA_KINDS = ['image', 'video', 'audio', 'document', 'other'] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];

/** De 10 ms à 2 min : une vignette se compte en dizaines de ms, un transcodage en dizaines de secondes. */
const BUCKETS_SECONDS = [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60, 120];

const DOCUMENT_TYPES = new Set(['application/pdf', 'application/msword', 'application/rtf', 'application/json']);

export function mediaKindOf(mimeType: string | null | undefined): MediaKind {
  const type = (mimeType ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
  if (type.startsWith('image/')) return 'image';
  if (type.startsWith('video/')) return 'video';
  if (type.startsWith('audio/')) return 'audio';
  if (type.startsWith('text/') || DOCUMENT_TYPES.has(type) || type.startsWith('application/vnd.openxmlformats') || type.startsWith('application/vnd.oasis')) {
    return 'document';
  }
  return 'other';
}

const EXTENSION_KIND: Readonly<Record<string, MediaKind>> = {
  jpg: 'image', jpeg: 'image', png: 'image', webp: 'image', gif: 'image', heic: 'image', heif: 'image', avif: 'image',
  mp4: 'video', mov: 'video', m4v: 'video', webm: 'video', mkv: 'video',
  m4a: 'audio', mp3: 'audio', aac: 'audio', ogg: 'audio', opus: 'audio', wav: 'audio', flac: 'audio',
  pdf: 'document', txt: 'document',
};

/** Le genre d'un fichier par son extension, quand l'étape ne connaît que son chemin. */
export function mediaKindOfPath(filePath: string): MediaKind {
  const extension = filePath.split('.').pop()?.toLowerCase() ?? '';
  return EXTENSION_KIND[extension] ?? 'other';
}

export type MediaStageMetrics = {
  readonly registry: Registry;
  readonly time: <T>(stage: MediaStage, kind: MediaKind, run: () => Promise<T>) => Promise<T>;
};

export function mediaStageMetrics(options: { readonly clock?: () => number } = {}): MediaStageMetrics {
  const clock = options.clock ?? (() => performance.now());
  const registry = new Registry();
  const histogram = new Histogram({
    name: 'media_stage_seconds',
    help: 'Durée de chaque étape de la chaîne média, par genre de média (#11257).',
    labelNames: ['stage', 'kind'] as const,
    buckets: BUCKETS_SECONDS,
    registers: [registry],
  });
  return {
    registry,
    time: async (stage, kind, run) => {
      const startedAt = clock();
      try {
        return await run();
      } finally {
        histogram.observe({ stage, kind }, Math.max(0, clock() - startedAt) / 1000);
      }
    },
  };
}

/** L'instance du processus : celle que les étapes alimentent et que le port interne sert. */
export const processMediaStageMetrics = mediaStageMetrics();

export const timeMediaStage = <T>(stage: MediaStage, kind: MediaKind, run: () => Promise<T>): Promise<T> =>
  processMediaStageMetrics.time(stage, kind, run);
