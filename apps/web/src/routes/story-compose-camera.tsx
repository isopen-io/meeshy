import { useEffect, useRef, useState } from 'react';

import { GlyphSvg } from '@/components/glyph';
import { CALL_SCREEN_GLYPHS } from '@/components/glyphs-call-screen';
import { COMPOSER_GLYPHS } from '@/components/glyphs-composer';
import { THREAD_MENU_GLYPHS } from '@/components/glyphs-thread-menu';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import type { PublicationKind } from '@/lib/stories/publication-kind';
import { createBrowserCameraEngine, type CameraEngine } from '@/lib/stories/studio-camera-engine';
import { cameraFlashPlan, quickCaptureRelease, quickCaptureTap, type CameraFacing } from '@/lib/stories/studio-quick-capture';
import { useBackDismiss } from '@/lib/view/use-back-dismiss';
import { ROUND_GLASS } from '@/routes/story-compose-chrome';

/**
 * `photo` : ouverte par un toucher, elle prend la photo dès qu'elle voit.
 * `hold` : ouverte par un appui long, elle filme tant qu'il dure (`holding`).
 * `arm` : un toucher sur un réel — elle s'ouvre, rien n'est pris.
 * `manual` : le déclencheur seul décide. `film` : ouverte par la voie du clavier
 * pour filmer — le déclencheur démarre puis arrête (un clavier ne tient pas).
 */
export type StudioCameraIntent = 'photo' | 'hold' | 'arm' | 'manual' | 'film';

/** Au-delà, un appui sur le déclencheur FILME (miroir du geste de la scène). */
const HOLD_MS = 350;

type Recording = 'hold' | 'toggle' | null;
type ScreenFlash = 'off' | 'full' | 'ring';

/**
 * **LA CAMÉRA DU COMPOSER** (#8654, jumelle web du viseur iOS, #8653) — un
 * plein écran ouvert par la capture rapide d'une scène vide :
 *
 *  - le (X) est TOUJOURS là, en haut à gauche, au-dessus de tout (même du sol
 *    blanc du flash) : il quitte à tout moment, film en cours compris, sans
 *    rien poser ni rien retirer du brouillon ;
 *  - le déclencheur : toucher = photo (un réel : démarrer / arrêter), le
 *    tenir = filmer tant qu'il est tenu ;
 *  - le FLASH fait vraiment de la lumière (`cameraFlashPlan`) : la torche à
 *    l'arrière quand le matériel l'expose, sinon — et toujours à l'avant — le
 *    sol de l'écran devient BLANC brillant (plein écran pour une photo, un
 *    anneau autour du viseur pendant un film), luminosité au maximum quand la
 *    coque la sert, restituée ensuite.
 *
 * Ce qu'elle rend est POSÉ dans la scène par l'hôte (`onTake`) : la caméra
 * est une ENTRÉE, pas un mode.
 */
export function StudioCamera({
  lang,
  kind,
  intent,
  holding,
  flash,
  onFlash,
  engine: injected,
  onTake,
  onClose,
}: {
  readonly lang: InterfaceLanguage;
  readonly kind: PublicationKind;
  readonly intent: StudioCameraIntent;
  /** Le doigt qui a ouvert la caméra par un appui long est-il encore posé ? */
  readonly holding: boolean;
  readonly flash: boolean;
  readonly onFlash: (next: boolean) => void;
  /** Injectable pour les témoins ; la production prend le moteur navigateur. */
  readonly engine?: CameraEngine;
  readonly onTake: (file: File) => void;
  readonly onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const restoreRef = useRef<(() => void) | null>(null);
  const busyRef = useRef(false);
  const autoRef = useRef(false);
  const closedRef = useRef(false);
  const startedRef = useRef(false);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [facing, setFacing] = useState<CameraFacing>('environment');
  const [status, setStatus] = useState<'opening' | 'live' | 'unavailable'>('opening');
  const [torch, setTorch] = useState(false);
  const [recording, setRecording] = useState<Recording>(null);
  const [screenFlash, setScreenFlash] = useState<ScreenFlash>('off');
  const recordingRef = useRef<Recording>(null);
  recordingRef.current = recording;
  const holdingRef = useRef(holding);
  holdingRef.current = holding;
  const [engine] = useState(() => injected ?? createBrowserCameraEngine());
  const photoFirst = quickCaptureTap(kind) === 'photo' && intent !== 'film';

  const releaseStream = () => {
    const stream = streamRef.current;
    streamRef.current = null;
    if (stream !== null) engine.release(stream);
    restoreRef.current?.();
    restoreRef.current = null;
  };

  useEffect(() => {
    let alive = true;
    setStatus('opening');
    void engine.open(facing).then(async (result) => {
      if (!alive) {
        if (result.ok) engine.release(result.stream);
        return;
      }
      if (!result.ok) {
        setStatus('unavailable');
        return;
      }
      streamRef.current = result.stream;
      setTorch(result.torch);
      const video = videoRef.current;
      if (video !== null) {
        video.srcObject = result.stream;
        void video.play?.()?.catch(() => undefined);
        await engine.live(video);
      }
      if (alive) setStatus('live');
    });
    return () => {
      alive = false;
      releaseStream();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facing, engine]);

  const plan = () => cameraFlashPlan({ flash, facing, torch });

  const lightOn = async (shape: ScreenFlash) => {
    const chosen = plan();
    const stream = streamRef.current;
    if (chosen === 'torch' && stream !== null) {
      await engine.setTorch(stream, true);
      return;
    }
    if (chosen !== 'screen') return;
    setScreenFlash(shape);
    restoreRef.current = await engine.maxBrightness();
  };

  const lightOff = async () => {
    const stream = streamRef.current;
    if (plan() === 'torch' && stream !== null) await engine.setTorch(stream, false);
    setScreenFlash('off');
    restoreRef.current?.();
    restoreRef.current = null;
  };

  const finish = (file: File | null) => {
    // Quittée par le (X) pendant la prise : rien n'est posé.
    if (file === null || closedRef.current) return;
    releaseStream();
    onTake(file);
  };

  const takePhoto = async () => {
    const video = videoRef.current;
    if (busyRef.current || video === null || streamRef.current === null) return;
    busyRef.current = true;
    await lightOn('full');
    if (plan() !== 'off') await engine.lit();
    const file = await engine.photo(video, facing === 'user');
    await lightOff();
    busyRef.current = false;
    finish(file);
  };

  const startRecording = async (mode: 'hold' | 'toggle') => {
    const stream = streamRef.current;
    if (busyRef.current || stream === null || recordingRef.current !== null) return;
    recordingRef.current = mode;
    setRecording(mode);
    await lightOn('ring');
    // Relâché (ou quittée) pendant que la lumière montait : rien ne tourne.
    if (recordingRef.current !== mode || streamRef.current !== stream) {
      await lightOff();
      return;
    }
    engine.startRecording(stream);
    startedRef.current = true;
  };

  const stopRecording = async () => {
    if (recordingRef.current === null) return;
    recordingRef.current = null;
    setRecording(null);
    // L'enregistreur n'a pas encore démarré : `startRecording` voit la levée
    // et éteint la lumière lui-même — il n'y a rien à clore.
    if (!startedRef.current) return;
    startedRef.current = false;
    const file = await engine.stopRecording();
    await lightOff();
    finish(file);
  };

  /* LA CAPTURE RAPIDE — une fois l'image vivante, le geste qui a ouvert la
     caméra se tient : la photo part, ou le film commence si l'appui dure. */
  useEffect(() => {
    if (status !== 'live' || autoRef.current) return;
    autoRef.current = true;
    if (intent === 'photo') void takePhoto();
    if (intent === 'hold' && holdingRef.current) void startRecording('hold');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  /* Le doigt de la scène se lève : la prise se clôt s'il filmait ; sinon
     (la caméra ne voyait pas encore) rien n'est pris, le viseur reste. */
  useEffect(() => {
    if (holding || intent !== 'hold') return;
    if (quickCaptureRelease({ recording: recordingRef.current === 'hold' }) === 'close-take') void stopRecording();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [holding]);

  const close = () => {
    closedRef.current = true;
    if (holdTimer.current !== null) clearTimeout(holdTimer.current);
    recordingRef.current = null;
    releaseStream();
    onClose();
  };
  useBackDismiss(close, { escape: true });

  const tap = () => {
    if (recordingRef.current !== null) {
      void stopRecording();
      return;
    }
    if (photoFirst) void takePhoto();
    else void startRecording('toggle');
  };

  const shutterLabel = recording !== null ? 'story.studio.camera.shutter.stop' : photoFirst ? 'story.studio.camera.shutter.photo' : 'story.studio.camera.shutter.start';
  const live = status === 'live';

  return (
    <div
      data-story-camera={status}
      data-story-camera-facing={facing}
      role="dialog"
      aria-modal="true"
      aria-label={translate(lang, 'story.studio.camera.title')}
      className="fixed inset-0 z-50 overflow-hidden bg-black"
      style={{ touchAction: 'none' }}
    >
      {/* LE SOL BLANC s'allume d'un coup, jamais en fondu : la lumière doit
          être pleine au moment où l'image est prise. */}
      {screenFlash !== 'off' ? (
        <span aria-hidden="true" data-story-camera-screen-flash={screenFlash} className="absolute inset-0 block" style={{ backgroundColor: '#fff' }} />
      ) : null}
      <video
        ref={videoRef}
        data-story-camera-preview
        muted
        playsInline
        autoPlay
        aria-hidden="true"
        className="absolute size-full object-cover"
        style={{
          inset: screenFlash === 'ring' ? '14% 10%' : 0,
          width: screenFlash === 'ring' ? '80%' : '100%',
          height: screenFlash === 'ring' ? '72%' : '100%',
          borderRadius: screenFlash === 'ring' ? 28 : 0,
          transform: facing === 'user' ? 'scaleX(-1)' : undefined,
          visibility: screenFlash === 'full' ? 'hidden' : 'visible',
        }}
      />
      {status === 'unavailable' ? (
        <p data-story-camera-unavailable role="alert" className="absolute inset-x-6 top-1/2 -translate-y-1/2 text-center text-body" style={{ color: '#fff' }}>
          {translate(lang, 'story.studio.camera.unavailable')}
        </p>
      ) : null}

      <div className="absolute inset-x-0 top-0 z-10 flex items-center gap-3 px-3 pt-safe">
        <button
          type="button"
          data-story-camera-close
          onClick={close}
          aria-label={translate(lang, 'story.studio.camera.close')}
          className={`${ROUND_GLASS} mt-1.5`}
          style={{ outlineColor: 'var(--color-ios-brand)', color: 'var(--color-ios-ink)' }}
        >
          <GlyphSvg glyph={COMPOSER_GLYPHS.x} size={18} />
        </button>
        <span className="flex-1" aria-hidden="true" />
        {recording !== null ? (
          <span data-story-camera-recording role="status" className="mt-1.5 rounded-full px-3 py-1 text-caption font-bold" style={{ backgroundColor: 'var(--color-error)', color: '#fff' }}>
            {translate(lang, 'story.studio.camera.recording')}
          </span>
        ) : null}
        <button
          type="button"
          data-story-camera-flash
          aria-label={translate(lang, 'story.studio.camera.flash')}
          aria-pressed={flash}
          onClick={() => onFlash(!flash)}
          className={`${ROUND_GLASS} mt-1.5`}
          style={{ outlineColor: 'var(--color-ios-brand)', color: flash ? '#FACC15' : 'var(--color-ios-ink)' }}
        >
          <GlyphSvg glyph={THREAD_MENU_GLYPHS.lightning} size={18} />
        </button>
      </div>

      <div className="absolute inset-x-0 bottom-0 z-10 flex flex-col items-center gap-3 px-3 pb-safe">
        <p aria-hidden="true" className="text-caption" style={screenFlash === 'off' ? { color: 'rgba(255,255,255,0.85)', textShadow: '0 1px 2px rgba(0,0,0,0.6)' } : { color: '#111' }}>
          {translate(lang, photoFirst ? 'story.studio.camera.hint.photo' : 'story.studio.camera.hint.video')}
        </p>
        <div className="mb-4 flex w-full items-center justify-center gap-10">
          <span className="size-11" aria-hidden="true" />
          <button
            type="button"
            data-story-camera-shutter
            disabled={!live}
            aria-label={translate(lang, shutterLabel)}
            className="grid size-20 place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{ border: '4px solid #fff', outlineColor: 'var(--color-ios-brand)', opacity: live ? 1 : 0.5, touchAction: 'none' }}
            onPointerDown={(event) => {
              if (!live || recordingRef.current !== null || event.button !== 0) return;
              event.currentTarget.setPointerCapture?.(event.pointerId);
              holdTimer.current = setTimeout(() => {
                holdTimer.current = null;
                void startRecording('hold');
              }, HOLD_MS);
            }}
            onPointerUp={() => {
              if (holdTimer.current !== null) {
                clearTimeout(holdTimer.current);
                holdTimer.current = null;
                tap();
                return;
              }
              if (recordingRef.current === 'hold') void stopRecording();
              else if (recordingRef.current === 'toggle') void stopRecording();
            }}
            onPointerCancel={() => {
              if (holdTimer.current !== null) clearTimeout(holdTimer.current);
              holdTimer.current = null;
              if (recordingRef.current === 'hold') void stopRecording();
            }}
            onClick={(event) => {
              // Le clavier et le lecteur d'écran (un clic sans pointeur).
              if (event.detail === 0) tap();
            }}
          >
            <span
              aria-hidden="true"
              className="block rounded-full transition-all"
              style={{ width: recording !== null ? 28 : 60, height: recording !== null ? 28 : 60, borderRadius: recording !== null ? 8 : 999, backgroundColor: recording !== null || !photoFirst ? 'var(--color-error)' : '#fff' }}
            />
          </button>
          <button
            type="button"
            data-story-camera-flip
            aria-label={translate(lang, 'story.studio.camera.flip')}
            disabled={recording !== null}
            onClick={() => {
              autoRef.current = true;
              setStatus('opening');
              setFacing((current) => (current === 'user' ? 'environment' : 'user'));
            }}
            className={ROUND_GLASS}
            style={{ outlineColor: 'var(--color-ios-brand)', color: 'var(--color-ios-ink)' }}
          >
            <GlyphSvg glyph={CALL_SCREEN_GLYPHS.cameraRotate} size={20} />
          </button>
        </div>
      </div>
    </div>
  );
}
