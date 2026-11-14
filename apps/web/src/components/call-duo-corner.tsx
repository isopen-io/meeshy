import type { CSSProperties, KeyboardEvent, PointerEventHandler, ReactNode, RefObject, WheelEventHandler, MouseEventHandler } from 'react';

import type { CameraOffStage } from '@/components/call-camera-off';
import { StreamVideo } from '@/components/call-media-elements';
import { CallTileNameplate } from '@/components/call-tile-nameplate';
import { HeldSwap } from '@/lib/calls/use-pill-motion';
import type { ActiveCall } from '@/lib/calls/call-store';
import type { SelfTileCorner, SelfTileScale } from '@/lib/calls/call-self-tile';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

/**
 * **LA VIGNETTE DU COIN, EN DUO VIDÉO** (#8577, #8747, #17982) — ma caméra, ou l'autre une fois permutée. Elle paraît
 * et repart en fondu, retenue le temps de sa sortie avec ce qu'elle montrait (loi 17) ; elle porte la plaque de verre
 * de son nom (« Vous », la même qu'en groupe, `CallTileNameplate`), lue par le lecteur d'écran avec son geste ; et
 * l'image de l'autre y cède à son avatar en fondu (loi 17.12, la scène noire de `CameraOffStage`).
 *
 * Chargée à part (`call-stage.tsx` › `duoCornerView`) : elle n'importe rien de l'écran d'appel, qui lui REMET sa place,
 * ses gestes et la scène noire, déjà calculés par la loi de ma vignette (`call-self-tile.ts`).
 */

/** Ce que montre la vignette du coin, retenu le temps de sa sortie : elle repart avec la personne qu'elle montrait. */
export type CornerSight = { readonly swapped: boolean; readonly video: boolean; readonly stream: MediaStream | null; readonly name: string; readonly muted: boolean; readonly peerId: string | undefined };

type Gestures = {
  readonly onPointerDown: PointerEventHandler;
  readonly onPointerMove: PointerEventHandler;
  readonly onPointerUp: PointerEventHandler;
  readonly onPointerCancel: PointerEventHandler;
  readonly onClickCapture: MouseEventHandler;
  readonly onWheel: WheelEventHandler;
};

/** La place de ma vignette, ses gestes et son habillage contre-mis à l'échelle, tels que l'écran les calcule. */
export type CornerTile = {
  readonly scale: SelfTileScale;
  readonly corner: SelfTileCorner;
  readonly offset: { readonly dx: number; readonly dy: number } | null;
  readonly gestures: Gestures;
  readonly pinchStyle: CSSProperties;
  readonly frame: RefObject<HTMLDivElement | null>;
  readonly place: CSSProperties;
  readonly look: { readonly rim: number; readonly radius: string; readonly plate: number; readonly origin: string; readonly avatar: number };
  readonly onArrow: (event: KeyboardEvent<HTMLButtonElement>) => void;
};

type Props = {
  readonly call: ActiveCall;
  readonly language: InterfaceLanguage;
  readonly sight: CornerSight | null;
  readonly tile: CornerTile;
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
  const { offset, look } = tile;
  return (
    <HeldSwap value={sight} shape="fade" className="pointer-events-none absolute inset-0 z-10" data-call-corner-slot="">
      {(shown) => (
        <div
          ref={tile.frame}
          className={`absolute ${composed ? 'pointer-events-none opacity-0' : 'pointer-events-auto'}`}
          style={tile.place}
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
              tile.onArrow(event);
            }}
            className={`relative z-10 grid size-full place-items-center overflow-hidden border-2 shadow-lg ${swapped ? '' : offset === null ? 'cursor-grab' : 'cursor-grabbing'}`}
            {...(swapped ? {} : tile.gestures)}
            style={{ background: 'var(--color-scrim-soft)', borderColor: color, borderWidth: look.rim, borderRadius: look.radius, ...(swapped ? {} : { ...tile.pinchStyle, transformOrigin: look.origin }) }}
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
