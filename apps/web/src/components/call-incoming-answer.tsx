import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useStore } from 'zustand/react';

import { StreamVideo } from '@/components/call-media-elements';
import { RoundButton } from '@/components/call-round-button';
import { Glyph, GlyphSvg } from '@/components/glyph';
import { CALL_SCREEN_GLYPHS } from '@/components/glyphs-call-screen';
import { sessionStore } from '@/lib/api/session';
import type { ActiveCall } from '@/lib/calls/call-store';
import type { AcceptOptions } from '@/lib/calls/engine';
import { browserSelfPreview, callerFirstName, hasLiveVideo, incomingAcceptOptions, incomingConsentKey, startSelfPreview, type IncomingChoice, type SelfPreviewDeps } from '@/lib/calls/incoming-self-preview';
import { translateCallControls } from '@/lib/i18n-call-controls-catalog';
import { HeldSwap } from '@/lib/calls/use-pill-motion';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

/**
 * **DÉCROCHER EN SACHANT CE QUI PART** (#16944, vue P17 de
 * `docs/product/appels-vue-finale.md`, miroir d'`IncomingCallView.swift`) —
 * pendant qu'un appel VIDÉO sonne : ma vignette, à ma couleur, dès que la
 * caméra est déjà autorisée ; une barre de verre qui dit ce que l'autre
 * recevra de moi, avec mes deux bascules ; et trois réponses, Refuser, « Sans
 * vidéo », Répondre. Décrocher tient la promesse de la barre
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
  /** La couleur STABLE d'une personne, remise par l'écran (#17650 : ce chunk n'importe rien de `call_overlay`) — `null` : moi sans identifiant, le liseré neutre. */
  readonly colorOf: (userId: string | null) => string;
  readonly selfPreview?: SelfPreviewDeps<MediaStream>;
};

const screenGlyph = (name: keyof typeof CALL_SCREEN_GLYPHS, size: number): ReactNode => <GlyphSvg glyph={CALL_SCREEN_GLYPHS[name]} size={size} />;

type SelfPreview = { readonly stream: MediaStream | null; readonly stop: () => void };

/** L'aperçu de ma caméra pendant la sonnerie : ouvert si elle est autorisée et allumée, fermé sinon. `stop` le ferme TOUT DE SUITE — décrocher le ferme avant que le moteur ouvre sa caméra. */
function useSelfPreview(active: boolean, deps: SelfPreviewDeps<MediaStream>): SelfPreview {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const close = useRef<(() => void) | null>(null);
  const stop = (): void => {
    close.current?.();
    close.current = null;
  };
  useEffect(() => {
    if (!active) return undefined;
    close.current = startSelfPreview(deps, setStream);
    return stop;
  }, [active]);
  return { stream: active ? stream : null, stop };
}

function SelfTile({ stream, label, colorOf }: { readonly stream: MediaStream; readonly label: string; readonly colorOf: Props['colorOf'] }) {
  const me = useStore(sessionStore, (state) => (state.session.status === 'authenticated' ? state.session.user : null));
  const color = colorOf(me?.id ?? null);
  return (
    <div aria-hidden="true" className="relative size-full overflow-hidden rounded-card border-2 shadow-lg" style={{ background: 'var(--color-scrim-soft)', borderColor: color }} data-call-incoming-self="">
      <StreamVideo stream={stream} mirrored className="size-full" self />
      <span className="absolute inset-x-0 bottom-1.5 text-center text-mini font-semibold text-on-media [text-shadow:0_1px_2px_var(--color-scrim-soft)]" data-call-incoming-self-label="">
        {label}
      </span>
    </div>
  );
}

/** Une bascule de la barre : ALLUMÉE (`active`), elle se remplit de blanc, glyphe sombre — la caméra qui filme, le micro COUPÉ (P17.8) ; `aria-pressed` suit cet état. */
function Toggle({ active, label, glyph, onPress, data }: { readonly active: boolean; readonly label: string; readonly glyph: ReactNode; readonly onPress: () => void; readonly data: Readonly<Record<`data-${string}`, string>> }) {
  return (
    <button type="button" aria-pressed={active} aria-label={label} onClick={onPress} className={`grid size-11 shrink-0 place-items-center rounded-full transition-transform active:scale-95 motion-reduce:transition-none ${active ? '' : 'bg-media-fill'}`} style={active ? ON : { color: INK }} {...data}>
      {glyph}
    </button>
  );
}

function ConsentBar({ name, choice, filming, language, onMic, onCamera }: { readonly name: string; readonly choice: IncomingChoice; readonly filming: boolean; readonly language: InterfaceLanguage; readonly onMic: () => void; readonly onCamera: () => void }) {
  return (
    <div className="glass-call-prominent mx-3 flex min-h-[3.25rem] items-center gap-2 rounded-[1.625rem] py-1.5 pe-1.5 ps-5" style={{ color: INK }} data-call-incoming-consent="">
      <p className="min-w-0 flex-1 text-bubble leading-snug" role="status" aria-live="polite">
        {translateCallControls(language, incomingConsentKey(choice, filming), { name })}
      </p>
      <Toggle
        active={!choice.micOn}
        label={translate(language, choice.micOn ? 'call.mic.mute' : 'call.mic.unmute')}
        glyph={choice.micOn ? <Glyph name="microphone" size={20} /> : screenGlyph('microphoneSlash', 20)}
        onPress={onMic}
        data={{ 'data-call-incoming-mic': '' }}
      />
      <Toggle
        active={choice.cameraOn}
        label={translate(language, choice.cameraOn ? 'call.camera.off' : 'call.camera.on')}
        glyph={screenGlyph(choice.cameraOn ? 'videoCamera' : 'videoCameraSlash', 20)}
        onPress={onCamera}
        data={{ 'data-call-incoming-camera': '' }}
      />
    </div>
  );
}

export function CallIncomingAnswer({ call, language, onAccept, onDecline, onDeclineMessage, colorOf, selfPreview = browserSelfPreview }: Props) {
  const video = call.media === 'video';
  const [choice, setChoice] = useState<IncomingChoice>({ micOn: true, cameraOn: video });
  const [answered, setAnswered] = useState(false);
  const preview = useSelfPreview(video && choice.cameraOn && !answered && call.localStream === null, selfPreview);
  const mine = call.localStream ?? preview.stream;
  /* P17.5 : la vignette n'existe que si une piste VIVANTE tourne, pas dès qu'un flux est là. */
  const filming = hasLiveVideo(mine);
  const tile = video && choice.cameraOn && filming ? mine : null;
  const answerLabel = video ? translateCallControls(language, 'callControls.incoming.answer') : translate(language, 'call.accept');
  const accept = (next: IncomingChoice): void => {
    preview.stop();
    setAnswered(true);
    onAccept(incomingAcceptOptions(next));
  };
  return (
    <div className="relative flex flex-col gap-6">
      {/* Hors du flux, au-dessus des réponses : la vignette qui arrive ne déplace rien, et elle arrive comme elle repart, en fondu (P17.5). */}
      <HeldSwap value={tile} shape="fade" className="pointer-events-none absolute bottom-full end-3 z-10 mb-6 h-32 w-[5.75rem]" data-call-incoming-self-slot="">
        {(held) => <SelfTile stream={held} label={translateCallControls(language, 'callControls.incoming.me')} colorOf={colorOf} />}
      </HeldSwap>
      <div className="flex justify-center">
        <RoundButton label={translate(language, 'callDecline.title')} caption={translate(language, 'callDecline.open')} size={48} glyph={screenGlyph('chatCircleText', 22)} onPress={onDeclineMessage} popup control="decline-message" />
      </div>
      {video ? (
        <ConsentBar
          name={callerFirstName(call.title)}
          choice={choice}
          filming={filming}
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
          label={answerLabel}
          caption={answerLabel}
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
