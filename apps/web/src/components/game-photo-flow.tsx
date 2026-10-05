import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';

import { GameBird, useChoreography } from '@/components/game';
import type { CameraFailure, CameraSession } from '@/lib/game-photo/camera';
import type { PhotoSource } from '@/lib/game-photo/compose';
import type { PhotoEnv } from '@/lib/game-photo/env';
import { flowReducer, type FlowState } from '@/lib/game-photo/flow';
import type { PhotoFormat } from '@/lib/game-photo/layout';
import type { PhotoMoment } from '@/lib/game-photo/moments';
import type { PhotoFiles } from '@/lib/game-photo/render';
import { dateLabelOf } from '@/lib/game-photo/render';

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

const CAMERA_MESSAGES: Readonly<Record<CameraFailure, string>> = {
  denied: 'La caméra est refusée. Autorise-la dans les réglages de ton appareil, ou choisis une photo dans ta galerie.',
  unsupported: 'Cet appareil ne permet pas la caméra ici. Choisis une photo dans ta galerie, ou garde la carte seule.',
  unavailable: 'La caméra n’est pas disponible (une autre application l’utilise ?). Choisis une photo dans ta galerie, ou garde la carte seule.',
};

function Button({ attr, primary = false, onClick, children, label, disabled = false }: { readonly attr: Readonly<Record<string, string>>; readonly primary?: boolean; readonly onClick: () => void; readonly children?: ReactNode; readonly label?: string; readonly disabled?: boolean }) {
  const style: CSSProperties = primary
    ? { ...BUTTON, backgroundColor: GAME_BRAND, color: 'var(--color-ios-surface)' }
    : { ...BUTTON, backgroundColor: 'color-mix(in srgb, var(--color-ios-brand) 12%, transparent)', color: GAME_BRAND };
  return (
    <button
      type="button"
      {...attr}
      {...(label === undefined ? {} : { 'aria-label': label })}
      disabled={disabled}
      onClick={onClick}
      className="rounded-chip px-4 text-body font-semibold disabled:opacity-60"
      style={style}
    >
      {children}
    </button>
  );
}

const urlOf = (file: Blob | null): string | null => {
  if (file === null) return null;
  try {
    return URL.createObjectURL(file);
  } catch {
    return null;
  }
};

function useObjectUrl(file: Blob | null): string | null {
  const url = useMemo(() => urlOf(file), [file]);
  useEffect(
    () => () => {
      if (url !== null) {
        try {
          URL.revokeObjectURL(url);
        } catch {
          /* Rien à rendre. */
        }
      }
    },
    [url],
  );
  return url;
}

export function GamePhotoFlow({ moment, env, onClose }: Props) {
  const [state, dispatch] = useReducer(flowReducer, { step: 'offer' } as FlowState);
  const { ref: stage, play } = useChoreography<HTMLDivElement>(env.playOptions);
  const video = useRef<HTMLVideoElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const session = useRef<CameraSession | null>(null);
  const photo = useRef<PhotoSource | null>(null);
  const closed = useRef(false);
  const [galleryFile, setGalleryFile] = useState<File | null>(null);
  const [galleryError, setGalleryError] = useState(false);
  const [files, setFiles] = useState<PhotoFiles | null>(null);
  const [format, setFormat] = useState<PhotoFormat>('story');
  const [notice, setNotice] = useState<{ readonly tone: 'good' | 'error'; readonly text: string } | null>(null);

  const dateLabel = useMemo(() => dateLabelOf(env.now()), [env]);
  const galleryUrl = useObjectUrl(galleryFile);
  const previewUrl = useObjectUrl(files === null ? null : files[format]);

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
    photo.current = captured;
    dispatch({ type: 'shutter' });
  }, [env]);

  const pickFromGallery = useCallback(
    async (file: File | undefined) => {
      if (file === undefined) return;
      const source = await env.readGallery(file);
      if (source === null) {
        setGalleryError(true);
        return;
      }
      setGalleryError(false);
      photo.current = source;
      setGalleryFile(file);
      dispatch({ type: 'gallery' });
    },
    [env],
  );

  const chosen = files === null ? null : files[format];

  const share = useCallback(async () => {
    if (chosen === null) return;
    const outcome = await env.share(chosen, moment.title);
    dispatch({ type: 'shared', outcome });
    if (outcome === 'downloaded') setNotice({ tone: 'good', text: 'Image enregistrée.' });
    else if (outcome === 'shared') setNotice({ tone: 'good', text: 'Image partagée.' });
    else if (outcome === 'failed') setNotice({ tone: 'error', text: 'Le partage n’a pas pu aboutir.' });
    else setNotice(null);
  }, [chosen, env, moment.title]);

  const save = useCallback(() => {
    if (chosen === null) return;
    const ok = env.save(chosen);
    dispatch({ type: 'shared', outcome: ok ? 'downloaded' : 'failed' });
    setNotice(ok ? { tone: 'good', text: 'Image enregistrée.' } : { tone: 'error', text: 'L’enregistrement n’a pas pu aboutir.' });
  }, [chosen, env]);

  const keep = useCallback(async () => {
    if (files === null || state.step !== 'result') return;
    const ok = await env.notebook.keep(moment, { story: files.story, square: files.square, mode: state.mode });
    dispatch({ type: 'kept', ok });
    setNotice(
      ok
        ? { tone: 'good', text: 'Gardée au carnet de progression.' }
        : { tone: 'error', text: 'Le carnet n’est pas disponible sur cet appareil : la photo n’a pas été gardée.' },
    );
  }, [env, files, moment, state]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') dispatch({ type: 'close' });
  };

  const showStage = state.step === 'camera' || state.step === 'striking';
  const stageMode = state.step === 'striking' ? state.mode : 'selfie';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Photo : ${moment.title}`}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      style={{ backgroundColor: 'color-mix(in srgb, var(--ios-indigo-950) 60%, transparent)' }}
    >
      <div
        className="flex max-h-dvh w-full max-w-md flex-col gap-3 overflow-y-auto rounded-card px-4 py-4 pb-safe"
        style={{ backgroundColor: 'var(--color-ios-surface)' }}
      >
        <div className="flex items-center justify-between gap-2">
          <p className="text-check font-semibold uppercase tracking-wide" style={{ color: GAME_INK_2 }}>
            {moment.kicker}
          </p>
          <Button attr={{ 'data-photo-close': '' }} onClick={() => dispatch({ type: 'close' })}>
            Fermer
          </Button>
        </div>

        {state.step === 'offer' ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-end gap-2">
              <GameBird bird="meeGuide" size={72} />
              <div className="min-w-0 flex-1 pb-1">
                <p className="text-title font-bold" style={{ color: GAME_INK }}>
                  On immortalise ?
                </p>
                <p className="text-body" style={{ color: GAME_INK_2 }}>
                  {moment.title}
                </p>
              </div>
              <GameBird bird="meoGuide" size={72} flip />
            </div>
            <p className="text-caption" style={{ color: GAME_INK_2 }}>
              La photo reste sur ton appareil tant que tu ne la partages pas.
            </p>
            <Button attr={{ 'data-photo-choice': 'selfie' }} primary onClick={() => dispatch({ type: 'selfie' })}>
              Selfie avec Mee et Meo
            </Button>
            <Button attr={{ 'data-photo-choice': 'card' }} onClick={() => dispatch({ type: 'card' })}>
              Carte seule
            </Button>
            <Button attr={{ 'data-photo-choice': 'later' }} onClick={() => dispatch({ type: 'later' })}>
              Plus tard
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
            {stageMode === 'gallery' && galleryUrl !== null ? <img src={galleryUrl} alt="" className="absolute inset-0 size-full object-cover" /> : null}
            <GamePhotoFrame moment={moment} dateLabel={dateLabel} format="story" />
          </div>
        ) : null}

        {state.step === 'camera' ? (
          <div className="flex flex-col gap-2">
            {state.camera === 'opening' ? (
              <p role="status" className="text-caption" style={{ color: GAME_INK_2 }}>
                Ouverture de la caméra…
              </p>
            ) : null}
            {state.camera === 'denied' || state.camera === 'unsupported' || state.camera === 'unavailable' ? (
              <p role="alert" className="text-body" style={{ color: GAME_ERROR }}>
                {CAMERA_MESSAGES[state.camera]}
              </p>
            ) : null}
            {galleryError ? (
              <p role="alert" className="text-caption" style={{ color: GAME_ERROR }}>
                Cette image n’a pas pu être lue.
              </p>
            ) : null}
            {state.camera === 'live' ? (
              <Button attr={{ 'data-photo-shutter': '' }} primary label="Prendre la photo" onClick={shoot}>
                Déclencher
              </Button>
            ) : null}
            <Button attr={{ 'data-photo-gallery': '' }} onClick={() => picker.current?.click()}>
              Choisir dans la galerie
            </Button>
            <Button attr={{ 'data-photo-choice': 'card' }} onClick={() => dispatch({ type: 'card' })}>
              Carte seule
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
            Mee et Meo frappent le moment…
          </p>
        ) : null}

        {state.step === 'result' ? (
          <div className="flex flex-col gap-3">
            <div className="flex gap-2" role="group" aria-label="Format de l’image">
              <Button attr={{ 'data-photo-format': 'story' }} primary={format === 'story'} onClick={() => setFormat('story')}>
                Story 9:16
              </Button>
              <Button attr={{ 'data-photo-format': 'square' }} primary={format === 'square'} onClick={() => setFormat('square')}>
                Profil 1:1
              </Button>
            </div>
            {previewUrl === null ? null : (
              <img
                src={previewUrl}
                alt={`Aperçu : ${moment.title}`}
                className="mx-auto w-full rounded-card object-contain"
                style={{ aspectRatio: format === 'story' ? '9 / 16' : '1 / 1', maxHeight: '52dvh' }}
              />
            )}
            <Button attr={{ 'data-photo-share': '' }} primary onClick={() => void share()}>
              Partager
            </Button>
            <Button attr={{ 'data-photo-save': '' }} onClick={save}>
              Enregistrer
            </Button>
            <Button attr={{ 'data-photo-keep': '' }} onClick={() => void keep()} disabled={state.kept === true}>
              {state.kept === true ? 'Gardée au carnet' : 'Garder au carnet'}
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
            Ce navigateur ne sait pas composer l’image. Ton moment reste dans la progression.
          </p>
        ) : null}
      </div>
    </div>
  );
}
