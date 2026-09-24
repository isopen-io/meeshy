import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';

import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { gripPose, keyboardPose, pointerFraction, type GripOrigin } from '@/lib/stories/studio-grip';
import type { StudioPose } from '@/lib/stories/studio-pose';

/**
 * **LES POIGNÉES DU PLATEAU** (#6943) — ce par quoi un objet se DÉPLACE,
 * s'AGRANDIT et TOURNE. Deux cibles de 44 px posées aux coins de l'objet
 * sélectionné : la poignée de DÉPLACEMENT en tête, la poignée d'ÉCHELLE ET DE
 * ROTATION au coin opposé (la grammaire d'un éditeur à un seul doigt, là où
 * iOS a le pincement à deux doigts).
 *
 * **Deux lois que ce fichier tient :**
 *
 *  - **60 fps pendant le geste** — la pose se PEINT directement en `style`
 *    sur l'élément que le moteur a rendu, exactement les propriétés que
 *    `SceneObjectFrame.applyPose` écrit (`left`, `top`, `transform`) ; l'état
 *    React n'est touché qu'au RELÂCHEMENT. Une vue re-rendue à chaque image
 *    de pointeur ne peut pas être fluide.
 *  - **tout ce que le pointeur fait, le clavier le fait** — les poignées sont
 *    des `<button>` focusables, et `keyboardPose` y traduit flèches, `+`/`−`
 *    et `[`/`]`. Un plateau qui ne s'exploite qu'à la souris n'est pas livré
 *    (dimension 5).
 *
 * Ces poignées sont posées SUR la scène, et c'est la seule exception assumée
 * à « aucun contrôle ne se pose sur le canvas » (`apps/ios/CLAUDE.md` § 1) :
 * une poignée de manipulation directe n'est pas un RAIL — elle ne porte aucun
 * réglage, elle EST l'objet qu'on saisit. Tous les réglages, eux, vivent dans
 * le couloir droit (`story-compose-editor.tsx`).
 */

const TARGET = 44;

/** Les propriétés que `SceneObjectFrame.applyPose` écrit — mêmes noms, même
 * ordre de composition : deux formules de pose divergeraient au premier
 * ajustement, et le geste peindrait ailleurs que le rendu. */
function paintPose(element: HTMLElement, pose: StudioPose): void {
  element.style.left = `${pose.x * 100}%`;
  element.style.top = `${pose.y * 100}%`;
  element.style.transform = `translate(-50%, -50%) rotate(${pose.rotation}deg) scale(${pose.scale})`;
}

export type StudioHandlesProps = {
  readonly lang: InterfaceLanguage;
  /** Le NOM de l'objet, tel qu'un lecteur d'écran l'entendra (« Texte 2 »). */
  readonly name: string;
  readonly pose: StudioPose;
  /** Le plateau, ancêtre positionné commun à la scène et aux poignées. */
  readonly stageRef: { readonly current: HTMLElement | null };
  /**
   * L'IDENTIFIANT de l'objet, pas une `ref` vers son élément — et c'est un
   * piège d'ORDRE qui l'impose : les effets de mise en page d'un ENFANT
   * tournent AVANT ceux de son parent, donc une `ref` que l'hôte remplit dans
   * son propre `useLayoutEffect` est encore `null` quand la poignée mesure.
   * Elle ne se serait jamais affichée tant qu'un second rendu n'était pas
   * provoqué par ailleurs. La poignée retrouve donc elle-même son élément.
   */
  readonly objectId: string;
  readonly onCommit: (pose: StudioPose) => void;
};

/**
 * Le cadre de SÉLECTION et ses deux poignées. Le cadre lui-même est inerte
 * (`pointer-events: none`) : il MONTRE la sélection, il ne la capture pas —
 * sinon il mangerait la frappe dans la saisie de texte posée au même endroit.
 */
export function StudioObjectHandles({ lang, name, pose, stageRef, objectId, onCommit }: StudioHandlesProps) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const [box, setBox] = useState<{ readonly width: number; readonly height: number } | null>(null);
  // La pose EN COURS de geste — une ref, jamais un état : la lire ne doit
  // provoquer aucun rendu.
  const live = useRef(pose);
  live.current = pose;

  /** L'élément que le MOTEUR a peint pour CET objet — retrouvé à chaque
   * mesure, jamais mémorisé : la scène se re-rend à chaque frappe, et un
   * élément gardé serait détaché du document. */
  const painted = useCallback(
    (): HTMLElement | null => stageRef.current?.querySelector<HTMLElement>(`[data-scene-object-id="${CSS.escape(objectId)}"]`) ?? null,
    [objectId, stageRef],
  );

  /** La taille NON transformée de l'objet peint (`offsetWidth/Height`, avant
   * `scale`/`rotate`) : le cadre l'adopte puis subit la MÊME transformation,
   * donc il colle quelle que soit l'échelle. */
  const measure = useCallback(() => {
    const element = painted();
    if (element === null) {
      setBox((current) => (current === null ? current : null));
      return;
    }
    const width = element.offsetWidth;
    const height = element.offsetHeight;
    setBox((current) => (current !== null && current.width === width && current.height === height ? current : { width, height }));
  }, [painted]);

  useLayoutEffect(measure);

  useEffect(() => {
    const element = painted();
    if (element === null || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [measure, painted]);

  const applyLive = useCallback(
    (next: StudioPose) => {
      live.current = next;
      const element = painted();
      const frame = frameRef.current;
      if (element !== null) paintPose(element, next);
      if (frame !== null) paintPose(frame, next);
    },
    [painted],
  );

  const stageBox = () => {
    const rect = stageRef.current?.getBoundingClientRect();
    return rect === undefined ? { left: 0, top: 0, width: 0, height: 0 } : rect;
  };

  const onMoveDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    const stage = stageBox();
    const start = pointerFraction(stage, event.clientX, event.clientY);
    const origin = live.current;
    const move = (e: PointerEvent) => {
      const at = pointerFraction(stageBox(), e.clientX, e.clientY);
      applyLive({ ...live.current, x: clamp01(origin.x + (at.x - start.x)), y: clamp01(origin.y + (at.y - start.y)) });
    };
    const end = () => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', end);
      target.removeEventListener('pointercancel', end);
      onCommit(live.current);
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', end);
    target.addEventListener('pointercancel', end);
  };

  const onGripDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    const stage = stageBox();
    const origin: GripOrigin = {
      centerX: stage.left + live.current.x * stage.width,
      centerY: stage.top + live.current.y * stage.height,
      grabX: event.clientX,
      grabY: event.clientY,
      scale: live.current.scale,
      rotation: live.current.rotation,
    };
    const move = (e: PointerEvent) => applyLive(gripPose(live.current, origin, e.clientX, e.clientY));
    const end = () => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', end);
      target.removeEventListener('pointercancel', end);
      onCommit(live.current);
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', end);
    target.addEventListener('pointercancel', end);
  };

  /** Le clavier COMMET directement : il n'y a pas de geste continu à
   * absorber, et chaque frappe doit être annulable comme une action. */
  const onKey = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    const next = keyboardPose(live.current, event.key, event.shiftKey);
    if (next === null) return;
    event.preventDefault();
    onCommit(next);
  };

  if (box === null) return null;

  return (
    <div
      ref={frameRef}
      data-story-object-frame
      className="absolute"
      style={{
        width: box.width,
        height: box.height,
        left: `${pose.x * 100}%`,
        top: `${pose.y * 100}%`,
        transform: `translate(-50%, -50%) rotate(${pose.rotation}deg) scale(${pose.scale})`,
        outline: '1px dashed rgba(255,255,255,0.85)',
        outlineOffset: 4,
        pointerEvents: 'none',
      }}
    >
      <button
        type="button"
        data-story-object-move
        aria-label={translate(lang, 'story.studio.pose.handle', { name })}
        title={translate(lang, 'story.studio.pose.handle', { name })}
        onPointerDown={onMoveDown}
        onKeyDown={onKey}
        className="absolute grid place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{
          width: TARGET,
          height: TARGET,
          insetInlineStart: -TARGET / 2,
          top: -TARGET / 2,
          pointerEvents: 'auto',
          touchAction: 'none',
          color: '#fff',
          backgroundColor: 'rgba(0,0,0,0.55)',
          outlineColor: 'var(--color-ios-brand)',
        }}
      >
        <span aria-hidden="true">✥</span>
      </button>
      <button
        type="button"
        data-story-object-grip
        aria-label={translate(lang, 'story.studio.pose.grip', { name })}
        title={translate(lang, 'story.studio.pose.grip', { name })}
        onPointerDown={onGripDown}
        onKeyDown={onKey}
        className="absolute grid place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{
          width: TARGET,
          height: TARGET,
          insetInlineEnd: -TARGET / 2,
          bottom: -TARGET / 2,
          pointerEvents: 'auto',
          touchAction: 'none',
          color: '#fff',
          backgroundColor: 'rgba(0,0,0,0.55)',
          outlineColor: 'var(--color-ios-brand)',
        }}
      >
        <span aria-hidden="true">⤡</span>
      </button>
    </div>
  );
}

const clamp01 = (value: number): number => (Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0.5);
