import { lazy, Suspense, useState, type ReactNode } from 'react';
import { useStore } from 'zustand/react';

import { CallButton } from '@/components/call-glass-button';
import { CallGrid, Portrait } from '@/components/call-grid';
import { StreamVideo } from '@/components/call-media-elements';
import { GlyphSvg } from '@/components/glyph';
import { CALL_VIEW_GLYPHS } from '@/components/glyphs-call-view';
import { useTilePinch } from '@/components/use-tile-pinch';
import type { MineAction } from '@/lib/calls/call-controls';
import type { CallModeration } from '@/lib/calls/call-moderation';
import { inSelfGroup, selfRowBounds, selfRowsLayout, selfRowWidth, type SelfControlGroup, type SelfRow } from '@/lib/calls/call-self-controls';
import { selfTileScaleFor, selfTileSize, selfTileStore, setSelfTileScale, type SelfTileScale } from '@/lib/calls/call-self-tile';
import type { SpotlightChoice } from '@/lib/calls/call-spotlight';
import { useLocalZoom } from '@/lib/calls/self-zoom';
import type { ActiveCall } from '@/lib/calls/call-store';
import { hasVideo, orderedMembers, screenSharer, type CallLayout } from '@/lib/calls/call-view';
import { translateCallControls } from '@/lib/i18n-call-controls-catalog';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { cameraMirrored } from '@/lib/media/camera-mirror';

/**
 * **LA SCÈNE DE L'APPEL** (#6382, #8063, #8392) — ce que l'écran d'appel montre
 * sous ses commandes : la grille d'un groupe (et sa une), l'écran partagé d'un
 * pair en duo (ENTIER, `contain`), ou la vidéo plein cadre avec la vignette
 * locale en coin, qui s'inverse d'un toucher comme sur iOS.
 *
 * - Ma vignette en coin se PINCE (#8577) : x1 · x2 · x3, accrochée, retenue
 *   pour l'appel (`call-self-tile.ts`) ; Ctrl + molette de même.
 * - Les commandes de MA caméra (#8626) vivent AUTOUR de ma vignette (#8747) :
 *   Effets · Écran au-dessus, Retourner · Couper et le cran du zoom en
 *   dessous (`selfRowsLayout`) ; quand mon image passe en PLEIN ÉCRAN, elles
 *   montent en haut au centre. La vignette se pose 8 rem sous la zone sûre
 *   dans les deux cas : la rangée du haut tient entre elle et l'en-tête.
 * - Mon image en plein écran porte seule le zoom de ma caméra, chargé à part
 *   (`call-self-camera.tsx`). Tout se retire dans un mode.
 */

/** Ce que l'écran d'appel remet à la scène pour MON image. */
export type SelfView = {
  readonly full: boolean;
  readonly onToggle: () => void;
  /** Les commandes de ma caméra (rangée, zoom) — retirées dans un mode. */
  readonly controls: boolean;
  /** Les commandes de ma caméra offertes — la largeur des rangées autour de ma vignette. */
  readonly mine: readonly MineAction[];
  /** La rangée des commandes de ma caméra (#8626) : entière en haut au centre en plein écran, une moitié (`group`) de chaque côté de ma vignette (#8747). */
  readonly row: (group?: SelfControlGroup) => ReactNode;
  /** La colonne de la capsule du zoom, sur le bord. */
  readonly column: (capsule: ReactNode) => ReactNode;
};

const CallSelfCamera = lazy(() => import('./call-self-camera').then((module) => ({ default: module.CallSelfCamera })));

const TILE_SAID: Readonly<Record<SelfTileScale, 'callControls.selfTile.small' | 'callControls.selfTile.medium' | 'callControls.selfTile.large'>> = {
  1: 'callControls.selfTile.small',
  2: 'callControls.selfTile.medium',
  3: 'callControls.selfTile.large',
};

const viewport = () => (typeof window === 'undefined' ? { width: 390, height: 844 } : { width: window.innerWidth, height: window.innerHeight });

/** Mon image dans son aperçu (#8696) : la loi du miroir, jamais une condition locale. */
export const selfPreviewMirrored = (call: Pick<ActiveCall, 'facing' | 'screenSharing'>): boolean => cameraMirrored({ facing: call.facing, role: 'preview', screen: call.screenSharing });

const INK_2 = 'var(--color-on-media-3)';

type StageProps = {
  readonly call: ActiveCall;
  readonly layout: CallLayout;
  readonly language: InterfaceLanguage;
  readonly choice: SpotlightChoice;
  readonly onChoose: (choice: SpotlightChoice) => void;
  readonly immersive: boolean;
  readonly onToggleImmersive: () => void;
  readonly moderation: CallModeration | null;
  readonly self: SelfView;
};

const cornerTop = { top: 'calc(env(safe-area-inset-top) + 4.5rem)' } as const;

const CORNER_Y = 128;

const CORNER_RIGHT = 16;

const cornerBelowControls = { top: `calc(env(safe-area-inset-top) + ${CORNER_Y}px)` } as const;

/** Une moitié des commandes de ma caméra, posée hors de ma vignette (`row` est relatif au cadre de la vignette). */
function SelfRowSlot({ group, row, tile, children }: { readonly group: SelfControlGroup; readonly row: SelfRow; readonly tile: { readonly x: number; readonly y: number }; readonly children: ReactNode }) {
  return (
    <div
      className="absolute z-20 flex justify-center transition-[left,top] duration-200 motion-reduce:transition-none"
      style={{ left: row.x - tile.x, top: row.y - tile.y, width: row.width, height: row.height }}
      data-call-self-row={group}
      data-call-self-row-side={row.side}
    >
      {children}
    </div>
  );
}

const controlsTop = { top: 'calc(env(safe-area-inset-top) + 3.5rem)' } as const;

function DuoScreen({ call, language, immersive, onToggleImmersive }: Pick<StageProps, 'call' | 'language' | 'immersive' | 'onToggleImmersive'>) {
  const sharer = screenSharer(call.members);
  const selfMirrored = selfPreviewMirrored(call);
  if (sharer === null) return null;
  return (
    <div className="absolute inset-0" data-call-shared-screen="">
      <StreamVideo stream={call.remoteStreams[sharer.userId] ?? null} mirrored={false} fit="contain" className="absolute inset-0 size-full" label={translate(language, 'call.screen.peerSharing', { name: sharer.name })} member={sharer.userId} />
      {call.cameraOn && !immersive ? (
        <div className="absolute right-4 h-40 w-28 overflow-hidden rounded-card shadow-lg" style={cornerTop} data-call-corner="">
          <StreamVideo stream={call.localStream} mirrored={selfMirrored} className="size-full" self />
        </div>
      ) : null}
      <div className="absolute bottom-4 right-4 z-20" style={{ bottom: 'calc(env(safe-area-inset-bottom) + 6.5rem)' }} data-call-chrome-fade="">
        <CallButton
          label={translate(language, immersive ? 'call.fullscreen.exit' : 'call.fullscreen.enter')}
          glyph={<GlyphSvg glyph={CALL_VIEW_GLYPHS[immersive ? 'cornersIn' : 'cornersOut']} size={20} />}
          onPress={onToggleImmersive}
          tone="glass"
          prominent
          size={44}
          data={{ 'data-call-fullscreen': '' }}
        />
      </div>
    </div>
  );
}

function VideoDuo({ call, language, self }: Pick<StageProps, 'call' | 'language' | 'self'>) {
  const swapped = self.full;
  const scale = useStore(selfTileStore, (state) => selfTileScaleFor(state, call.callId ?? ''));
  const [said, setSaid] = useState('');
  const resize = (next: SelfTileScale): void => {
    setSelfTileScale(call.callId ?? '', next);
    setSaid(translateCallControls(language, TILE_SAID[next]));
  };
  const pinch = useTilePinch(scale, resize);
  const firstPeer = orderedMembers(call.members)[0];
  const remoteStream = firstPeer === undefined ? null : (call.remoteStreams[firstPeer.userId] ?? null);
  const remoteVideoOn = firstPeer !== undefined && firstPeer.cameraOn && hasVideo(remoteStream);
  const selfMirrored = selfPreviewMirrored(call);
  const local = useLocalZoom(call.callId, call.facing);
  const you = translate(language, 'call.you');
  const main = swapped ? call.localStream : remoteStream;
  const corner = swapped ? remoteStream : call.localStream;
  const mainOn = swapped ? call.cameraOn : remoteVideoOn;
  const cornerShown = swapped || call.cameraOn;
  const cornerVideo = swapped ? remoteVideoOn : call.cameraOn;
  const screen = viewport();
  const size = selfTileSize(scale, screen);
  const tileBox = { x: screen.width - CORNER_RIGHT - size.width, y: CORNER_Y, width: size.width, height: size.height };
  const count = (group: SelfControlGroup): number => self.mine.filter((action) => inSelfGroup(group, action)).length;
  const rows = swapped || !self.controls ? null : selfRowsLayout({ tile: tileBox, bounds: selfRowBounds(screen), effectsWidth: selfRowWidth(count('effects')), cameraWidth: selfRowWidth(count('camera') + 1) });
  const glyphs = { plus: <GlyphSvg glyph={CALL_VIEW_GLYPHS.plus} size={18} />, minus: <GlyphSvg glyph={CALL_VIEW_GLYPHS.minus} size={18} /> };
  return (
    <div className="absolute inset-0">
      {mainOn ? (
        <div className="absolute inset-0 overflow-hidden">
          <StreamVideo stream={main} mirrored={swapped && selfMirrored} zoom={swapped ? local.value : 1} className="absolute inset-0 size-full" label={swapped ? you : call.title} member={swapped ? undefined : firstPeer?.userId} self={swapped} />
        </div>
      ) : (
        <div className="absolute inset-0 grid place-items-center">
          <div className="flex flex-col items-center gap-3">
            <Portrait name={swapped ? you : call.title} avatar={swapped ? null : call.avatar} size={96} pulse={false} />
            <span className="text-body" style={{ color: INK_2 }}>
              {translate(language, swapped ? 'call.camera.off' : remoteStream === null ? 'call.video.connecting' : 'call.camera.peerOff')}
            </span>
          </div>
        </div>
      )}
      {swapped ? (
        <Suspense fallback={self.controls ? self.column(null) : null}>
          <CallSelfCamera stream={call.cameraOn && !call.screenSharing ? call.localStream : null} local={local} language={language} glyphs={glyphs} column={self.controls ? self.column : null} />
        </Suspense>
      ) : null}
      {swapped && self.controls ? (
        <div className="absolute left-1/2 z-20 -translate-x-1/2" style={controlsTop}>
          {self.row()}
        </div>
      ) : null}
      {cornerShown ? (
        <div className="absolute right-4 z-10 transition-[width,height] duration-200 motion-reduce:transition-none" style={{ ...cornerBelowControls, width: size.width, height: size.height }} data-call-corner-frame="">
          {rows?.effects ? (
            <SelfRowSlot group="effects" row={rows.effects} tile={tileBox}>
              {self.row('effects')}
            </SelfRowSlot>
          ) : null}
          <button
            type="button"
            aria-label={translate(language, 'call.video.swap')}
            onClick={self.onToggle}
            className="relative z-10 grid size-full place-items-center overflow-hidden rounded-card shadow-lg"
            {...(swapped ? {} : pinch)}
            style={{ background: 'var(--color-scrim-soft)', ...(swapped ? {} : pinch.style) }}
            data-call-corner=""
            data-call-self-tile={swapped ? undefined : String(scale)}
          >
            {cornerVideo ? <StreamVideo stream={corner} mirrored={!swapped && selfMirrored} zoom={swapped ? 1 : local.value} className="size-full" member={swapped ? firstPeer?.userId : undefined} self={!swapped} /> : <Portrait name={call.title} avatar={call.avatar} size={Math.round(size.width / 2)} pulse={false} />}
          </button>
          {rows?.camera ? (
            <SelfRowSlot group="camera" row={rows.camera} tile={tileBox}>
              {self.row('camera')}
            </SelfRowSlot>
          ) : null}
        </div>
      ) : null}
      <span role="status" aria-live="polite" className="sr-only" data-call-self-tile-status="">
        {said}
      </span>
    </div>
  );
}

export function CallStage({ call, layout, language, choice, onChoose, immersive, onToggleImmersive, moderation, self }: StageProps) {
  if (layout === 'grid') {
    return (
      <CallGrid
        members={orderedMembers(call.members)}
        remoteStreams={call.remoteStreams}
        self={{ stream: call.localStream, cameraOn: call.cameraOn, mirrored: selfPreviewMirrored(call) }}
        choice={choice}
        onChoose={onChoose}
        immersive={immersive}
        onToggleImmersive={onToggleImmersive}
        moderation={moderation}
        language={language}
      />
    );
  }
  if (layout === 'screen') return <DuoScreen call={call} language={language} immersive={immersive} onToggleImmersive={onToggleImmersive} />;
  if (layout === 'video-duo') return <VideoDuo call={call} language={language} self={self} />;
  return null;
}
