/**
 * **LE GESTE SUR LE STYLE CHOISI** (#8625), en loi pure — les modes Montage
 * et Effets n'ont plus de déclencheur :
 *
 * - DEUX TAPES sur le style déjà choisi : une photo (Entrée au clavier) ;
 * - un APPUI LONG sur le style choisi : une vidéo, avec le son de l'appel,
 *   jusqu'au bouton stop posé au centre du gabarit ;
 * - une tape sur un AUTRE style le choisit, quel que soit le geste — jamais
 *   de capture par surprise. Pendant une vidéo, on change encore de style ;
 *   le reste attend le stop.
 */

export const DOUBLE_TAP_MS = 320;

export const LONG_PRESS_MS = 450;

/** Au-delà, le doigt fait défiler le carrousel : ce n'est plus un appui. */
export const PRESS_SLOP_PX = 10;

export const MAX_CLIP_MS = 180_000;

export type PressGesture = 'tap' | 'double-tap' | 'long-press';

export type CaptureIntent = 'select' | 'photo' | 'record' | 'none';

export type LastTap = { readonly id: string; readonly at: number; readonly selected: boolean } | null;

export function tapGesture(last: LastTap, tap: { readonly id: string; readonly at: number }): 'tap' | 'double-tap' {
  if (last === null || !last.selected || last.id !== tap.id) return 'tap';
  return tap.at - last.at <= DOUBLE_TAP_MS ? 'double-tap' : 'tap';
}

type IntentInput = { readonly gesture: PressGesture; readonly selected: boolean; readonly recording: boolean };

export function captureIntent({ gesture, selected, recording }: IntentInput): CaptureIntent {
  if (!selected) return 'select';
  if (recording) return 'none';
  if (gesture === 'double-tap') return 'photo';
  return gesture === 'long-press' ? 'record' : 'none';
}

export function keyIntent({ key, selected, recording }: { readonly key: string; readonly selected: boolean; readonly recording: boolean }): 'photo' | null {
  return key === 'Enter' && selected && !recording ? 'photo' : null;
}

export function clipClock(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
