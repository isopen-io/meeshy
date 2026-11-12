import { lazy, Suspense, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useStore } from 'zustand/react';

import { CallButton } from '@/components/call-glass-button';
import { Arrives } from '@/components/call-arrives';
import { HeldSwap } from '@/lib/calls/use-pill-motion';
import { CameraOffStage, PeerSpeechRing } from '@/components/call-camera-off';
import { CallModerationSlot } from '@/components/call-control-slots';
import type { CallGridKit } from '@/components/call-grid';
import { Portrait } from '@/components/call-portrait';
import { StageBleed, StreamVideo } from '@/components/call-media-elements';
import { GlyphSvg } from '@/components/glyph';
import { CALL_SCREEN_GLYPHS } from '@/components/glyphs-call-screen';
import { CALL_VIEW_GLYPHS } from '@/components/glyphs-call-view';
import { useFlip } from '@/lib/use-flip';
import { useTileDrag, type TileOffset } from '@/components/use-tile-drag';
import { useTilePinch } from '@/components/use-tile-pinch';
import type { CallModeration } from '@/lib/calls/call-moderation';
import {
  cornerAfterArrow,
  isTileDrag,
  nearestSelfCorner,
  SCREEN_SELF_TILE,
  SELF_TILE_BOTTOM,
  SELF_TILE_MARGIN,
  SELF_TILE_TOP,
  selfTileBox,
  selfTileCornerFor,
  selfTileCounterScaled,
  selfTileOrigin,
  selfTileRestingFactor,
  selfTileScaleFor,
  selfTileSize,
  selfTileStore,
  setSelfTileCorner,
  setSelfTileScale,
  type SelfTileCorner,
  type SelfTileScale,
  type TileSize,
} from '@/lib/calls/call-self-tile';
import type { ZoomControl } from '@/lib/calls/call-self-controls';
import { autoSharer, resolveSpotlight, type SpotlightChoice } from '@/lib/calls/call-spotlight';
import { useLocalZoom, type LocalZoom } from '@/lib/calls/self-zoom';
import { useCallViewport } from '@/lib/calls/use-call-viewport';
import { useElementSize } from '@/lib/view/use-element-size';
import type { ActiveCall } from '@/lib/calls/call-store';
import { hasVideo, membersInArrival, orderedMembers, screenSharer, selfCameraShown, selfCameraStream, type CallLayout } from '@/lib/calls/call-view';
import { usePressedChrome } from '@/lib/calls/use-pressed-chrome';
import { useStageFlip } from '@/lib/calls/use-stage-flip';
import { translateCallControls } from '@/lib/i18n-call-controls-catalog';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { cameraMirrored } from '@/lib/media/camera-mirror';
import { preloadedView } from '@/lib/calls/preloaded-view';
import { sessionStore } from '@/lib/api/session';
import { peerSpeakingOnCameraOff } from '@/lib/calls/call-camera-off';
import { SELF_SPEAKER_COLOR, speakerColor } from '@/lib/calls/call-speaker-color';

/**
 * **LA SCÈNE DE L'APPEL** (#6382, #8063, #8392) — ce que l'écran d'appel montre
 * sous ses commandes : la grille d'un groupe (et sa une), l'écran partagé d'un
 * pair en duo (ENTIER, `contain`), ou la vidéo plein cadre avec la vignette
 * locale en coin, qui s'inverse d'un toucher comme sur iOS.
 *
 * - Ma vignette en coin se PINCE (#8577) : x1 · x2 · x3, accrochée, retenue
 *   pour l'appel (`call-self-tile.ts`) ; Ctrl + molette de même.
 * - Elle se GLISSE (#8747) vers l'un des quatre coins, où elle s'aimante ; un
 *   toucher reste un toucher, les flèches la déplacent quand elle a le focus,
 *   et son coin tient pour l'appel. Ses rangées la suivent pendant le geste.
 * - Le micro coupé du pair (#8787) se voit SUR son image — grande ou en
 *   vignette — et se dit dans le libellé de la scène, chrome masqué ou non.
 * - Ma vignette ne porte AUCUNE commande (#17327) : Caméra, Retourner, Effets
 *   et Écran sont le rail « mon image » du `(…)` (`call-screen.tsx`). Seul le
 *   cran du zoom (#8441) vit dans son coin haut, quand une cible de 44 y tient ;
 *   en PLEIN ÉCRAN, mon image porte la capsule du zoom sur le bord.
 * - Mon image en plein écran, DUO ou GROUPE (ma tuile à la une, #9182), porte
 *   le zoom de ma caméra, chargé à part (`call-self-camera.tsx`). Tout se
 *   retire dans un mode.
 */

/** Ce que l'écran d'appel remet à la scène pour MON image. */
export type SelfView = {
  readonly full: boolean;
  readonly onToggle: () => void;
  /** Le zoom de ma caméra, là où la loi le pose (`zoomControlIn`) : le cran de ma vignette, la capsule du plein écran, ou rien — sans vignette, ou dans un mode. */
  readonly zoom: ZoomControl | null;
  /** La colonne de la capsule du zoom, sur le bord. */
  readonly column: (capsule: ReactNode) => ReactNode;
  /** Le zoom de ma caméra courante (#9182) — absent : un témoin qui n'en parle pas (aucun zoom offert, ancien comportement). */
  readonly local?: LocalZoom;
  /** Ce que la capsule de capture prend sous l'en-tête (R1) : ma vignette et ses commandes descendent d'autant. Absent : 0. */
  readonly topInset?: number;
  /** Ma vignette se retire : un cadre en direct me compose dans sa case (#16943, comme `duoOverlays` iOS). */
  readonly tileHidden?: boolean;
};

const CallSelfCamera = lazy(() => import('./call-self-camera').then((module) => ({ default: module.CallSelfCamera })));

const CallZoomStep = lazy(() => import('./call-self-camera').then((module) => ({ default: module.CallZoomStep })));

/**
 * LA GRILLE D'UN GROUPE, CHARGÉE À PART (#17650) — un duo ne la paie jamais.
 * L'écran la précharge dès qu'un appel de GROUPE se montre (il sonne avant de
 * se connecter, et la grille n'est que la disposition d'un appel connecté) ;
 * arrivée, elle se dessine dans le même rendu que la scène.
 */
export const callGridView = preloadedView(() => import('./call-grid').then((module) => module.CallGrid));
const CallGrid = callGridView.View;

export const CALL_GRID_KIT: CallGridKit = {
  Portrait,
  Button: CallButton,
  ModerationSlot: CallModerationSlot,
  colorOf: (userId) => (userId === null ? SELF_SPEAKER_COLOR : speakerColor(userId)),
  resolveSpotlight,
  autoSharer,
  SpeechRing: PeerSpeechRing,
  usePressedChrome,
  useStageFlip,
  Arrives,
  HeldSwap,
};

/**
 * LA SURFACE QUI ZOOME L'ÉCRAN REÇU EN DUO (P15.11), CHARGÉE À PART : le crochet du zoom et ses lois ne pèsent plus sur
 * `call_overlay`. L'écran la précharge avec l'appel (`PREFETCH`) ; pas encore là, l'écran reçu se montre entier.
 */
export const screenZoomSurfaceView = preloadedView(() => import('./call-screen-zoom-surface').then((module) => module.ScreenZoomSurface));
const ScreenZoomSurface = screenZoomSurfaceView.View;

/** Une cible de 44 et ses 4 de marge de chaque côté : en deçà, la vignette n'a pas la place du cran du zoom. */
const ZOOM_STEP_ROOM = 52;

const TILE_SAID: Readonly<Record<SelfTileScale, 'callControls.selfTile.small' | 'callControls.selfTile.medium' | 'callControls.selfTile.large'>> = {
  1: 'callControls.selfTile.small',
  2: 'callControls.selfTile.medium',
  3: 'callControls.selfTile.large',
};

/** Mon image dans son aperçu (#8696) : la loi du miroir, jamais une condition locale. */
export const selfPreviewMirrored = (call: Pick<ActiveCall, 'facing' | 'screenSharing' | 'cameraPreview'>): boolean => cameraMirrored({ facing: call.facing, role: 'preview', screen: call.screenSharing && (call.cameraPreview ?? null) === null });


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
  /** Le chrome est-il affiché (#9183) : en grille, décide ce que touche une tuile (la mettre à la une, ou juste rendre le chrome) ; en duo vidéo, chrome retiré, ma vignette passe à sa petite taille (#16663). Défaut `true`. */
  readonly chromeVisible?: boolean;
  readonly onRevealChrome?: () => void;
  /** La largeur que la scène laisse à la colonne du journal (W1) : en duo vidéo, l'image de l'autre s'y prolonge en flou. Absent : 0. */
  readonly bleedEnd?: number;
};

/** Le tempo d'un changement de coin : celui de l'ancienne transition. */
const SELF_TILE_FLIP_MS = 300;

const screenCorner = { top: `calc(env(safe-area-inset-top) + ${SCREEN_SELF_TILE.y}px)`, right: SELF_TILE_MARGIN, width: SCREEN_SELF_TILE.width, height: SCREEN_SELF_TILE.height } as const;

const TILE_CORNER_SAID: Readonly<Record<SelfTileCorner, `callControls.selfTile.corner.${SelfTileCorner}`>> = {
  'top-left': 'callControls.selfTile.corner.top-left',
  'top-right': 'callControls.selfTile.corner.top-right',
  'bottom-left': 'callControls.selfTile.corner.bottom-left',
  'bottom-right': 'callControls.selfTile.corner.bottom-right',
};

/** Le coin de repos, en marges de zone sûre : ce que `selfTileBox` calcule sans elles. */
function cornerPlace(corner: SelfTileCorner, size: TileSize, topInset: number): { readonly left: string; readonly top: string } {
  const left = corner.endsWith('left') ? `calc(env(safe-area-inset-left) + ${SELF_TILE_MARGIN}px)` : `calc(100% - env(safe-area-inset-right) - ${SELF_TILE_MARGIN + size.width}px)`;
  const tileTop = SELF_TILE_TOP + topInset;
  const top = corner.startsWith('top') ? `calc(env(safe-area-inset-top) + ${tileTop}px)` : `max(calc(env(safe-area-inset-top) + ${tileTop}px), calc(100% - env(safe-area-inset-bottom) - ${SELF_TILE_BOTTOM + size.height}px))`;
  return { left, top };
}

/** Le liseré de ma vignette, à sa taille de petite vignette quand elle est rangée (`CallSelfTileScale.counterScaled`, iOS). */
const TILE_RIM = 2;

const both =
  <E,>(first: (event: E) => void, second: (event: E) => void) =>
  (event: E): void => {
    first(event);
    second(event);
  };

/** Sous la rangée des pastilles, au centre : entre les rangées d'une vignette de coin. */
const peerMutedTop = { top: 'calc(env(safe-area-inset-top) + 7rem)' } as const;

/** Le micro coupé du pair (#8787), posé sur son image : il reste quand le chrome se retire. */
function PeerMuted({ where }: { readonly where: 'main' | 'corner' }) {
  const place = where === 'main' ? 'absolute left-1/2 z-10 -translate-x-1/2 size-9' : 'absolute bottom-1.5 left-1.5 z-10 size-7';
  return (
    <span aria-hidden="true" className={`glass-call pointer-events-none grid place-items-center rounded-full text-on-media ${place}`} style={where === 'main' ? peerMutedTop : undefined} data-call-peer-muted={where}>
      <GlyphSvg glyph={CALL_SCREEN_GLYPHS.microphoneSlash} size={where === 'main' ? 18 : 14} />
    </span>
  );
}

function DuoScreen({ call, language, immersive, onToggleImmersive }: Pick<StageProps, 'call' | 'language' | 'immersive' | 'onToggleImmersive'>) {
  const sharer = screenSharer(call.members);
  const selfMirrored = selfPreviewMirrored(call);
  if (sharer === null) return null;
  const screen = <StreamVideo stream={call.remoteStreams[sharer.userId] ?? null} mirrored={false} fit="contain" className="absolute inset-0 size-full" label={translate(language, 'call.screen.peerSharing', { name: sharer.name })} member={sharer.userId} />;
  return (
    <div className="absolute inset-0" data-call-shared-screen="">
      {/* L'écran reçu se zoome (P15.11) : la surface des gestes et son calque GPU ne portent QUE l'image — ma vignette et le bouton plein écran, posés après, ne bougent jamais. */}
      <Suspense fallback={screen}>
        <ScreenZoomSurface hint={translateCallControls(language, 'callControls.screenZoom.hint')} isDrag={isTileDrag}>
          {screen}
        </ScreenZoomSurface>
      </Suspense>
      {call.cameraOn && !immersive ? (
        <div className="absolute overflow-hidden rounded-card shadow-lg" style={screenCorner} data-call-corner="">
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

function VideoDuo({ call, language, self, chromeVisible = true, onRevealChrome = () => undefined, bleedEnd = 0 }: Pick<StageProps, 'call' | 'language' | 'self' | 'chromeVisible' | 'onRevealChrome' | 'bleedEnd'>) {
  const swapped = self.full;
  const callId = call.callId ?? '';
  const scale = useStore(selfTileStore, (state) => selfTileScaleFor(state, callId));
  const corner = useStore(selfTileStore, (state) => selfTileCornerFor(state, callId));
  const meId = useStore(sessionStore, (state) => (state.session.status === 'authenticated' ? state.session.user.id : null));
  const [said, setSaid] = useState('');
  const hint = useId();
  const resize = (next: SelfTileScale): void => {
    setSelfTileScale(call.callId ?? '', next);
    setSaid(translateCallControls(language, TILE_SAID[next]));
  };
  const pinch = useTilePinch(scale, resize);
  const moveTo = (next: SelfTileCorner): void => {
    setSelfTileCorner(callId, next);
    setSaid(translateCallControls(language, TILE_CORNER_SAID[next]));
  };
  const firstPeer = orderedMembers(call.members)[0];
  const remoteStream = firstPeer === undefined ? null : (call.remoteStreams[firstPeer.userId] ?? null);
  const remoteVideoOn = firstPeer !== undefined && firstPeer.cameraOn && hasVideo(remoteStream);
  /* La vignette du coin porte la couleur de qui s'y montre : la mienne, ou celle du correspondant une fois échangée (#16635). */
  const mainOwner = swapped ? meId : (firstPeer?.userId ?? null);
  const cornerOwner = swapped ? (firstPeer?.userId ?? null) : meId;
  const colorOf = (owner: string | null): string => (owner === null ? SELF_SPEAKER_COLOR : speakerColor(owner));
  const cornerColor = colorOf(cornerOwner);
  const selfMirrored = selfPreviewMirrored(call);
  const local = useLocalZoom(call.callId, call.facing);
  const you = translate(language, 'call.you');
  const selfStream = selfCameraStream(call);
  const selfOn = selfCameraShown(call);
  const main = swapped ? selfStream : remoteStream;
  const cornerStream = swapped ? remoteStream : selfStream;
  const mainOn = swapped ? selfOn : remoteVideoOn;
  const cornerShown = swapped || selfOn;
  /* Ma vignette composée dans un cadre en direct (#16943) reste montée, invisible et intouchable : sa vidéo est la source de ma case. */
  const composed = self.tileHidden === true && !swapped;
  const cornerVideo = swapped ? remoteVideoOn : selfOn;
  const screen = useCallViewport();
  const compact = !chromeVisible;
  /* G1.11 : le cadre garde la taille du palier choisi ; rangée, la vignette s'y met à l'échelle de sa petite taille depuis son coin — une transformation, jamais une mise en page. */
  const size = selfTileSize(scale, screen);
  const restFactor = selfTileRestingFactor(scale, chromeVisible, screen);
  const topInset = self.topInset ?? 0;
  const rest = selfTileBox({ corner, size, viewport: screen, topInset });
  const seen = { width: size.width * restFactor, height: size.height * restFactor };
  const seenX = corner.endsWith('left') ? rest.x : rest.x + rest.width - seen.width;
  const seenY = corner.startsWith('top') ? rest.y : rest.y + rest.height - seen.height;
  const drop = ({ dx, dy }: TileOffset): void => {
    const next = nearestSelfCorner({ center: { x: seenX + seen.width / 2 + dx, y: seenY + seen.height / 2 + dy }, size, viewport: screen, topInset });
    if (next !== corner) moveTo(next);
  };
  const drag = useTileDrag(drop);
  const offset = swapped ? null : drag.offset;
  const gestures = {
    onPointerDown: both(pinch.onPointerDown, drag.onPointerDown),
    onPointerMove: both(pinch.onPointerMove, drag.onPointerMove),
    onPointerUp: both(pinch.onPointerUp, drag.onPointerUp),
    onPointerCancel: both(pinch.onPointerCancel, drag.onPointerCancel),
    onClickCapture: both(pinch.onClickCapture, drag.onClickCapture),
    onWheel: pinch.onWheel,
  };
  const cornerFrame = useRef<HTMLDivElement>(null);
  /* G1.9 (loi 15) : contrôles rangés, toucher ma vignette les rend d'abord, comme une tuile du groupe. La décision se prend à la DESCENTE : le focus que le pointeur donne au bouton rend le chrome avant le clic, qui sinon permuterait. */
  const pressed = usePressedChrome(chromeVisible);
  const tap = (): void => {
    if (pressed.release()) onRevealChrome();
    else self.onToggle();
  };
  useFlip(cornerFrame, {
    key: cornerShown ? `${corner}:${size.width}x${size.height}:${offset === null ? 'rest' : 'held'}` : null,
    held: offset !== null,
    duration: SELF_TILE_FLIP_MS,
    easing: 'ease-out',
  });
  const onArrow = (event: KeyboardEvent<HTMLButtonElement>): void => {
    const next = swapped ? null : cornerAfterArrow(corner, event.key);
    if (next === null) return;
    event.preventDefault();
    moveTo(next);
  };
  const peerMuted = firstPeer?.micMuted === true;
  const stageLabel = peerMuted ? `${call.title} · ${translate(language, 'call.peer.muted')}` : call.title;
  const zoomStep = !swapped && self.zoom === 'step' && call.cameraOn && !composed && size.width >= ZOOM_STEP_ROOM && size.height >= ZOOM_STEP_ROOM;
  const glyphs = { plus: <GlyphSvg glyph={CALL_VIEW_GLYPHS.plus} size={18} />, minus: <GlyphSvg glyph={CALL_VIEW_GLYPHS.minus} size={18} /> };
  return (
    <div role="group" aria-label={stageLabel} className="absolute inset-0" data-call-duo-stage="">
      {mainOn && bleedEnd > 0 ? <StageBleed stream={main} mirrored={swapped && selfMirrored} width={bleedEnd} /> : null}
      <CameraOffStage
        videoOn={mainOn}
        video={<StreamVideo stream={main} mirrored={swapped && selfMirrored} className="absolute inset-0 size-full" label={swapped ? you : call.title} member={swapped ? undefined : firstPeer?.userId} self={swapped} />}
        name={swapped ? you : call.title}
        avatar={swapped ? null : call.avatar}
        presenceKey={swapped ? undefined : (call.peerKey ?? undefined)}
        color={colorOf(mainOwner)}
        speaking={!swapped && peerSpeakingOnCameraOff(call.captions, firstPeer?.userId)}
        label={translate(language, swapped ? 'call.camera.off' : remoteStream === null ? 'call.video.connecting' : 'call.camera.peerOff')}
      />
      {peerMuted && !swapped ? <PeerMuted where="main" /> : null}
      {swapped ? (
        <Suspense fallback={self.zoom === 'capsule' ? self.column(null) : null}>
          <CallSelfCamera stream={call.cameraOn && !call.screenSharing ? call.localStream : null} local={local} language={language} glyphs={glyphs} column={self.zoom === 'capsule' ? self.column : null} />
        </Suspense>
      ) : null}
      {cornerShown ? (
        <div
          ref={cornerFrame}
          className={`absolute z-10 ${composed ? 'pointer-events-none opacity-0' : ''}`}
          style={{ ...cornerPlace(corner, size, topInset), width: size.width, height: size.height, scale: String(restFactor), transformOrigin: selfTileOrigin(corner), transform: offset === null ? undefined : `translate(${offset.dx}px, ${offset.dy}px)` }}
          {...(composed ? { 'aria-hidden': true, inert: true } : {})}
          data-call-corner-frame=""
          data-call-self-tile-composed={composed ? '' : undefined}
          data-call-self-tile-corner={corner}
          data-call-self-tile-compact={compact ? '' : undefined}
          data-call-self-tile-dragging={offset === null ? undefined : ''}
        >
          <button
            type="button"
            aria-label={translate(language, 'call.video.swap')}
            aria-describedby={swapped ? undefined : hint}
            onPointerDownCapture={pressed.press}
            onClick={tap}
            onKeyDown={(event) => {
              pressed.clear();
              onArrow(event);
            }}
            className={`relative z-10 grid size-full place-items-center overflow-hidden border-2 shadow-lg ${swapped ? '' : offset === null ? 'cursor-grab' : 'cursor-grabbing'}`}
            {...(swapped ? {} : gestures)}
            style={{ background: 'var(--color-scrim-soft)', borderColor: cornerColor, borderWidth: selfTileCounterScaled(TILE_RIM, restFactor), borderRadius: `calc(var(--radius-card) / ${restFactor})`, ...(swapped ? {} : { ...pinch.style, transformOrigin: selfTileOrigin(corner) }) }}
            data-call-corner=""
            data-call-self-tile={swapped ? undefined : String(scale)}
          >
            {cornerVideo ? <StreamVideo stream={cornerStream} mirrored={!swapped && selfMirrored} className="size-full" member={swapped ? firstPeer?.userId : undefined} self={!swapped} /> : <Portrait name={call.title} avatar={call.avatar} size={Math.round(size.width / 2)} pulse={false} presenceKey={call.peerKey ?? undefined} />}
            {peerMuted && swapped ? <PeerMuted where="corner" /> : null}
          </button>
          {zoomStep ? (
            <div className="absolute right-1 top-1 z-20" data-call-chrome-fade="" data-call-self-zoom="">
              <Suspense fallback={null}>
                <CallZoomStep stream={call.cameraOn && !call.screenSharing ? call.localStream : null} local={local} language={language} Button={CallButton} />
              </Suspense>
            </div>
          ) : null}
        </div>
      ) : null}
      <span role="status" aria-live="polite" className="sr-only" data-call-self-tile-status="">
        {said}
      </span>
      <span id={hint} hidden>
        {translateCallControls(language, 'callControls.selfTile.hint')}
      </span>
    </div>
  );
}

/**
 * LA SCÈNE D'UN GROUPE LIT SON ORIENTATION SUR ELLE-MÊME (P11.1, `GroupCallStageView` d'iOS, qui la lit dans sa
 * géométrie) : la colonne du journal ouverte (W1), une fenêtre large porte une scène plus haute que large. Le cadre
 * mesuré tient sa taille de l'écran (`flex-1` dans la surface de la scène, sa réserve exclue), jamais de la grille
 * qu'il contient : passer de 2 × 3 à 3 × 2 ne le redimensionne pas, aucune boucle. Avant sa première mesure
 * (rendu serveur, scène encore sans taille), la fenêtre.
 */
function GroupStage({ call, language, choice, onChoose, immersive, onToggleImmersive, moderation, self, chromeVisible, onRevealChrome }: Omit<StageProps, 'layout' | 'bleedEnd' | 'chromeVisible' | 'onRevealChrome'> & { readonly chromeVisible: boolean; readonly onRevealChrome: () => void }) {
  const me = useStore(sessionStore, (state) => (state.session.status === 'authenticated' ? state.session.user : null));
  const viewport = useCallViewport();
  const [frame, measured] = useElementSize();
  const scene = measured.width > 0 && measured.height > 0 ? measured : viewport;
  return (
    <div ref={frame} className="flex min-h-0 flex-1 flex-col" data-call-grid-frame="">
      <Suspense fallback={null}>
        <CallGrid
          kit={CALL_GRID_KIT}
          members={membersInArrival(call.members)}
          remoteStreams={call.remoteStreams}
          self={{ id: me?.id ?? null, stream: selfCameraStream(call), cameraOn: selfCameraShown(call), mirrored: selfPreviewMirrored(call), micMuted: call.micMuted, name: me?.displayName || me?.username || null, avatar: me?.avatar ?? null }}
          choice={choice}
          onChoose={onChoose}
          immersive={immersive}
          onToggleImmersive={onToggleImmersive}
          moderation={moderation}
          language={language}
          chromeVisible={chromeVisible}
          onRevealChrome={onRevealChrome}
          landscape={scene.width > scene.height}
          selfZoom={self.local === undefined || self.zoom !== 'capsule' ? null : { local: self.local, column: self.column }}
        />
      </Suspense>
    </div>
  );
}

export function CallStage({ call, layout, language, choice, onChoose, immersive, onToggleImmersive, moderation, self, chromeVisible = true, onRevealChrome = () => undefined, bleedEnd = 0 }: StageProps) {
  if (layout === 'grid') return <GroupStage call={call} language={language} choice={choice} onChoose={onChoose} immersive={immersive} onToggleImmersive={onToggleImmersive} moderation={moderation} self={self} chromeVisible={chromeVisible} onRevealChrome={onRevealChrome} />;
  if (layout === 'screen') return <DuoScreen call={call} language={language} immersive={immersive} onToggleImmersive={onToggleImmersive} />;
  if (layout === 'video-duo') return <VideoDuo call={call} language={language} self={self} chromeVisible={chromeVisible} onRevealChrome={onRevealChrome} bleedEnd={bleedEnd} />;
  return null;
}
