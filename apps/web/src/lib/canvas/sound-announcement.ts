import { backgroundAudioOf, backgroundSoundProvenance, soundAuthorTag, type CanvasDocument, type CanvasObject } from '@/lib/canvas/document';

/**
 * L'ANNONCE DU SON DE FOND (#9678, #9698) — miroir de
 * `BackgroundSoundBadge.announcement(for:)` et d'`AudioChipDisplay.creditLine`,
 * la loi iOS :
 *
 * - `none` : aucune piste de fond — l'annonce n'existe que si une piste existe ;
 * - `original` : une piste PROPRE (aucun `soundId`) — la note et la sinusoïde ;
 * - `credit` : une piste EMPRUNTÉE à la bibliothèque — « titre · @auteur » ;
 *   sans titre « @auteur · date du son » (`soundCreatedAt`, date courte de la
 *   langue du lecteur) ; sans rien « — ». Jamais la sinusoïde, qui mentirait
 *   sur la provenance.
 *
 * Le texte ne porte PAS la note : elle est le contrôle du crédit
 * (`background-sound-credit.tsx`), dessinée devant lui.
 *
 * Quel objet est le fond, et sa provenance : la règle partagée
 * (`@meeshy/shared/utils/scene-audio`, lue par `lib/canvas/document`).
 *
 * Chargé à la demande avec le crédit.
 */
export type BackgroundSoundAnnouncement =
  | { readonly kind: 'none' }
  | { readonly kind: 'original' }
  | { readonly kind: 'credit'; readonly text: string };

export const NO_BACKGROUND_SOUND: BackgroundSoundAnnouncement = { kind: 'none' };

export const GENERIC_CREDIT = '—';

const trimmed = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  return text === '' ? undefined : text;
};

type DateContext = { readonly language?: string | undefined; readonly timeZone?: string | undefined };

/** « 12 mars 2026 » — `undefined` pour une date illisible : le crédit s'en passe. */
function creditDate(iso: string | undefined, { language, timeZone }: DateContext): string | undefined {
  if (iso === undefined) return undefined;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return undefined;
  return new Intl.DateTimeFormat(language, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...(timeZone !== undefined ? { timeZone } : {}),
  }).format(date);
}

function creditText(object: CanvasObject | undefined, context: DateContext): string {
  const title = trimmed(object?.payload.name);
  const tag = soundAuthorTag(object?.payload.soundAuthorUsername);
  const date = title === undefined && tag !== undefined ? creditDate(trimmed(object?.payload.soundCreatedAt), context) : undefined;
  const parts = [title, tag, date].filter((part): part is string => part !== undefined);
  return parts.length === 0 ? GENERIC_CREDIT : parts.join(' · ');
}

export function announceBackgroundSound(params: {
  readonly document: CanvasDocument;
  readonly sceneIndex: number;
  /** La langue d'interface du lecteur : celle de la date du son. */
  readonly language?: string | undefined;
  /** Le fuseau du lecteur par défaut ; fixé par les témoins. */
  readonly timeZone?: string | undefined;
}): BackgroundSoundAnnouncement {
  const scene = params.document.scenes[params.sceneIndex];
  if (scene === undefined) return NO_BACKGROUND_SOUND;
  const provenance = backgroundSoundProvenance({ documentSound: params.document.sound, objects: scene.objects });
  if (provenance === null) return NO_BACKGROUND_SOUND;
  if (provenance === 'original') return { kind: 'original' };
  return { kind: 'credit', text: creditText(backgroundAudioOf(scene.objects), params) };
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
