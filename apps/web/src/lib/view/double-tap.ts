import type { Message } from '@/lib/api/types';
import { protectionOf } from '@/lib/reading-mode/protection';

import { LONG_PRESS_MS } from './long-press';

/**
 * LE DOUBLE TOUCHER D'UN MESSAGE (#10599) — deux touchers rapprochés sur une
 * rangée du fil ouvrent la barre de réaction rapide (décision porteur du
 * 2026-10-14). La machine est PURE,
 * testable sans DOM ni minuteur réel, comme `pressReducer` (`long-press.ts`) :
 * le hook (`use-double-tap.ts`) ne fait qu'y brancher les événements et un
 * `setTimeout`.
 *
 * LE MODÈLE EST CELUI D'ANDROID (`GestureDetector`) : la fenêtre se mesure du
 * RELÂCHER du premier toucher (son `click`) à l'APPUI du second. Un toucher
 * sur du texte n'a aucun effet simple : il passe sans attendre, et le double
 * ne coûte rien. Un toucher sur un média OUVRE la visionneuse : il est RETENU
 * pendant la fenêtre (`hold`), puis rendu (`release`) si aucun second appui
 * n'est venu — c'est le seul geste qui paie le délai, et il le paie une fois.
 * Un contrôle (pastille, lien, bouton de lecture, drapeau) passe toujours et
 * rompt le geste : il n'est jamais retardé.
 */

/** Du relâcher du premier toucher à l'appui du second. Android : 300 ms ; ici plus court, c'est le délai d'ouverture d'un média. */
export const DOUBLE_TAP_GAP_MS = 200;
/** Les deux touchers d'un double tombent à cette distance l'un de l'autre au plus. */
export const DOUBLE_TAP_SLOP_PX = 24;
/** Au-delà, l'appui a glissé (balayage, défilement) : son clic n'est pas un toucher. */
export const TAP_MOVE_SLOP_PX = 10;

export type TapKind = 'plain' | 'media' | 'control';

type Point = { readonly x: number; readonly y: number; readonly at: number };

type Armed = Point & {
  readonly messageId: string;
  readonly held: boolean;
  readonly secondDownAt: number | null;
};

export type TapState = { readonly down: Point | null; readonly armed: Armed | null };

export const IDLE_TAP: TapState = { down: null, armed: null };

export type TapEvent =
  | { readonly type: 'down'; readonly x: number; readonly y: number; readonly at: number }
  | {
      readonly type: 'click';
      readonly x: number;
      readonly y: number;
      readonly at: number;
      readonly kind: TapKind;
      readonly messageId: string;
    }
  | { readonly type: 'expire'; readonly at: number }
  | { readonly type: 'cancel' };

/**
 * `pass` : laisser le clic suivre son cours ; `hold` : le retenir ;
 * `release` : rendre le clic retenu ; `drop` : l'abandonner (le second appui
 * est devenu autre chose, un appui long ou un glissé) ; `double` : le geste.
 */
export type TapEffect = 'pass' | 'hold' | 'release' | 'drop' | 'double';

export type TapStep = { readonly state: TapState; readonly effects: readonly TapEffect[] };

const distance = (a: { readonly x: number; readonly y: number }, b: { readonly x: number; readonly y: number }): number =>
  Math.hypot(a.x - b.x, a.y - b.y);

const releaseOf = (armed: Armed | null): readonly TapEffect[] => (armed?.held === true ? ['release'] : []);

function onDown(state: TapState, event: Extract<TapEvent, { type: 'down' }>): TapStep {
  const point = { x: event.x, y: event.y, at: event.at };
  const { armed } = state;
  if (armed === null) return { state: { down: point, armed: null }, effects: [] };
  const second = armed.secondDownAt === null && event.at - armed.at <= DOUBLE_TAP_GAP_MS && distance(armed, point) <= DOUBLE_TAP_SLOP_PX;
  if (second) return { state: { down: point, armed: { ...armed, secondDownAt: event.at } }, effects: [] };
  return { state: { down: point, armed: null }, effects: releaseOf(armed) };
}

function onClick(state: TapState, event: Extract<TapEvent, { type: 'click' }>): TapStep {
  const { down, armed } = state;
  const isTap = down !== null && event.at - down.at < LONG_PRESS_MS && distance(down, event) <= TAP_MOVE_SLOP_PX;
  if (!isTap || event.kind === 'control') return { state: IDLE_TAP, effects: [...releaseOf(armed), 'pass'] };
  if (armed !== null && armed.secondDownAt !== null && armed.messageId === event.messageId) {
    return { state: IDLE_TAP, effects: ['double'] };
  }
  const held = event.kind === 'media';
  return {
    state: { down: null, armed: { x: event.x, y: event.y, at: event.at, messageId: event.messageId, held, secondDownAt: null } },
    effects: [...releaseOf(armed), held ? 'hold' : 'pass'],
  };
}

function onExpire(state: TapState, at: number): TapStep {
  const deadline = nextTapDeadline(state);
  if (deadline === null || at < deadline || state.armed === null) return { state, effects: [] };
  if (state.armed.secondDownAt === null) return { state: IDLE_TAP, effects: releaseOf(state.armed) };
  return { state: IDLE_TAP, effects: state.armed.held ? ['drop'] : [] };
}

export function tapReducer(state: TapState, event: TapEvent): TapStep {
  switch (event.type) {
    case 'down':
      return onDown(state, event);
    case 'click':
      return onClick(state, event);
    case 'expire':
      return onExpire(state, event.at);
    case 'cancel':
      return { state: IDLE_TAP, effects: releaseOf(state.armed) };
    default:
      return { state, effects: [] };
  }
}

/** L'instant où le geste en cours doit être tranché sans nouvel événement — `null` au repos. */
export function nextTapDeadline(state: TapState): number | null {
  const { armed } = state;
  if (armed === null) return null;
  return armed.secondDownAt === null ? armed.at + DOUBLE_TAP_GAP_MS : armed.secondDownAt + LONG_PRESS_MS;
}

/**
 * Ce qu'ouvre un toucher simple sur une pièce : la tuile d'une photo, la surface d'une vidéo, un STICKER (sa fiche, #10630).
 * Une tuile voilée se révèle — c'est un contrôle.
 */
const MEDIA_OPENER = 'button[data-media-tile]:not([data-protected-attachment]), button[data-video-surface], button[data-sticker-open]';
const CONTROL =
  'a[href], button, input, textarea, select, summary, label, audio, video[controls], [role="button"], [role="checkbox"], [role="slider"], [role="link"], [contenteditable="true"], [contenteditable=""]';

/** La nature du toucher, lue sur la cible du clic, dans la rangée seulement. */
export function tapKindOf(target: EventTarget | null, row: Element): TapKind {
  if (!(target instanceof Element)) return 'control';
  const media = target.closest(MEDIA_OPENER);
  if (media !== null && row.contains(media)) return 'media';
  const control = target.closest(CONTROL);
  return control !== null && row.contains(control) && control !== row ? 'control' : 'plain';
}

/** L'élément à qui rendre un clic retenu : le bouton qui ouvre la pièce. */
export function mediaOpenerOf(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null;
  const opener = target.closest(MEDIA_OPENER);
  return opener instanceof HTMLElement ? opener : null;
}

/**
 * CE QU'UN DOUBLE TOUCHER PEUT RÉAGIR — ce que la capsule « + » offre
 * (`thread-modes.tsx`) : ni un message supprimé, ni un éphémère échu, ni un
 * envoi encore local (`cid_…`, que la passerelle ne connaît pas), ni un
 * message système (`ReactionService.addReaction` le refuse). C'est la même loi
 * qui monte, ou non, le rail du menu de l'appui long (#11206).
 */
export function doubleTapReactable(
  message: Pick<Message, 'id'> & Partial<Pick<Message, 'messageType'>> & Parameters<typeof protectionOf>[0],
  now: number,
): boolean {
  if (message.id.startsWith('cid_')) return false;
  if (message.messageType === 'system') return false;
  const protection = protectionOf(message, now);
  return protection !== 'deleted' && protection !== 'expired';
}
