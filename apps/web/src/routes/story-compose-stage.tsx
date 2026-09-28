import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react';

import { pointerFraction } from '@/lib/stories/studio-grip';
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
 *  - le DOUBLE-TAP ouvre son édition.
 *
 * **60 fps pendant le glissé** : la pose se PEINT sur l'élément que le moteur
 * a rendu (`left`/`top`/`transform`, les propriétés de `SceneObjectFrame`) ;
 * l'état React ne change qu'au relâchement, et à l'entrée ou la sortie d'un
 * aimant.
 *
 * Le calque couvre la scène ; en ÉDITION d'un texte, la saisie passe
 * au-dessus de lui (l'hôte l'élève), pour que le curseur se pose au doigt.
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

type Press = {
  readonly id: string | null;
  readonly x: number;
  readonly y: number;
  readonly origin: StudioPose | null;
  readonly start: { readonly x: number; readonly y: number };
  moved: boolean;
  menu: boolean;
  pose: StudioPose | null;
  timer: ReturnType<typeof setTimeout> | null;
};

export function StudioStageGestures({
  stageRef,
  objects,
  locked,
  onSelect,
  onEdit,
  onCommit,
  onMenu,
}: {
  readonly stageRef: { readonly current: HTMLElement | null };
  /** Les objets SAISISSABLES (textes écrits, calque), avec leur pose. */
  readonly objects: readonly StudioStageObject[];
  readonly locked: boolean;
  readonly onSelect: (id: string | null) => void;
  readonly onEdit: (id: string) => void;
  readonly onCommit: (id: string, pose: StudioPose) => void;
  readonly onMenu: (id: string, point: { readonly x: number; readonly y: number }) => void;
}) {
  const press = useRef<Press | null>(null);
  const lastTap = useRef<{ readonly id: string; readonly at: number } | null>(null);
  const [engaged, setEngaged] = useState<SnapEngaged | null>(null);

  useEffect(() => () => {
    if (press.current?.timer) clearTimeout(press.current.timer);
  }, []);

  /** L'objet SOUS le doigt — le plus haut peint (le dernier du DOM). */
  const hit = (x: number, y: number): string | null => {
    const stage = stageRef.current;
    if (stage === null) return null;
    const ids = new Set(objects.map((object) => object.id));
    const painted = [...stage.querySelectorAll<HTMLElement>('[data-scene-object-id]')].filter((element) => ids.has(element.dataset.sceneObjectId ?? ''));
    const found = painted.reverse().find((element) => {
      const box = element.getBoundingClientRect();
      return x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;
    });
    return found?.dataset.sceneObjectId ?? null;
  };

  const paintedOf = (id: string): HTMLElement | null =>
    stageRef.current?.querySelector<HTMLElement>(`[data-scene-object-id="${CSS.escape(id)}"]`) ?? null;

  const stageBox = () => stageRef.current?.getBoundingClientRect() ?? { left: 0, top: 0, width: 0, height: 0 };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (locked || event.button !== 0) return;
    const id = hit(event.clientX, event.clientY);
    const origin = id === null ? null : (objects.find((object) => object.id === id)?.pose ?? null);
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const current: Press = {
      id,
      x: event.clientX,
      y: event.clientY,
      origin,
      start: pointerFraction(stageBox(), event.clientX, event.clientY),
      moved: false,
      menu: false,
      pose: null,
      timer: null,
    };
    if (id !== null) {
      current.timer = setTimeout(() => {
        current.menu = true;
        onMenu(id, { x: current.x, y: current.y });
      }, LONG_PRESS_MS);
    }
    press.current = current;
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = press.current;
    if (current === null || current.menu || current.id === null || current.origin === null) return;
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
    const element = paintedOf(current.id);
    if (element !== null) paintPose(element, snapped.pose);
    setEngaged((previous) => (previous !== null && previous.x === snapped.engaged.x && previous.y === snapped.engaged.y ? previous : snapped.engaged));
  };

  const onPointerUp = () => {
    const current = press.current;
    press.current = null;
    if (current === null) return;
    if (current.timer !== null) clearTimeout(current.timer);
    setEngaged(null);
    if (current.menu) return;
    if (current.moved && current.id !== null && current.pose !== null) {
      onSelect(current.id);
      onCommit(current.id, current.pose);
      return;
    }
    if (current.id === null) {
      lastTap.current = null;
      onSelect(null);
      return;
    }
    const now = Date.now();
    const previous = lastTap.current;
    if (previous !== null && previous.id === current.id && now - previous.at < DOUBLE_TAP_MS) {
      lastTap.current = null;
      onEdit(current.id);
      return;
    }
    lastTap.current = { id: current.id, at: now };
    onSelect(current.id);
  };

  /** Le CLIC DROIT au bureau — le même menu que l'appui long. */
  const onContextMenu = (event: ReactMouseEvent<HTMLDivElement>) => {
    const id = hit(event.clientX, event.clientY);
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
