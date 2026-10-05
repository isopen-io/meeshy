import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useStore } from 'zustand/react';

import type { CallRowsKit } from '@/components/call-control-actions';
import { CallControlPill } from '@/components/call-control-pill';
import { CallButton } from '@/components/call-glass-button';
import { Portrait } from '@/components/call-grid';
import { CallControlFeedbackSlot, CallModerationSlot } from '@/components/call-control-slots';
import { CallPeerAlerts } from '@/components/call-quality';
import { StreamAudio, StreamVideo } from '@/components/call-media-elements';
import { CallClock, CallScreenHeader } from '@/components/call-screen-header';
import { CallStage, selfPreviewMirrored, type SelfView } from '@/components/call-stage';
import { Glyph, GlyphSvg } from '@/components/glyph';
import { CALL_DEVICES_GLYPHS } from '@/components/glyphs-call-devices';
import { CALL_SCREEN_GLYPHS, type CallScreenGlyphName } from '@/components/glyphs-call-screen';
import { CALL_VIEW_GLYPHS } from '@/components/glyphs-call-view';
import { FLOATING_GLYPHS } from '@/components/glyphs-floating';
import { callActions } from '@/lib/calls/call-actions';
import { callControlSet, cameraSwitchOf, isVideoScene, type CameraSwitch } from '@/lib/calls/call-controls';
import { browserPipSupport, requestCallPip, shouldOfferPip } from '@/lib/calls/call-pip';
import { onRowKeyDown, onRowWheel, ROW_ITEM } from '@/lib/calls/call-row-keys';
import { CALL_ACTIONS_ID, CALL_PANEL_ID, IDLE, layerChrome, layerOffered, nextLayer, type CallLayerEvent, type CallPanelKind, type CallPanels, type CallScreenLayer, type LayerOffer } from '@/lib/calls/call-screen-layer';
import { mineInMenu, SELF_CONTROL_GROUPS, selfControlsPlace, zoomControlIn } from '@/lib/calls/call-self-controls';
import { SELF_SPEAKER_COLOR, speakerColor } from '@/lib/calls/call-speaker-color';
import { resolveSpotlight, type SpotlightChoice } from '@/lib/calls/call-spotlight';
import type { CallCaption } from '@/lib/calls/call-captions';
import { formatCallClock, type ActiveCall, type CallMember } from '@/lib/calls/call-store';
import { callLayout, callStatusKey, type PlainCallKey, canRetry, canShareScreen, hasVideo, orderedMembers, screenSharer, STATUS_PILL_KEY, statusPills } from '@/lib/calls/call-view';
import { useLocalZoom } from '@/lib/calls/self-zoom';
import { swipeDownAllowed } from '@/lib/calls/call-swipe-down';
import { useCallChrome } from '@/lib/calls/use-call-chrome';
import { useCallSwipeDown } from '@/lib/calls/use-call-swipe-down';
import { useCallModeration } from '@/lib/calls/use-call-moderation';
import { translateCallControls } from '@/lib/i18n-call-controls-catalog';
import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { prefersReducedMotion } from '@/lib/view/reduced-motion';
import { appSettingsOpener } from '@/lib/view/settings-recovery';
import { blurCapable, browserColorSupport, cameraSourceOf, effectsOffered, effectsUsedOf, videoEffectsStore } from '@/lib/calls/video-effects';

import type { EffectsCompanion } from './call-effects-companions';

/**
 * **L'ÉCRAN D'APPEL** (#6382, #8045, #8391) — miroir de `CallView.swift` et
 * d'`IncomingCallView.swift` : toujours sombre (iOS peint l'appel sur fond
 * noir quel que soit le schéma), un portrait pulsé pendant la sonnerie, la
 * vidéo distante plein cadre avec la vignette locale en coin, une grille pour
 * un groupe.
 *
 * Connecté, la vue suit « C adapté » : en bas, une pilule de verre identique en
 * audio, vidéo et groupe — `(…)` · Micro · Sortie · Fin (`call-control-pill.tsx`) ;
 * `(…)` la fait grandir vers le haut et y empile une rangée par famille, qui
 * défile à l'horizontale (`call-control-actions.tsx`, #8550) ; en haut,
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
 * L'appel entrant, l'écran de fin, la pastille, la bulle et la fenêtre PiP ne
 * changent pas.
 */

const INK = 'var(--color-on-media)';
const INK_2 = 'var(--color-on-media-3)';
const BACKDROP = 'linear-gradient(180deg, var(--ios-indigo-950) 0%, var(--color-media-backdrop) 100%)';
const HANGUP = 'var(--ios-error-strong)';
const ANSWER = 'var(--ios-success)';

/* Refuser et Accepter gardent leur couleur de signal ; le neutre prend le verre d'appel. */
const SIGNAL_TONE = { danger: { background: HANGUP, color: INK }, accept: { background: ANSWER, color: INK } } as const;

/**
 * Le bouton rond de l'appel entrant et de l'écran de fin. Neutre, il porte le
 * verre d'appel comme tout bouton qui flotte seul (#8432) ; Refuser est rouge,
 * Accepter vert.
 */
function RoundButton({
  label,
  glyph,
  onPress,
  tone = 'plain',
  size = 56,
  caption,
  popup = false,
  control,
}: {
  readonly label: string;
  readonly glyph: ReactNode;
  readonly onPress: () => void;
  readonly tone?: 'plain' | 'danger' | 'accept';
  readonly size?: number;
  readonly caption?: string;
  readonly popup?: boolean;
  readonly control?: string;
}) {
  const glass = tone === 'plain';
  return (
    <div className="flex flex-col items-center gap-1.5">
      <button
        type="button"
        aria-label={label}
        {...(popup ? { 'aria-haspopup': 'dialog' as const } : {})}
        {...(control === undefined ? {} : { 'data-call-control': control })}
        onClick={onPress}
        className={`${glass ? 'glass-call ' : ''}grid place-items-center rounded-full transition-transform active:scale-95 motion-reduce:transition-none`}
        style={tone === 'plain' ? { width: size, height: size } : { width: size, height: size, ...SIGNAL_TONE[tone] }}
      >
        {glyph}
      </button>
      {caption === undefined ? null : (
        <span className="text-mini" style={{ color: INK_2 }}>
          {caption}
        </span>
      )}
    </div>
  );
}

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
const CallCaptionsPanel = lazy(() => loadCaptions().then((module) => ({ default: module.CallCaptionsPanel })));

const loadActions = once(() => import('./call-control-actions'));

const CallPreview = lazy(() => import('./call-preview').then((module) => ({ default: module.CallPreview })));

const PREVIEW_KIT = { Video: StreamVideo, Audio: StreamAudio, soundOn: <GlyphSvg glyph={CALL_VIEW_GLYPHS.speakerHigh} size={22} />, soundOff: <GlyphSvg glyph={CALL_VIEW_GLYPHS.speakerSlash} size={22} /> };

const useEffectsActive = (): boolean => useStore(videoEffectsStore, (state) => effectsUsedOf(state.effects).length > 0);

const ROWS_KIT: CallRowsKit = {
  Button: CallButton,
  glyphs: CALL_VIEW_GLYPHS,
  onRowKeyDown,
  onRowWheel,
  rowItem: ROW_ITEM,
  actionsId: CALL_ACTIONS_ID,
  panelIds: CALL_PANEL_ID,
  useEffectsActive,
  cameraSourceOf,
  requestPip: requestCallPip,
  pipGlyph: <GlyphSvg glyph={CALL_DEVICES_GLYPHS.pictureInPicture} size={22} />,
};

const CallCameraControls = lazy(() => loadActions().then((module) => ({ default: module.CallCameraControls })));

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
  loadEffectsMode,
  loadMontageMode,
  loadPanels,
  loadPeople,
  loadJournal,
  loadCaptions,
  () => import('./call-devices-sheet'),
  () => import('./call-quality-detail'),
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

/** Où va le focus quand la couche change : au bouton qui avait ouvert le panneau, sinon à `(…)`. */
function focusTarget(from: CallScreenLayer, to: CallScreenLayer): string | null {
  if (from.kind === to.kind && (from.kind !== 'panel' || to.kind !== 'panel' || from.panel === to.panel)) return null;
  if (to.kind === 'menu' && from.kind === 'panel') return PANEL_OPENER[from.panel];
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
};

export function CallScreen({ call, canShare = browserCanShare(), initiallyExpanded = false, effectsSupport }: CallScreenProps) {
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
  const sharer = layout === 'screen' ? screenSharer(call.members) : null;
  const support = useEffectsSupport(call.localStream, effectsSupport);
  const cameraSwitch = useCameraSwitch(call.cameraOn);
  const set = callControlSet({ ...call, canShare, canEffect: effectsOffered(support), cameraSwitch, canPip: shouldOfferPip(call, browserPipSupport()), videoScene });
  const place = spotlight !== null && spotlight.featured === null ? 'top' : selfControlsPlace({ layout, selfFull, selfTileShown: call.cameraOn });
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
  const visibility = useCallChrome({ videoScene: videoScene && chrome.mode === null, root, swallowTap: swipe.swallowTap });
  const send = (event: CallLayerEvent) => {
    const next = nextLayer(shown, event);
    focusNext.current = focusTarget(shown, next);
    setLayer(next);
  };
  const panels: CallPanels = { open: chrome.panel, toggle: (panel) => send({ type: 'open-panel', panel }), enter: (mode) => send({ type: 'enter-mode', mode }) };
  const nameOf = (userId: string): string | null => call.members[userId]?.name ?? null;
  const closeGlyph = <GlyphSvg glyph={CALL_VIEW_GLYPHS.x} size={20} />;
  const expanded = shown.kind === 'menu' || shown.kind === 'panel';

  useEffect(() => {
    if (!live) return undefined;
    void loadActions().catch(() => undefined);
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

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !live) return;
      if (chrome.panel !== null) send({ type: 'close' });
      else callActions.minimize();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [live, chrome.panel]);

  const identity = (
    <div className="flex flex-col items-center gap-3 px-6 text-center">
      <Portrait name={call.title} avatar={call.avatar} size={112} pulse={phase === 'incoming' || phase === 'outgoing'} />
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
      <p className="text-body" role="status" aria-live="polite" style={{ color: INK_2 }} data-call-status="">
        {statusKey === null ? <CallClock call={call} active={joined} /> : t(statusKey)}
        {endedClock === null ? null : ` · ${endedClock}`}
      </p>
    </div>
  );

  const pills = statusPills(call);
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

  const self: SelfView = {
    full: selfFull,
    onToggle: () => setSelfFull((full) => !full),
    controls: chrome.selfControls,
    mine: set.mine,
    row: (group) =>
      place === 'menu' ? null : (
        <div className={fade} aria-hidden={hidden ? true : undefined} data-call-self-controls-holder={place}>
          <Suspense fallback={null}>
            <CallCameraControls
              call={call}
              set={set}
              language={language}
              panels={panels}
              kit={ROWS_KIT}
              place={place}
              local={zoomControlIn(place) === 'step' && group !== 'effects' ? local : null}
              group={group}
              only={group === undefined ? undefined : SELF_CONTROL_GROUPS[group]}
            />
          </Suspense>
        </div>
      ),
    column: (capsule) =>
      capsule === null ? null : (
        <div className={`absolute left-3 top-1/2 z-10 -translate-y-1/2 ${fade}`} aria-hidden={hidden ? true : undefined} data-call-self-column="">
          {capsule}
        </div>
      ),
  };
  const stage = <CallStage call={call} layout={layout} language={language} choice={choice} onChoose={setChoice} immersive={immersive} onToggleImmersive={toggleImmersive} moderation={moderation} self={self} />;

  const incomingControls = (
    <div className="flex flex-col gap-6">
      <div className="flex justify-center">
        <RoundButton
          label={translate(language, 'callDecline.title')}
          caption={translate(language, 'callDecline.open')}
          size={48}
          glyph={screenGlyph('chatCircleText', 22)}
          onPress={() => setDeclineOpen(true)}
          popup
          control="decline-message"
        />
      </div>
      <div className="flex items-start justify-around gap-6 px-8">
        <RoundButton label={t('call.decline')} caption={t('call.decline')} tone="danger" size={68} glyph={screenGlyph('phoneDisconnect', 30)} onPress={callActions.decline} />
        {call.media === 'video' ? <RoundButton label={t('call.accept.audioOnly')} caption={t('call.accept.audioOnly')} size={68} glyph={<Glyph name="phone" size={28} />} onPress={() => callActions.accept({ audioOnly: true })} /> : null}
        <RoundButton label={t('call.accept')} caption={t('call.accept')} tone="accept" size={68} glyph={call.media === 'video' ? screenGlyph('videoCamera', 30) : <Glyph name="phone" size={28} />} onPress={() => callActions.accept()} />
      </div>
    </div>
  );

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
  /* Les sous-titres ne s'effacent JAMAIS avec les commandes : posés dans le
     cadre de la pilule déployée, ils en sortent quand elle s'efface, et
     restent lus (et annoncés) au-dessus de sa place. */
  const captionsFramed = expanded && !hidden && chrome.panel !== 'journal';
  const colorOf = (caption: CallCaption): string => (caption.mine ? SELF_SPEAKER_COLOR : speakerColor(caption.speakerId));
  const captions =
    call.captionsMode === 'off' || !live || chrome.panel === 'journal' ? null : (
      <Suspense fallback={null}>
        <CallCaptionsPanel call={call} language={language} colorOf={colorOf} surface={captionsFramed ? 'inset' : 'glass'} />
      </Suspense>
    );
  const panelOf = (open: CallPanelKind): ReactNode => {
    const base = {
      id: CALL_PANEL_ID[open],
      closeGlyph,
      language,
      onClose: () => send({ type: 'close' }),
      back: { label: translateCallControls(language, 'callControls.back'), onPress: () => send({ type: 'back' }) },
    };
    switch (open) {
      case 'react':
        return <CallReactionPalette {...base} onRowKeyDown={onRowKeyDown} onRowWheel={onRowWheel} />;
      case 'record':
        return <CallRecordChoice {...base} onRowKeyDown={onRowKeyDown} onRowWheel={onRowWheel} />;
      case 'journal':
        return <CallJournalPanel {...base} captions={call.captions} colorOf={colorOf} listening={call.captionsMode !== 'off'} onListen={callActions.toggleCaptions} />;
      case 'people':
        return <CallPeopleSheet {...base} members={orderedMembers(call.members)} renderModeration={(member) => <CallModerationSlot member={member} language={language} moderation={moderation} />} />;
    }
  };
  const exitMode = () => send({ type: 'exit-mode' });
  /* Les autres, qui accompagnent mon image en mode Effets (#8737), dans leur ordre d'arrivée. */
  const companionOf = (member: CallMember): EffectsCompanion => {
    const stream = call.remoteStreams[member.userId] ?? null;
    const shows = (member.cameraOn || member.screenSharing) && hasVideo(stream);
    return {
      id: member.userId,
      name: member.name,
      color: speakerColor(member.userId),
      render: (width) =>
        shows ? <StreamVideo stream={stream} mirrored={false} fit={member.screenSharing ? 'contain' : 'cover'} className="absolute inset-0 size-full" label={member.name} /> : <Portrait name={member.name} avatar={member.avatar} size={Math.round(width / 2)} pulse={member.link === 'ringing'} />,
    };
  };
  const callAudio = (): readonly MediaStream[] => [call.localStream, ...Object.values(call.remoteStreams)].filter((stream): stream is MediaStream => stream !== null);
  const mode =
    chrome.mode === 'effects' ? (
      <CallEffectsMode
        language={language}
        colorAvailable={support.color}
        blurAvailable={support.blur}
        preview={<StreamVideo stream={call.localStream} mirrored={selfPreviewMirrored(call)} className="size-full" videoRef={myPreview} />}
        selfVideo={() => myPreview.current}
        companions={Object.values(call.members).map(companionOf)}
        captions={call.captions}
        quitGlyph={closeGlyph}
        onExit={exitMode}
        onWheel={onRowWheel}
        audio={callAudio}
      />
    ) : chrome.mode === 'montage' ? (
      <CallMontageMode language={language} quitGlyph={closeGlyph} onExit={exitMode} stage={() => root.current} onWheel={onRowWheel} audio={callAudio} call={call} loadFrames={loadFrameStudio} />
    ) : null;
  /* Le fondu ne retire JAMAIS le doigt à un bouton encore visible (#8735) :
     rangées d'un toucher, les commandes deviennent `invisible` à la FIN du
     fondu (la visibilité suit la transition), et reviennent d'un coup. */
  const fade = `duration-300 motion-reduce:transition-none ${hidden ? 'transition-[opacity,visibility] opacity-0 invisible' : 'transition-opacity opacity-100'}`;

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
    >
      {call.preview === null ? null : (
        <Suspense fallback={null}>
          <CallPreview stream={call.preview} language={language} kit={PREVIEW_KIT} />
        </Suspense>
      )}
      {overlayVideo ? (
        <div ref={stageRef} className="absolute inset-0" data-call-stage-surface="">
          {stage}
        </div>
      ) : null}
      <CallControlFeedbackSlot language={language} nameOf={nameOf} live={live} />
      <div className="relative flex min-h-0 flex-1 flex-col gap-4">
        {chrome.header ? (
          <div className={`relative z-20 ${fade}`} aria-hidden={hidden ? true : undefined} data-call-plane="">
            <CallScreenHeader call={call} language={language} joined={joined} prominent={sharedScreenShown} />
          </div>
        ) : null}
        {layout === 'grid' ? (
          <>
            {immersive || chrome.mode !== null ? null : (
              <div className={fade} aria-hidden={hidden ? true : undefined}>
                {pillRow}
              </div>
            )}
            <div ref={stageRef} className="flex min-h-0 flex-1 flex-col" data-call-stage-surface="">
              {stage}
            </div>
          </>
        ) : overlayVideo ? (
          <div className={`flex flex-col items-center gap-2 px-6 ${fade} ${chrome.mode === null ? '' : 'invisible'}`} aria-hidden={hidden || chrome.mode !== null ? true : undefined}>
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
          <div className="relative z-20 flex flex-col gap-3 pb-6" data-call-plane="">
            {captionsFramed ? null : <div className="relative z-10">{captions}</div>}
            {mode === null ? (
              <div className={`flex flex-col gap-3 ${fade}`} aria-hidden={hidden ? true : undefined} data-call-controls="">
                <CallControlPill
                  call={call}
                  language={language}
                  set={mineInMenu(set, place)}
                  expanded={expanded}
                  onToggle={() => send({ type: 'toggle-menu' })}
                  prominent={sharedScreenShown}
                  framedCaptions={captionsFramed ? captions : null}
                  panels={panels}
                  kit={ROWS_KIT}
                  panel={chrome.panel === null ? null : <Suspense fallback={null}>{panelOf(chrome.panel)}</Suspense>}
                />
              </div>
            ) : (
              <Suspense fallback={<CallModePending label={t('call.close')} glyph={closeGlyph} onExit={exitMode} />}>{mode}</Suspense>
            )}
          </div>
        ) : (
          <div className="pb-6">{phase === 'incoming' ? incomingControls : endedControls}</div>
        )}
        {declineOpen && phase === 'incoming' ? (
          <Suspense fallback={null}>
            <CallDeclineSheet call={call} language={language} onClose={() => setDeclineOpen(false)} />
          </Suspense>
        ) : null}
      </div>
    </div>
  );
}
