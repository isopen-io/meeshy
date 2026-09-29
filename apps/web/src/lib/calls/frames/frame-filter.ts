import { BUCKET_PEOPLE, FRAME_BUCKETS, FRAME_MOODS, type CaptureFrame, type FrameBucket, type FrameMood, type FrameMotif } from './frame-spec';

/**
 * **QUELS CADRES POUR COMBIEN DE PERSONNES** — la règle de filtrage du § 2 de
 * la spec : à `n` personnes (moi compris), seuls les cadres dont la tranche
 * contient `n` se proposent ; ceux d'un appel à dix ne s'affichent pas à
 * quatre, ceux d'un duo pas à cinq.
 */

export function bucketOf(people: number): FrameBucket | null {
  return FRAME_BUCKETS.find((bucket) => people >= BUCKET_PEOPLE[bucket][0] && people <= BUCKET_PEOPLE[bucket][1]) ?? null;
}

/** Un motif déplié en cadres, un par tranche qu'il sait servir : la variante surcharge la base clé par clé. */
export function expandMotif(motif: FrameMotif): readonly CaptureFrame[] {
  return FRAME_BUCKETS.flatMap((bucket) => {
    const variant = motif.variants[bucket];
    if (variant === undefined) return [];
    return [{ ...motif.base, ...variant, id: `${motif.id}.${bucket}`, motif: motif.id, mood: motif.mood, name: motif.name, bucket, people: BUCKET_PEOPLE[bucket] }];
  });
}

export const servesPeople = (frame: CaptureFrame, people: number): boolean => people >= frame.people[0] && people <= frame.people[1];

export function framesFor(frames: readonly CaptureFrame[], people: number, mood?: FrameMood): readonly CaptureFrame[] {
  return frames.filter((frame) => servesPeople(frame, people) && (mood === undefined || frame.mood === mood));
}

/** Les ambiances qui ont au moins un cadre pour `n`, dans l'ordre canonique. */
export function moodsFor(frames: readonly CaptureFrame[], people: number): readonly FrameMood[] {
  const served = new Set(framesFor(frames, people).map((frame) => frame.mood));
  return FRAME_MOODS.filter((mood) => served.has(mood));
}

/**
 * Le nombre a changé (une arrivée, un départ) : le même motif dans la variante
 * de la nouvelle tranche ; sinon le premier cadre de la même ambiance ; sinon
 * `null` (l'hôte retombe sur un classique).
 */
export function reconcileFrame(frames: readonly CaptureFrame[], selectedId: string, people: number): CaptureFrame | null {
  const current = frames.find((frame) => frame.id === selectedId);
  if (current !== undefined && servesPeople(current, people)) return current;
  const motif = selectedId.split('.').slice(0, 2).join('.');
  const sibling = frames.find((frame) => frame.motif === motif && servesPeople(frame, people));
  if (sibling !== undefined) return sibling;
  const mood = selectedId.split('.')[0];
  return frames.find((frame) => frame.mood === mood && servesPeople(frame, people)) ?? null;
}
