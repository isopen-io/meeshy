import { colorForName } from '@meeshy/shared/utils/conversation-colors';
import { useEffect, useState, type ReactNode } from 'react';

import { Avatar } from '@/components/avatar';
import { StreamVideo } from '@/components/call-media-elements';
import { Glyph, GlyphSvg } from '@/components/glyph';
import { CALL_SCREEN_GLYPHS, type CallScreenGlyphName } from '@/components/glyphs-call-screen';
import { callActions } from '@/lib/calls/call-actions';
import { elapsedSeconds, formatCallClock, type ActiveCall, type CallMember } from '@/lib/calls/call-store';
import { callLayout, callStatusKey, type PlainCallKey, canRetry, gridColumns, hasVideo, orderedMembers, STATUS_PILL_KEY, statusPills } from '@/lib/calls/call-view';
import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { initialsOf } from '@/lib/view/conversation';

/**
 * **L'ÉCRAN D'APPEL** (#6382, #8045) — miroir de `CallView.swift` et
 * d'`IncomingCallView.swift` : toujours sombre (iOS peint l'appel sur fond
 * noir quel que soit le schéma), un portrait pulsé pendant la sonnerie, la
 * durée une fois connecté, la vidéo distante plein cadre avec la vignette
 * locale en coin, une grille pour un groupe, la barre de contrôles en bas.
 *
 * Les contrôles suivent l'ordre d'iOS : Micro, Vidéo, Caméra (quand elle
 * tourne), Sous-titres (quand l'autre en envoie), Raccrocher. La vignette
 * locale s'inverse d'un toucher avec la vidéo distante, comme sur iOS.
 */

const INK = '#ffffff';
const INK_2 = 'rgba(255,255,255,0.72)';
const BACKDROP = 'linear-gradient(180deg, #16131f 0%, #07060b 100%)';
const PILL = 'rgba(255,255,255,0.14)';
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

function RoundButton({
  label,
  glyph,
  onPress,
  tone = 'plain',
  pressed,
  size = 56,
  caption,
}: {
  readonly label: string;
  readonly glyph: ReactNode;
  readonly onPress: () => void;
  readonly tone?: 'plain' | 'danger' | 'accept' | 'active';
  readonly pressed?: boolean;
  readonly size?: number;
  readonly caption?: string;
}) {
  const background = tone === 'danger' ? HANGUP : tone === 'accept' ? ANSWER : tone === 'active' ? INK : PILL;
  const color = tone === 'active' ? '#111' : INK;
  return (
    <div className="flex flex-col items-center gap-1.5">
      <button
        type="button"
        aria-label={label}
        {...(pressed === undefined ? {} : { 'aria-pressed': pressed })}
        onClick={onPress}
        className="grid place-items-center rounded-full transition-transform active:scale-95"
        style={{ width: size, height: size, background, color }}
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

const screenGlyph = (name: CallScreenGlyphName, size = 24) => <GlyphSvg glyph={CALL_SCREEN_GLYPHS[name]} size={size} />;

function Portrait({ name, avatar, size, pulse }: { readonly name: string; readonly avatar: string | null; readonly size: number; readonly pulse: boolean }) {
  return (
    <div className="relative grid place-items-center" style={{ width: size + 24, height: size + 24 }}>
      {pulse ? <span aria-hidden className="absolute inset-0 animate-ping rounded-full" style={{ background: 'rgba(255,255,255,0.10)' }} /> : null}
      <Avatar initials={initialsOf(name)} color={colorForName(name)} size={size} {...(avatar === null ? {} : { src: avatar })} />
    </div>
  );
}

function MemberTile({ member, stream, t }: { readonly member: CallMember; readonly stream: MediaStream | undefined; readonly t: (key: PlainCallKey) => string }) {
  const showVideo = member.cameraOn && hasVideo(stream);
  return (
    <div className="relative grid min-h-0 place-items-center overflow-hidden rounded-card" style={{ background: 'rgba(255,255,255,0.06)' }} data-call-tile={member.userId}>
      {showVideo ? <StreamVideo stream={stream ?? null} mirrored={false} className="absolute inset-0 size-full" label={member.name} /> : <Portrait name={member.name} avatar={member.avatar} size={64} pulse={false} />}
      <span className="absolute bottom-2 left-2 flex max-w-[85%] items-center gap-1 truncate rounded-full px-2 py-0.5 text-mini" style={{ background: 'rgba(0,0,0,0.45)', color: INK }}>
        {member.micMuted ? screenGlyph('microphoneSlash', 12) : null}
        {member.name}
        {member.link === 'connected' ? null : ` · ${t(member.link === 'reconnecting' ? 'call.reconnecting' : 'call.connecting')}`}
      </span>
    </div>
  );
}

export function CallScreen({ call }: { readonly call: ActiveCall }) {
  const language = currentInterfaceLanguage();
  const t = (key: PlainCallKey): string => translate(language, key);
  const [swapped, setSwapped] = useState(false);
  const now = useSecondTick(call.phase.kind === 'connected' || call.phase.kind === 'reconnecting');
  const phase = call.phase.kind;
  const statusKey = callStatusKey(call);
  const members = orderedMembers(call.members);
  const layout = phase === 'connected' || phase === 'reconnecting' ? callLayout(call) : 'portrait';
  const firstPeer = members[0];
  const remoteStream = firstPeer === undefined ? null : (call.remoteStreams[firstPeer.userId] ?? null);
  const remoteVideoOn = firstPeer !== undefined && firstPeer.cameraOn && hasVideo(remoteStream);
  const live = phase !== 'ended' && phase !== 'incoming';
  const clock = call.connectedAt === null ? null : formatCallClock(elapsedSeconds(call, now));
  const endedClock = phase === 'ended' && call.endedDurationSec !== null && call.endedDurationSec > 0 ? formatCallClock(call.endedDurationSec) : null;
  const caption = call.captionsOn ? call.captions.at(-1) : undefined;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && live) callActions.minimize();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [live]);

  const header = (
    <div className="flex min-h-11 items-center justify-between gap-2 px-4">
      {live ? (
        <button type="button" aria-label={t('call.minimize')} onClick={callActions.minimize} className="grid size-11 place-items-center rounded-full" style={{ color: INK }}>
          {screenGlyph('arrowsInSimple', 22)}
        </button>
      ) : (
        <span className="size-11" />
      )}
      {call.isGroup && phase !== 'incoming' ? (
        <span className="truncate text-mini" style={{ color: INK_2 }}>
          {translate(language, 'call.members', { count: String(Object.keys(call.members).length + 1) })}
        </span>
      ) : null}
      <span className="size-11" />
    </div>
  );

  const identity = (
    <div className="flex flex-col items-center gap-3 px-6 text-center">
      <Portrait name={call.title} avatar={call.avatar} size={112} pulse={phase === 'incoming' || phase === 'outgoing'} />
      <h2 className="text-[1.6rem] font-bold leading-tight" style={{ color: INK }}>
        {call.title}
      </h2>
      {phase === 'incoming' && call.isGroup && call.callerName !== null ? (
        <p className="text-body" style={{ color: INK_2 }}>
          {translate(language, 'call.incoming.group', { caller: call.callerName })}
        </p>
      ) : null}
      <p className="text-body" role="status" aria-live="polite" style={{ color: INK_2 }} data-call-status="">
        {statusKey === null ? clock : t(statusKey)}
        {endedClock === null ? null : ` · ${endedClock}`}
      </p>
    </div>
  );

  const pills = statusPills(call);
  const pillRow =
    live && pills.length > 0 ? (
      <div className="flex flex-wrap justify-center gap-2 px-4">
        {pills.map((pill) => (
          <span key={pill} className="rounded-full px-3 py-1 text-mini" style={{ background: PILL, color: INK }} data-call-pill={pill}>
            {t(STATUS_PILL_KEY[pill])}
          </span>
        ))}
      </div>
    ) : null;

  const stage = (() => {
    if (layout === 'grid') {
      const columns = gridColumns(members.length + 1);
      return (
        <div className="grid min-h-0 flex-1 gap-2 px-3" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gridAutoRows: '1fr' }}>
          {members.map((member) => (
            <MemberTile key={member.userId} member={member} stream={call.remoteStreams[member.userId]} t={t} />
          ))}
          <div className="relative grid min-h-0 place-items-center overflow-hidden rounded-card" style={{ background: 'rgba(255,255,255,0.06)' }}>
            {call.cameraOn ? <StreamVideo stream={call.localStream} mirrored={call.facing === 'user'} className="absolute inset-0 size-full" label={t('call.you')} /> : <Portrait name={t('call.you')} avatar={null} size={64} pulse={false} />}
            <span className="absolute bottom-2 left-2 rounded-full px-2 py-0.5 text-mini" style={{ background: 'rgba(0,0,0,0.45)', color: INK }}>
              {t('call.you')}
            </span>
          </div>
        </div>
      );
    }
    if (layout === 'video-duo') {
      const main = swapped ? call.localStream : remoteStream;
      const corner = swapped ? remoteStream : call.localStream;
      const mainOn = swapped ? call.cameraOn : remoteVideoOn;
      const cornerOn = swapped ? remoteVideoOn : call.cameraOn;
      return (
        <div className="absolute inset-0">
          {mainOn ? (
            <StreamVideo stream={main} mirrored={swapped && call.facing === 'user'} className="absolute inset-0 size-full" label={swapped ? t('call.you') : call.title} />
          ) : (
            <div className="absolute inset-0 grid place-items-center">
              <div className="flex flex-col items-center gap-3">
                <Portrait name={swapped ? t('call.you') : call.title} avatar={swapped ? null : call.avatar} size={96} pulse={false} />
                <span className="text-body" style={{ color: INK_2 }}>
                  {t(swapped ? 'call.camera.off' : remoteStream === null ? 'call.video.connecting' : 'call.camera.peerOff')}
                </span>
              </div>
            </div>
          )}
          {cornerOn ? (
            <button
              type="button"
              aria-label={t('call.video.swap')}
              onClick={() => setSwapped((value) => !value)}
              className="absolute right-4 h-40 w-28 overflow-hidden rounded-card shadow-lg"
              style={{ top: 'calc(env(safe-area-inset-top) + 4.5rem)' }}
              data-call-corner=""
            >
              <StreamVideo stream={corner} mirrored={!swapped && call.facing === 'user'} className="size-full" />
            </button>
          ) : null}
        </div>
      );
    }
    return null;
  })();

  const controls = (() => {
    if (phase === 'incoming') {
      return (
        <div className="flex items-start justify-around gap-6 px-8">
          <RoundButton label={t('call.decline')} caption={t('call.decline')} tone="danger" size={68} glyph={screenGlyph('phoneDisconnect', 30)} onPress={callActions.decline} />
          {call.media === 'video' ? (
            <RoundButton label={t('call.accept.audioOnly')} caption={t('call.accept.audioOnly')} size={68} glyph={<Glyph name="phone" size={28} />} onPress={() => callActions.accept({ audioOnly: true })} />
          ) : null}
          <RoundButton
            label={t('call.accept')}
            caption={t('call.accept')}
            tone="accept"
            size={68}
            glyph={call.media === 'video' ? screenGlyph('videoCamera', 30) : <Glyph name="phone" size={28} />}
            onPress={() => callActions.accept()}
          />
        </div>
      );
    }
    if (phase === 'ended') {
      return (
        <div className="flex items-start justify-center gap-10 px-8">
          <RoundButton label={t('call.close')} caption={t('call.close')} size={60} glyph={screenGlyph('arrowsInSimple', 24)} onPress={callActions.dismiss} />
          {canRetry(call) ? <RoundButton label={t('call.retry')} caption={t('call.retry')} tone="accept" size={60} glyph={<Glyph name="phone" size={26} />} onPress={callActions.retry} /> : null}
        </div>
      );
    }
    const hasCaptions = call.captions.length > 0;
    return (
      <div className="flex flex-wrap items-start justify-center gap-4 px-4">
        <RoundButton
          label={t(call.micMuted ? 'call.mic.unmute' : 'call.mic.mute')}
          pressed={call.micMuted}
          tone={call.micMuted ? 'active' : 'plain'}
          glyph={call.micMuted ? screenGlyph('microphoneSlash') : <Glyph name="microphone" size={24} />}
          onPress={callActions.toggleMic}
        />
        <RoundButton
          label={t(call.cameraOn ? 'call.camera.off' : 'call.camera.on')}
          pressed={call.cameraOn}
          tone={call.cameraOn ? 'active' : 'plain'}
          glyph={screenGlyph(call.cameraOn ? 'videoCamera' : 'videoCameraSlash')}
          onPress={callActions.toggleCamera}
        />
        {call.cameraOn ? <RoundButton label={t('call.camera.switch')} glyph={screenGlyph('cameraRotate')} onPress={callActions.switchCamera} /> : null}
        {hasCaptions ? (
          <RoundButton
            label={t(call.captionsOn ? 'call.captions.off' : 'call.captions.on')}
            pressed={call.captionsOn}
            tone={call.captionsOn ? 'active' : 'plain'}
            glyph={screenGlyph('closedCaptioning')}
            onPress={callActions.toggleCaptions}
          />
        ) : null}
        <RoundButton label={t('call.hangup')} tone="danger" glyph={screenGlyph('phoneDisconnect', 26)} onPress={callActions.hangup} />
      </div>
    );
  })();

  const overlayVideo = layout === 'video-duo';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={translate(language, 'call.a11y.screen', { name: call.title })}
      className="fixed inset-0 z-[200] flex flex-col pb-safe pt-safe"
      style={{ background: BACKDROP, color: INK }}
      data-call-screen={phase}
    >
      {overlayVideo ? stage : null}
      <div className="relative flex min-h-0 flex-1 flex-col gap-4">
        {header}
        {layout === 'grid' ? (
          <>
            {pillRow}
            {stage}
          </>
        ) : overlayVideo ? (
          <div className="flex flex-col items-center gap-2 px-6">
            <span className="rounded-full px-3 py-1 text-body font-semibold" style={{ background: 'rgba(0,0,0,0.35)' }}>
              {call.title}
              {clock === null ? null : ` · ${clock}`}
            </span>
            {pillRow}
          </div>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-5">
            {identity}
            {pillRow}
          </div>
        )}
        {overlayVideo || layout === 'grid' ? <div className="flex-1" /> : null}
        {caption === undefined ? null : (
          <p className="mx-4 self-center rounded-card px-3 py-2 text-center text-body" style={{ background: 'rgba(0,0,0,0.55)' }} aria-live="polite" data-call-caption="">
            {call.isGroup ? <strong>{caption.speakerName} · </strong> : null}
            {caption.text}
          </p>
        )}
        <div className="pb-6">{controls}</div>
      </div>
    </div>
  );
}
