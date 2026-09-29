import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

import { GlyphSvg } from '@/components/glyph';
import { CALL_SCREEN_GLYPHS } from '@/components/glyphs-call-screen';
import { COMPOSER_GLYPHS } from '@/components/glyphs-composer';
import { GLYPHS } from '@/components/glyphs';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { cameraMirrored } from '@/lib/media/camera-mirror';
import type { PublicationKind } from '@/lib/stories/publication-kind';
import { captureLock, flashFloorColor, flashSliderShown, zoomAfterDrag, type CameraZoomRange, type LayoutDirection } from '@/lib/stories/studio-capture-gestures';
import { createBrowserCameraEngine, type CameraEngine } from '@/lib/stories/studio-camera-engine';
import { cameraFlashPlan, quickCaptureRelease, quickCaptureTap, type CameraFacing } from '@/lib/stories/studio-quick-capture';
import { useBackDismiss } from '@/lib/view/use-back-dismiss';
import { StudioCameraFlash } from '@/routes/story-compose-camera-flash';
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

/** `locked` : l'appui long a glissé jusqu'au cadenas — le doigt peut se
 * lever, le film continue jusqu'au stop (#8672). */
type Recording = 'hold' | 'locked' | 'toggle' | null;
type ScreenFlash = 'off' | 'full' | 'ring';

/** Le glisser du doigt qui a ouvert la caméra par un appui long sur la SCÈNE :
 * il vit sous la caméra (capturé par la scène), l'hôte le relaie ici. */
export type StudioHoldDrag = { current: ((dx: number, dy: number) => void) | null };

const NO_ZOOM: CameraZoomRange = { mode: 'preview', min: 1, max: 1, step: 0 };

function directionOf(element: Element | null): LayoutDirection {
  if (element === null || typeof getComputedStyle !== 'function') return 'ltr';
  return getComputedStyle(element).direction === 'rtl' ? 'rtl' : 'ltr';
}

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
 *  - LE VERROU ET LE ZOOM (#8672) : pendant l'appui long qui filme, un
 *    cadenas paraît du côté de début du déclencheur ; glisser jusqu'à lui
 *    VERROUILLE (le doigt se lève, le déclencheur devient stop). Glisser vers
 *    le haut zoome, vers le bas dézoome — maintenu, verrouillé, ou sur le
 *    viseur pendant un film mains libres ;
 *  - LE CURSEUR DU FLASH : flash activé et sol blanc, un curseur de verre
 *    s'allonge collé au bouton et règle l'intensité du blanc.
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
  intensity = 1,
  onIntensity = () => undefined,
  holdDrag,
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
  /** L'intensité du blanc du sol, de `FLASH_INTENSITY_MIN` à 1. */
  readonly intensity?: number;
  readonly onIntensity?: (next: number) => void;
  /** Le relais du glisser de la scène — la caméra y branche sa loi. */
  readonly holdDrag?: StudioHoldDrag;
  /** Injectable pour les témoins ; la production prend le moteur navigateur. */
  readonly engine?: CameraEngine;
  readonly onTake: (file: File) => void;
  readonly onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
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
  const [previewingFloor, setPreviewingFloor] = useState(false);
  const [lockProgress, setLockProgress] = useState(0);
  const [zoom, setZoomState] = useState(1);
  const zoomRef = useRef(1);
  const zoomRangeRef = useRef<CameraZoomRange>(NO_ZOOM);
  /** Le zoom au début du glisser en cours — le geste est RELATIF à lui. */
  const dragFromRef = useRef(1);
  const pressRef = useRef<{ readonly x: number; readonly y: number; readonly already: boolean } | null>(null);
  const viewDragRef = useRef<{ readonly y: number } | null>(null);
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
      zoomRangeRef.current = result.zoom;
      zoomRef.current = result.zoom.min;
      setZoomState(result.zoom.min);
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

  const applyZoom = (next: number) => {
    if (next === zoomRef.current) return;
    zoomRef.current = next;
    setZoomState(next);
    const stream = streamRef.current;
    if (zoomRangeRef.current.mode === 'hardware' && stream !== null) void engine.setZoom(stream, next);
  };

  const resetZoom = () => {
    applyZoom(zoomRangeRef.current.min);
    setLockProgress(0);
  };

  /** LE DOIGT QUI FILME GLISSE : l'axe horizontal mène au cadenas, l'axe
   * vertical zoome — relatif au zoom du début du geste. */
  const dragWhileFilming = (dx: number, dy: number) => {
    const mode = recordingRef.current;
    if (mode !== 'hold' && mode !== 'locked') return;
    if (mode === 'hold') {
      const lock = captureLock({ dx, direction: directionOf(rootRef.current) });
      setLockProgress(lock.progress);
      if (lock.reached) {
        recordingRef.current = 'locked';
        setRecording('locked');
        setLockProgress(0);
      }
    }
    applyZoom(zoomAfterDrag({ from: dragFromRef.current, dy, range: zoomRangeRef.current }));
  };

  useEffect(() => {
    if (holdDrag === undefined) return undefined;
    holdDrag.current = dragWhileFilming;
    return () => {
      holdDrag.current = null;
    };
  });

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
    const file = await engine.photo(video, zoomRangeRef.current.mode === 'hardware' ? 1 : zoomRef.current);
    await lightOff();
    busyRef.current = false;
    finish(file);
  };

  /** Relue APRÈS une attente : le mode a pu changer (relâché, verrouillé). */
  const recordingNow = (): Recording => recordingRef.current;

  const startRecording = async (mode: 'hold' | 'toggle') => {
    const stream = streamRef.current;
    if (busyRef.current || stream === null || recordingRef.current !== null) return;
    recordingRef.current = mode;
    setRecording(mode);
    dragFromRef.current = zoomRef.current;
    await lightOn('ring');
    // Relâché (ou quittée) pendant que la lumière montait : rien ne tourne.
    // Verrouillé pendant ce temps, le film, lui, doit tourner.
    const current = recordingNow();
    if ((current !== mode && !(mode === 'hold' && current === 'locked')) || streamRef.current !== stream) {
      await lightOff();
      return;
    }
    const video = videoRef.current;
    engine.startRecording(stream, zoomRangeRef.current.mode === 'recorded' && video !== null ? { video, zoom: () => zoomRef.current } : null);
    startedRef.current = true;
  };

  const stopRecording = async () => {
    if (recordingRef.current === null) return;
    recordingRef.current = null;
    setRecording(null);
    viewDragRef.current = null;
    // L'enregistreur n'a pas encore démarré : `startRecording` voit la levée
    // et éteint la lumière lui-même — il n'y a rien à clore.
    if (!startedRef.current) return;
    startedRef.current = false;
    const file = await engine.stopRecording();
    await lightOff();
    resetZoom();
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
  const sliderShown = flashSliderShown({ flash, plan: plan() });
  const floor: ScreenFlash = screenFlash !== 'off' ? screenFlash : previewingFloor && sliderShown ? 'ring' : 'off';
  const handsFree = recording === 'locked' || recording === 'toggle';
  const hintKey =
    recording === 'hold'
      ? 'story.studio.camera.hint.holding'
      : handsFree
        ? 'story.studio.camera.hint.locked'
        : photoFirst
          ? 'story.studio.camera.hint.photo'
          : 'story.studio.camera.hint.video';
  /** Le zoom de l'APERÇU : numérique (`recorded`, `preview`) — la piste
   * matérielle zoome elle-même, l'aperçu ne grandit pas en plus. */
  const previewScale = zoomRangeRef.current.mode === 'hardware' ? 1 : zoom;
  const transforms = [cameraMirrored({ facing, role: 'preview' }) ? 'scaleX(-1)' : '', previewScale > 1 ? `scale(${previewScale})` : ''].filter((part) => part !== '');

  /* LE VISEUR, PENDANT UN FILM MAINS LIBRES : glisser vers le haut zoome,
     vers le bas dézoome. Les boutons gardent leurs propres gestes. */
  const onViewDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!handsFree || event.button !== 0 || !(event.target instanceof Element) || event.target.closest('button, input') !== null) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    viewDragRef.current = { y: event.clientY };
    dragFromRef.current = zoomRef.current;
  };
  const onViewMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = viewDragRef.current;
    if (drag === null || recordingRef.current === null) return;
    applyZoom(zoomAfterDrag({ from: dragFromRef.current, dy: event.clientY - drag.y, range: zoomRangeRef.current }));
  };
  const onViewEnd = () => {
    viewDragRef.current = null;
  };

  return (
    <div
      ref={rootRef}
      data-story-camera={status}
      data-story-camera-facing={facing}
      data-story-camera-zoom-mode={zoomRangeRef.current.mode}
      role="dialog"
      aria-modal="true"
      aria-label={translate(lang, 'story.studio.camera.title')}
      className="fixed inset-0 z-50 overflow-hidden bg-black"
      style={{ touchAction: 'none' }}
      onPointerDown={onViewDown}
      onPointerMove={onViewMove}
      onPointerUp={onViewEnd}
      onPointerCancel={onViewEnd}
    >
      {/* LE SOL BLANC s'allume d'un coup, jamais en fondu : la lumière doit
          être pleine au moment où l'image est prise. */}
      {floor !== 'off' ? (
        <span
          aria-hidden="true"
          data-story-camera-screen-flash={floor}
          data-story-camera-screen-flash-preview={screenFlash === 'off' ? '' : undefined}
          className="absolute inset-0 block"
          style={{ backgroundColor: flashFloorColor(intensity) }}
        />
      ) : null}
      {/* La FENÊTRE du viseur borne l'image : un zoom numérique agrandit la
          vidéo DANS elle, jamais par-dessus l'anneau blanc du flash. */}
      <div
        aria-hidden="true"
        className="absolute overflow-hidden"
        style={{
          inset: floor === 'ring' ? '14% 10%' : 0,
          width: floor === 'ring' ? '80%' : '100%',
          height: floor === 'ring' ? '72%' : '100%',
          borderRadius: floor === 'ring' ? 28 : 0,
          visibility: floor === 'full' ? 'hidden' : 'visible',
        }}
      >
        <video
          ref={videoRef}
          data-story-camera-preview
          muted
          playsInline
          autoPlay
          className="size-full object-cover"
          style={{ transform: transforms.length > 0 ? transforms.join(' ') : undefined }}
        />
      </div>
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
        {/* Le flash suit le (X) : son curseur s'allonge vers la fin de la
            ligne, collé à lui — il a la place de le faire. */}
        <StudioCameraFlash
          lang={lang}
          flash={flash}
          sliderShown={sliderShown}
          intensity={intensity}
          onFlash={onFlash}
          onIntensity={onIntensity}
          onPreview={setPreviewingFloor}
        />
      </div>

      <div className="absolute inset-x-0 bottom-0 z-10 flex flex-col items-center gap-3 px-3 pb-safe">
        {/* L'ÉTAT DU FILM, au-dessus du déclencheur (la barre haute porte le
            curseur du flash déplié) : enregistrement ou verrou, et le zoom. */}
        {recording !== null ? (
          <div className="flex items-center gap-2">
            <span
              data-story-camera-recording={recording === 'locked' ? 'locked' : ''}
              role="status"
              className="flex items-center gap-1 whitespace-nowrap rounded-full px-3 py-1 text-caption font-bold"
              style={{ backgroundColor: 'var(--color-error)', color: '#fff' }}
            >
              {recording === 'locked' ? <GlyphSvg glyph={GLYPHS.lock} size={14} /> : null}
              {translate(lang, recording === 'locked' ? 'story.studio.camera.locked' : 'story.studio.camera.recording')}
            </span>
            {zoomRangeRef.current.max > zoomRangeRef.current.min ? (
              <span data-story-camera-zoom={zoom.toFixed(1)} aria-hidden="true" dir="ltr" className="glass rounded-full px-2.5 py-1 text-caption font-bold tabular-nums" style={{ color: 'var(--color-ios-ink)' }}>
                {`${zoom.toFixed(1)}×`}
              </span>
            ) : null}
          </div>
        ) : null}
        <p aria-hidden="true" data-story-camera-hint className="text-center text-caption" style={floor === 'off' ? { color: 'rgba(255,255,255,0.85)', textShadow: '0 1px 2px rgba(0,0,0,0.6)' } : { color: '#111' }}>
          {translate(lang, hintKey)}
        </p>
        <div className="mb-4 flex w-full items-center justify-center gap-10">
          {/* LE CADENAS — pendant l'appui long qui filme, du côté de début
              du déclencheur ; il grandit à mesure que le doigt s'approche. */}
          <span
            aria-hidden="true"
            data-story-camera-lock={recording === 'hold' ? (lockProgress > 0 ? 'near' : 'shown') : undefined}
            className="glass grid size-11 place-items-center rounded-full motion-safe:transition-transform"
            style={
              recording === 'hold'
                ? { color: 'var(--color-ios-ink)', transform: `scale(${1 + lockProgress * 0.25})` }
                : { visibility: 'hidden' }
            }
          >
            <GlyphSvg glyph={GLYPHS.lock} size={20} />
          </span>
          <button
            type="button"
            data-story-camera-shutter
            disabled={!live}
            aria-label={translate(lang, shutterLabel)}
            className="grid size-20 place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{ border: `4px solid ${floor === 'off' ? '#fff' : '#111'}`, outlineColor: 'var(--color-ios-brand)', opacity: live ? 1 : 0.5, touchAction: 'none' }}
            onPointerDown={(event) => {
              if (!live || event.button !== 0) return;
              const already = recordingRef.current !== null;
              pressRef.current = { x: event.clientX, y: event.clientY, already };
              if (already) return;
              event.currentTarget.setPointerCapture?.(event.pointerId);
              holdTimer.current = setTimeout(() => {
                holdTimer.current = null;
                void startRecording('hold');
              }, HOLD_MS);
            }}
            onPointerMove={(event) => {
              const origin = pressRef.current;
              if (origin === null || origin.already) return;
              dragWhileFilming(event.clientX - origin.x, event.clientY - origin.y);
            }}
            onPointerUp={() => {
              const origin = pressRef.current;
              pressRef.current = null;
              if (holdTimer.current !== null) {
                clearTimeout(holdTimer.current);
                holdTimer.current = null;
                tap();
                return;
              }
              // Un toucher sur le stop (film verrouillé ou mains libres) le
              // clôt ; le doigt qui VIENT de verrouiller se lève sans rien clore.
              if (origin?.already === true || recordingRef.current === 'hold') void stopRecording();
            }}
            onPointerCancel={() => {
              pressRef.current = null;
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
