import { colorForName } from '@meeshy/shared/utils/conversation-colors';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from 'zustand/react';
import { createStore } from 'zustand/vanilla';

import { Avatar } from '@/components/avatar';
import { StreamVideo } from '@/components/call-media-elements';
import { Glyph, GlyphSvg } from '@/components/glyph';
import { CALL_SCREEN_GLYPHS } from '@/components/glyphs-call-screen';
import { callActions } from '@/lib/calls/call-actions';
import { armAutoPip, browserPipSupport, pipSource, registerPipOpener, shouldOfferPip, type AutoPipSession } from '@/lib/calls/call-pip';
import { callStore, elapsedSeconds, formatCallClock, type ActiveCall } from '@/lib/calls/call-store';
import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { initialsOf } from '@/lib/view/conversation';

/**
 * **L'IMAGE DANS L'IMAGE D'UN APPEL** (#8046, D10) — les réels de
 * `lib/calls/call-pip.ts`. La fenêtre Document PiP reçoit un PORTAIL de
 * l'arbre de la couche d'appel (un seul arbre, un seul magasin : ce que la
 * fenêtre montre ne peut pas diverger de l'écran) ; l'image dans l'image
 * d'une vidéo lit une `<video>` cachée, montée tant qu'une vidéo peut
 * flotter, pour que le geste n'attende aucun chargement (un navigateur refuse
 * la PiP qui n'est pas demandée DANS le geste).
 */

type DocumentPip = { readonly requestWindow: (options: { readonly width: number; readonly height: number }) => Promise<Window>; readonly window: Window | null };

type PipDocument = Document & { readonly pictureInPictureEnabled?: boolean; readonly pictureInPictureElement?: Element | null; readonly exitPictureInPicture?: () => Promise<void> };

type PipVideo = HTMLVideoElement & { readonly requestPictureInPicture?: () => Promise<unknown> };

const documentPip = (): DocumentPip | undefined =>
  typeof window === 'undefined' ? undefined : (window as unknown as { readonly documentPictureInPicture?: DocumentPip }).documentPictureInPicture;

const pipWindowStore = createStore<{ readonly window: Window | null }>(() => ({ window: null }));

const PIP_VIDEO = 'data-call-pip-video';

/* Les feuilles de style de l'application, recopiées dans la fenêtre : sans
   elles, les classes utilitaires de la barre ne s'y appliquent pas. */
function adoptStyles(target: Document): void {
  for (const node of document.head.querySelectorAll('style, link[rel="stylesheet"]')) target.head.appendChild(node.cloneNode(true));
  target.documentElement.className = document.documentElement.className;
  target.body.style.margin = '0';
  target.body.style.background = '#000';
}

async function openDocumentPip(api: DocumentPip): Promise<boolean> {
  if (api.window !== null) return true;
  const opened = await api.requestWindow({ width: 320, height: 260 }).catch(() => null);
  if (opened === null) return false;
  adoptStyles(opened.document);
  opened.addEventListener('pagehide', () => pipWindowStore.setState({ window: null }));
  pipWindowStore.setState({ window: opened });
  return true;
}

async function openVideoPip(): Promise<boolean> {
  const video = document.querySelector(`[${PIP_VIDEO}]`) as PipVideo | null;
  if (video === null || typeof video.requestPictureInPicture !== 'function') return false;
  return video.requestPictureInPicture().then(
    () => true,
    () => false,
  );
}

/** Le geste « Image dans l'image » — la fenêtre de document d'abord, la vidéo seule à défaut. */
export async function openCallPip(): Promise<boolean> {
  const api = documentPip();
  if (api !== undefined && (await openDocumentPip(api))) return true;
  return openVideoPip();
}

function closeCallPip(): void {
  pipWindowStore.getState().window?.close();
  pipWindowStore.setState({ window: null });
  const doc = document as PipDocument;
  if (doc.pictureInPictureElement?.hasAttribute(PIP_VIDEO) === true) void doc.exitPictureInPicture?.().catch(() => undefined);
}

function PipClock({ call }: { readonly call: ActiveCall }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const handle = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(handle);
  }, []);
  return <span className="text-mini tabular-nums">{formatCallClock(elapsedSeconds(call, now))}</span>;
}

function CallPipView({ call }: { readonly call: ActiveCall }) {
  const language = currentInterfaceLanguage();
  const source = pipSource(call);
  const back = () => {
    window.focus();
    callActions.expand();
  };
  return (
    <div className="relative flex h-screen flex-col" style={{ background: '#000', color: '#fff' }} data-call-pip-window="">
      <div className="relative grid min-h-0 flex-1 place-items-center">
        {source === null ? (
          <Avatar initials={initialsOf(call.title)} color={colorForName(call.title)} size={72} {...(call.avatar === null ? {} : { src: call.avatar })} />
        ) : (
          <StreamVideo stream={source.stream} mirrored={source.mirrored} className="absolute inset-0 size-full" label={call.title} />
        )}
        <span className="absolute left-2 top-2 flex items-center gap-2 rounded-full px-2 py-0.5 text-mini" style={{ background: 'rgba(0,0,0,0.55)' }}>
          <span className="max-w-[10rem] truncate font-semibold">{call.title}</span>
          <PipClock call={call} />
        </span>
      </div>
      <div className="flex items-center justify-center gap-3 py-1" style={{ background: 'rgba(17,16,24,0.92)' }}>
        <button type="button" onClick={callActions.toggleMic} aria-pressed={call.micMuted} aria-label={translate(language, call.micMuted ? 'call.mic.unmute' : 'call.mic.mute')} className="grid size-11 place-items-center rounded-full">
          {call.micMuted ? <GlyphSvg glyph={CALL_SCREEN_GLYPHS.microphoneSlash} size={20} /> : <Glyph name="microphone" size={20} />}
        </button>
        <button type="button" onClick={back} aria-label={translate(language, 'call.expand')} className="min-h-11 rounded-full px-3 text-body font-semibold">
          {translate(language, 'call.expand')}
        </button>
        <button type="button" onClick={callActions.hangup} aria-label={translate(language, 'call.hangup')} className="grid size-11 place-items-center rounded-full" style={{ background: '#ef4444' }}>
          <GlyphSvg glyph={CALL_SCREEN_GLYPHS.phoneDisconnect} size={20} />
        </button>
      </div>
    </div>
  );
}

/**
 * Monté par la couche d'appel tant qu'un appel existe : le portail vers la
 * fenêtre PiP, la `<video>` que la PiP simple emprunte, et la bascule
 * automatique quand l'onglet se masque. Un appel fini ferme la fenêtre.
 */
function CallPip({ call }: { readonly call: ActiveCall }) {
  const pipWindow = useStore(pipWindowStore, (state) => state.window);
  const support = browserPipSupport();
  const offered = shouldOfferPip(call, support);
  const live = call.phase.kind !== 'ended';
  const source = pipSource(call);
  const hidden = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (!offered) return undefined;
    /* `lib.dom` ne connaît pas encore l'action `enterpictureinpicture`
       (Chromium 120+) : la session est vue par la seule méthode qu'on lui
       demande, et un navigateur qui ignore l'action lève — `armAutoPip` l'avale. */
    const session = typeof navigator === 'undefined' || navigator.mediaSession === undefined ? undefined : (navigator.mediaSession as unknown as AutoPipSession);
    return armAutoPip(session, () => void openCallPip());
  }, [offered]);

  useEffect(() => {
    if (!live) closeCallPip();
  }, [live]);
  useEffect(() => () => closeCallPip(), []);

  useEffect(() => {
    const element = hidden.current;
    if (element === null) return;
    const stream = source?.stream ?? null;
    if (element.srcObject !== stream) element.srcObject = stream;
    if (stream !== null) void element.play?.().catch(() => undefined);
  }, [source?.stream]);

  return (
    <>
      {support === 'video' && offered ? (
        <video ref={hidden} muted playsInline autoPlay aria-hidden {...{ [PIP_VIDEO]: '' }} style={{ position: 'fixed', width: 1, height: 1, opacity: 0, pointerEvents: 'none', left: 0, top: 0 }} />
      ) : null}
      {pipWindow === null || !live ? null : createPortal(<CallPipView call={call} />, pipWindow.document.body)}
    </>
  );
}

/** Monté par `call-layer.tsx` en chunk à part, frère de l'écran d'appel : il vit tant qu'un appel existe. */
export function CallPipLayer() {
  const call = useStore(callStore, (state) => state.call);
  useEffect(() => registerPipOpener(openCallPip), []);
  return call === null ? null : <CallPip call={call} />;
}
