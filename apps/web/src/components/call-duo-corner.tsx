import { useRef, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';

import type { CameraOffStage } from '@/components/call-camera-off';
import { StreamVideo } from '@/components/call-media-elements';
import { CallTileNameplate } from '@/components/call-tile-nameplate';
import { useTileDrag, type TileOffset } from '@/components/use-tile-drag';
import { useTilePinch } from '@/components/use-tile-pinch';
import { STOW_REDUCED_MS } from '@/lib/calls/call-pill-motion';
import { cornerAfterArrow } from '@/lib/calls/call-self-tile-gestures';
import { HeldSwap } from '@/lib/calls/use-pill-motion';
import type { ActiveCall } from '@/lib/calls/call-store';
import type { SelfTileCorner, SelfTileScale } from '@/lib/calls/call-self-tile';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { useFlip } from '@/lib/use-flip';

/**
 * **LA VIGNETTE DU COIN, EN DUO VIDÉO** (#8577, #8747, #17982) — ma caméra, ou l'autre une fois permutée. Elle paraît
 * et repart en fondu, retenue le temps de sa sortie avec ce qu'elle montrait (loi 17) ; elle porte la plaque de verre
 * de son nom (« Vous », la même qu'en groupe, `CallTileNameplate`), lue par le lecteur d'écran avec son geste ; et
 * l'image de l'autre y cède à son avatar en fondu (loi 17.12, la scène noire de `CameraOffStage`).
 *
 * Chargée à part (`call-stage.tsx` › `duoCornerView`) : elle n'importe rien de l'écran d'appel, qui lui REMET sa place
 * et la scène noire, déjà calculées par la loi de ma vignette (`call-self-tile.ts`). Ses GESTES vivent ici (#17930) :
 * pincer (x1 · x2 · x3, Ctrl + molette), glisser de coin en coin, les flèches au clavier, et le FLIP qui joue tout
 * changement de place — jamais left/top/width/height ; `call_overlay` ne les porte pas.
 */

/** Ce que montre la vignette du coin, retenu le temps de sa sortie : elle repart avec la personne qu'elle montrait. */
export type CornerSight = { readonly swapped: boolean; readonly video: boolean; readonly stream: MediaStream | null; readonly name: string; readonly muted: boolean; readonly peerId: string | undefined };

/** La place de ma vignette telle que la scène la calcule, et ce qu'un geste en fait : la loi reste dans l'écran d'appel. */
export type CornerPlace = {
  readonly scale: SelfTileScale;
  readonly corner: SelfTileCorner;
  /** Son coin de repos, à sa taille et à son échelle, sans le geste en cours. */
  readonly place: CSSProperties;
  readonly look: { readonly rim: number; readonly radius: string; readonly plate: number; readonly origin: string; readonly avatar: number };
  /** La FORME que joue le FLIP (palier, coin, fenêtre couchée…), sans le geste ; `null` : la vignette n'est pas là. */
  readonly shape: string | null;
  /** Le coin où le lâcher d'un glissé la pose. */
  readonly dropAt: (offset: TileOffset) => SelfTileCorner;
  readonly onScale: (scale: SelfTileScale) => void;
  readonly onCorner: (corner: SelfTileCorner) => void;
};

/** Le tempo d'un changement de coin : celui de l'ancienne transition. */
const SELF_TILE_FLIP_MS = 300;

const both =
  <E,>(first: (event: E) => void, second: (event: E) => void) =>
  (event: E): void => {
    first(event);
    second(event);
  };

/** Pincer, glisser, les flèches : ce que mes gestes font de ma vignette, et le FLIP qui joue sa nouvelle place. */
function useCornerGestures(tile: CornerPlace, swapped: boolean) {
  const pinch = useTilePinch(tile.scale, tile.onScale);
  const drag = useTileDrag((offset) => {
    const next = tile.dropAt(offset);
    if (next !== tile.corner) tile.onCorner(next);
  });
  const offset = swapped ? null : drag.offset;
  const frame = useRef<HTMLDivElement>(null);
  useFlip(frame, {
    key: tile.shape === null ? null : `${tile.shape}:${offset === null}`,
    origin: { x: tile.corner.endsWith('left') ? 0 : 1, y: tile.corner.startsWith('top') ? 0 : 1 },
    held: offset !== null,
    duration: SELF_TILE_FLIP_MS,
    reducedDuration: STOW_REDUCED_MS,
    easing: 'ease-out',
    /* W1.20 : la colonne qui entre ou repart fait glisser la scène vers son nouveau centre (`useFollowInline`, `call-screen.tsx`) ; elle porte ma vignette d'une part du chemin, le FLIP n'en joue que le reste. */
    carrier: '[data-call-stage-surface]',
  });
  const onArrow = (event: KeyboardEvent<HTMLButtonElement>): void => {
    const next = swapped ? null : cornerAfterArrow(tile.corner, event.key);
    if (next === null) return;
    event.preventDefault();
    tile.onCorner(next);
  };
  return {
    offset,
    frame,
    onArrow,
    pinchStyle: pinch.style,
    place: { ...tile.place, transform: offset === null ? undefined : `translate(${offset.dx}px, ${offset.dy}px)` },
    gestures: {
      onPointerDown: both(pinch.onPointerDown, drag.onPointerDown),
      onPointerMove: both(pinch.onPointerMove, drag.onPointerMove),
      onPointerUp: both(pinch.onPointerUp, drag.onPointerUp),
      onPointerCancel: both(pinch.onPointerCancel, drag.onPointerCancel),
      onClickCapture: both(pinch.onClickCapture, drag.onClickCapture),
      onWheel: pinch.onWheel,
    },
  };
}

type Props = {
  readonly call: ActiveCall;
  readonly language: InterfaceLanguage;
  readonly sight: CornerSight | null;
  readonly tile: CornerPlace;
  readonly swapped: boolean;
  readonly composed: boolean;
  readonly compact: boolean;
  readonly color: string;
  readonly hint: string;
  readonly onTap: () => void;
  readonly pressed: { readonly press: () => void; readonly clear: () => void };
  readonly mirrored: boolean;
  readonly Off: typeof CameraOffStage;
  readonly zoom: ReactNode;
};

export function DuoCorner({ call, language, sight, tile, swapped, composed, compact, color, hint, onTap, pressed, mirrored, Off, zoom }: Props) {
  const { look } = tile;
  const { offset, frame, onArrow, pinchStyle, place, gestures } = useCornerGestures(tile, swapped);
  return (
    <HeldSwap value={sight} shape="fade" className="pointer-events-none absolute inset-0 z-10" data-call-corner-slot="">
      {(shown) => (
        <div
          ref={frame}
          className={`absolute ${composed ? 'pointer-events-none opacity-0' : 'pointer-events-auto'}`}
          style={place}
          {...(composed ? { 'aria-hidden': true, inert: true } : {})}
          data-call-corner-frame=""
          data-call-self-tile-composed={composed ? '' : undefined}
          data-call-self-tile-corner={tile.corner}
          data-call-self-tile-compact={compact ? '' : undefined}
          data-call-self-tile-dragging={offset === null ? undefined : ''}
        >
          <button
            type="button"
            aria-label={`${shown.name} · ${translate(language, 'call.video.swap')}`}
            aria-describedby={swapped ? undefined : hint}
            onPointerDownCapture={pressed.press}
            onClick={onTap}
            onKeyDown={(event) => {
              pressed.clear();
              onArrow(event);
            }}
            className={`relative z-10 grid size-full place-items-center overflow-hidden border-2 shadow-lg ${swapped ? '' : offset === null ? 'cursor-grab' : 'cursor-grabbing'}`}
            {...(swapped ? {} : gestures)}
            style={{ background: 'var(--color-scrim-soft)', borderColor: color, borderWidth: look.rim, borderRadius: look.radius, ...(swapped ? {} : { ...pinchStyle, transformOrigin: look.origin }) }}
            data-call-corner=""
            data-call-self-tile={swapped ? undefined : String(tile.scale)}
          >
            {shown.swapped ? (
              <Off videoOn={shown.video} video={<StreamVideo stream={shown.stream} mirrored={false} className="size-full" member={shown.peerId} />} name={call.title} avatar={call.avatar} presenceKey={call.peerKey ?? undefined} color={color} speech={null} label={null} size={look.avatar} />
            ) : (
              <StreamVideo stream={shown.stream} mirrored={mirrored} className="size-full" self />
            )}
            <CallTileNameplate name={shown.name} muted={shown.muted} scale={look.plate} />
          </button>
          {zoom}
        </div>
      )}
    </HeldSwap>
  );
}
