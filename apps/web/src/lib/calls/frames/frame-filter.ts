import { canUseFrame, captureFrameUsage, type FrameUsage, type FrameUseContext } from '@meeshy/shared/types/frame-usage';

import { BUCKET_PEOPLE, FRAME_BUCKETS, FRAME_MOODS, type CaptureFrame, type FrameBucket, type FrameLook, type FrameMood, type FrameMotif, type FrameStyle } from './frame-spec';

/**
 * **QUELS CADRES POUR COMBIEN DE PERSONNES** — la règle de filtrage du § 2 de
 * la spec : à `n` personnes (moi compris), seuls les cadres dont la tranche
 * contient `n` se proposent ; ceux d'un appel à dix ne s'affichent pas à
 * quatre, ceux d'un duo pas à cinq.
 */

export function bucketOf(people: number): FrameBucket | null {
  return FRAME_BUCKETS.find((bucket) => people >= BUCKET_PEOPLE[bucket][0] && people <= BUCKET_PEOPLE[bucket][1]) ?? null;
}

type Variant = NonNullable<FrameMotif['variants'][FrameBucket]>;

/** La variante surcharge la base clé par clé ; une clé absente de la variante garde celle de la base. */
function overlay(base: FrameLook, variant: Variant): FrameLook {
  const pattern = variant.pattern ?? base.pattern;
  const border = variant.border ?? base.border;
  const subtitle = variant.subtitle ?? base.subtitle;
  const brand = variant.brand ?? base.brand;
  const elements = variant.elements ?? base.elements;
  const scene = variant.scene ?? base.scene;
  const behaviors = variant.behaviors ?? base.behaviors;
  const fallbacks = variant.fallbacks ?? base.fallbacks;
  return {
    layout: variant.layout ?? base.layout,
    slot: variant.slot ?? base.slot,
    background: variant.background ?? base.background,
    ornaments: variant.ornaments ?? base.ornaments,
    names: variant.names ?? base.names,
    title: variant.title ?? base.title,
    ...(pattern === undefined ? {} : { pattern }),
    ...(border === undefined ? {} : { border }),
    ...(brand === undefined ? {} : { brand }),
    ...(subtitle === undefined ? {} : { subtitle }),
    ...(elements === undefined ? {} : { elements }),
    ...(scene === undefined ? {} : { scene }),
    ...(behaviors === undefined ? {} : { behaviors }),
    ...(fallbacks === undefined ? {} : { fallbacks }),
  };
}

/** Ce que le motif déclare pour TOUTES ses tranches (doc 06 § 3) : qui l'a fait, où il se propose, ce qu'il coûte, ses déclinaisons. */
function motifKeys(motif: FrameMotif): Pick<CaptureFrame, 'credits' | 'surfaces' | 'cost' | 'styles'> {
  return {
    ...(motif.credits === undefined ? {} : { credits: motif.credits }),
    ...(motif.surfaces === undefined ? {} : { surfaces: motif.surfaces }),
    ...(motif.cost === undefined ? {} : { cost: motif.cost }),
    ...(motif.styles === undefined ? {} : { styles: motif.styles }),
  };
}

/** Un motif déplié en cadres, un par tranche qu'il sait servir : la variante surcharge la base clé par clé. */
export function expandMotif(motif: FrameMotif): readonly CaptureFrame[] {
  return FRAME_BUCKETS.flatMap((bucket) => {
    const variant = motif.variants[bucket];
    if (variant === undefined) return [];
    return [{ ...overlay(motif.base, variant), ...motifKeys(motif), id: `${motif.id}.${bucket}`, motif: motif.id, mood: motif.mood, name: motif.name, bucket, people: BUCKET_PEOPLE[bucket] }];
  });
}

/** Les déclinaisons d'un motif ou d'un cadre déplié (#12685) — aucune, le plus souvent. */
export const stylesOf = (owner: { readonly styles?: readonly FrameStyle[] | undefined }): readonly FrameStyle[] => owner.styles ?? [];

/**
 * **LA DÉCLINAISON D'UN CADRE** (#12685) — le même cadre sous un autre habillage : le `look`
 * de la déclinaison surcharge le cadre déplié clé par clé, comme une variante surcharge sa
 * base, et l'identifiant porte le sien (`ambiance.motif.tranche.style`). Le catalogue déplié
 * ne la liste pas (le carrousel web la découvrira avec #12692) ; le peintre la rend déjà.
 */
export function styledFrame(frame: CaptureFrame, style: FrameStyle): CaptureFrame {
  const { id, motif, mood, name, bucket, people, credits, surfaces, cost, styles, ...look } = frame;
  return {
    ...overlay(look, style.look),
    ...(credits === undefined ? {} : { credits }),
    ...(surfaces === undefined ? {} : { surfaces }),
    ...(cost === undefined ? {} : { cost }),
    ...(styles === undefined ? {} : { styles }),
    id: `${id}.${style.id}`,
    motif,
    mood,
    name,
    bucket,
    people,
  };
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

/**
 * **OÙ UN CADRE SERT** (#10146) — l'usage d'un cadre de capture d'appel est
 * celui que la loi partagée projette de ses `surfaces` (`captureFrameUsage`) :
 * `live` ⇒ l'appel vidéo ET la capture ; `capture` seul ⇒ la photo et la vidéo,
 * jamais l'appel. Aucune autre lecture de `surfaces` ne décide d'une offre.
 */
export const frameUsageOf = (frame: Pick<CaptureFrame, 'surfaces'>): FrameUsage => captureFrameUsage(frame.surfaces);

/** L'appel vidéo en direct : seuls les cadres du direct s'y proposent. */
export const CALL_FRAME_USES: readonly FrameUseContext[] = [{ kind: 'call' }];

/** La capture (mode Montage) : deux tapes PHOTOGRAPHIENT, un appui long FILME — un cadre proposé sert les deux. */
export const CAPTURE_FRAME_USES: readonly FrameUseContext[] = [
  { kind: 'capture', media: 'photo' },
  { kind: 'capture', media: 'video' },
];

/** Les cadres qu'une surface propose : ceux que la loi autorise dans CHACUN de ses contextes. */
export function offeredFor(frames: readonly CaptureFrame[], uses: readonly FrameUseContext[]): readonly CaptureFrame[] {
  return frames.filter((frame) => uses.every((use) => canUseFrame(frameUsageOf(frame), use)));
}
