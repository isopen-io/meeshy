import type { Prisma } from '@meeshy/shared/prisma/client';

/**
 * Calcule les incréments de compteurs dénormalisés pour une NOUVELLE session
 * (spec §19.3). Renvoie un objet `Prisma.PostUpdateInput` partiel — vide si
 * la session ne déclenche aucun compteur. Fonction pure, extraite de
 * `PostService` (budget de taille du fichier) sans changement de comportement.
 */
export const engagementAggregateIncrements = (s: {
  surface: string; contentType: string; dwellMs: number;
  watchMs?: number; mediaDurationMs?: number; completed: boolean;
  watchSamples: unknown[];
}): Prisma.PostUpdateInput => {
  const SHORT_VIDEO_MS = 8300;
  const QUALIFY_MS = 2500;

  const increments: Record<string, { increment: number }> = {};

  // "Ouverture" d'un post = consommation plein-cadre. Sur le feed de reels,
  // l'ouverture (vue totale) est comptée par l'engagement (défilement plein
  // écran). La page Detail, elle, compte sa vue IMMÉDIATEMENT à l'ouverture
  // (route /impression?source=detail) → on ne la recompte PAS ici, sinon une
  // ouverture de Detail vaudrait +2. Les surfaces éphémères (story/status) ont
  // leurs propres métriques et ne comptent pas ici.
  if (s.surface === 'reels') {
    increments.postOpenCount = { increment: 1 };
  }

  if (s.completed) {
    increments.playCount = { increment: 1 };
  }

  const maxPositionMs = Array.isArray(s.watchSamples)
    ? s.watchSamples.reduce<number>((max, sample) => {
        const pos = (sample as { positionMs?: unknown })?.positionMs;
        return typeof pos === 'number' && pos > max ? pos : max;
      }, 0)
    : 0;

  const duration = s.mediaDurationMs ?? 0;
  const positionThresh = duration < SHORT_VIDEO_MS ? 0.90 : 0.30;
  const positionQualifies = duration > 0 && (maxPositionMs / duration) >= positionThresh;
  const watchQualifies = (s.watchMs ?? 0) >= QUALIFY_MS;
  const dwellQualifies = s.watchMs === undefined && s.dwellMs >= QUALIFY_MS;

  if (positionQualifies || watchQualifies || dwellQualifies) {
    increments.qualifiedViewCount = { increment: 1 };
  }

  return increments as Prisma.PostUpdateInput;
};
