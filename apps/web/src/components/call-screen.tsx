import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { CALL_PANEL_ID, type CallPanel } from '@/components/call-control-actions';
import { CallControlPill } from '@/components/call-control-pill';
import { Portrait } from '@/components/call-grid';
import { CallControlFeedbackSlot, CallModerationSlot } from '@/components/call-control-slots';
import { CallPreview } from '@/components/call-preview';
import { CallPeerAlerts } from '@/components/call-quality';
import { CallScreenHeader } from '@/components/call-screen-header';
import { CallStage } from '@/components/call-stage';
import { Glyph, GlyphSvg } from '@/components/glyph';
import { CALL_SCREEN_GLYPHS, type CallScreenGlyphName } from '@/components/glyphs-call-screen';
import { CALL_VIEW_GLYPHS } from '@/components/glyphs-call-view';
import { callActions } from '@/lib/calls/call-actions';
import { callControlSet, flipOffered, isVideoScene } from '@/lib/calls/call-controls';
import { onRowKeyDown } from '@/lib/calls/call-row-keys';
import { SELF_SPEAKER_COLOR, speakerColor } from '@/lib/calls/call-speaker-color';
import { resolveSpotlight, type SpotlightChoice } from '@/lib/calls/call-spotlight';
import { elapsedSeconds, formatCallClock, type ActiveCall } from '@/lib/calls/call-store';
import { callLayout, callStatusKey, type PlainCallKey, canRetry, canShareScreen, orderedMembers, screenSharer, STATUS_PILL_KEY, statusPills } from '@/lib/calls/call-view';
import { useCallChrome } from '@/lib/calls/use-call-chrome';
import { useCallModeration } from '@/lib/calls/use-call-moderation';
import { translateCallControls } from '@/lib/i18n-call-controls-catalog';
import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { blurCapable, browserColorSupport, cameraSourceOf, effectsOffered } from '@/lib/calls/video-effects';

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
 * elles s'effacent aussi après 4 s sans geste (`use-call-chrome.ts`). Au-dessus
 * d'un écran partagé, fond clair par nature, les verres prennent leur teinte
 * plus sombre.
 *
 * Chaque sous-menu s'ouvre DANS le cadre de la pilule, en rangées posées
 * au-dessus des familles, un seul à la fois et chacun dans son chunk :
 * « Effets » (#8442, #8551), « Capturer » (#8552), les participants et qui y
 * ajouter (« Ajouter », #8433), la palette « Réagir » (#8439), le choix « Audio
 * seul » · « Audio et vidéo » d'« Enregistrer » (#8437). Qui modère trouve sur
 * chaque tuile d'un pair, et dans la liste, « Couper le micro » · « Retirer de
 * l'appel » (#8438). Les réactions montent par-dessus la scène, et le mot d'un
 * contrôle s'affiche en haut (`call-control-overlays.tsx`).
 *
 * L'appel entrant, l'écran de fin, la pastille, la bulle et la fenêtre PiP ne
 * changent pas.
 */

const INK = '#ffffff';
const INK_2 = 'rgba(255,255,255,0.72)';
const BACKDROP = 'linear-gradient(180deg, #16131f 0%, #07060b 100%)';
const HANGUP = '#ef4444';
const ANSWER = '#22c55e';

function useSecondTick(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return undefined;
    const handle = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(handle);
  }, [active]);
  return now;
}

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

const CallCaptionsPanel = lazy(() =>
  import('./call-captions-panel').then((module) => ({
    default: module.CallCaptionsPanel,
  })),
);

const CallEffectsPanel = lazy(() =>
  import('./call-effects-panel').then(async (module) => {
    await module.loadEffectsPanelText(currentInterfaceLanguage());
    return { default: module.CallEffectsPanel };
  }),
);
const CallCapturePanel = lazy(() =>
  import('./call-capture-panel').then(async (module) => {
    await module.loadCapturePanelText(currentInterfaceLanguage());
    return { default: module.CallCapturePanel };
  }),
);
const CallReactionPalette = lazy(() => import('./call-control-panels').then((module) => ({ default: module.CallReactionPalette })));
const CallRecordChoice = lazy(() => import('./call-control-panels').then((module) => ({ default: module.CallRecordChoice })));
const CallPeopleSheet = lazy(() => import('./call-people-sheet').then((module) => ({ default: module.CallPeopleSheet })));

/** Le bouton qui a ouvert chaque panneau : le focus y revient quand il se ferme. */
const PANEL_OPENER: Readonly<Record<CallPanel, string>> = {
  effects: '[data-call-control="effects"]',
  people: '[data-call-control="invite"]',
  react: '[data-call-control="react"]',
  record: '[data-call-record]',
  capture: '[data-call-control="capture"]',
};

type EffectsSupport = { readonly color: boolean; readonly blur: boolean };

/** Ce que ma caméra sait faire en effets — relu quand la piste envoyée change. */
function useEffectsSupport(stream: MediaStream | null, forced: EffectsSupport | undefined): EffectsSupport {
  const sent = stream?.getVideoTracks()[0] ?? null;
  return useMemo(() => forced ?? { color: browserColorSupport(), blur: blurCapable(sent === null ? null : cameraSourceOf(sent)) }, [forced, sent]);
}

/** Une autre caméra où se retourner — relu quand la caméra s'allume et quand un appareil arrive ou part. */
function useCanFlip(cameraOn: boolean): boolean {
  const [canFlip, setCanFlip] = useState(true);
  useEffect(() => {
    const media = typeof navigator === 'undefined' ? undefined : navigator.mediaDevices;
    if (media?.enumerateDevices === undefined) return undefined;
    const read = () => void media.enumerateDevices().then((devices) => setCanFlip(flipOffered(devices)), () => undefined);
    read();
    media.addEventListener?.('devicechange', read);
    return () => media.removeEventListener?.('devicechange', read);
  }, [cameraOn]);
  return canFlip;
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
  const [expanded, setExpanded] = useState(initiallyExpanded);
  const [choice, setChoice] = useState<SpotlightChoice>(null);
  const [declineOpen, setDeclineOpen] = useState(false);
  const [panel, setPanel] = useState<CallPanel | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const controls = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const moderation = useCallModeration(call);
  const now = useSecondTick(call.phase.kind === 'connected' || call.phase.kind === 'reconnecting');
  const phase = call.phase.kind;
  const joined = phase === 'connected' || phase === 'reconnecting';
  const statusKey = callStatusKey(call);
  const layout = joined ? callLayout(call) : 'portrait';
  const live = phase !== 'ended' && phase !== 'incoming';
  const clock = call.connectedAt === null ? null : formatCallClock(elapsedSeconds(call, now));
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
  const [immersive, toggleImmersive] = useImmersive(stageRef, sharedScreenShown);
  const videoScene = live && isVideoScene(call);
  const chromeHidden = useCallChrome({ videoScene, root, controls, held: panel !== null });
  const sharer = layout === 'screen' ? screenSharer(call.members) : null;
  const support = useEffectsSupport(call.localStream, effectsSupport);
  const canFlip = useCanFlip(call.cameraOn);
  const set = callControlSet({ ...call, canShare, canEffect: effectsOffered(support), canFlip, videoScene });
  const offered: Readonly<Record<CallPanel, boolean>> = {
    effects: set.mine.includes('effects'),
    people: set.call.includes('invite'),
    react: set.call.includes('react'),
    record: set.call.includes('record'),
    capture: set.call.includes('capture'),
  };
  const shownPanel = panel !== null && offered[panel] ? panel : null;
  const panels = { open: shownPanel, toggle: (next: CallPanel) => setPanel((open) => (open === next ? null : next)) };
  const closePanel = () => {
    const closing = shownPanel;
    setPanel(null);
    if (closing !== null) root.current?.querySelector<HTMLElement>(PANEL_OPENER[closing])?.focus();
  };
  const nameOf = (userId: string): string | null => call.members[userId]?.name ?? null;
  const closeGlyph = <GlyphSvg glyph={CALL_VIEW_GLYPHS.x} size={20} />;
  const toggleActions = () => {
    if (expanded) setPanel(null);
    setExpanded(!expanded);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && live) callActions.minimize();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [live]);

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
        {statusKey === null ? clock : t(statusKey)}
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

  const stage = <CallStage call={call} layout={layout} language={language} choice={choice} onChoose={setChoice} immersive={immersive} onToggleImmersive={toggleImmersive} moderation={moderation} />;

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

  const endedControls = (
    <div className="flex items-start justify-center gap-10 px-8">
      <RoundButton label={t('call.close')} caption={t('call.close')} size={60} glyph={screenGlyph('arrowsInSimple', 24)} onPress={callActions.dismiss} />
      {canRetry(call) ? <RoundButton label={t('call.retry')} caption={t('call.retry')} tone="accept" size={60} glyph={<Glyph name="phone" size={26} />} onPress={callActions.retry} /> : null}
    </div>
  );

  const overlayVideo = layout === 'video-duo' || layout === 'screen';
  const hidden = chromeHidden || immersive;
  /* Les sous-titres ne s'effacent JAMAIS avec les commandes : posés dans le
     cadre de la pilule déployée, ils en sortent quand elle s'efface, et
     restent lus (et annoncés) au-dessus de sa place. */
  const captionsFramed = expanded && !hidden;
  const captions =
    call.captionsMode === 'off' || !live ? null : (
      <Suspense fallback={null}>
        <CallCaptionsPanel call={call} language={language} colorOf={(caption) => (caption.mine ? SELF_SPEAKER_COLOR : speakerColor(caption.speakerId))} surface={captionsFramed ? 'inset' : 'glass'} />
      </Suspense>
    );
  const panelOf = (open: CallPanel): ReactNode => {
    const base = { id: CALL_PANEL_ID[open], closeGlyph, language, onClose: closePanel };
    switch (open) {
      case 'effects':
        return <CallEffectsPanel {...base} colorAvailable={support.color} blurAvailable={support.blur} onRowKeyDown={onRowKeyDown} />;
      case 'react':
        return <CallReactionPalette {...base} onRowKeyDown={onRowKeyDown} />;
      case 'record':
        return <CallRecordChoice {...base} onRowKeyDown={onRowKeyDown} />;
      case 'capture':
        return <CallCapturePanel {...base} onRowKeyDown={onRowKeyDown} stage={() => root.current} />;
      case 'people':
        return <CallPeopleSheet {...base} members={orderedMembers(call.members)} renderModeration={(member) => <CallModerationSlot member={member} language={language} moderation={moderation} />} />;
    }
  };
  const fade = `transition-opacity duration-300 motion-reduce:transition-none ${hidden ? 'pointer-events-none opacity-0' : 'opacity-100'}`;

  return (
    <div
      ref={root}
      role="dialog"
      aria-modal="true"
      aria-label={translate(language, 'call.a11y.screen', { name: call.title })}
      className="fixed inset-0 z-[200] flex flex-col pb-safe pt-safe"
      style={{ background: BACKDROP, color: INK }}
      data-call-screen={phase}
      data-call-chrome={hidden ? 'hidden' : 'shown'}
    >
      {call.preview === null ? null : <CallPreview stream={call.preview} language={language} />}
      {overlayVideo ? (
        <div ref={stageRef} className="absolute inset-0" data-call-stage-surface="">
          {stage}
        </div>
      ) : null}
      <CallControlFeedbackSlot language={language} nameOf={nameOf} live={live} />
      <div className="relative flex min-h-0 flex-1 flex-col gap-4">
        <div className={fade} aria-hidden={hidden ? true : undefined}>
          <CallScreenHeader call={call} language={language} clock={joined ? clock : null} prominent={sharedScreenShown} />
        </div>
        {layout === 'grid' ? (
          <>
            {immersive ? null : (
              <div className={fade} aria-hidden={hidden ? true : undefined}>
                {pillRow}
              </div>
            )}
            <div ref={stageRef} className="flex min-h-0 flex-1 flex-col" data-call-stage-surface="">
              {stage}
            </div>
          </>
        ) : overlayVideo ? (
          <div className={`flex flex-col items-center gap-2 px-6 ${fade}`} aria-hidden={hidden ? true : undefined}>
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
          <div className="flex flex-col gap-3 pb-6">
            {captionsFramed ? null : captions}
            <div ref={controls} className={`flex flex-col gap-3 ${fade}`} aria-hidden={hidden ? true : undefined} data-call-controls="">
              <CallControlPill
                call={call}
                language={language}
                set={set}
                expanded={expanded}
                onToggle={toggleActions}
                prominent={sharedScreenShown}
                framedCaptions={captionsFramed ? captions : null}
                panels={panels}
                panel={shownPanel === null || !expanded ? null : <Suspense fallback={null}>{panelOf(shownPanel)}</Suspense>}
              />
            </div>
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
