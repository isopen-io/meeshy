import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react';

import { pinchPose, pointerFraction } from '@/lib/stories/studio-grip';
import type { StudioPose } from '@/lib/stories/studio-pose';
import { snapPose, type SnapEngaged } from '@/lib/stories/studio-snap';
import { StudioManipulationLimits } from '@/routes/story-compose-limits';

/**
 * **LES GESTES SUR LA SCÈNE — UNE SÉLECTION SILENCIEUSE** (lot 6, directive
 * porteur 2026-09-27 soir, miroir iOS) :
 *  - TOUCHER un objet le sélectionne, sans l'entourer (ni contour, ni poignée) ;
 *  - le GLISSER le déplace, aimanté aux cibles d'iOS, avec le contour de la
 *    scène et les lignes magnétiques pendant le geste (#8413) ;
 *  - l'APPUI LONG (ou le clic droit au bureau) ouvre son menu d'actions ;
 *  - le DOUBLE-TAP ouvre son édition ;
 *  - DEUX DOIGTS le pincent et le tournent (#8515, miroir `handlePinch` /
 *    `handleRotation` d'iOS) — l'objet sous le premier doigt, sinon sous le
 *    milieu des deux ;
 *  - toucher le VIDE désélectionne (`onBackgroundTapped` d'iOS).
 *
 * **L'INVITE s'écrit au doigt** (#8515) : un texte VIDE n'est pas peint, le
 * moteur n'a donc rien à toucher — mais la saisie qui l'invite (« Écrivez… »)
 * est sous ce calque. Toucher sa boîte ouvre l'écriture (`onWrite`) : le
 * texte vide qu'elle cible, ou un texte neuf quand elle n'en cible aucun.
 *
 * **60 fps pendant le glissé** : la pose se PEINT sur l'élément que le moteur
 * a rendu (`left`/`top`/`transform`, les propriétés de `SceneObjectFrame`) ;
 * l'état React ne change qu'au relâchement, et à l'entrée ou la sortie d'un
 * aimant.
 *
 * Le calque couvre la scène ; en ÉDITION d'un texte, la saisie passe
 * au-dessus de lui (l'hôte l'élève), pour que le curseur se pose au doigt et
 * que le clavier écrive.
 */

const DRAG_THRESHOLD = 6;
const LONG_PRESS_MS = 500;
const DOUBLE_TAP_MS = 300;

export type StudioStageObject = { readonly id: string; readonly pose: StudioPose };

/** Les propriétés que `SceneObjectFrame.applyPose` écrit — mêmes noms, même
 * ordre de composition : deux formules divergeraient au premier ajustement. */
function paintPose(element: HTMLElement, pose: StudioPose): void {
  element.style.left = `${pose.x * 100}%`;
  element.style.top = `${pose.y * 100}%`;
  element.style.transform = `translate(-50%, -50%) rotate(${pose.rotation}deg) scale(${pose.scale})`;
}

const clamp01 = (value: number): number => (Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0.5);

type Point = { readonly x: number; readonly y: number };

/** Ce que le doigt touche : un objet PEINT, ou l'INVITE d'écriture (la boîte
 * de la saisie) — `id` nul quand l'invite ne cible aucun texte. */
type Hit = { readonly kind: 'object'; readonly id: string } | { readonly kind: 'invite'; readonly id: string | null };

type Press = {
  readonly hit: Hit | null;
  readonly x: number;
  readonly y: number;
  readonly origin: StudioPose | null;
  readonly start: Point;
  moved: boolean;
  menu: boolean;
  pose: StudioPose | null;
  timer: ReturnType<typeof setTimeout> | null;
};

/** Un pincement en cours — l'objet, sa pose et les deux doigts au départ. */
type Pinch = { readonly id: string; readonly origin: StudioPose; readonly from: readonly [Point, Point]; pose: StudioPose | null };

const inside = (box: DOMRect, x: number, y: number): boolean => x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;

export function StudioStageGestures({
  stageRef,
  objects,
  locked,
  onSelect,
  onEdit,
  onCommit,
  onMenu,
  onWrite,
}: {
  readonly stageRef: { readonly current: HTMLElement | null };
  /** Les objets SAISISSABLES (textes écrits, calque), avec leur pose. */
  readonly objects: readonly StudioStageObject[];
  readonly locked: boolean;
  readonly onSelect: (id: string | null) => void;
  readonly onEdit: (id: string) => void;
  readonly onCommit: (id: string, pose: StudioPose) => void;
  readonly onMenu: (id: string, point: { readonly x: number; readonly y: number }) => void;
  /** L'INVITE touchée — écrire le texte vide `id`, ou un texte neuf (`null`). */
  readonly onWrite: (id: string | null) => void;
}) {
  const press = useRef<Press | null>(null);
  const pinch = useRef<Pinch | null>(null);
  /** Les doigts posés — un pincement commence au SECOND. */
  const pointers = useRef(new Map<number, Point>());
  const lastTap = useRef<{ readonly id: string; readonly at: number } | null>(null);
  const [engaged, setEngaged] = useState<SnapEngaged | null>(null);

  useEffect(
    () => () => {
      if (press.current?.timer) clearTimeout(press.current.timer);
    },
    [],
  );

  /** Ce qui est SOUS le doigt — l'objet le plus haut peint (le dernier du
   * DOM), sinon l'invite. Une invite qui cible un texte ÉCRIT est ce texte. */
  const hit = (x: number, y: number): Hit | null => {
    const stage = stageRef.current;
    if (stage === null) return null;
    const ids = new Set(objects.map((object) => object.id));
    const painted = [...stage.querySelectorAll<HTMLElement>('[data-scene-object-id]')].filter((element) => ids.has(element.dataset.sceneObjectId ?? ''));
    const found = painted.reverse().find((element) => inside(element.getBoundingClientRect(), x, y))?.dataset.sceneObjectId;
    if (found !== undefined) return { kind: 'object', id: found };
    const invite = stage.querySelector<HTMLElement>('[data-story-text-input]');
    if (invite === null || !inside(invite.getBoundingClientRect(), x, y)) return null;
    const target = invite.dataset.storyTextTarget ?? null;
    return target !== null && ids.has(target) ? { kind: 'object', id: target } : { kind: 'invite', id: target };
  };

  const objectAt = (x: number, y: number): string | null => {
    const found = hit(x, y);
    return found?.kind === 'object' ? found.id : null;
  };

  const poseOf = (id: string): StudioPose | null => objects.find((object) => object.id === id)?.pose ?? null;

  const paintedOf = (id: string): HTMLElement | null =>
    stageRef.current?.querySelector<HTMLElement>(`[data-scene-object-id="${CSS.escape(id)}"]`) ?? null;

  const stageBox = () => stageRef.current?.getBoundingClientRect() ?? { left: 0, top: 0, width: 0, height: 0 };

  const clearPress = () => {
    if (press.current?.timer) clearTimeout(press.current.timer);
    press.current = null;
  };

  /** Le SECOND doigt — le pincement prend l'objet du premier, sinon celui du
   * milieu des deux ; sans objet, le geste n'a pas d'effet. */
  const startPinch = (): void => {
    const [a, b] = [...pointers.current.values()];
    if (a === undefined || b === undefined) return;
    const held = press.current?.hit?.kind === 'object' ? press.current.hit.id : null;
    const id = held ?? objectAt((a.x + b.x) / 2, (a.y + b.y) / 2);
    clearPress();
    const origin = id === null ? null : poseOf(id);
    if (id === null || origin === null) return;
    pinch.current = { id, origin, from: [a, b], pose: null };
    setEngaged({ x: null, y: null });
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (locked || event.button !== 0) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 2) {
      startPinch();
      return;
    }
    if (pointers.current.size > 2) return;
    const found = hit(event.clientX, event.clientY);
    const origin = found?.kind === 'object' ? poseOf(found.id) : null;
    const current: Press = {
      hit: found,
      x: event.clientX,
      y: event.clientY,
      origin,
      start: pointerFraction(stageBox(), event.clientX, event.clientY),
      moved: false,
      menu: false,
      pose: null,
      timer: null,
    };
    if (found?.kind === 'object') {
      current.timer = setTimeout(() => {
        current.menu = true;
        onMenu(found.id, { x: current.x, y: current.y });
      }, LONG_PRESS_MS);
    }
    press.current = current;
  };

  const movePinch = (active: Pinch) => {
    const [a, b] = [...pointers.current.values()];
    if (a === undefined || b === undefined) return;
    active.pose = pinchPose(active.origin, active.from, [a, b]);
    const element = paintedOf(active.id);
    if (element !== null) paintPose(element, active.pose);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (pointers.current.has(event.pointerId)) pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pinch.current !== null) {
      movePinch(pinch.current);
      return;
    }
    const current = press.current;
    if (current === null || current.menu || current.hit?.kind !== 'object' || current.origin === null) return;
    if (!current.moved && Math.hypot(event.clientX - current.x, event.clientY - current.y) < DRAG_THRESHOLD) return;
    if (!current.moved) {
      current.moved = true;
      if (current.timer !== null) clearTimeout(current.timer);
      setEngaged({ x: null, y: null });
    }
    const at = pointerFraction(stageBox(), event.clientX, event.clientY);
    const snapped = snapPose({
      ...current.origin,
      x: clamp01(current.origin.x + (at.x - current.start.x)),
      y: clamp01(current.origin.y + (at.y - current.start.y)),
    });
    current.pose = snapped.pose;
    const element = paintedOf(current.hit.id);
    if (element !== null) paintPose(element, snapped.pose);
    setEngaged((previous) => (previous !== null && previous.x === snapped.engaged.x && previous.y === snapped.engaged.y ? previous : snapped.engaged));
  };

  /** Le pincement se COMMET quand un doigt se lève — un seul pas d'historique. */
  const endPinch = (active: Pinch) => {
    pinch.current = null;
    setEngaged(null);
    lastTap.current = null;
    onSelect(active.id);
    if (active.pose !== null) onCommit(active.id, active.pose);
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    pointers.current.delete(event.pointerId);
    if (pinch.current !== null) {
      endPinch(pinch.current);
      return;
    }
    const current = press.current;
    press.current = null;
    if (current === null) return;
    if (current.timer !== null) clearTimeout(current.timer);
    setEngaged(null);
    if (current.menu) return;
    const found = current.hit;
    if (found?.kind === 'invite') {
      lastTap.current = null;
      onWrite(found.id);
      return;
    }
    if (found === null) {
      lastTap.current = null;
      onSelect(null);
      return;
    }
    if (current.moved && current.pose !== null) {
      onSelect(found.id);
      onCommit(found.id, current.pose);
      return;
    }
    const now = Date.now();
    const previous = lastTap.current;
    if (previous !== null && previous.id === found.id && now - previous.at < DOUBLE_TAP_MS) {
      lastTap.current = null;
      onEdit(found.id);
      return;
    }
    lastTap.current = { id: found.id, at: now };
    onSelect(found.id);
  };

  /** Le CLIC DROIT au bureau — le même menu que l'appui long. */
  const onContextMenu = (event: ReactMouseEvent<HTMLDivElement>) => {
    const id = objectAt(event.clientX, event.clientY);
    if (id === null || locked) return;
    event.preventDefault();
    onSelect(id);
    onMenu(id, { x: event.clientX, y: event.clientY });
  };

  return (
    <>
      {engaged !== null ? <StudioManipulationLimits engaged={engaged} /> : null}
      <div
        aria-hidden="true"
        data-story-stage-gestures
        className="absolute inset-0"
        style={{ zIndex: 3, touchAction: 'none' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onContextMenu={onContextMenu}
      />
    </>
  );
}
