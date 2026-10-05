import { useLayoutEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode, type RefObject } from 'react';

import type { CallCaption } from '@/lib/calls/call-captions';
import { companionCapacity, companionCorner, companionLayout, companionRestingLeft, companionTileSize, otherCorner, speakingPeers, type CompanionCorner, type CompanionTile } from '@/lib/calls/call-effects-companions';
import { translateCallStudio } from '@/lib/i18n-call-studio-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

/**
 * **LES AUTRES, PENDANT QUE J'APPLIQUE UN EFFET** (#8737) — miroir de
 * `CallEffectsCompanionStrip.swift`. Le mode Effets pose MON image en plein
 * écran ; les autres restent à l'écran dans un bloc posé en haut, sous la zone
 * sûre, dans la bande LIBRE au-dessus des commandes du mode (mesurée : jamais
 * il ne les couvre). Le duo en est le cas à un seul accompagnant : une vignette
 * de la taille de la mienne ; au-delà, une bande de verre, trois au plus et
 * « +N ». Le doigt l'emmène d'un coin du haut à l'autre ; au clavier et au
 * lecteur d'écran, « Changer de côté ».
 *
 * Le bloc vit HORS de l'aperçu capturé (`data-call-mode-preview`), et la
 * capture lit ma vidéo par son élément nommé : une vignette posée ici n'entre
 * jamais dans une photo ni dans un film du mode.
 */

/** Un autre participant, remis par l'écran d'appel dans l'ordre d'arrivée, avec son corps (sa vidéo, sinon son portrait). */
export type EffectsCompanion = {
  readonly id: string;
  readonly name: string;
  readonly color: string;
  readonly render: (width: number) => ReactNode;
};

const MARGIN = 16;
const INSET = 6;
const SPACING = 8;
const CHIP = 44;
const GAP = 12;
const TOP = 'calc(env(safe-area-inset-top) + 0.75rem)';

type Room = { readonly width: number; readonly height: number };

type Drag = { readonly pointerId: number; readonly x: number; readonly y: number; readonly dx: number; readonly dy: number };

const viewportWidth = (): number => (typeof window === 'undefined' ? 390 : window.innerWidth);

/** Un élément que le moteur n'a pas mis en page (rendu sans mise en page) ne borne rien. */
const unlaid = (box: DOMRect): boolean => box.width === 0 && box.height === 0;

/** La bande libre : toute la largeur, de sous la zone sûre au-dessus des commandes du mode. */
function useRoom(band: RefObject<HTMLElement | null>, floor: RefObject<HTMLElement | null>): readonly [Room, boolean] {
  const [room, setRoom] = useState<Room>({ width: viewportWidth(), height: Number.POSITIVE_INFINITY });
  const [rtl, setRtl] = useState(false);
  useLayoutEffect(() => {
    const measure = (): void => {
      const top = band.current?.getBoundingClientRect();
      const bottom = floor.current?.getBoundingClientRect();
      const width = top === undefined || top.width === 0 ? viewportWidth() : top.width;
      const height = top === undefined || bottom === undefined || unlaid(bottom) ? Number.POSITIVE_INFINITY : bottom.top - top.top - GAP;
      setRoom((last) => (last.width === width && last.height === height ? last : { width, height }));
      setRtl(band.current !== null && typeof getComputedStyle === 'function' && getComputedStyle(band.current).direction === 'rtl');
    };
    measure();
    window.addEventListener('resize', measure);
    const observer = typeof ResizeObserver === 'function' && floor.current !== null ? new ResizeObserver(measure) : null;
    if (observer !== null && floor.current !== null) observer.observe(floor.current);
    return () => {
      window.removeEventListener('resize', measure);
      observer?.disconnect();
    };
  }, [band, floor]);
  return [room, rtl] as const;
}

type Companion = EffectsCompanion & CompanionTile;

/** La largeur du bloc, calculée et non mesurée : le coin se pose juste dès la première image, sans glisser depuis le bord. */
function blockWidthOf({ tiles, tileWidth, chip, single }: { readonly tiles: number; readonly tileWidth: number; readonly chip: boolean; readonly single: boolean }): number {
  const items = tiles + (chip ? 1 : 0);
  const content = tiles * tileWidth + (chip ? CHIP : 0) + Math.max(0, items - 1) * SPACING;
  return single ? content : content + 2 * INSET;
}

function CompanionView({ companion, width, height }: { readonly companion: Companion; readonly width: number; readonly height: number }) {
  return (
    <div
      className="relative grid shrink-0 place-items-center overflow-hidden rounded-card"
      style={{ width, height, background: 'var(--color-scrim-soft)', borderStyle: 'solid', borderColor: companion.color, borderWidth: companion.isSpeaking ? '4px' : '2px' }}
      data-call-effects-companion={companion.id}
      {...(companion.isSpeaking ? { 'data-call-effects-companion-speaking': '' } : {})}
    >
      {companion.render(width)}
      <span className="glass-call absolute bottom-1 left-1 max-w-[85%] truncate rounded-full px-1.5 text-[0.625rem] leading-4 text-on-media">{companion.name}</span>
    </div>
  );
}

export function CallEffectsCompanions({ language, companions, captions, floor }: { readonly language: InterfaceLanguage; readonly companions: readonly EffectsCompanion[]; readonly captions: readonly CallCaption[]; readonly floor: RefObject<HTMLElement | null> }) {
  const band = useRef<HTMLDivElement>(null);
  const [room, rtl] = useRoom(band, floor);
  const [corner, setCorner] = useState<CompanionCorner>('top-trailing');
  const [drag, setDrag] = useState<Drag | null>(null);

  const speaking = useMemo(() => speakingPeers(captions), [captions]);
  const tiles: readonly Companion[] = companions.map((companion) => ({ ...companion, isLocal: false, isSpeaking: speaking.has(companion.id) }));
  const everyone = companionLayout({ tiles, featuredId: null, capacity: 0 });
  const size = companionTileSize({ companionCount: everyone.overflow, freeHeight: room.height - 2 * INSET });
  const capacity = size === null ? 0 : companionCapacity({ availableWidth: room.width - 2 * (MARGIN + INSET), tileWidth: size.width, spacing: SPACING, chipWidth: CHIP, count: everyone.overflow });
  const layout = companionLayout({ tiles, featuredId: null, capacity });
  if (layout.companions.length === 0 && layout.overflow === 0) return null;

  const single = layout.companions.length === 1 && layout.overflow === 0;
  const blockWidth = blockWidthOf({ tiles: size === null ? 0 : layout.companions.length, tileWidth: size?.width ?? 0, chip: layout.overflow > 0, single });
  const left = companionRestingLeft({ corner, blockWidth, containerWidth: room.width, margin: MARGIN, rtl });
  const t = translateCallStudio;
  const grab = (event: PointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0 || (event.target as Element).closest('button') !== null) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDrag({ pointerId: event.pointerId, x: event.clientX, y: event.clientY, dx: 0, dy: 0 });
  };
  const follow = (event: PointerEvent<HTMLDivElement>): void => {
    if (drag === null || drag.pointerId !== event.pointerId) return;
    setDrag({ ...drag, dx: event.clientX - drag.x, dy: event.clientY - drag.y });
  };
  const release = (event: PointerEvent<HTMLDivElement>): void => {
    if (drag === null || drag.pointerId !== event.pointerId) return;
    const dropX = left + blockWidth / 2 + (event.clientX - drag.x);
    if (event.type === 'pointerup') setCorner(companionCorner({ dropX, containerWidth: room.width, rtl }));
    setDrag(null);
  };

  return (
    <div ref={band} className="pointer-events-none fixed inset-x-0 z-10" style={{ top: TOP }} data-call-effects-companions-band="">
      <div
        role="group"
        aria-label={t(language, 'callStudio.companions.label')}
        onPointerDown={grab}
        onPointerMove={follow}
        onPointerUp={release}
        onPointerCancel={release}
        className={`pointer-events-auto absolute top-0 flex cursor-grab touch-none select-none items-center ${single ? 'shadow-lg' : 'glass-call rounded-field-ios'} ${drag === null ? 'transition-[left,transform] duration-300 ease-out motion-reduce:transition-none' : 'cursor-grabbing'}`}
        style={{ left, gap: SPACING, padding: single ? 0 : INSET, transform: drag === null ? undefined : `translate(${drag.dx}px, ${drag.dy}px)` }}
        data-call-effects-companions=""
        data-call-effects-companions-corner={corner}
      >
        {size === null ? null : layout.companions.map((companion) => <CompanionView key={companion.id} companion={companion} width={size.width} height={size.height} />)}
        {layout.overflow > 0 ? (
          <span role="img" aria-label={t(language, 'callStudio.companions.more', { count: String(layout.overflow) })} className="grid shrink-0 place-items-center rounded-full bg-media-fill text-sm font-semibold text-on-media" style={{ width: CHIP, height: CHIP }} data-call-effects-companions-more="">
            {`+${layout.overflow}`}
          </span>
        ) : null}
        <button type="button" onClick={() => setCorner(otherCorner)} className="sr-only min-h-11 rounded-full px-3 text-mini font-semibold text-on-media focus:not-sr-only focus:bg-scrim-strong" data-call-effects-companions-move="">
          {t(language, 'callStudio.companions.move')}
        </button>
      </div>
    </div>
  );
}
