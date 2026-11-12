import spotlightFile from '@meeshy/shared/design/call-capture-frames/spotlight.json';
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

/** Ce que le motif déclare pour TOUTES ses tranches (doc 06 § 3) : son nom dans chaque langue (#13953), qui l'a fait, où il se propose, ce qu'il coûte, ses déclinaisons. */
function motifKeys(motif: FrameMotif): Pick<CaptureFrame, 'localizedNames' | 'credits' | 'surfaces' | 'cost' | 'styles'> {
  return {
    ...(motif.localizedNames === undefined ? {} : { localizedNames: motif.localizedNames }),
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
 * ne la liste pas : le carrousel du Montage l'offre par `declinationsOf` (balayage vertical, #17821) ; le peintre la rend.
 */
export function styledFrame(frame: CaptureFrame, style: FrameStyle): CaptureFrame {
  const { id, motif, mood, name, localizedNames, bucket, people, credits, surfaces, cost, styles, ...look } = frame;
  return {
    ...overlay(look, style.look),
    ...(localizedNames === undefined ? {} : { localizedNames }),
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

const BASE_PARTS = 3;

/** L'identifiant du cadre de BASE d'un identifiant : `ambiance.motif.tranche`, décliné ou non (`.style` en plus). */
export const baseIdOf = (id: string): string => {
  const parts = id.split('.');
  return parts.length > BASE_PARTS ? parts.slice(0, BASE_PARTS).join('.') : id;
};

/** Le style d'un identifiant décliné, `undefined` pour un cadre de base. */
export const styleIdOf = (id: string): string | undefined => {
  const parts = id.split('.');
  return parts.length > BASE_PARTS ? parts.slice(BASE_PARTS).join('.') : undefined;
};

const declined = new WeakMap<CaptureFrame, readonly CaptureFrame[]>();

/**
 * **LES DÉCLINAISONS D'UN CADRE** (#12685, #17821 C1.6) — sa version de base puis chacune de ses `styles`, dans l'ordre
 * du motif (jumelle de `CallFrameStyleRule.declinations`, iOS). Un cadre sans style n'en a qu'une : lui-même.
 */
export function declinationsOf(frame: CaptureFrame): readonly CaptureFrame[] {
  const known = declined.get(frame);
  if (known !== undefined) return known;
  const list = [frame, ...stylesOf(frame).map((style) => styledFrame(frame, style))];
  declined.set(frame, list);
  return list;
}

/** Une déclinaison de `base` par son identifiant complet (`ambiance.motif.tranche.style`) ; `undefined` si inconnue. */
export const declinationById = (base: CaptureFrame | undefined, id: string): CaptureFrame | undefined => (base === undefined ? undefined : declinationsOf(base).find((frame) => frame.id === id));

export const servesPeople = (frame: CaptureFrame, people: number): boolean => people >= frame.people[0] && people <= frame.people[1];

export function framesFor(frames: readonly CaptureFrame[], people: number, mood?: FrameMood): readonly CaptureFrame[] {
  return frames.filter((frame) => servesPeople(frame, people) && (mood === undefined || frame.mood === mood));
}

/** Les ambiances qui ont au moins un cadre pour `n`, dans l'ordre canonique. */
export function moodsFor(frames: readonly CaptureFrame[], people: number): readonly FrameMood[] {
  const served = new Set(framesFor(frames, people).map((frame) => frame.mood));
  return FRAME_MOODS.filter((mood) => served.has(mood));
}

export type FrameScope = 'spotlight' | 'all';

/** Une ambiance ouverte d'office, et ses cadres vedettes (identifiants de MOTIF), dans l'ordre où ils se proposent. */
export type FrameSpotlight = readonly { readonly mood: FrameMood; readonly featured: readonly string[] }[];

const isMood = (value: string): value is FrameMood => (FRAME_MOODS as readonly string[]).includes(value);

/** `spotlight.json` (#12683) : le fichier que lisent iOS et Android, et qui dit lesquelles s'ouvrent d'office. */
export const SPOTLIGHT: FrameSpotlight = spotlightFile.moods.flatMap((entry) => (isMood(entry.mood) ? [{ mood: entry.mood, featured: entry.featured }] : []));

/**
 * **LA MISE EN AVANT DES CADRES** (#12692, jumelle de `CallFrameSpotlightRule`, iOS) — d'office, les ambiances de
 * `spotlight.json` qui servent `n`, dans l'ordre de la mise en avant ; « Plus d'ambiances » rend tout le catalogue, dans
 * l'ordre canonique. Aucune vedette ne sert `n` : tout ce qui le sert (jamais une rangée vide). Rien n'est retiré du catalogue.
 */
export function spotlightMoods(frames: readonly CaptureFrame[], people: number, scope: FrameScope, spotlight: FrameSpotlight = SPOTLIGHT): readonly FrameMood[] {
  const served = moodsFor(frames, people);
  if (scope === 'all') return served;
  const featured = spotlight.map((entry) => entry.mood).filter((mood) => served.includes(mood));
  return featured.length === 0 ? served : featured;
}

/** Les cadres d'une ambiance pour `n` : d'office, ses seules vedettes dans leur ordre (toute l'ambiance si aucune ne sert `n`). */
export function spotlightFrames(frames: readonly CaptureFrame[], people: number, mood: FrameMood, scope: FrameScope, spotlight: FrameSpotlight = SPOTLIGHT): readonly CaptureFrame[] {
  const served = framesFor(frames, people, mood);
  if (scope === 'all') return served;
  const order = spotlight.find((entry) => entry.mood === mood)?.featured ?? [];
  const featured = order.flatMap((motif) => served.filter((frame) => frame.motif === motif).slice(0, 1));
  return featured.length === 0 ? served : featured;
}

type ScopedSource = { readonly moods: (scope: FrameScope) => readonly FrameMood[]; readonly framesOf: (mood: FrameMood, scope: FrameScope) => readonly CaptureFrame[] };

const countFrames = (source: ScopedSource, scope: FrameScope): number => source.moods(scope).reduce((total, mood) => total + source.framesOf(mood, scope).length, 0);

/** Ce que « Plus d'ambiances » révélerait : des ambiances, ou des cadres, absents de la mise en avant. Rien ⇒ pas de puce. */
export const hidesBeyondSpotlight = (source: ScopedSource): boolean => countFrames(source, 'spotlight') < countFrames(source, 'all');

/**
 * La portée qu'on montre : celle demandée, sauf si le cadre choisi n'y figure pas — alors tout le catalogue, pour que le
 * choix en cours reste visible. Une déclinaison compte pour son cadre de base.
 */
export function scopeShowing(source: ScopedSource & { readonly find: (id: string) => CaptureFrame | null }, frameId: string | null, requested: FrameScope): FrameScope {
  if (requested === 'all' || frameId === null) return requested;
  const base = source.find(baseIdOf(frameId));
  if (base === null) return requested;
  const visible = source.moods('spotlight').includes(base.mood) && source.framesOf(base.mood, 'spotlight').some((frame) => frame.id === base.id);
  return visible ? 'spotlight' : 'all';
}

export type PeopleSource = {
  readonly moods: (people: number, scope?: FrameScope) => readonly FrameMood[];
  readonly framesOf: (people: number, mood: FrameMood, scope?: FrameScope) => readonly CaptureFrame[];
  readonly find: (id: string) => CaptureFrame | null;
};

export type ScopeLaws = {
  readonly hidesBeyondSpotlight: (people: number) => boolean;
  readonly scopeShowing: (frameId: string | null, people: number, requested: FrameScope) => FrameScope;
};

/** Les deux lois de portée, posées sur ce qu'une source PROPOSE (l'atelier, ou l'atelier étagé) pour `n` personnes. */
export const scopeLawsOf = (source: PeopleSource): ScopeLaws => ({
  hidesBeyondSpotlight: (people: number): boolean => hidesBeyondSpotlight({ moods: (scope) => source.moods(people, scope), framesOf: (mood, scope) => source.framesOf(people, mood, scope) }),
  scopeShowing: (frameId: string | null, people: number, requested: FrameScope): FrameScope =>
    scopeShowing({ moods: (scope) => source.moods(people, scope), framesOf: (mood, scope) => source.framesOf(people, mood, scope), find: source.find }, frameId, requested),
});

/**
 * Le nombre a changé (une arrivée, un départ) : le même motif dans la variante
 * de la nouvelle tranche ; sinon le premier cadre de la même ambiance ; sinon
 * `null` (l'hôte retombe sur un classique).
 */
export function reconcileFrame(frames: readonly CaptureFrame[], selectedId: string, people: number): CaptureFrame | null {
  const base = reconcileBase(frames, baseIdOf(selectedId), people);
  const styleId = styleIdOf(selectedId);
  if (base === null || styleId === undefined) return base;
  return declinationById(base, `${base.id}.${styleId}`) ?? base;
}

function reconcileBase(frames: readonly CaptureFrame[], selectedId: string, people: number): CaptureFrame | null {
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
