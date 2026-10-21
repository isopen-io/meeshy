import { recordingMimeOf } from '@/lib/media/recording-codec';

import type { CardMedia } from './message-card-media';

/**
 * **CE QU'« IMAGER » PEUT RENDRE** (#8693) — la loi, pure et légère, que la
 * feuille lit AVANT d'enregistrer : une image toujours ; un contenu TEMPOREL
 * offre davantage. Une vidéo : Image · GIF · Vidéo. Un audio : Image · Vidéo —
 * jamais de GIF, qui est muet et ne dirait rien d'un son. Le moteur qui les
 * fabrique (`message-card-motion.ts`) n'est chargé qu'au choix d'un format animé.
 */

export const CARD_OUTPUTS = ['image', 'gif', 'video'] as const;
export type CardOutput = (typeof CARD_OUTPUTS)[number];

export function cardOutputsOf(media: readonly CardMedia[]): readonly CardOutput[] {
  if (media.some((item) => item.kind === 'video')) return ['image', 'gif', 'video'];
  if (media.some((item) => item.kind === 'audio')) return ['image', 'video'];
  return ['image'];
}

/** La vidéo exportée : au plus trente secondes — une carte se partage, elle ne remplace pas le média. */
export const MAX_VIDEO_MS = 30_000;
/** Le GIF : quatre secondes au plus, dix images par seconde — son poids reste celui d'une image. */
export const MAX_GIF_MS = 4_000;
export const GIF_FPS = 10;
/** Sans durée connue, on anime six secondes. */
const UNKNOWN_DURATION_MS = 6_000;

/** La durée animée : celle du premier média temporel, bornée par le format. */
export function motionDurationOf(params: { readonly output: Exclude<CardOutput, 'image'>; readonly mediaDurationMs: number | null }): number {
  const known = params.mediaDurationMs !== null && Number.isFinite(params.mediaDurationMs) && params.mediaDurationMs > 0 ? params.mediaDurationMs : UNKNOWN_DURATION_MS;
  return Math.min(known, params.output === 'gif' ? MAX_GIF_MS : MAX_VIDEO_MS);
}

/** Le premier conteneur que l'enregistreur du navigateur sait écrire — la loi unique, MP4 d'abord (lu partout). */
export function pickRecorderType(isTypeSupported: (type: string) => boolean): string | null {
  return recordingMimeOf('video', isTypeSupported) ?? null;
}

export const extensionOfType = (type: string): 'mp4' | 'webm' | 'gif' | 'png' =>
  type.startsWith('video/mp4') ? 'mp4' : type.startsWith('video/webm') ? 'webm' : type === 'image/gif' ? 'gif' : 'png';
