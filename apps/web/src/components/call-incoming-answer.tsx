import { useEffect, useState, type ReactNode } from 'react';
import { useStore } from 'zustand/react';

import { StreamVideo } from '@/components/call-media-elements';
import { RoundButton } from '@/components/call-round-button';
import { Glyph, GlyphSvg } from '@/components/glyph';
import { CALL_SCREEN_GLYPHS } from '@/components/glyphs-call-screen';
import { sessionStore } from '@/lib/api/session';
import { SELF_SPEAKER_COLOR, speakerColor } from '@/lib/calls/call-speaker-color';
import type { ActiveCall } from '@/lib/calls/call-store';
import type { AcceptOptions } from '@/lib/calls/engine';
import { browserSelfPreview, incomingAcceptOptions, incomingConsentKey, startSelfPreview, type IncomingChoice, type SelfPreviewDeps } from '@/lib/calls/incoming-self-preview';
import { translateCallControls } from '@/lib/i18n-call-controls-catalog';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

/**
 * **DÉCROCHER EN SACHANT CE QUI PART** (#16944, vue P17 de
 * `docs/product/appels-vue-finale.md`, miroir d'`IncomingCallView.swift`) —
 * pendant qu'un appel VIDÉO sonne : ma vignette, à ma couleur, dès que la
 * caméra est déjà autorisée ; une barre de verre qui dit ce que l'autre
 * recevra de moi, avec mes deux bascules ; et trois réponses, Refuser, « Sans
 * vidéo », Accepter. Décrocher tient la promesse de la barre
 * (`incomingAcceptOptions`). « Refuser avec un message » reste au-dessus.
 *
 * Un appel VOCAL garde ses deux réponses, sans barre ni vignette.
 */

const INK = 'var(--color-on-media)';

const ON = { background: 'var(--color-on-media)', color: 'var(--ios-indigo-950)' } as const;

type Props = {
  readonly call: ActiveCall;
  readonly language: InterfaceLanguage;
  readonly onAccept: (options: AcceptOptions) => void;
  readonly onDecline: () => void;
  readonly onDeclineMessage: () => void;
  readonly selfPreview?: SelfPreviewDeps<MediaStream>;
};

const screenGlyph = (name: keyof typeof CALL_SCREEN_GLYPHS, size: number): ReactNode => <GlyphSvg glyph={CALL_SCREEN_GLYPHS[name]} size={size} />;

/** L'aperçu de ma caméra pendant la sonnerie : ouvert si elle est autorisée et allumée, fermé sinon. */
function useSelfPreview(active: boolean, deps: SelfPreviewDeps<MediaStream>): MediaStream | null {
  const [stream, setStream] = useState<MediaStream | null>(null);
  useEffect(() => (active ? startSelfPreview(deps, setStream) : undefined), [active]);
  return active ? stream : null;
}

function SelfTile({ stream }: { readonly stream: MediaStream }) {
  const me = useStore(sessionStore, (state) => (state.session.status === 'authenticated' ? state.session.user : null));
  const color = me === null ? SELF_SPEAKER_COLOR : speakerColor(me.id);
  return (
    <div aria-hidden="true" className="pointer-events-none absolute bottom-full end-3 z-10 mb-6 h-32 w-[5.75rem] overflow-hidden rounded-card border-2 shadow-lg" style={{ background: 'var(--color-scrim-soft)', borderColor: color }} data-call-incoming-self="">
      <StreamVideo stream={stream} mirrored className="size-full" self />
    </div>
  );
}

/** Une bascule de la barre ; `filled`, elle se remplit de blanc allumée (la caméra, ce que l'autre VERRA). */
function Toggle({ on, filled, label, glyph, onPress, data }: { readonly on: boolean; readonly filled: boolean; readonly label: string; readonly glyph: ReactNode; readonly onPress: () => void; readonly data: Readonly<Record<`data-${string}`, string>> }) {
  const white = on && filled;
  return (
    <button type="button" aria-pressed={on} aria-label={label} onClick={onPress} className={`grid size-11 shrink-0 place-items-center rounded-full transition-transform active:scale-95 motion-reduce:transition-none ${white ? '' : 'bg-media-fill'}`} style={white ? ON : { color: INK }} {...data}>
      {glyph}
    </button>
  );
}

function ConsentBar({ name, choice, language, onMic, onCamera }: { readonly name: string; readonly choice: IncomingChoice; readonly language: InterfaceLanguage; readonly onMic: () => void; readonly onCamera: () => void }) {
  return (
    <div className="glass-call-prominent mx-3 flex min-h-[3.25rem] items-center gap-2 rounded-[1.625rem] py-1.5 pe-1.5 ps-5" style={{ color: INK }} data-call-incoming-consent="">
      <p className="min-w-0 flex-1 text-body leading-snug" role="status" aria-live="polite">
        {translateCallControls(language, incomingConsentKey(choice), { name })}
      </p>
      <Toggle
        on={choice.micOn}
        label={translate(language, choice.micOn ? 'call.mic.mute' : 'call.mic.unmute')}
        glyph={choice.micOn ? <Glyph name="microphone" size={20} /> : screenGlyph('microphoneSlash', 20)}
        filled={false}
        onPress={onMic}
        data={{ 'data-call-incoming-mic': '' }}
      />
      <Toggle
        on={choice.cameraOn}
        label={translate(language, choice.cameraOn ? 'call.camera.off' : 'call.camera.on')}
        glyph={screenGlyph(choice.cameraOn ? 'videoCamera' : 'videoCameraSlash', 20)}
        filled
        onPress={onCamera}
        data={{ 'data-call-incoming-camera': '' }}
      />
    </div>
  );
}

export function CallIncomingAnswer({ call, language, onAccept, onDecline, onDeclineMessage, selfPreview = browserSelfPreview }: Props) {
  const video = call.media === 'video';
  const [choice, setChoice] = useState<IncomingChoice>({ micOn: true, cameraOn: video });
  const [answered, setAnswered] = useState(false);
  const preview = useSelfPreview(video && choice.cameraOn && !answered && call.localStream === null, selfPreview);
  const mine = call.localStream ?? preview;
  const accept = (next: IncomingChoice): void => {
    setAnswered(true);
    onAccept(incomingAcceptOptions(next));
  };
  return (
    <div className="relative flex flex-col gap-6">
      {/* Hors du flux, au-dessus des réponses : la vignette qui arrive ne déplace rien. */}
      {video && choice.cameraOn && mine !== null ? <SelfTile stream={mine} /> : null}
      <div className="flex justify-center">
        <RoundButton label={translate(language, 'callDecline.title')} caption={translate(language, 'callDecline.open')} size={48} glyph={screenGlyph('chatCircleText', 22)} onPress={onDeclineMessage} popup control="decline-message" />
      </div>
      {video ? (
        <ConsentBar
          name={call.title}
          choice={choice}
          language={language}
          onMic={() => setChoice((current) => ({ ...current, micOn: !current.micOn }))}
          onCamera={() => setChoice((current) => ({ ...current, cameraOn: !current.cameraOn }))}
        />
      ) : null}
      <div className="flex items-start justify-around gap-6 px-8">
        <RoundButton label={translate(language, 'call.decline')} caption={translate(language, 'call.decline')} tone="danger" size={68} glyph={screenGlyph('phoneDisconnect', 30)} onPress={onDecline} data={{ 'data-call-incoming-decline': '' }} />
        {video ? (
          <RoundButton
            label={translate(language, 'call.accept.audioOnly')}
            caption={translateCallControls(language, 'callControls.incoming.noVideo')}
            size={68}
            glyph={<Glyph name="phone" size={28} />}
            onPress={() => accept({ ...choice, cameraOn: false })}
            data={{ 'data-call-incoming-audio-only': '' }}
          />
        ) : null}
        <RoundButton
          label={translate(language, 'call.accept')}
          caption={translate(language, 'call.accept')}
          tone="accept"
          size={68}
          glyph={video && choice.cameraOn ? screenGlyph('videoCamera', 30) : <Glyph name="phone" size={28} />}
          onPress={() => accept(choice)}
          data={{ 'data-call-incoming-accept': '' }}
        />
      </div>
    </div>
  );
}
