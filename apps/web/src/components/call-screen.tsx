import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useStore } from 'zustand/react';

import type { CallRowsKit } from '@/components/call-control-actions';
import { CallControlPill, loadDeck } from '@/components/call-control-pill';
import { CallButton } from '@/components/call-glass-button';
import { CallIncomingAnswer } from '@/components/call-incoming-answer';
import { RoundButton } from '@/components/call-round-button';
import { CallLiveFrameStatusSlot, CallLiveFrameSurfaceSlot, liveFrameHold, liveFrameShown, useLiveFrameState } from '@/components/call-live-frame-slots';
import { SpeechRing } from '@/components/call-camera-off';
import { Portrait } from '@/components/call-grid';
import { CallControlFeedbackSlot, CallModerationSlot } from '@/components/call-control-slots';
import { CALL_CAPTURE_ROW_CLEARANCE, CallCaptureAlerts, CallPeerAlerts, someoneCaptures } from '@/components/call-quality';
import { StreamAudio, StreamVideo } from '@/components/call-media-elements';
import { CallClock, CallScreenHeader } from '@/components/call-screen-header';
import { CallStage, selfPreviewMirrored, type SelfView } from '@/components/call-stage';
import { Glyph, GlyphSvg } from '@/components/glyph';
import { CALL_SCREEN_GLYPHS, type CallScreenGlyphName } from '@/components/glyphs-call-screen';
import { CALL_VIEW_GLYPHS } from '@/components/glyphs-call-view';
import { FLOATING_GLYPHS } from '@/components/glyphs-floating';
import { callActions } from '@/lib/calls/call-actions';
import { cameraOffFadeMs } from '@/lib/calls/call-camera-off';
import { callControlSet, cameraSwitchOf, isVideoScene, type CameraSwitch } from '@/lib/calls/call-controls';
import { controlsDisposition, participantCountOf, pillRows, railRows, railsBySide, unfoldsPill } from '@/lib/calls/call-controls-disposition';
import { JOURNAL_COLUMN_GUTTER, JOURNAL_COLUMN_WIDTH, useEscapeFolds, useJournalDock } from '@/lib/calls/call-journal-dock';
import { browserPipSupport, requestCallPip, shouldOfferPip } from '@/lib/calls/call-pip';
import { callPillText, PILL_TEXT_WIDTH_CLASS, pillStaysWhenChromeStowed, type CallPillText } from '@/lib/calls/call-pill-text';
import { CALL_ACTIONS_ID, CALL_PANEL_ID, IDLE, layerChrome, layerOffered, nextLayer, panelInThePill, type CallLayerEvent, type CallPanelKind, type CallScreenLayer, type LayerOffer } from '@/lib/calls/call-screen-layer';
import { selfZoomPlace, zoomControlIn } from '@/lib/calls/call-self-controls';
import { selfTileCornerFor, selfTileFootprint, selfTileScaleFor, selfTileStore } from '@/lib/calls/call-self-tile';
import { speakerColor } from '@/lib/calls/call-speaker-color';
import { usePeerSpeaking } from '@/lib/calls/peer-audio-level';
import { resolveSpotlight, type SpotlightChoice } from '@/lib/calls/call-spotlight';
import type { CallCaption } from '@/lib/calls/call-captions';
import { formatCallClock, type ActiveCall } from '@/lib/calls/call-store';
import { callLayout, callStatusKey, type PlainCallKey, canRetry, canShareScreen, hasVideo, orderedMembers, screenSharer, STATUS_PILL_KEY, visibleStatusPills } from '@/lib/calls/call-view';
import { useLocalZoom } from '@/lib/calls/self-zoom';
import { useCallViewport } from '@/lib/calls/use-call-viewport';
import { swipeDownAllowed } from '@/lib/calls/call-swipe-down';
import { useCallChrome } from '@/lib/calls/use-call-chrome';
import { usePublishChrome } from '@/lib/calls/call-chrome-store';
import { useStowFade } from '@/lib/calls/use-pill-motion';
import { useCallSwipeDown } from '@/lib/calls/use-call-swipe-down';
import { useCallModeration } from '@/lib/calls/use-call-moderation';
import { translateCallControls } from '@/lib/i18n-call-controls-catalog';
import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { prefersReducedMotion } from '@/lib/view/reduced-motion';
import { appSettingsOpener } from '@/lib/view/settings-recovery';
import { blurCapable, browserColorSupport, cameraSourceOf, effectsOffered, effectsUsedOf, videoEffectsStore } from '@/lib/calls/video-effects';
import { useMediaSystemBars } from '@/lib/use-media-system-bars';

import '@/styles/call-motion.css';

/**
 * **L'ÉCRAN D'APPEL** (#6382, #8045, #8391) — miroir de `CallView.swift` et
 * d'`IncomingCallView.swift` : toujours sombre (iOS peint l'appel sur fond
 * noir quel que soit le schéma), un portrait pulsé pendant la sonnerie, la
 * vidéo distante plein cadre avec la vignette locale en coin, une grille pour
 * un groupe.
 *
 * Connecté, la vue suit « C adapté » : en bas, une pilule de verre identique en
 * audio, vidéo et groupe — `(…)` · Micro · Sortie · Fin (`call-control-pill.tsx`) ;
 * ce que `(…)` sort suit le nombre de participants (`call-controls-disposition.ts`,
 * #17327) : à deux, deux rails sur les bords, « Mon image » à gauche et
 * « L'appel » à droite, sans que la pilule grandisse (`call-rails.tsx`) ; à
 * plusieurs, la pilule grandit vers le haut et empile une rangée par famille,
 * qui défile à l'horizontale (`call-control-actions.tsx`, #8550) ; en haut,
 * Réduire et la puce « Nom · durée » (`call-screen-header.tsx`). En vidéo,
 * toucher la scène efface TOUTES les commandes et un second toucher les rend ;
 * rien d'autre ne les efface, aucune attente (#8988, `use-call-chrome.ts`). En
 * duo, glisser l'écran vers le bas le réduit en bulle, ou dans l'image dans
 * l'image quand le navigateur l'offre (#9096, `use-call-swipe-down.ts`). Au-dessus
 * d'un écran partagé, fond clair par nature, les verres prennent leur teinte
 * plus sombre.
 *
 * UNE CHOSE À LA FOIS (#8578, `call-screen-layer.ts`) : repos, menu, un
 * panneau qui REMPLACE les rangées dans le cadre de la pilule (‹ revient au
 * menu, ✕ ferme tout) — les participants et qui y ajouter (« Ajouter »,
 * #8433), la palette « Réagir » (#8439), le choix « Audio seul » · « Audio et
 * vidéo » d'« Enregistrer » (#8437) —, ou un MODE qui libère tout l'écran :
 * « Effets » (#8442, #8551) et « Capturer » en montage (#8552, #8580) n'y
 * laissent que leur carrousel centré et leur barre d'action. Chacun vit dans
 * son chunk. Qui modère trouve sur
 * chaque tuile d'un pair, et dans la liste, « Couper le micro » · « Retirer de
 * l'appel » (#8438). Les réactions montent par-dessus la scène, et le mot d'un
 * contrôle s'affiche en haut (`call-control-overlays.tsx`).
 *
 * L'appel entrant vit dans `call-incoming-answer.tsx` (P17, #16944) ; l'écran
 * de fin, la pastille, la bulle et la fenêtre PiP ne changent pas.
 *
 * LE TEXTE VIT DANS LA PILULE (#17343, `call-pill-text.ts`) : les sous-titres
 * au repos dans son verre, au-dessus de sa rangée de base, avec « Journal » à
 * leur pied (#17346) ; le journal s'ouvre à leur place ; `(…)` les range tous
 * deux et refermer les actions les rend ; la pilule rangée d'un toucher laisse
 * les sous-titres dans un verre à eux. Sur grand écran, la colonne du journal
 * (W1) reste ouverte quand `(…)` s'ouvre (porteur, 2026-11-10).
 */

const INK = 'var(--color-on-media)';
const INK_2 = 'var(--color-on-media-3)';
const BACKDROP = 'linear-gradient(180deg, var(--ios-indigo-950) 0%, var(--color-media-backdrop) 100%)';

/**
 * Un chunk chargé UNE fois — et rechargé après un échec : un préchargement
 * raté (réseau coupé) ne condamne pas le premier toucher qui en a besoin.
 */
function once<T>(load: () => Promise<T>): () => Promise<T> {
  const memo: { pending: Promise<T> | null } = { pending: null };
  return () => {
    memo.pending ??= load().catch((error: unknown) => {
      memo.pending = null;
      throw error;
    });
    return memo.pending;
  };
}

const loadCaptions = once(() => import('./call-captions-panel'));
const CallCaptionsSlot = lazy(() => loadCaptions().then((module) => ({ default: module.CallCaptionsSlot })));

const loadActions = once(() => import('./call-control-actions'));

/* La pastille de l'appel réduit (`call-floating-pill.tsx`) : chargée dès que l'appel vit, car partager l'écran réduit l'appel aussitôt (#16664). */
const loadFloatingPill = once(() => import('./call-floating-pill'));

/* Les rails du duo (#17327) : leur cadre, leur glissement et la loi qui les écarte de ma vignette (#17429) sont un chunk à part (`budgets.json` › `call_rails`), chargé dès que l'appel vit. */
const loadRails = once(() => import('./call-rails'));
const CallRails = lazy(() => loadRails().then((module) => ({ default: module.CallRails })));
const CallActionRail = lazy(() => loadActions().then((module) => ({ default: module.CallActionRail })));

const CallPreview = lazy(() => import('./call-preview').then((module) => ({ default: module.CallPreview })));

const PREVIEW_KIT = { Video: StreamVideo, Audio: StreamAudio, soundOn: <GlyphSvg glyph={CALL_VIEW_GLYPHS.speakerHigh} size={22} />, soundOff: <GlyphSvg glyph={CALL_VIEW_GLYPHS.speakerSlash} size={22} /> };

const useEffectsActive = (): boolean => useStore(videoEffectsStore, (state) => effectsUsedOf(state.effects).length > 0);

const ROWS_KIT: CallRowsKit = {
  Button: CallButton,
  glyphs: CALL_VIEW_GLYPHS,
  actionsId: CALL_ACTIONS_ID,
  panelIds: CALL_PANEL_ID,
  useEffectsActive,
  cameraSourceOf,
};

const loadEffectsMode = once(() =>
  import('./call-effects-mode').then(async (module) => {
    await module.loadEffectsModeText(currentInterfaceLanguage());
    return { default: module.CallEffectsMode };
  }),
);
const CallEffectsMode = lazy(loadEffectsMode);
const loadMontageMode = once(() =>
  import('./call-montage-mode').then(async (module) => {
    await module.loadMontageModeText(currentInterfaceLanguage());
    return { default: module.CallMontageMode };
  }),
);
const CallMontageMode = lazy(loadMontageMode);
/* L'atelier des cadres de capture (#8743) : son chunk à lui, que le mode Montage charge À SON ENTRÉE, jamais préchargé avec l'appel. */
const loadFrameStudio = () => import('@/lib/calls/frames/frame-studio');
const loadPanels = once(() => import('./call-control-panels'));
const CallReactionPalette = lazy(() => loadPanels().then((module) => ({ default: module.CallReactionPalette })));
const CallRecordChoice = lazy(() => loadPanels().then((module) => ({ default: module.CallRecordChoice })));
const loadPeople = once(() => import('./call-people-sheet'));
const CallPeopleSheet = lazy(() => loadPeople().then((module) => ({ default: module.CallPeopleSheet })));
const loadJournal = once(() => import('./call-journal-panel'));
const CallJournalPanel = lazy(() => loadJournal().then((module) => ({ default: module.CallJournalPanel })));
/* La colonne du grand écran vit avec le journal, dans son chunk : l'écran d'appel n'en paie que l'`import()`. */
const CallJournalInColumn = lazy(() => loadJournal().then((module) => ({ default: module.CallJournalInColumn })));

/**
 * CE QU'UN TOUCHER VA DEMANDER, CHARGÉ AVANT LUI (#8735) — chaque mode et
 * chaque panneau vit dans son chunk ; le premier toucher sur « Effets »,
 * « Réagir » ou « Sortie » attendait le réseau (et le catalogue du studio)
 * devant un écran vidé, et se lisait comme un toucher « qui n'a pas pris ».
 * L'appel vivant, ils se chargent quand le navigateur souffle, au plus tard
 * quand `(…)` s'ouvre.
 */
const PREFETCH: readonly (() => Promise<unknown>)[] = [
  loadActions,
  loadDeck,
  loadRails,
  loadEffectsMode,
  loadMontageMode,
  loadPanels,
  loadPeople,
  loadJournal,
  loadCaptions,
  () => import('./call-devices-sheet'),
  () => import('./call-quality-detail'),
  () => import('./call-waiting-banner'),
  loadFloatingPill,
];

const prefetchCallChunks = (): void => PREFETCH.forEach((load) => void load().catch(() => undefined));

/** Quand le navigateur souffle — `requestIdleCallback`, sinon un peu plus tard. */
function whenIdle(run: () => void): () => void {
  if (typeof requestIdleCallback === 'function') {
    const handle = requestIdleCallback(run, { timeout: 2000 });
    return () => cancelIdleCallback(handle);
  }
  const handle = setTimeout(run, 1200);
  return () => clearTimeout(handle);
}

/** Le mode en chemin (#8735) : l'écran ne reste pas vide, et ✕ en sort avant même que le carrousel n'arrive. */
export function CallModePending({ label, glyph, onExit }: { readonly label: string; readonly glyph: ReactNode; readonly onExit: () => void }) {
  return (
    <div className="flex w-full flex-col items-center gap-3" data-call-mode-pending="">
      <div aria-hidden className="flex h-24 items-center gap-2">
        {[0.82, 1.1, 0.82].map((scale, index) => (
          <span key={index} className="size-16 rounded-full bg-media-fill" style={{ scale: String(scale) }} />
        ))}
      </div>
      <div className="flex w-full justify-start px-6">
        <button type="button" aria-label={label} title={label} onClick={onExit} className="glass-call grid size-12 place-items-center rounded-full text-on-media">
          {glyph}
        </button>
      </div>
    </div>
  );
}

/** Le bouton qui a ouvert chaque panneau : le focus y revient quand on revient au menu. */
const PANEL_OPENER: Readonly<Record<CallPanelKind, string>> = {
  people: '[data-call-control="invite"]',
  react: '[data-call-control="react"]',
  record: '[data-call-record]',
  journal: '[data-call-control="journal"]',
};

const MORE = '[data-call-more]';

/** La couleur d'un locuteur : une fonction pure, la même à chaque rendu — les lignes mémoïsées du bandeau et du journal ne se redessinent pas pour elle. */
const colorOf = (who: Pick<CallCaption, 'speakerId' | 'speakerName'>): string => speakerColor(who.speakerId, who.speakerName);

/** Où va le focus quand la couche change : au bouton qui avait ouvert le panneau, sinon à `(…)` — que le journal rangé (#17343) ne lui prend pas. */
function focusTarget(from: CallScreenLayer, to: CallScreenLayer): string | null {
  if (from.kind === to.kind && (from.kind !== 'panel' || to.kind !== 'panel' || from.panel === to.panel)) return null;
  if (to.kind === 'menu' && from.kind === 'panel') return to.stowed === undefined ? PANEL_OPENER[from.panel] : null;
  if (to.kind === 'idle' && (from.kind === 'panel' || from.kind === 'mode')) return MORE;
  return null;
}

type EffectsSupport = { readonly color: boolean; readonly blur: boolean };

/** Ce que ma caméra sait faire en effets — relu quand la piste envoyée change. */
function useEffectsSupport(stream: MediaStream | null, forced: EffectsSupport | undefined): EffectsSupport {
  const sent = stream?.getVideoTracks()[0] ?? null;
  return useMemo(() => forced ?? { color: browserColorSupport(), blur: blurCapable(sent === null ? null : cameraSourceOf(sent)) }, [forced, sent]);
}

/** Retourner, choisir sa caméra, ou rien (#9094) — relu quand la caméra s'allume et quand un appareil arrive ou part. */
function useCameraSwitch(cameraOn: boolean): CameraSwitch {
  const [cameraSwitch, setCameraSwitch] = useState<CameraSwitch>('flip');
  useEffect(() => {
    const media = typeof navigator === 'undefined' ? undefined : navigator.mediaDevices;
    if (media?.enumerateDevices === undefined) return undefined;
    const read = () => void media.enumerateDevices().then((devices) => setCameraSwitch(cameraSwitchOf(devices)), () => undefined);
    read();
    media.addEventListener?.('devicechange', read);
    return () => media.removeEventListener?.('devicechange', read);
  }, [cameraOn]);
  return cameraSwitch;
}

const CallDeclineSheet = lazy(() =>
  import('./call-decline-entry').then((module) => ({
    default: module.ConnectedCallDeclineSheet,
  })),
);

const screenGlyph = (name: CallScreenGlyphName, size = 24) => <GlyphSvg glyph={CALL_SCREEN_GLYPHS[name]} size={size} />;

const browserCanShare = (): boolean => typeof navigator !== 'undefined' && canShareScreen(navigator.mediaDevices);

/** Le plein écran de l'écran partagé : l'API Fullscreen sur la scène, et, sans elle, tout le reste s'efface. */
function useImmersive(stage: React.RefObject<HTMLElement | null>, available: boolean): readonly [boolean, () => void] {
  const [immersive, setImmersive] = useState(false);
  useEffect(() => {
    const onChange = () => {
      if (document.fullscreenElement === null) setImmersive(false);
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);
  useEffect(() => {
    if (available || !immersive) return;
    setImmersive(false);
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
  }, [available, immersive]);
  const toggle = () => {
    const element = stage.current;
    if (immersive) {
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
      setImmersive(false);
      return;
    }
    if (element !== null && typeof element.requestFullscreen === 'function' && document.fullscreenEnabled) void element.requestFullscreen().catch(() => undefined);
    setImmersive(true);
  };
  return [available && immersive, toggle] as const;
}

type CallScreenProps = {
  readonly call: ActiveCall;
  readonly canShare?: boolean;
  /** Les actions sorties dès l'ouverture — pour un rendu sans geste (témoins, captures). */
  readonly initiallyExpanded?: boolean;
  /** Ce que le navigateur sait faire en effets — imposé par les témoins. */
  readonly effectsSupport?: EffectsSupport;
  /** La fenêtre a la place du journal en colonne (#16942) — mesurée, ou imposée par les témoins. */
  readonly wide?: boolean;
};

export function CallScreen({ call, canShare = browserCanShare(), initiallyExpanded = false, effectsSupport, wide }: CallScreenProps) {
  useMediaSystemBars();
  const language = currentInterfaceLanguage();
  const t = (key: PlainCallKey): string => translate(language, key);
  const [layer, setLayer] = useState<CallScreenLayer>(initiallyExpanded ? { kind: 'menu' } : IDLE);
  const [choice, setChoice] = useState<SpotlightChoice>(null);
  const [selfFull, setSelfFull] = useState(false);
  const [declineOpen, setDeclineOpen] = useState(false);
  const focusNext = useRef<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const myPreview = useRef<HTMLVideoElement | null>(null);
  const moderation = useCallModeration(call);
  const liveFrame = useLiveFrameState();
  const phase = call.phase.kind;
  const joined = phase === 'connected' || phase === 'reconnecting';
  const statusKey = callStatusKey(call);
  const layout = joined ? callLayout(call) : 'portrait';
  const live = phase !== 'ended' && phase !== 'incoming';
  const endedClock = phase === 'ended' && call.endedDurationSec !== null && call.endedDurationSec > 0 ? formatCallClock(call.endedDurationSec) : null;
  const spotlight =
    layout === 'grid'
      ? resolveSpotlight({
          members: orderedMembers(call.members),
          choice,
          remoteStreams: call.remoteStreams,
        })
      : null;
  const sharedScreenShown = layout === 'screen' || spotlight?.screen === true;
  const [immersive, toggleImmersive] = useImmersive(stageRef, layout === 'screen' || spotlight !== null);
  const videoScene = live && isVideoScene(call);
  /* P9.5, P9.6 : le duo audio dessine l'autre à SA couleur (l'identifiant primant) et l'allume à sa parole — mesurée sur son flux, jamais lue dans les sous-titres. */
  const peerId = call.peerKey ?? null;
  const peerTint = peerId === null ? undefined : speakerColor(peerId, call.title);
  const peerHeard = usePeerSpeaking(joined && layout === 'portrait' ? (call.remoteStreams[peerId ?? orderedMembers(call.members)[0]?.userId ?? ''] ?? null) : null);
  const sharer = layout === 'screen' ? screenSharer(call.members) : null;
  const support = useEffectsSupport(call.localStream, effectsSupport);
  const cameraSwitch = useCameraSwitch(call.cameraOn);
  const set = callControlSet({ ...call, canShare, canEffect: effectsOffered(support), cameraSwitch, videoScene });
  const framed = liveFrameShown(call, liveFrame, live && layer.kind !== 'mode');
  const place = spotlight !== null && spotlight.featured === null ? 'top' : selfZoomPlace({ layout, selfFull, selfTileShown: call.cameraOn && !framed });
  const local = useLocalZoom(call.callId, call.facing);
  const offer: LayerOffer = {
    effects: set.mine.includes('effects'),
    montage: set.call.includes('capture'),
    people: set.call.includes('invite'),
    react: set.call.includes('react'),
    record: set.call.includes('record'),
    journal: joined,
  };
  const shown = live ? layerOffered(layer, offer) : IDLE;
  const chrome = layerChrome(shown);
  const disposition = controlsDisposition({ participantCount: participantCountOf(call, layout), showsGroupGrid: layout === 'grid' });
  const rails = railRows(disposition, set, shown);
  const viewport = useCallViewport();
  const tileCorner = useStore(selfTileStore, (state) => selfTileCornerFor(state, call.callId ?? ''));
  const tileScale = useStore(selfTileStore, (state) => selfTileScaleFor(state, call.callId ?? ''));
  const swipe = useCallSwipeDown({
    root,
    allowed: live && swipeDownAllowed({ joined, layout, layerIdle: shown.kind === 'idle' }),
    canPip: shouldOfferPip(call, browserPipSupport()),
    reducedMotion: prefersReducedMotion(),
    onOutcome: (outcome) => {
      if (outcome === 'pip') requestCallPip();
      callActions.minimize();
    },
  });
  const { visibility, reveal: revealChrome } = useCallChrome({ videoScene: videoScene && chrome.mode === null, root, swallowTap: swipe.swallowTap });
  const send = (event: CallLayerEvent) => {
    const next = nextLayer(shown, event);
    focusNext.current = focusTarget(shown, next);
    setLayer(next);
  };
  const { column, panels, reserve, reserveEnd, bleedEnd } = useJournalDock({ wide, available: live && offer.journal && chrome.mode === null, panel: chrome.panel, send });
  const nameOf = (userId: string): string | null => call.members[userId]?.name ?? null;
  const closeGlyph = <GlyphSvg glyph={CALL_VIEW_GLYPHS.x} size={20} />;
  const expanded = shown.kind === 'menu' || shown.kind === 'panel';
  const pillPanel = chrome.panel !== null && panelInThePill(chrome.panel) ? chrome.panel : null;
  const grown = unfoldsPill(disposition, shown);

  useEffect(() => {
    if (!live) return undefined;
    void loadActions().catch(() => undefined);
    void loadRails().catch(() => undefined);
    void loadFloatingPill().catch(() => undefined);
    return whenIdle(prefetchCallChunks);
  }, [live]);

  useEffect(() => {
    if (expanded) prefetchCallChunks();
  }, [expanded]);

  useEffect(() => {
    if (shown !== layer) setLayer(shown);
  }, [shown.kind, shown.kind === 'panel' ? shown.panel : shown.kind === 'mode' ? shown.mode : '']);

  useLayoutEffect(() => {
    const selector = focusNext.current;
    focusNext.current = null;
    if (selector !== null) root.current?.querySelector<HTMLElement>(selector)?.focus();
  });

  useEscapeFolds({ live, panelOpen: chrome.panel !== null, column, send });

  const identity = (
    <div className="flex flex-col items-center gap-3 px-6 text-center">
      {/* P17 (#16944) : la vidéo de l'appelant tient lieu de portrait pendant la sonnerie. */}
      {phase === 'incoming' && hasVideo(call.preview) ? null : (
        <span data-call-incoming-portrait="">
          <Portrait name={call.title} avatar={call.avatar} size={112} pulse={phase === 'incoming' || phase === 'outgoing'} presenceKey={call.peerKey ?? undefined} {...(peerTint === undefined ? {} : { tint: peerTint })}>
            {peerTint === undefined ? null : <SpeechRing color={peerTint} speaking={peerHeard} ms={cameraOffFadeMs(prefersReducedMotion())} />}
          </Portrait>
        </span>
      )}
      <h2 className="text-[1.6rem] font-bold leading-tight" style={{ color: INK }}>
        {call.title}
      </h2>
      {phase === 'incoming' && call.invitedBy !== null && call.callerName !== null ? (
        <p className="text-body" style={{ color: INK_2 }} data-call-invited-by="">
          {translateCallControls(language, 'callControls.incomingInvite', { name: call.callerName })}
        </p>
      ) : phase === 'incoming' && call.isGroup && call.callerName !== null ? (
        <p className="text-body" style={{ color: INK_2 }}>
          {translate(language, 'call.incoming.group', {
            caller: call.callerName,
          })}
        </p>
      ) : null}
      {phase === 'outgoing' && call.previewed ? (
        <p className="glass-call rounded-full px-3 py-1 text-mini" data-call-previewed="">
          {translate(language, call.media === 'video' ? 'call.preview.seenBy' : 'call.preview.heardBy', { name: call.title })}
        </p>
      ) : null}
      <div className="text-body" style={{ color: INK_2 }} data-call-status="">
        <span role="status" aria-live="polite">
          {statusKey === null ? null : t(statusKey)}
        </span>
        {statusKey !== null && endedClock !== null ? ' · ' : null}
        {statusKey === null || endedClock !== null ? (
          <span data-call-duration="">
            <span className="sr-only">{t('call.duration.a11y.label')} </span>
            {statusKey === null ? <CallClock call={call} active={joined} /> : endedClock}
          </span>
        ) : null}
      </div>
    </div>
  );

  const pills = visibleStatusPills(call, layout);
  const pillRow = live ? (
    <>
      {pills.length > 0 ? (
        <div className="flex flex-wrap justify-center gap-2 px-4" data-call-pill-row="" data-call-chrome-fade="">
          {pills.map((pill) => (
            <span key={pill} className="glass-call rounded-full px-3 py-1 text-mini" data-call-pill={pill}>
              {t(STATUS_PILL_KEY[pill])}
            </span>
          ))}
        </div>
      ) : null}
      <CallPeerAlerts members={call.members} language={language} />
    </>
  ) : null;

  const captureShown = live && someoneCaptures(call.members);
  /* R1 : la capsule de capture se pose UNE fois sous l'en-tête, en audio comme
     en vidéo, et ne suit jamais le chrome — ni son fondu, ni un mode, ni un
     panneau : une capture ne se cache pas. */
  const captureRow = captureShown ? (
    <div className="relative z-30 flex justify-center" data-call-capture-slot="">
      <CallCaptureAlerts members={call.members} language={language} />
    </div>
  ) : null;

  const selfTopInset = captureShown ? CALL_CAPTURE_ROW_CLEARANCE : 0;
  const self: SelfView = {
    topInset: selfTopInset,
    full: selfFull,
    tileHidden: framed && !selfFull,
    onToggle: () => setSelfFull((full) => !full),
    zoom: chrome.selfZoom ? zoomControlIn(place) : null,
    /* La capsule du zoom en plein écran se pose au bord de début, centrée : quand le rail « mon image » y sort, elle se range derrière lui par une translation, jamais d'un saut (#17327). */
    column: (capsule) =>
      capsule === null ? null : (
        <div className="absolute left-3 top-1/2 z-10 -translate-y-1/2" data-call-stow="" aria-hidden={hidden ? true : undefined} data-call-self-column="">
          <div className={`transition-[translate] duration-300 motion-reduce:transition-none ${railsShown ? 'translate-x-[4.5rem] rtl:-translate-x-[4.5rem]' : ''}`}>{capsule}</div>
        </div>
      ),
    local,
  };
  const stage = (
    <CallStage
      call={call}
      layout={layout}
      language={language}
      choice={choice}
      onChoose={setChoice}
      immersive={immersive}
      onToggleImmersive={toggleImmersive}
      moderation={moderation}
      self={self}
      chromeVisible={visibility === 'shown'}
      onRevealChrome={revealChrome}
      bleedEnd={bleedEnd}
    />
  );

  const incomingControls = <CallIncomingAnswer call={call} language={language} onAccept={callActions.accept} onDecline={callActions.decline} onDeclineMessage={() => setDeclineOpen(true)} />;

  const openAppSettings = appSettingsOpener();
  const endedControls = (
    <div className="flex items-start justify-center gap-10 px-8">
      <RoundButton label={t('call.close')} caption={t('call.close')} size={60} glyph={screenGlyph('arrowsInSimple', 24)} onPress={callActions.dismiss} />
      {canRetry(call) ? <RoundButton label={t('call.retry')} caption={t('call.retry')} tone="accept" size={60} glyph={<Glyph name="phone" size={26} />} onPress={callActions.retry} /> : null}
      {/* UN REFUS DÉFINITIF DU MICRO MÈNE AUX RÉGLAGES DE L'APP (#9033, comme le
          composeur #8882) : dans la coque Android, il ne se redemande plus. */}
      {call.phase.kind === 'ended' && call.phase.reason === 'permission' && openAppSettings !== null ? (
        <RoundButton label={t('call.openSettings')} caption={t('call.openSettings')} size={60} glyph={<GlyphSvg glyph={FLOATING_GLYPHS.gear} size={24} />} onPress={openAppSettings} />
      ) : null}
    </div>
  );

  const overlayVideo = layout === 'video-duo' || layout === 'screen';
  const hidden = visibility !== 'shown' || immersive;
  const railsShown = rails.length > 0 && !hidden;
  /* LES SOUS-TITRES VIVENT DANS LA PILULE (#17343, `call-pill-text.ts`) : au repos
     dans son verre, au-dessus de sa rangée de base ; (…) les range, refermer les
     actions les rend ; le journal s'ouvre à leur place. Ils ne s'effacent JAMAIS
     avec les commandes, et UN SEUL verre les porte (G1.3, #17536) : la pilule
     rangée d'un toucher les garde dans son verre, qui perd sa rangée de base et se
     resserre autour d'eux. Seul un mode, qui n'a pas de pilule, les pose dans un
     verre à eux. */
  const text: CallPillText = live ? callPillText({ captionsOn: call.captionsMode !== 'off', layer: shown, chromeShown: !hidden }) : 'none';
  const stowedWithCaptions = hidden && pillStaysWhenChromeStowed(text);
  /* Toujours montés : c'est `CallCaptionsSlot`, dans son chunk, qui les pose quand
     `visible` et les fait repartir en fondu sinon (#17406) — rangés par (…),
     éteints, ou laissés seuls quand un mode a pris l'écran. */
  const captionsOf = (slot: 'captions' | 'captionsAlone', visible: boolean): ReactNode => (
    <Suspense fallback={null}>
      <CallCaptionsSlot slot={slot} shown={visible} call={call} language={language} colorOf={colorOf} onOpenJournal={joined ? () => panels.toggle('journal') : undefined} />
    </Suspense>
  );
  const standaloneCaptions = (): ReactNode => (
    <div className={`${PILL_TEXT_WIDTH_CLASS} relative z-10 mx-auto`} data-call-captions-band="">
      {captionsOf('captionsAlone', text === 'captionsAlone')}
    </div>
  );
  const panelOf = (open: CallPanelKind): ReactNode => {
    const base = {
      id: CALL_PANEL_ID[open],
      closeGlyph,
      language,
      Button: CallButton,
      onClose: () => send({ type: 'close' }),
      back: { label: translateCallControls(language, 'callControls.back'), onPress: () => send({ type: 'back' }) },
    };
    switch (open) {
      case 'react':
        return <CallReactionPalette {...base} />;
      case 'record':
        return <CallRecordChoice {...base} />;
      case 'journal':
        return <CallJournalPanel {...base} captions={call.captions} notes={call.journalNotes ?? []} colorOf={colorOf} startedAt={call.connectedAt} listening={call.captionsMode !== 'off'} onListen={callActions.toggleCaptions} windowHeight={viewport.height} />;
      case 'people':
        /* Une feuille se referme sur le menu qu'elle recouvrait (G3.5, `backToMenu` d'iOS), pas sur la pilule de base. */
        return <CallPeopleSheet {...base} onClose={base.back.onPress} members={orderedMembers(call.members)} renderModeration={(member) => <CallModerationSlot member={member} language={language} moderation={moderation} />} />;
    }
  };
  const exitMode = () => send({ type: 'exit-mode' });
  const mode =
    chrome.mode === 'effects' ? (
      <CallEffectsMode
        language={language}
        colorAvailable={support.color}
        blurAvailable={support.blur}
        preview={<StreamVideo stream={call.localStream} mirrored={selfPreviewMirrored(call)} className="size-full" videoRef={myPreview} />}
        selfVideo={() => myPreview.current}
        others={{ ...call, Portrait, colorOf: speakerColor }}
        captions={call.captions}
        onExit={exitMode}
      />
    ) : chrome.mode === 'montage' ? (
      <CallMontageMode language={language} quitGlyph={closeGlyph} onExit={exitMode} stage={() => root.current} call={call} loadFrames={loadFrameStudio} hold={liveFrameHold(call, liveFrame)} />
    ) : null;
  /* LE CHROME SE RANGE VERS SES BORDS, ET REVIENT PAR LE MÊME CHEMIN (G1.11, G2.8, #17406) : l'en-tête par le haut, la pilule par le bas, les bandeaux en fondu (`data-call-stow`, `call-motion.css`). Il ne retire JAMAIS le doigt à un bouton encore visible (#8735) : rangés d'un toucher, ils deviennent `invisible` à la FIN du mouvement, et reviennent d'un coup. Sous « Réduire les animations » : un fondu court, sans déplacement (`useStowFade`). */
  useStowFade(root, hidden);
  usePublishChrome(hidden);

  return (
    <div
      ref={root}
      role="dialog"
      aria-modal="true"
      aria-label={translate(language, 'call.a11y.screen', { name: call.title })}
      className={`fixed inset-0 z-[200] flex flex-col pb-safe pt-safe ${swipe.dragging ? '' : 'transition-transform duration-300 ease-out motion-reduce:transition-none'}`}
      style={{ background: BACKDROP, color: INK, ...(swipe.allowed ? { touchAction: 'none' } : {}), ...(swipe.offset === 0 ? {} : { transform: `translateY(${swipe.offset}px)` }) }}
      data-call-swipe-down={swipe.allowed ? (swipe.dragging ? 'dragging' : 'ready') : undefined}
      data-call-screen={phase}
      data-call-chrome={hidden ? 'hidden' : 'shown'}
      data-call-layer={shown.kind}
      data-call-journal-dock={column.shown ? 'column' : undefined}
    >
      {call.preview === null ? null : (
        <Suspense fallback={null}>
          <CallPreview stream={call.preview} language={language} kit={PREVIEW_KIT} />
        </Suspense>
      )}
      {overlayVideo ? (
        <div ref={stageRef} className="absolute inset-0" style={bleedEnd === 0 ? undefined : { insetInlineEnd: bleedEnd }} data-call-stage-surface="" {...reserve}>
          {stage}
        </div>
      ) : null}
      <CallLiveFrameSurfaceSlot shown={framed} state={liveFrame} language={language} call={call} stage={() => stageRef.current} load={loadFrameStudio} />
      <CallControlFeedbackSlot language={language} nameOf={nameOf} live={live} />
      <div className="relative flex min-h-0 flex-1 flex-col gap-4">
        {chrome.header ? (
          <div className="relative z-20" data-call-stow="top" aria-hidden={hidden ? true : undefined} data-call-plane="">
            <CallScreenHeader call={call} language={language} joined={joined} prominent={sharedScreenShown} />
          </div>
        ) : null}
        {captureRow}
        {live ? <CallLiveFrameStatusSlot language={language} state={liveFrame} load={loadFrameStudio} /> : null}
        {layout === 'grid' ? (
          <>
            {immersive || chrome.mode !== null ? null : (
              <div data-call-stow="" aria-hidden={hidden ? true : undefined}>
                {pillRow}
              </div>
            )}
            <div ref={stageRef} className="flex min-h-0 flex-1 flex-col" style={reserveEnd} data-call-stage-surface="" {...reserve}>
              {stage}
            </div>
          </>
        ) : overlayVideo ? (
          <div className={`flex flex-col items-center gap-2 px-6 ${chrome.mode === null ? '' : 'invisible'}`} data-call-stow="" style={reserveEnd} aria-hidden={hidden || chrome.mode !== null ? true : undefined} {...reserve}>
            {sharer === null ? null : (
              <span className="glass-call-prominent rounded-full px-3 py-1 text-mini" role="status" data-call-screen-banner="">
                {translate(language, 'call.screen.peerSharing', {
                  name: sharer.name,
                })}
              </span>
            )}
            {pillRow}
          </div>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-5">
            {identity}
            {pillRow}
          </div>
        )}
        {overlayVideo ? <div className="flex-1" /> : null}
        {live ? (
          <div className="relative z-20 flex flex-col gap-3 pb-6" style={reserveEnd} data-call-plane="" {...reserve}>
            {mode !== null && text === 'captionsAlone' ? standaloneCaptions() : null}
            {mode === null ? (
              <div className="flex flex-col gap-3" {...(stowedWithCaptions ? {} : { 'data-call-stow': 'bottom' })} aria-hidden={hidden && !stowedWithCaptions ? true : undefined} data-call-controls="">
                <CallControlPill
                  call={call}
                  language={language}
                  rows={pillRows(disposition, set, shown)}
                  expanded={expanded}
                  grown={grown}
                  onToggle={() => send({ type: 'toggle-menu' })}
                  prominent={sharedScreenShown}
                  text={text}
                  captions={captionsOf('captions', text === 'captions' || stowedWithCaptions)}
                  panels={panels}
                  kit={ROWS_KIT}
                  panel={pillPanel === null ? null : <Suspense fallback={null}>{panelOf(pillPanel)}</Suspense>}
                  stowed={stowedWithCaptions}
                />
              </div>
            ) : (
              <Suspense fallback={<CallModePending label={t('call.close')} glyph={closeGlyph} onExit={exitMode} />}>{mode}</Suspense>
            )}
          </div>
        ) : (
          <div className="pb-6">{phase === 'incoming' ? incomingControls : endedControls}</div>
        )}
        {live && chrome.mode === null ? (
          <Suspense fallback={null}>
            <CallRails
              call={call}
              rails={railsBySide(rails)}
              open={railsShown}
              language={language}
              panels={panels}
              kit={ROWS_KIT}
              Rail={CallActionRail}
              viewport={viewport}
              inset={bleedEnd}
              tile={selfTileFootprint({ layout, cameraOn: call.cameraOn, swapped: selfFull, framed, immersive, corner: tileCorner, scale: tileScale, viewport, topInset: selfTopInset })}
            />
          </Suspense>
        ) : null}
        {column.shown ? (
          <Suspense fallback={null}>
            <CallJournalInColumn width={JOURNAL_COLUMN_WIDTH} gutter={JOURNAL_COLUMN_GUTTER} id={CALL_PANEL_ID.journal} closeGlyph={closeGlyph} language={language} Button={CallButton} onClose={column.close} captions={call.captions} notes={call.journalNotes ?? []} colorOf={colorOf} startedAt={call.connectedAt} listening={call.captionsMode !== 'off'} onListen={callActions.toggleCaptions} />
          </Suspense>
        ) : null}
        {chrome.panel !== null && !panelInThePill(chrome.panel) ? <Suspense fallback={null}>{panelOf(chrome.panel)}</Suspense> : null}
        {declineOpen && phase === 'incoming' ? (
          <Suspense fallback={null}>
            <CallDeclineSheet call={call} language={language} onClose={() => setDeclineOpen(false)} />
          </Suspense>
        ) : null}
      </div>
    </div>
  );
}
