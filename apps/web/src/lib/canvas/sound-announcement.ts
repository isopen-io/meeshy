import type { CanvasDocument, CanvasObject, CanvasScene } from '@/lib/canvas/document';

/**
 * L'ANNONCE DU SON DE FOND (#9678) — miroir de `BackgroundSoundBadge.announcement(for:)`
 * (`apps/ios/.../BackgroundSoundBadge.swift`) et de `AudioChipDisplay`
 * (`MeeshyUI/Story/Controls/AudioChipDisplay.swift`), la loi iOS :
 *
 * - `none` : aucune piste de fond — l'annonce n'existe que si une piste existe ;
 * - `original` : une piste PROPRE (aucun `soundId`) — la note et la sinusoïde ;
 * - `credit` : une piste EMPRUNTÉE à la bibliothèque (`soundId`) — « titre · @auteur »,
 *   et « ♫ — » quand ses métadonnées manquent : jamais la sinusoïde, qui mentirait
 *   sur la provenance.
 *
 * `soundId` décide, jamais la présence d'un titre (`StoryAudioIdentity.form(of:)`).
 * Le document (`CanvasV3.sound`) prime pour la provenance, comme
 * `backgroundSound(of:)` ; les métadonnées viennent de l'objet de fond.
 *
 * Chargé à la demande avec le crédit (`background-sound-credit.tsx`).
 */
export type BackgroundSoundAnnouncement =
  | { readonly kind: 'none' }
  | { readonly kind: 'original' }
  | { readonly kind: 'credit'; readonly text: string };

export const NO_BACKGROUND_SOUND: BackgroundSoundAnnouncement = { kind: 'none' };

export const GENERIC_CREDIT = '♫ —';

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
const trimmed = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  return text === '' ? undefined : text;
};

function creditText(object: CanvasObject | undefined): string {
  const title = trimmed(object?.payload.name);
  const author = trimmed(object?.payload.soundAuthorUsername)?.replace(/^@+/, '');
  const tag = author === undefined || author === '' ? undefined : `@${author}`;
  const parts = [title, tag].filter((part): part is string => part !== undefined);
  return parts.length === 0 ? GENERIC_CREDIT : parts.join(' · ');
}

/** Le fond sonore d'une scène — MÊME prédicat que `electBackgroundTrack`
 * (`background-sound.ts`), que ce module n'importe pas : il tirerait le porteur
 * et la résolution d'adresse dans le chunk du crédit, et un nom de plus dans la
 * table de l'entrée (mesuré, #9678). */
function backgroundAudioObject(scene: CanvasScene): CanvasObject | undefined {
  return scene.objects.find((o) => o.kind === 'audio' && o.payload.isBackground === true);
}

type Provenance = 'original' | 'library' | null;

function documentProvenance(sound: unknown): Provenance {
  if (!isRecord(sound) || !isRecord(sound.source)) return null;
  if (sound.source.t === 'library') return 'library';
  if (sound.source.t === 'original') return 'original';
  return null;
}

function objectProvenance(object: CanvasObject | undefined): Provenance {
  if (object === undefined) return null;
  return trimmed(object.payload.soundId) === undefined ? 'original' : 'library';
}

export function announceBackgroundSound(params: {
  readonly document: CanvasDocument;
  readonly sceneIndex: number;
}): BackgroundSoundAnnouncement {
  const scene = params.document.scenes[params.sceneIndex];
  if (scene === undefined) return NO_BACKGROUND_SOUND;
  const object = backgroundAudioObject(scene);
  const provenance = documentProvenance(params.document.sound) ?? objectProvenance(object);
  if (provenance === null) return NO_BACKGROUND_SOUND;
  if (provenance === 'original') return { kind: 'original' };
  return { kind: 'credit', text: creditText(object) };
}

/** `AudioChipMarquee` : 28 points par seconde, 24 points entre les deux copies. */
export const MARQUEE_SPEED_PX_PER_S = 28;
export const MARQUEE_GAP_PX = 24;

export type MarqueePlan =
  | { readonly kind: 'static' }
  | { readonly kind: 'scroll'; readonly shiftPx: number; readonly durationS: number };

/**
 * Le crédit DÉFILE seulement s'il dépasse sa boîte, et jamais sous mouvement
 * réduit (texte statique tronqué). Un cycle déplace d'une copie plus l'espace :
 * la seconde copie est alors exactement où la première commençait.
 */
export function marqueePlan(params: {
  readonly contentWidth: number;
  readonly boxWidth: number;
  readonly reducedMotion: boolean;
}): MarqueePlan {
  const { contentWidth, boxWidth, reducedMotion } = params;
  if (reducedMotion || contentWidth <= 0 || boxWidth <= 0 || contentWidth <= boxWidth) return { kind: 'static' };
  const shiftPx = contentWidth + MARQUEE_GAP_PX;
  return { kind: 'scroll', shiftPx, durationS: shiftPx / MARQUEE_SPEED_PX_PER_S };
}
