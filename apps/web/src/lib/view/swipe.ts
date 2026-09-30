/**
 * **LA LOI DU GLISSÉ LATÉRAL** (#7559) — miroir de `BubbleSwipeResistance`
 * (`apps/ios/.../BubbleSwipeResistance.swift`), UNE source pour le glissé d'un
 * commentaire (#8583, `comment-swipe.ts` en est la projection « répondre
 * seul ») et pour celui d'un message (répondre dans un sens, transférer dans
 * l'autre). Aucun DOM ici, sauf `swipeYieldsTo`, qui ne lit qu'un ancêtre.
 *
 * - engagement : un glissé HORIZONTAL FRANC — 3:1 au-delà de 22 px, ou 4:1
 *   au-delà de 48 px pour une bulle audio/vidéo, dont la piste de lecture se
 *   dispute le même geste (`SwipeResistance.resistant`) ;
 * - piste : suivi 1:1 jusqu'à 72 px, élastique à 15 % au-delà ;
 * - validation : 66 px dans le sens de l'action.
 */

export type SwipeResistance = 'normal' | 'resistant';

export const SWIPE_ACTION_ZONE = 72;
export const SWIPE_RUBBER_BAND = 0.15;
export const SWIPE_COMMIT_DISTANCE = 66;

export function swipeMinimumDistance(resistance: SwipeResistance): number {
  return resistance === 'resistant' ? 48 : 22;
}

export function swipeDominanceRatio(resistance: SwipeResistance): number {
  return resistance === 'resistant' ? 4 : 3;
}

/** Un glissé HORIZONTAL FRANC — sinon le geste appartient au défilement. */
export function swipeEngages(dx: number, dy: number, resistance: SwipeResistance): boolean {
  const horizontal = Math.abs(dx);
  return horizontal > Math.abs(dy) * swipeDominanceRatio(resistance) && horizontal > swipeMinimumDistance(resistance);
}

/** Le doigt est suivi 1:1 jusqu'à la zone d'action, puis l'élastique freine. */
export function swipeTrackedOffset(dx: number): number {
  const horizontal = Math.abs(dx);
  if (horizontal <= SWIPE_ACTION_ZONE) return dx;
  return Math.sign(dx) * (SWIPE_ACTION_ZONE + (horizontal - SWIPE_ACTION_ZONE) * SWIPE_RUBBER_BAND);
}

/** Un décalage ORIENTÉ vers l'action (positif) a atteint le seuil. */
export function swipeCommits(offset: number): boolean {
  return offset >= SWIPE_COMMIT_DISTANCE;
}

/** Avancement de 0 à 1 jusqu'au seuil, quel que soit le sens. */
export function swipeProgress(offset: number): number {
  return Math.min(1, Math.max(0, Math.abs(offset) / SWIPE_COMMIT_DISTANCE));
}

/**
 * LA TRANSLATION LUE DANS LE SENS DE LECTURE — en arabe, « vers la droite »
 * se lit « depuis le bord de DÉBUT » (`ReadingDirection.readingDelta` d'iOS).
 */
export function readingDelta(dx: number, direction: 'ltr' | 'rtl'): number {
  return direction === 'rtl' ? -dx : dx;
}

/** Une pièce audio ou vidéo porte une piste qu'on parcourt au doigt. */
export function swipeResistanceOf(attachments: readonly { readonly mimeType: string }[] | undefined): SwipeResistance {
  return (attachments ?? []).some((piece) => piece.mimeType.startsWith('audio/') || piece.mimeType.startsWith('video/'))
    ? 'resistant'
    : 'normal';
}

/**
 * LE SENS DE LA RÉPONSE (`BubbleSwipeResistance.replyDirection`) : une rangée
 * PLATE (Focal, Script) répond toujours vers la droite — tous ses messages
 * sont alignés pareil ; une BULLE répond vers le côté qui « pointe vers
 * l'expéditeur » — à gauche pour un message envoyé. Transférer est l'opposé.
 */
export function replyDirectionOf({ flat, isMine }: { readonly flat: boolean; readonly isMine: boolean }): 1 | -1 {
  return flat || !isMine ? 1 : -1;
}

export type MessageSwipeRules = {
  readonly resistance: SwipeResistance;
  readonly replyDirection: 1 | -1;
  /** Faux ⇒ glisser dans le sens de la réponse ne déplace rien (vue unique). */
  readonly canReply: boolean;
  /** Faux ⇒ glisser dans le sens du transfert ne déplace rien (`canForward` du menu). */
  readonly canForward: boolean;
};

const actsToward = (offset: number, rules: MessageSwipeRules): boolean =>
  offset * rules.replyDirection >= 0 ? rules.canReply : rules.canForward;

/**
 * Le décalage à peindre pour `(dx, dy)` — déjà lu dans le sens de lecture —,
 * `null` tant que le geste n'est pas un glissé franc. Un sens qui n'a pas
 * d'action rend `0` : la rangée ne promet pas un geste qui ne fera rien.
 */
export function messageSwipeOffset(dx: number, dy: number, rules: MessageSwipeRules): number | null {
  if (!swipeEngages(dx, dy, rules.resistance)) return null;
  const offset = swipeTrackedOffset(dx);
  return actsToward(offset, rules) ? offset : 0;
}

export type SwipeOutcome = 'reply' | 'forward';

/** Ce que RELÂCHER à ce décalage déclenche — `null` en deçà du seuil. */
export function messageSwipeOutcome(offset: number, rules: MessageSwipeRules): SwipeOutcome | null {
  const directed = offset * rules.replyDirection;
  if (swipeCommits(directed) && rules.canReply) return 'reply';
  if (swipeCommits(-directed) && rules.canForward) return 'forward';
  return null;
}

/**
 * UN GESTE NÉ SUR UNE PISTE DE LECTURE N'EST PAS UN GLISSÉ DE RANGÉE — le
 * curseur d'une vidéo, l'onde d'un vocal (`role="slider"`), ou toute couche
 * qui réclame le geste (`[data-claims-gesture]`, `shortcut-scope.ts`) : c'est
 * `isGestureOwnershipClaimed` d'iOS, lu à la source du geste plutôt que
 * remonté par une préférence.
 */
export function swipeYieldsTo(target: EventTarget | null): boolean {
  if (target === null || typeof Element === 'undefined' || !(target instanceof Element)) return false;
  return target.closest('[role="slider"], [data-claims-gesture], input[type="range"]') !== null;
}
