import { lazy, Suspense, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useStore } from 'zustand/react';

import { CallButton } from '@/components/call-glass-button';
import { Arrives } from '@/components/call-arrives';
import { HeldSwap } from '@/lib/calls/use-pill-motion';
import { STOW_REDUCED_MS } from '@/lib/calls/call-pill-motion';
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
  isLandscapeWindow,
  isTileDrag,
  nearestSelfCorner,
  SCREEN_SELF_TILE,
  SELF_TILE_MARGIN,
  selfTileBox,
  selfTileCornerInsets,
  selfTileCornerFor,
  selfTileCounterScaled,
  selfTileOrigin,
  selfTileRailShift,
  selfTileRestingFactor,
  selfTileScaleFor,
  selfTileSize,
  selfTileStore,
  setSelfTileCorner,
  setSelfTileScale,
  type SelfTileCorner,
  type TileSize,
} from '@/lib/calls/call-self-tile';
import type { ZoomControl } from '@/lib/calls/call-self-controls';
import { autoSharer, resolveSpotlight, type FullScreenLevel, type SpotlightChoice } from '@/lib/calls/call-spotlight';
import { useLocalZoom, type LocalZoom } from '@/lib/calls/self-zoom';
import type { CornerSight } from '@/components/call-duo-corner';
import { useCallViewport } from '@/lib/calls/use-call-viewport';
import { useElementSize } from '@/lib/view/use-element-size';
import type { ActiveCall } from '@/lib/calls/call-store';
import { hasVideo, isCompactHeight, membersInArrival, orderedMembers, screenSharer, selfCameraShown, selfCameraStream, type CallLayout } from '@/lib/calls/call-view';
import { usePressedChrome } from '@/lib/calls/use-pressed-chrome';
import { useStageFlip } from '@/lib/calls/use-stage-flip';
import { translateCallControls } from '@/lib/i18n-call-controls-catalog';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { cameraMirrored } from '@/lib/media/camera-mirror';
import { preloadedView } from '@/lib/calls/preloaded-view';
import { sessionStore } from '@/lib/api/session';
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
  /** Les rails du duo sont sortis : en paysage, ma vignette leur cède le coin (L2.8, `selfTileRailShift`). Absent : rangés. */
  readonly railsOpen?: boolean;
};

const CallSelfCamera = lazy(() => import('./call-self-camera').then((module) => ({ default: module.CallSelfCamera })));

const CallZoomStep = lazy(() => import('./call-self-camera').then((module) => ({ default: module.CallZoomStep })));

/**
 * LA GRILLE D'UN GROUPE, CHARGÉE À PART (#17650) — un duo ne la paie jamais.
 * L'écran la précharge dès qu'un appel de GROUPE se montre (il sonne avant de
 * se connecter, et la grille n'est que la disposition d'un appel connecté) ;
 * arrivée, elle se dessine dans le même rendu que la scène.
 */
/** L'écran partagé à la une d'un groupe (U2), chargé à part et AVEC la grille : un groupe sans partage ne paie pas son code dans la grille. */
const groupScreenView = preloadedView(() => import('./call-grid-screen').then((module) => module.GroupSharedScreen));

export const callGridView = preloadedView(() => Promise.all([import('./call-grid'), groupScreenView.load()]).then(([module]) => module.CallGrid));
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
  CameraOff: CameraOffStage,
  isDrag: isTileDrag,
  SharedScreen: groupScreenView.View,
};

/**
 * LA SURFACE QUI ZOOME L'ÉCRAN REÇU EN DUO (P15.11), CHARGÉE À PART : le crochet du zoom et ses lois ne pèsent plus sur
 * `call_overlay`. L'écran la précharge avec l'appel (`PREFETCH`) ; pas encore là, l'écran reçu se montre entier.
 */
export const screenZoomSurfaceView = preloadedView(() => import('./call-screen-zoom-surface').then((module) => module.DuoSharedScreen));
const DuoScreenView = screenZoomSurfaceView.View;


/** Une cible de 44 et ses 4 de marge de chaque côté : en deçà, la vignette n'a pas la place du cran du zoom. */
const ZOOM_STEP_ROOM = 52;

const TILE_SAID = ['small', 'medium', 'large'] as const;

/** Mon image dans son aperçu (#8696) : la loi du miroir, jamais une condition locale. */
export const selfPreviewMirrored = (call: Pick<ActiveCall, 'facing' | 'screenSharing' | 'cameraPreview'>): boolean => cameraMirrored({ facing: call.facing, role: 'preview', screen: call.screenSharing && (call.cameraPreview ?? null) === null });


type StageProps = {
  readonly call: ActiveCall;
  readonly layout: CallLayout;
  readonly language: InterfaceLanguage;
  readonly choice: SpotlightChoice;
  readonly onChoose: (choice: SpotlightChoice) => void;
  /** Le plein écran de la scène (loi 15, #17961) : un duo n'a qu'un niveau, la une d'un groupe en a deux pour un écran partagé. */
  readonly fullScreen: FullScreenLevel;
  readonly onFullScreen: (level: FullScreenLevel) => void;
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


/** Le coin de repos, en marges de zone sûre : ce que `selfTileBox` calcule sans elles ; `shift`, le pas de côté qui cède le coin au rail (L2.8). */
function cornerPlace(corner: SelfTileCorner, size: TileSize, topInset: number, viewport: TileSize, shift: number): { readonly left: string; readonly top: string } {
  const clearance = selfTileCornerInsets(viewport);
  const left = corner.endsWith('left') ? `calc(env(safe-area-inset-left) + ${SELF_TILE_MARGIN + shift}px)` : `calc(100% - env(safe-area-inset-right) - ${SELF_TILE_MARGIN + size.width - shift}px)`;
  const tileTop = clearance.top + topInset;
  const top = corner.startsWith('top') ? `calc(env(safe-area-inset-top) + ${tileTop}px)` : `max(calc(env(safe-area-inset-top) + ${tileTop}px), calc(100% - env(safe-area-inset-bottom) - ${clearance.bottom + size.height}px))`;
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

/** Le micro coupé du pair (#8787), posé sur son image : il reste quand le chrome se retire. Dans la vignette du coin, il vit dans sa plaque, comme en groupe. */
function PeerMuted() {
  return (
    <span aria-hidden="true" className="glass-call pointer-events-none absolute left-1/2 z-10 grid size-9 -translate-x-1/2 place-items-center rounded-full text-on-media" style={peerMutedTop} data-call-peer-muted="main">
      <GlyphSvg glyph={CALL_SCREEN_GLYPHS.microphoneSlash} size={18} />
    </span>
  );
}


const ScreenButton = (props: Omit<Parameters<typeof CallButton>[0], 'tone' | 'prominent'>) => <CallButton {...props} tone="glass" prominent />;

/**
 * L'écran reçu en duo (P15) vit avec sa surface de zoom, dans son chunk chargé avec la vignette du coin dès que le duo
 * sonne (`duoCornerView`) : il est là bien avant qu'un écran ne soit partagé.
 */
function DuoScreen({ call, language, fullScreen, onFullScreen }: Pick<StageProps, 'call' | 'language' | 'fullScreen' | 'onFullScreen'>) {
  const sharer = screenSharer(call.members);
  if (sharer === null) return null;
  const immersive = fullScreen !== 'off';
  return (
    <Suspense fallback={null}>
      <DuoScreenView call={call} sharer={sharer} language={language} immersive={immersive} onToggleImmersive={() => onFullScreen(immersive ? 'off' : 'full')} mirrored={selfPreviewMirrored(call)} corner={screenCorner} Button={ScreenButton} isDrag={isTileDrag} />
    </Suspense>
  );
}

type TileInput = { readonly call: ActiveCall; readonly language: InterfaceLanguage; readonly swapped: boolean; readonly shown: boolean; readonly chromeVisible: boolean; readonly topInset: number; readonly bleedEnd: number; readonly railsOpen: boolean };

/**
 * OÙ SE TIENT MA VIGNETTE, ET COMMENT ELLE BOUGE : son palier et son coin retenus pour l'appel, le pincement, le glissé
 * de coin en coin et les flèches, le pas de côté qui cède le coin au rail en paysage (L2.8), et le FLIP qui joue tout
 * changement de place — jamais left/top/width/height.
 */
function useSelfTilePlace({ call, language, swapped, shown, chromeVisible, topInset, bleedEnd, railsOpen }: TileInput) {
  const callId = call.callId ?? '';
  const scale = useStore(selfTileStore, (state) => selfTileScaleFor(state, callId));
  const corner = useStore(selfTileStore, (state) => selfTileCornerFor(state, callId));
  const [said, setSaid] = useState('');
  const pinch = useTilePinch(scale, (next) => {
    setSelfTileScale(callId, next);
    setSaid(translateCallControls(language, `callControls.selfTile.${TILE_SAID[next - 1] ?? 'medium'}`));
  });
  const moveTo = (next: SelfTileCorner): void => {
    setSelfTileCorner(callId, next);
    setSaid(translateCallControls(language, `callControls.selfTile.corner.${next}`));
  };
  const screen = useCallViewport();
  /* G1.11 : le cadre garde la taille du palier choisi ; rangée, la vignette s'y met à l'échelle de sa petite taille depuis son coin — une transformation, jamais une mise en page. */
  const size = selfTileSize(scale, screen);
  const restFactor = selfTileRestingFactor(scale, chromeVisible, screen);
  const railShift = selfTileRailShift({ corner, viewport: screen, railsOpen });
  const box = selfTileBox({ corner, size, viewport: screen, topInset, bleed: bleedEnd });
  const seen = { width: size.width * restFactor, height: size.height * restFactor };
  const seenX = box.x + railShift + (corner.endsWith('left') ? 0 : box.width - seen.width);
  const seenY = corner.startsWith('top') ? box.y : box.y + box.height - seen.height;
  const drag = useTileDrag(({ dx, dy }: TileOffset): void => {
    const next = nearestSelfCorner({ center: { x: seenX + seen.width / 2 + dx, y: seenY + seen.height / 2 + dy }, size, viewport: screen, topInset, bleed: bleedEnd });
    if (next !== corner) moveTo(next);
  });
  const offset = swapped ? null : drag.offset;
  const gestures = {
    onPointerDown: both(pinch.onPointerDown, drag.onPointerDown),
    onPointerMove: both(pinch.onPointerMove, drag.onPointerMove),
    onPointerUp: both(pinch.onPointerUp, drag.onPointerUp),
    onPointerCancel: both(pinch.onPointerCancel, drag.onPointerCancel),
    onClickCapture: both(pinch.onClickCapture, drag.onClickCapture),
    onWheel: pinch.onWheel,
  };
  const frame = useRef<HTMLDivElement>(null);
  /* La clé dit la FORME (palier, fenêtre couchée ou debout, colonne du journal ouverte ou non, coin cédé au rail), jamais les pixels de la fenêtre : redimensionner la fenêtre sans la coucher ne mesure ni ne rejoue rien, la vignette la suit ; la coucher joue une fois. */
  useFlip(frame, {
    key: shown ? `${corner}:${scale}:${isLandscapeWindow(screen)}:${topInset}:${bleedEnd}:${railShift}:${offset === null}` : null,
    origin: { x: corner.endsWith('left') ? 0 : 1, y: corner.startsWith('top') ? 0 : 1 },
    held: offset !== null,
    duration: SELF_TILE_FLIP_MS,
    reducedDuration: STOW_REDUCED_MS,
    easing: 'ease-out',
    /* W1.20 : la colonne qui entre ou repart fait glisser la scène vers son nouveau centre (`useFollowInline`, `call-screen.tsx`) ; elle porte ma vignette d'une part du chemin, le FLIP n'en joue que le reste. */
    carrier: '[data-call-stage-surface]',
  });
  const onArrow = (event: KeyboardEvent<HTMLButtonElement>): void => {
    const next = swapped ? null : cornerAfterArrow(corner, event.key);
    if (next === null) return;
    event.preventDefault();
    moveTo(next);
  };
  const origin = selfTileOrigin(corner);
  const place = { ...cornerPlace(corner, size, topInset, screen, railShift), width: size.width, height: size.height, scale: String(restFactor), transformOrigin: origin, transform: offset === null ? undefined : `translate(${offset.dx}px, ${offset.dy}px)` };
  /* Rangée par une échelle, la vignette contre-met à l'échelle son liseré, ses coins et sa plaque : ils gardent leur taille de petite vignette. */
  const look = { rim: selfTileCounterScaled(TILE_RIM, restFactor), radius: `calc(var(--radius-card) / ${restFactor})`, plate: selfTileCounterScaled(1, restFactor), origin, avatar: Math.round(size.width / 2) };
  return { scale, corner, size, offset, gestures, pinchStyle: pinch.style, frame, place, look, onArrow, said };
}

/**
 * LA VIGNETTE DU COIN, CHARGÉE À PART (#17982, `call-duo-corner.tsx`) : `call_overlay` n'en porte que l'`import()`.
 * L'écran la précharge dès qu'un duo se montre (il sonne avant de se connecter) et avec l'appel (`PREFETCH`) ; elle se
 * rend dans le même rendu une fois là.
 */
export const duoCornerView = preloadedView(() => Promise.all([import('./call-duo-corner'), screenZoomSurfaceView.load()]).then(([module]) => module.DuoCorner));
const DuoCornerView = duoCornerView.View;

/** La couleur de qui se montre : la mienne sans identifiant est le neutre de l'écran, jamais une couleur inventée. */
const ownerColor = (owner: string | null): string => (owner === null ? SELF_SPEAKER_COLOR : speakerColor(owner));

function VideoDuo({ call, language, self, chromeVisible = true, onRevealChrome = () => undefined, bleedEnd = 0 }: Pick<StageProps, 'call' | 'language' | 'self' | 'chromeVisible' | 'onRevealChrome' | 'bleedEnd'>) {
  const swapped = self.full;
  const meId = useStore(sessionStore, (state) => (state.session.status === 'authenticated' ? state.session.user.id : null));
  const hint = useId();
  const firstPeer = orderedMembers(call.members)[0];
  const remoteStream = firstPeer === undefined ? null : (call.remoteStreams[firstPeer.userId] ?? null);
  const remoteVideoOn = firstPeer !== undefined && firstPeer.cameraOn && hasVideo(remoteStream);
  /* La vignette du coin porte la couleur de qui s'y montre : la mienne, ou celle du correspondant une fois échangée (#16635). */
  const peerId = firstPeer?.userId ?? null;
  const selfMirrored = selfPreviewMirrored(call);
  const local = useLocalZoom(call.callId, call.facing);
  const you = translate(language, 'call.you');
  const selfStream = selfCameraStream(call);
  const selfOn = selfCameraShown(call);
  const main = swapped ? selfStream : remoteStream;
  const mainOn = swapped ? selfOn : remoteVideoOn;
  const cornerShown = swapped || selfOn;
  /* Ma vignette composée dans un cadre en direct (#16943) reste montée, invisible et intouchable : sa vidéo est la source de ma case. */
  const composed = self.tileHidden === true && !swapped;
  const tile = useSelfTilePlace({ call, language, swapped, shown: cornerShown, chromeVisible, topInset: self.topInset ?? 0, bleedEnd, railsOpen: self.railsOpen === true });
  /* G1.9 (loi 15) : contrôles rangés, toucher ma vignette les rend d'abord, comme une tuile du groupe. La décision se prend à la DESCENTE : le focus que le pointeur donne au bouton rend le chrome avant le clic, qui sinon permuterait. */
  const pressed = usePressedChrome(chromeVisible);
  const tap = (): void => (pressed.release() ? onRevealChrome() : self.onToggle());
  const peerMuted = firstPeer?.micMuted === true;
  const sight: CornerSight | null = cornerShown ? { swapped, video: swapped ? remoteVideoOn : selfOn, stream: swapped ? remoteStream : selfStream, name: swapped ? call.title : you, muted: peerMuted && swapped, peerId: firstPeer?.userId } : null;
  const stageLabel = peerMuted ? `${call.title} · ${translate(language, 'call.peer.muted')}` : call.title;
  const zoomStep = !swapped && self.zoom === 'step' && call.cameraOn && !composed && tile.size.width >= ZOOM_STEP_ROOM && tile.size.height >= ZOOM_STEP_ROOM;
  const glyphs = { plus: <GlyphSvg glyph={CALL_VIEW_GLYPHS.plus} size={18} />, minus: <GlyphSvg glyph={CALL_VIEW_GLYPHS.minus} size={18} /> };
  const zoom = zoomStep ? (
    <div className="absolute right-1 top-1 z-20" data-call-chrome-fade="" data-call-self-zoom="">
      <Suspense fallback={null}>
        <CallZoomStep stream={call.cameraOn && !call.screenSharing ? call.localStream : null} local={local} language={language} Button={CallButton} />
      </Suspense>
    </div>
  ) : null;
  return (
    <div role="group" aria-label={stageLabel} className="absolute inset-0" data-call-duo-stage="">
      {mainOn && bleedEnd > 0 ? <StageBleed stream={main} mirrored={swapped && selfMirrored} width={bleedEnd} /> : null}
      <CameraOffStage
        videoOn={mainOn}
        video={<StreamVideo stream={main} mirrored={swapped && selfMirrored} className="absolute inset-0 size-full" label={swapped ? you : call.title} member={swapped ? undefined : firstPeer?.userId} self={swapped} />}
        name={swapped ? you : call.title}
        avatar={swapped ? null : call.avatar}
        presenceKey={swapped ? undefined : (call.peerKey ?? undefined)}
        color={ownerColor(swapped ? meId : peerId)}
        speech={swapped ? null : remoteStream}
        label={translate(language, swapped ? 'call.camera.off' : remoteStream === null ? 'call.video.connecting' : 'call.camera.peerOff')}
      />
      <HeldSwap value={peerMuted && !swapped ? true : null} shape="fade" className="pointer-events-none absolute inset-0 z-10" data-call-peer-muted-slot="">
        {() => <PeerMuted />}
      </HeldSwap>
      {swapped ? (
        <Suspense fallback={self.zoom === 'capsule' ? self.column(null) : null}>
          <CallSelfCamera stream={call.cameraOn && !call.screenSharing ? call.localStream : null} local={local} language={language} glyphs={glyphs} column={self.zoom === 'capsule' ? self.column : null} />
        </Suspense>
      ) : null}
      <Suspense fallback={null}>
        <DuoCornerView call={call} language={language} sight={sight} tile={tile} swapped={swapped} composed={composed} compact={!chromeVisible} color={ownerColor(swapped ? peerId : meId)} hint={hint} onTap={tap} pressed={pressed} mirrored={selfMirrored} Off={CameraOffStage} zoom={zoom} />
      </Suspense>
      <span role="status" aria-live="polite" className="sr-only" data-call-self-tile-status="">
        {tile.said}
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
function GroupStage({ call, language, choice, onChoose, fullScreen, onFullScreen, moderation, self, chromeVisible, onRevealChrome }: Omit<StageProps, 'layout' | 'bleedEnd' | 'chromeVisible' | 'onRevealChrome'> & { readonly chromeVisible: boolean; readonly onRevealChrome: () => void }) {
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
          fullScreen={fullScreen}
          onFullScreen={onFullScreen}
          moderation={moderation}
          language={language}
          chromeVisible={chromeVisible}
          onRevealChrome={onRevealChrome}
          landscape={scene.width > scene.height}
          compact={isCompactHeight(viewport.height)}
          selfZoom={self.local === undefined || self.zoom !== 'capsule' ? null : { local: self.local, column: self.column }}
        />
      </Suspense>
    </div>
  );
}

export function CallStage({ call, layout, language, choice, onChoose, fullScreen, onFullScreen, moderation, self, chromeVisible = true, onRevealChrome = () => undefined, bleedEnd = 0 }: StageProps) {
  if (layout === 'grid') return <GroupStage call={call} language={language} choice={choice} onChoose={onChoose} fullScreen={fullScreen} onFullScreen={onFullScreen} moderation={moderation} self={self} chromeVisible={chromeVisible} onRevealChrome={onRevealChrome} />;
  if (layout === 'screen') return <DuoScreen call={call} language={language} fullScreen={fullScreen} onFullScreen={onFullScreen} />;
  if (layout === 'video-duo') return <VideoDuo call={call} language={language} self={self} chromeVisible={chromeVisible} onRevealChrome={onRevealChrome} bleedEnd={bleedEnd} />;
  return null;
}
