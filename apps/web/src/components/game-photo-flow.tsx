import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';

import { GameBird, useChoreography } from '@/components/game';
import type { CameraFailure, CameraSession } from '@/lib/game-photo/camera';
import type { PhotoSource } from '@/lib/game-photo/compose';
import type { PhotoEnv } from '@/lib/game-photo/env';
import { flowReducer, type FlowState } from '@/lib/game-photo/flow';
import type { PhotoFormat } from '@/lib/game-photo/layout';
import type { PhotoMoment } from '@/lib/game-photo/moments';
import type { PhotoFiles } from '@/lib/game-photo/render';
import type { ShareOutcome } from '@/lib/game-photo/share';
import { dateLabelOf } from '@/lib/game-photo/render';
import { useObjectUrl } from '@/lib/game-photo/use-object-url';
import { nextFocusIndex } from '@/lib/view/focus-trap';
import { gameText } from '@/lib/view/game-copy';
import { useBackDismiss } from '@/lib/view/use-back-dismiss';

import { GamePhotoFrame } from './game-photo-frame';
import { GAME_BRAND, GAME_ERROR, GAME_GOOD, GAME_INK, GAME_INK_2 } from './game-surface';

/**
 * LES MOMENTS PHOTO (#9382) — conception, partie VI : les grands moments se
 * photographient. Mee propose (« On immortalise ? » : un selfie avec nous, la
 * carte seule, plus tard), la caméra avant s'ouvre avec le cadre du moment en
 * surimpression, au déclenchement Mee et Meo FRAPPENT l'emblème en place
 * (la chorégraphie « mint »), puis l'image se compose en 9:16 et en 1:1 :
 * partager, enregistrer, ou garder au carnet.
 *
 * VIE PRIVÉE : aucune image n'est envoyée à Meeshy. Le flux de la caméra ne sert
 * qu'à l'aperçu ; la composition se fait sur l'appareil ; le carnet est local ;
 * le partage passe par la feuille du système, à un geste. Aucune analyse du
 * visage.
 *
 * Le déroulé est un réducteur pur (`lib/game-photo/flow.ts`) ; tout ce que le
 * navigateur fournit passe par `PhotoEnv`, injecté. Un refus de la caméra
 * n'est jamais une impasse : on nomme la raison et on garde la galerie et la
 * carte seule.
 */

export type PhotoFlowResult = { readonly deferred: boolean };

type Props = {
  readonly moment: PhotoMoment;
  readonly env: PhotoEnv;
  readonly onClose: (result: PhotoFlowResult) => void;
};

const BUTTON = { minHeight: 44 } as const;

const FOCUSABLE = 'button:not([disabled]), [href], input:not([hidden]), [tabindex]:not([tabindex="-1"])';

const canFocus = (element: Element | null): element is HTMLElement => element !== null && 'focus' in element && typeof element.focus === 'function';

const cameraMessage = (failure: CameraFailure): string => {
  switch (failure) {
    case 'denied':
      return gameText('game.photo.camera.denied');
    case 'unsupported':
      return gameText('game.photo.camera.unsupported');
    case 'unavailable':
      return gameText('game.photo.camera.unavailable');
  }
};

function Button({ attr, primary = false, onClick, children, disabled = false }: { readonly attr: Readonly<Record<string, string>>; readonly primary?: boolean; readonly onClick: () => void; readonly children?: ReactNode; readonly disabled?: boolean }) {
  const style: CSSProperties = primary
    ? { ...BUTTON, backgroundColor: GAME_BRAND, color: 'var(--color-ios-surface)' }
    : { ...BUTTON, backgroundColor: 'color-mix(in srgb, var(--color-ios-brand) 12%, transparent)', color: GAME_BRAND };
  return (
    <button
      type="button"
      {...attr}
      disabled={disabled}
      onClick={onClick}
      className="rounded-chip px-4 text-body font-semibold disabled:opacity-60"
      style={style}
    >
      {children}
    </button>
  );
}

export function GamePhotoFlow({ moment, env, onClose }: Props) {
  const [state, dispatch] = useReducer(flowReducer, { step: 'offer' } as FlowState);
  const panel = useRef<HTMLDivElement>(null);
  const close = useCallback(() => dispatch({ type: 'close' }), []);
  /* Le retour matériel (coque Android) et Échap ferment le déroulé, pas l'écran d'en dessous. */
  useBackDismiss(close, { escape: true });
  const { ref: stage, play } = useChoreography<HTMLDivElement>(env.playOptions);
  const video = useRef<HTMLVideoElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const session = useRef<CameraSession | null>(null);
  const photo = useRef<PhotoSource | null>(null);
  const closed = useRef(false);
  const alive = useRef(true);
  const [galleryFile, setGalleryFile] = useState<File | null>(null);
  const [galleryError, setGalleryError] = useState(false);
  const [still, setStill] = useState<Blob | null>(null);
  const [files, setFiles] = useState<PhotoFiles | null>(null);
  const [format, setFormat] = useState<PhotoFormat>('story');
  const [notice, setNotice] = useState<{ readonly tone: 'good' | 'error'; readonly text: string } | null>(null);

  const dateLabel = useMemo(() => dateLabelOf(env.now()), [env]);
  const galleryUrl = useObjectUrl(galleryFile);
  const stillUrl = useObjectUrl(still);
  const previewUrl = useObjectUrl(files === null ? null : files[format]);

  /* Le focus entre dans le dialogue, et revient à ce qui l'a ouvert. */
  useEffect(() => {
    const opener = document.activeElement;
    panel.current?.focus();
    return () => {
      if (canFocus(opener)) opener.focus();
    };
  }, []);

  /* L'image décodée d'une photo de la galerie tient sa mémoire jusqu'à `release()` :
     on la rend au remplacement et à la sortie du déroulé (#9382). */
  const holdPhoto = useCallback((next: PhotoSource | null) => {
    const previous = photo.current;
    photo.current = next;
    if (previous !== null && previous !== next) previous.release?.();
  }, []);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      holdPhoto(null);
    };
  }, [holdPhoto]);

  const stopCamera = useCallback(() => {
    session.current?.stop();
    session.current = null;
  }, []);

  /* La caméra : ouverte au choix du selfie, rendue dès qu'on quitte l'étape. */
  const cameraOpening = state.step === 'camera' && state.camera === 'opening';
  useEffect(() => {
    if (!cameraOpening) return;
    let live = true;
    void env.openCamera().then((result) => {
      if (!live) {
        if (result.ok) result.session.stop();
        return;
      }
      if (!result.ok) {
        dispatch({ type: 'camera-failed', reason: result.reason });
        return;
      }
      session.current = result.session;
      dispatch({ type: 'camera-ready' });
    });
    return () => {
      live = false;
    };
  }, [cameraOpening, env]);

  const cameraLive = state.step === 'camera' && state.camera === 'live';
  useEffect(() => {
    const element = video.current;
    if (!cameraLive || element === null || session.current === null) return;
    element.srcObject = session.current.stream;
    void element.play?.()?.catch(() => undefined);
  }, [cameraLive]);

  useEffect(() => {
    if (state.step !== 'camera') stopCamera();
  }, [state.step, stopCamera]);
  useEffect(() => stopCamera, [stopCamera]);

  /* La frappe en place, et la composition en même temps : on attend les deux. */
  const strikingMode = state.step === 'striking' ? state.mode : null;
  useEffect(() => {
    if (strikingMode === null) return;
    let live = true;
    const source = strikingMode === 'card' ? null : photo.current;
    const handle = play('mint');
    void Promise.all([handle?.finished ?? Promise.resolve(), env.render({ moment, photo: source, frame: stage.current })])
      .then(([, rendered]) => {
        if (!live) return;
        if (rendered === null) {
          dispatch({ type: 'compose-failed' });
          return;
        }
        setFiles(rendered);
        dispatch({ type: 'composed' });
      })
      .catch(() => {
        if (live) dispatch({ type: 'compose-failed' });
      });
    return () => {
      live = false;
    };
  }, [strikingMode, env, moment, play, stage]);

  /* La sortie : « plus tard » laisse le moment en attente, tout le reste le laisse tel quel. */
  useEffect(() => {
    if (state.step !== 'done' || closed.current) return;
    closed.current = true;
    void (async () => {
      if (state.deferred) await env.notebook.defer(moment);
      onClose({ deferred: state.deferred });
    })();
  }, [state, env, moment, onClose]);

  const shoot = useCallback(() => {
    const element = video.current;
    const captured = element === null ? null : env.captureVideo(element);
    if (captured === null) {
      dispatch({ type: 'camera-failed', reason: 'unavailable' });
      return;
    }
    element?.pause?.();
    holdPhoto(captured);
    /* L'image prise reste à l'écran : une caméra rendue peut laisser un écran noir derrière le cadre. */
    (captured.image as { toBlob?: (done: (blob: Blob | null) => void) => void }).toBlob?.((blob) => setStill(blob));
    dispatch({ type: 'shutter' });
  }, [env, holdPhoto]);

  const pickFromGallery = useCallback(
    async (file: File | undefined) => {
      if (file === undefined) return;
      const source = await env.readGallery(file);
      if (!alive.current) {
        source?.release?.();
        return;
      }
      if (source === null) {
        setGalleryError(true);
        return;
      }
      setGalleryError(false);
      holdPhoto(source);
      setGalleryFile(file);
      dispatch({ type: 'gallery' });
    },
    [env, holdPhoto],
  );

  const chosen = files === null ? null : files[format];

  const announce = useCallback((outcome: ShareOutcome, failure: string) => {
    dispatch({ type: 'shared', outcome });
    if (outcome === 'downloaded') setNotice({ tone: 'good', text: gameText('game.photo.notice.saved_file') });
    else if (outcome === 'shared') setNotice({ tone: 'good', text: gameText('game.photo.notice.shared') });
    else if (outcome === 'failed') setNotice({ tone: 'error', text: failure });
    else setNotice(null);
  }, []);

  const share = useCallback(async () => {
    if (chosen === null) return;
    announce(await env.share(chosen, moment.title), gameText('game.photo.notice.share_failed'));
  }, [announce, chosen, env, moment.title]);

  const save = useCallback(async () => {
    if (chosen === null) return;
    announce(await env.save(chosen), gameText('game.photo.notice.save_failed'));
  }, [announce, chosen, env]);

  const keep = useCallback(async () => {
    if (files === null || state.step !== 'result') return;
    const ok = await env.notebook.keep(moment, { story: files.story, square: files.square, mode: state.mode });
    dispatch({ type: 'kept', ok });
    setNotice(
      ok
        ? { tone: 'good', text: gameText('game.photo.notice.kept') }
        : { tone: 'error', text: gameText('game.photo.notice.keep_failed') },
    );
  }, [env, files, moment, state]);

  /* Le piège de focus : Tab ne sort jamais du dialogue. */
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab' || panel.current === null) return;
    const focusables = Array.from(panel.current.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (focusables.length === 0) return;
    event.preventDefault();
    const current = focusables.findIndex((element) => element === document.activeElement);
    const next = current === -1 ? (event.shiftKey ? focusables.length - 1 : 0) : nextFocusIndex(focusables.length, current, event.shiftKey);
    focusables[next]?.focus();
  };

  const showStage = state.step === 'camera' || state.step === 'striking';
  const stageMode = state.step === 'striking' ? state.mode : 'selfie';

  return (
    <div
      ref={panel}
      role="dialog"
      aria-modal="true"
      aria-label={gameText('game.photo.a11y', { title: moment.title })}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      style={{ backgroundColor: 'color-mix(in srgb, var(--ios-indigo-950) 60%, transparent)' }}
    >
      <div
        className="flex max-h-dvh w-full max-w-md flex-col gap-3 overflow-y-auto rounded-card px-4 py-4 pt-safe pb-safe"
        style={{ backgroundColor: 'var(--color-ios-surface)' }}
      >
        <div className="flex items-center justify-between gap-2">
          <p className="text-check font-semibold uppercase tracking-wide" style={{ color: GAME_INK_2 }}>
            {moment.kicker}
          </p>
          <Button attr={{ 'data-photo-close': '' }} onClick={close}>
            {gameText('game.photo.close')}
          </Button>
        </div>

        {state.step === 'offer' ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-end gap-2">
              <GameBird bird="meeGuide" size={72} />
              <div className="min-w-0 flex-1 pb-1">
                <p className="text-title font-bold" style={{ color: GAME_INK }}>
                  {gameText('game.photo.offer.title')}
                </p>
                <p className="text-body" style={{ color: GAME_INK_2 }}>
                  {moment.title}
                </p>
              </div>
              <GameBird bird="meoGuide" size={72} flip />
            </div>
            <p className="text-caption" style={{ color: GAME_INK_2 }}>
              {gameText('game.photo.private')}
            </p>
            <Button attr={{ 'data-photo-choice': 'selfie' }} primary onClick={() => dispatch({ type: 'selfie' })}>
              {gameText('game.photo.selfie')}
            </Button>
            <Button attr={{ 'data-photo-choice': 'card' }} onClick={() => dispatch({ type: 'card' })}>
              {gameText('game.photo.card_only')}
            </Button>
            <Button attr={{ 'data-photo-choice': 'later' }} onClick={() => dispatch({ type: 'later' })}>
              {gameText('game.photo.later')}
            </Button>
          </div>
        ) : null}

        {showStage ? (
          <div
            ref={stage}
            data-photo-stage={stageMode}
            className="relative mx-auto w-full overflow-hidden rounded-card"
            style={{ aspectRatio: '9 / 16', maxHeight: '62dvh', backgroundColor: 'var(--ios-indigo-950)' }}
          >
            {stageMode === 'selfie' ? (
              <video ref={video} playsInline muted autoPlay className="absolute inset-0 size-full object-cover" style={{ transform: 'scaleX(-1)' }} />
            ) : null}
            {stageMode === 'selfie' && state.step === 'striking' && stillUrl !== null ? (
              <img data-photo-still="" src={stillUrl} alt="" className="absolute inset-0 size-full object-cover" style={{ transform: 'scaleX(-1)' }} />
            ) : null}
            {stageMode === 'gallery' && galleryUrl !== null ? <img src={galleryUrl} alt="" className="absolute inset-0 size-full object-cover" /> : null}
            <GamePhotoFrame moment={moment} dateLabel={dateLabel} format="story" />
          </div>
        ) : null}

        {state.step === 'camera' ? (
          <div className="flex flex-col gap-2">
            {state.camera === 'opening' ? (
              <p role="status" className="text-caption" style={{ color: GAME_INK_2 }}>
                {gameText('game.photo.camera.opening')}
              </p>
            ) : null}
            {state.camera === 'denied' || state.camera === 'unsupported' || state.camera === 'unavailable' ? (
              <p role="alert" className="text-body" style={{ color: GAME_ERROR }}>
                {cameraMessage(state.camera)}
              </p>
            ) : null}
            {galleryError ? (
              <p role="alert" className="text-caption" style={{ color: GAME_ERROR }}>
                {gameText('game.photo.gallery.unreadable')}
              </p>
            ) : null}
            {state.camera === 'live' ? (
              <Button attr={{ 'data-photo-shutter': '' }} primary onClick={shoot}>
                {gameText('game.photo.shutter')}
              </Button>
            ) : null}
            <Button attr={{ 'data-photo-gallery': '' }} onClick={() => picker.current?.click()}>
              {gameText('game.photo.gallery')}
            </Button>
            <Button attr={{ 'data-photo-choice': 'card' }} onClick={() => dispatch({ type: 'card' })}>
              {gameText('game.photo.card_only')}
            </Button>
            <input
              ref={picker}
              type="file"
              accept="image/*"
              hidden
              onChange={(event) => {
                void pickFromGallery(event.currentTarget.files?.[0]);
                event.currentTarget.value = '';
              }}
            />
          </div>
        ) : null}

        {state.step === 'striking' ? (
          <p role="status" className="text-center text-body font-semibold" style={{ color: GAME_INK }}>
            {gameText('game.photo.striking')}
          </p>
        ) : null}

        {state.step === 'result' ? (
          <div className="flex flex-col gap-3">
            <div className="flex gap-2" role="group" aria-label={gameText('game.photo.format.group')}>
              <Button attr={{ 'data-photo-format': 'story' }} primary={format === 'story'} onClick={() => setFormat('story')}>
                {gameText('game.photo.format.story')}
              </Button>
              <Button attr={{ 'data-photo-format': 'square' }} primary={format === 'square'} onClick={() => setFormat('square')}>
                {gameText('game.photo.format.square')}
              </Button>
            </div>
            {previewUrl === null ? null : (
              <img
                src={previewUrl}
                alt={gameText('game.photo.preview', { title: moment.title })}
                className="mx-auto w-full rounded-card object-contain"
                style={{ aspectRatio: format === 'story' ? '9 / 16' : '1 / 1', maxHeight: '52dvh' }}
              />
            )}
            <Button attr={{ 'data-photo-share': '' }} primary onClick={() => void share()}>
              {gameText('game.photo.share')}
            </Button>
            <Button attr={{ 'data-photo-save': '' }} onClick={() => void save()}>
              {gameText('game.photo.save')}
            </Button>
            <Button attr={{ 'data-photo-keep': '' }} onClick={() => void keep()} disabled={state.kept === true}>
              {state.kept === true ? gameText('game.photo.kept') : gameText('game.photo.keep')}
            </Button>
            {notice === null ? null : (
              <p role={notice.tone === 'error' ? 'alert' : 'status'} className="text-caption" style={{ color: notice.tone === 'error' ? GAME_ERROR : GAME_GOOD }}>
                {notice.text}
              </p>
            )}
          </div>
        ) : null}

        {state.step === 'failed' ? (
          <p role="alert" className="text-body" style={{ color: GAME_ERROR }}>
            {gameText('game.photo.compose_unsupported')}
          </p>
        ) : null}
      </div>
    </div>
  );
}
