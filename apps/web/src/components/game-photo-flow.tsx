import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';

import { saveButtonVisible, type CaptureZone, type FrameChoice } from '@meeshy/shared/utils/capture/capture-save';

import { GameBird, useChoreography } from '@/components/game';
import { authorPlateOf, type PhotoAuthor } from '@/lib/game-photo/author-plate';
import type { CameraFailure, CameraSession } from '@/lib/game-photo/camera';
import type { PhotoSource } from '@/lib/game-photo/compose';
import type { PhotoEnv } from '@/lib/game-photo/env';
import { flowReducer, type FlowState } from '@/lib/game-photo/flow';
import type { PhotoFormat } from '@/lib/game-photo/layout';
import type { PhotoMoment } from '@/lib/game-photo/moments';
import { referralOf, referralPlaceholder, referralShareText, type PhotoReferral } from '@/lib/game-photo/referral';
import { photoBannerOf, type GloryRenderSource, type PhotoFiles } from '@/lib/game-photo/render';
import type { GloryPreviewKit } from '@/lib/game-photo/env';
import type { GloryRecipe, GloryScene } from '@/lib/game-photo/glory/glory-scene';
import { interfaceDirection } from '@/lib/inline-interface-language-bootstrap.js';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import type { ShareOutcome } from '@/lib/game-photo/share';
import { dateLabelOf } from '@/lib/game-photo/render';
import { useObjectUrl } from '@/lib/game-photo/use-object-url';
import { usePhotoAuthor } from '@/lib/game-photo/use-photo-author';
import { nextFocusIndex } from '@/lib/view/focus-trap';
import { gameText } from '@/lib/view/game-copy';
import { useBackDismiss } from '@/lib/view/use-back-dismiss';

import { GameAuthorCard } from './game-author-card';
import { GamePhotoFrame, type GloryFrameOverlay } from './game-photo-frame';
import { GamePhotoGloryCanvas } from './game-photo-glory-canvas';
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
 *
 * LE CADRE EST LE DÉCLENCHEUR (#10284, directive porteur 2026-10-12) : aucun
 * cercle d'enregistrement à côté du cadre. La case du cadre choisi prend la
 * photo, l'enregistre dans la galerie puis ouvre le résultat ; la scène (toucher
 * deux fois, tenir, Entrée au clavier) la prend sans l'écrire hors de l'app.
 * « Enregistrer » ne se montre que si la prise n'est pas déjà enregistrée avec
 * ce cadre (loi partagée `capture-save`, portée par le réducteur). Le cadre
 * choisi est celui du moment tant que la bande de cadres (#10164) n'existe pas.
 */

export type PhotoFlowResult = { readonly deferred: boolean };

type Props = {
  readonly moment: PhotoMoment;
  readonly env: PhotoEnv;
  readonly onClose: (result: PhotoFlowResult) => void;
  /** Les jours de la Flamme (#7742) : le bandeau de la carte les porte à côté du lien de parrainage. */
  readonly flameDays?: number | null;
  /** L'auteur dont la plaque grave le pseudo (#10816) ; absent : le lecteur ; `null` : aucune plaque. */
  readonly author?: PhotoAuthor | null;
};

const BUTTON = { minHeight: 44 } as const;

/** Tenir la scène : au-delà de ce délai, l'appui est une prise hors cadre. */
const HOLD_MS = 450;

/** Une sortie vers la galerie a abouti : un fichier écrit, ou la feuille du système qui l'a pris. */
const reachedGallery = (outcome: ShareOutcome): boolean => outcome === 'downloaded';

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

export function GamePhotoFlow({ moment, env, onClose, flameDays = null, author: givenAuthor }: Props) {
  const viewerAuthor = usePhotoAuthor();
  const author = givenAuthor === undefined ? viewerAuthor : givenAuthor;
  const plate = useMemo(() => authorPlateOf(moment.emblem, author), [moment.emblem, author]);
  const [state, dispatch] = useReducer(flowReducer, { step: 'offer' } as FlowState);
  const panel = useRef<HTMLDivElement>(null);
  const close = useCallback(() => dispatch({ type: 'close' }), []);
  /* Le retour matériel (coque Android) et Échap ferment le déroulé, pas l'écran d'en dessous. */
  useBackDismiss(close, { escape: true });
  const { ref: stage, play } = useChoreography<HTMLDivElement>(env.playOptions);
  const video = useRef<HTMLVideoElement>(null);
  /* La case du cadre peint le direct à travers son cadre, comme les cases du composer. */
  const tileVideo = useRef<HTMLVideoElement>(null);
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
  /* Le format au moment de la composition : la prise par le cadre part dans la galerie dans CE format (#10296). */
  const formatAtCompose = useRef<PhotoFormat>(format);
  formatAtCompose.current = format;
  const [notice, setNotice] = useState<{ readonly tone: 'good' | 'error'; readonly text: string; readonly action?: 'save'; readonly transient?: boolean } | null>(null);
  /* Le cadre posé sur la prise : celui du moment, seul proposé tant que la bande n'existe pas (#10164). */
  const frameId = moment.id;
  /* Une prise par la case du cadre attend sa composition pour partir dans la galerie. */
  const galleryOnCompose = useRef(false);
  const hold = useRef<ReturnType<typeof setTimeout> | null>(null);
  /* Le bandeau que porte l'image COMPOSÉE — pas celui que la carte porterait maintenant : un lien lu
     après la frappe ne change ni l'image qui part, ni son texte. */
  const [composedReferral, setComposedReferral] = useState<PhotoReferral | null>(null);

  const dateLabel = useMemo(() => dateLabelOf(env.now()), [env]);

  /* Le lien de parrainage (#7742) : le lien EXISTANT, lu UNE fois à l'ouverture,
     SANS rien créer (décision porteur : aucun jeton sans geste). Sans jeton, et
     quand l'environnement sait en créer un, l'aperçu montre l'EMPLACEMENT
     VIDE du carré QR (#9554) ; le jeton se crée au toucher de « Partager ». Un échec ou
     une absence ne retient jamais la carte — elle part simplement sans bandeau. */
  const [link, setLink] = useState<string | null>(null);
  const [lookedUp, setLookedUp] = useState(false);
  const [linkUnavailable, setLinkUnavailable] = useState(false);
  useEffect(() => {
    let live = true;
    const done = (url: string | null): void => {
      if (!live) return;
      setLink(url);
      setLookedUp(true);
    };
    void (env.referral?.() ?? Promise.resolve(null)).then(done, () => done(null));
    return () => {
      live = false;
    };
  }, [env]);
  const linkOffered = link !== null || (lookedUp && env.createReferral !== undefined && !linkUnavailable);
  /* CE QUE LA CARTE PORTE SE CHOISIT (conformité H-2) : le lien d'invitation et la
     Flamme sont chacun retirables AVANT la prise, et l'aperçu du cadre montre
     exactement ce qui sera composé. Sans lien, il n'y a rien à retirer. */
  const [withLink, setWithLink] = useState(true);
  const [withFlame, setWithFlame] = useState(true);
  const shownFlame = withFlame ? flameDays : null;
  const referral = useMemo((): PhotoReferral | null => {
    if (!withLink || !linkOffered) return null;
    return link === null ? referralPlaceholder(shownFlame) : referralOf(link, shownFlame);
  }, [link, linkOffered, shownFlame, withLink]);
  /* Lu au moment de composer, jamais une dépendance : un lien qui arrive pendant
     la frappe ne la rejoue pas. */
  const referralRef = useRef(referral);
  referralRef.current = referral;

  /* LE CADRE DÉCORÉ (#10159, L7) : la scène de l'étape, demandée dès l'ouverture (couches à
     demi-résolution pour l'aperçu) ; `null` — pack pas prêt, ancien serveur, étape sans cadre —
     laisse la carte simple, sans attendre. La scène se rend en sortant. */
  const [glory, setGlory] = useState<GloryScene | null>(null);
  const [gloryKit, setGloryKit] = useState<GloryPreviewKit | null>(null);
  const gloryStep = useMemo(() => ({ stepId: moment.id, atmosphere: null, lastChosen: null }), [moment.id]);
  const gloryTexts = useMemo(() => ({ kicker: moment.kicker, title: moment.title, date: dateLabel, message: null }), [moment.kicker, moment.title, dateLabel]);
  useEffect(() => {
    if (env.glory === undefined) return;
    let live = true;
    let opened: GloryScene | null = null;
    void env
      .glory({ step: gloryStep, texts: gloryTexts, scale: 0.5 })
      .then((scene) => {
        if (!live) {
          scene?.close();
          return;
        }
        opened = scene;
        setGlory(scene);
      })
      .catch(() => undefined);
    return () => {
      live = false;
      opened?.close();
      setGlory(null);
    };
  }, [env, gloryStep, gloryTexts]);
  const gloryRecipe = useMemo((): GloryRecipe => ({ pose: null, message: null, crop: { dx: 0, dy: 0, zoom: 1 }, showFlame: withFlame, showLink: withLink }), [withFlame, withLink]);
  const rtl = interfaceDirection(currentInterfaceLanguage()) === 'rtl';
  const gloryBanner = useMemo(() => (glory === null || referral === null ? null : photoBannerOf(referral, glory.bannerLayout(rtl))), [glory, referral, rtl]);
  const gloryOverlay = useMemo((): GloryFrameOverlay | null => (glory === null ? null : { crest: glory.crest, qr: glory.bannerLayout(rtl)?.qr ?? null }), [glory, rtl]);
  /* L'image finale ouvre SA scène (pleine résolution) le temps de composer, puis la rend. */
  const gloryFinal = useCallback(async (): Promise<{ readonly source: GloryRenderSource; readonly close: () => void } | null> => {
    if (glory === null || env.glory === undefined) return null;
    const scene = await env.glory({ step: gloryStep, texts: gloryTexts, scale: 1 }).catch(() => null);
    return scene === null ? null : { source: { scene, recipe: gloryRecipe, language: currentInterfaceLanguage() }, close: scene.close };
  }, [env, glory, gloryRecipe, gloryStep, gloryTexts]);
  const composeWith = useCallback(
    async (input: { readonly photo: PhotoSource | null; readonly frame: HTMLElement | null; readonly referral: PhotoReferral | null }): Promise<PhotoFiles | null> => {
      const final = await gloryFinal();
      try {
        return await env.render({ moment, ...input, glory: final?.source ?? null });
      } finally {
        final?.close();
      }
    },
    [env, gloryFinal, moment],
  );
  /* Lu au moment de composer, jamais une dépendance de la frappe : une scène d'aperçu qui arrive
     PENDANT la frappe (premier usage : chunk, packs, contrat, décodages) changerait l'identité de
     `composeWith` et rejouerait frappe et composition — la même loi que `referralRef`. */
  const composeRef = useRef(composeWith);
  composeRef.current = composeWith;
  const options =
    !linkOffered ? null : (
      <fieldset className="flex flex-col gap-1" data-photo-options="">
        <legend className="text-caption font-semibold" style={{ color: GAME_INK_2 }}>
          {gameText('game.photo.referral.options')}
        </legend>
        <label className="flex items-center gap-3" style={{ minHeight: 44, color: GAME_INK }}>
          <input type="checkbox" data-photo-with-link="" checked={withLink} onChange={(event) => setWithLink(event.currentTarget.checked)} className="size-5 accent-[var(--color-ios-brand)]" />
          <span className="text-body">{gameText('game.photo.referral.with_link')}</span>
        </label>
        {flameDays === null || flameDays <= 0 ? null : (
          <label className="flex items-center gap-3" style={{ minHeight: 44, color: GAME_INK }}>
            <input
              type="checkbox"
              data-photo-with-flame=""
              checked={withFlame && withLink}
              disabled={!withLink}
              onChange={(event) => setWithFlame(event.currentTarget.checked)}
              className="size-5 accent-[var(--color-ios-brand)]"
            />
            <span className="text-body">{gameText('game.photo.referral.with_flame')}</span>
          </label>
        )}
      </fieldset>
    );
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
    const tile = tileVideo.current;
    if (tile === null) return;
    tile.srcObject = session.current.stream;
    void tile.play?.()?.catch(() => undefined);
  }, [cameraLive]);

  useEffect(() => {
    if (state.step !== 'camera') stopCamera();
  }, [state.step, stopCamera]);
  useEffect(() => stopCamera, [stopCamera]);

  /* La frappe en place, et la composition en même temps : on attend les deux. */
  const strikingMode = state.step === 'striking' ? state.mode : null;
  const strikingZone = state.step === 'striking' ? state.zone : null;
  useEffect(() => {
    if (strikingMode === null) return;
    let live = true;
    const source = strikingMode === 'card' ? null : photo.current;
    const handle = play('mint');
    const banner = referralRef.current;
    void Promise.all([handle?.finished ?? Promise.resolve(), composeRef.current({ photo: source, frame: stage.current, referral: banner })])
      .then(([, rendered]) => {
        if (!live) return;
        if (rendered === null) {
          dispatch({ type: 'compose-failed' });
          return;
        }
        setFiles(rendered);
        setComposedReferral(banner);
        galleryOnCompose.current = strikingZone === 'frame';
        dispatch({ type: 'composed', frame: frameId, format: formatAtCompose.current });
      })
      .catch(() => {
        if (live) dispatch({ type: 'compose-failed' });
      });
    return () => {
      live = false;
    };
  }, [strikingMode, strikingZone, frameId, play, stage]);

  /* La sortie : « plus tard » laisse le moment en attente, tout le reste le laisse tel quel. */
  useEffect(() => {
    if (state.step !== 'done' || closed.current) return;
    closed.current = true;
    void (async () => {
      if (state.deferred) await env.notebook.defer(moment);
      onClose({ deferred: state.deferred });
    })();
  }, [state, env, moment, onClose]);

  const shoot = useCallback((zone: CaptureZone) => {
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
    dispatch({ type: 'shutter', zone });
  }, [env, holdPhoto]);

  const releaseHold = useCallback(() => {
    if (hold.current !== null) clearTimeout(hold.current);
    hold.current = null;
  }, []);
  useEffect(() => releaseHold, [releaseHold]);
  const sceneControls = {
    role: 'button',
    tabIndex: 0,
    'aria-label': gameText('game.photo.take.scene'),
    'data-photo-take': 'scene',
    onDoubleClick: () => shoot('outside'),
    onPointerDown: () => {
      releaseHold();
      hold.current = setTimeout(() => {
        hold.current = null;
        shoot('outside');
      }, HOLD_MS);
    },
    onPointerUp: releaseHold,
    onPointerLeave: releaseHold,
    onPointerCancel: releaseHold,
    onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      shoot('outside');
    },
  } as const;

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

  /* L'image qui SORT de l'appareil ne porte jamais l'emplacement du lien : elle est
     recomposée — avec le vrai lien, ou sans bandeau — depuis les dessins du cadre
     gardé (`artFrame`) et la même photo. */
  const artFrame = useRef<HTMLDivElement>(null);
  const resultMode = state.step === 'result' ? state.mode : null;
  const recompose = useCallback(
    (next: PhotoReferral | null) => composeWith({ photo: resultMode === 'card' ? null : photo.current, frame: artFrame.current, referral: next }).catch(() => null),
    [composeWith, resultMode],
  );
  const outgoingFiles = useCallback(
    async (): Promise<PhotoFiles | null> => (composedReferral?.placeholder === true ? recompose(null) : files),
    [composedReferral, files, recompose],
  );
  const sharing = useRef(false);

  const announce = useCallback((outcome: ShareOutcome, failure: string) => {
    dispatch({ type: 'shared', outcome });
    if (outcome === 'downloaded') setNotice({ tone: 'good', text: gameText('game.photo.notice.saved_file') });
    else if (outcome === 'shared') setNotice({ tone: 'good', text: gameText('game.photo.notice.shared') });
    else if (outcome === 'failed') setNotice({ tone: 'error', text: failure });
    else setNotice(null);
  }, []);

  /* « Partager » : le SEUL geste qui crée un jeton, quand la carte montre
     l'emplacement du lien. La carte est recomposée avec le vrai lien — ou sans
     bandeau si aucun ne vient — AVANT de partir, et l'aperçu la suit. */
  const prepareShare = useCallback(async (): Promise<{ readonly files: PhotoFiles; readonly referral: PhotoReferral | null } | null> => {
    if (files === null) return null;
    if (composedReferral?.placeholder !== true) return { files, referral: composedReferral };
    const url = await (env.createReferral?.() ?? Promise.resolve(null)).catch(() => null);
    const next = url === null ? null : referralOf(url, composedReferral.flameDays);
    const recomposed = await recompose(next);
    if (!alive.current || recomposed === null) return null;
    if (next === null) setLinkUnavailable(true);
    else setLink(url);
    setFiles(recomposed);
    setComposedReferral(next);
    return { files: recomposed, referral: next };
  }, [composedReferral, env, files, recompose]);

  const share = useCallback(async () => {
    if (files === null || sharing.current) return;
    sharing.current = true;
    try {
      const outgoing = await prepareShare();
      if (outgoing === null) {
        if (alive.current) announce('failed', gameText('game.photo.notice.share_failed'));
        return;
      }
      const text = outgoing.referral === null ? undefined : referralShareText(outgoing.referral);
      announce(await env.share(outgoing.files[format], moment.title, text), gameText('game.photo.notice.share_failed'));
    } finally {
      sharing.current = false;
    }
  }, [announce, env, files, format, moment.title, prepareShare]);

  /* L'écriture dans la galerie (la galerie de la coque Android, sinon un fichier, sinon la feuille du
     système) de la version (`frame`, `photoFormat`) ; l'état l'a déjà comptée (optimiste), un échec la rend. */
  const writeGallery = useCallback(
    async (frame: FrameChoice, photoFormat: PhotoFormat) => {
      const outgoing = await outgoingFiles();
      const outcome = outgoing === null ? 'failed' : await env.save(outgoing[photoFormat]);
      if (!alive.current) return;
      if (reachedGallery(outcome)) {
        setNotice({ tone: 'good', text: gameText('game.photo.notice.saved_file'), transient: true });
        return;
      }
      dispatch({ type: 'save-failed', frame, format: photoFormat });
      setNotice(outcome === 'cancelled' || outcome === 'shared' ? null : { tone: 'error', text: gameText('game.photo.notice.save_failed') });
    },
    [env, outgoingFiles],
  );

  const canSave = state.step === 'result' && saveButtonVisible(state.save);
  const currentFrame = state.step === 'result' ? state.save.currentFrame : null;
  const save = useCallback(() => {
    if (!canSave) return;
    dispatch({ type: 'saved' });
    void writeGallery(currentFrame, format);
  }, [canSave, currentFrame, format, writeGallery]);

  /* Changer de format est changer de version : « Enregistrer » revient si celle-ci n'est pas en galerie (#10296). */
  const chooseFormat = useCallback((next: PhotoFormat) => {
    setFormat(next);
    dispatch({ type: 'format', format: next });
  }, []);

  /* Une prise par la case du cadre part dans la galerie dès qu'elle est composée, puis le résultat
     s'affiche sans « Enregistrer » (l'état l'y a déjà rangée avec ce cadre). */
  useEffect(() => {
    if (state.step !== 'result' || files === null || !galleryOnCompose.current) return;
    galleryOnCompose.current = false;
    void writeGallery(state.save.currentFrame, format);
  }, [state, files, format, writeGallery]);

  /* La pastille « Image enregistrée » s'efface seule : elle ne prend jamais le focus. */
  useEffect(() => {
    if (notice?.transient !== true) return;
    const timer = setTimeout(() => setNotice((current) => (current === notice ? null : current)), 2000);
    return () => clearTimeout(timer);
  }, [notice]);

  /* La recette (#10161) : le 9:16 composé (en JPEG, #10238), la photo d'origine réduite (jamais pour une carte seule) et le miroir. */
  const keep = useCallback(async () => {
    if (state.step !== 'result') return;
    const outgoing = await outgoingFiles();
    if (outgoing === null) return;
    const taken = state.mode === 'card' ? null : photo.current;
    const source = taken === null ? null : await (env.developSource?.(taken) ?? Promise.resolve(null)).catch(() => null);
    const story = await (env.keptStory?.(outgoing.story) ?? Promise.resolve(outgoing.story)).catch(() => outgoing.story);
    const outcome = await env.notebook.keep(moment, {
      story,
      mode: state.mode,
      source,
      recipe: { ...(taken === null ? {} : { mirror: taken.mirror }), showLink: composedReferral !== null },
    });
    dispatch({ type: 'kept', ok: outcome === 'kept' });
    setNotice(
      outcome === 'kept'
        ? { tone: 'good', text: gameText('game.photo.notice.kept') }
        : outcome === 'no-space'
          ? { tone: 'error', text: gameText('game.photo.notice.no_space'), action: 'save' }
          : { tone: 'error', text: gameText('game.photo.notice.keep_failed') },
    );
  }, [composedReferral, env, moment, outgoingFiles, state]);

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
  /* Les dessins du cadre affiché, pour que le canvas peigne l'emblème, Mee, Meo et la Signature de l'écran. */
  const wantsKit = showStage && glory !== null && env.gloryKit !== undefined;
  useEffect(() => {
    if (!wantsKit || stage.current === null || env.gloryKit === undefined) return;
    let live = true;
    void env.gloryKit(stage.current).then((kit) => {
      if (live) setGloryKit(kit);
    }).catch(() => undefined);
    return () => {
      live = false;
    };
  }, [wantsKit, env, stage, referral]);
  /* La source de l'aperçu décoré : la vidéo tant qu'elle est vivante, la prise ou la photo importée ensuite, rien pour la carte seule. */
  const liveVideo = cameraLive ? video.current : null;
  const striking = state.step === 'striking';
  const glorySource = useMemo(() => {
    if (stageMode === 'card') return { kind: 'card' } as const;
    if (stageMode === 'gallery' || striking) return { kind: 'photo', photo: photo.current } as const;
    return { kind: 'video', element: liveVideo } as const;
  }, [stageMode, striking, liveVideo]);

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
        className="flex max-h-dvh w-full max-w-md flex-col gap-3 overflow-y-auto overflow-x-clip overscroll-x-none rounded-card px-4 py-4 pt-safe pb-safe"
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
            {plate === null ? null : <GameAuthorCard moment={moment} plate={plate} dateLabel={dateLabel} />}
            <div className="flex items-end gap-2">
              <GameBird bird="meeGuide" size={72} />
              <div className="min-w-0 flex-1 pb-1">
                <p className="text-title font-bold" style={{ color: GAME_INK }}>
                  {gameText('game.photo.offer.title')}
                </p>
                {/* La carte posée dit déjà le moment : le titre ne se répète pas sous elle. */}
                {plate !== null ? null : (
                  <p className="text-body" style={{ color: GAME_INK_2 }}>
                    {moment.title}
                  </p>
                )}
              </div>
              <GameBird bird="meoGuide" size={72} flip />
            </div>
            <p className="text-caption" style={{ color: GAME_INK_2 }}>
              {gameText('game.photo.private')}
            </p>
            {options}
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
            {...(cameraLive ? sceneControls : {})}
            data-photo-stage={stageMode}
            className="relative mx-auto shrink-0 overflow-hidden rounded-card"
            style={{ width: 'min(100%, calc(62dvh * 9 / 16))', aspectRatio: '9 / 16', backgroundColor: 'var(--ios-indigo-950)' }}
          >
            {stageMode === 'selfie' ? (
              <video ref={video} playsInline muted autoPlay className="absolute inset-0 size-full object-cover" style={{ transform: 'scaleX(-1)' }} />
            ) : null}
            {stageMode === 'selfie' && state.step === 'striking' && stillUrl !== null ? (
              <img data-photo-still="" src={stillUrl} alt="" className="absolute inset-0 size-full object-cover" style={{ transform: 'scaleX(-1)' }} />
            ) : null}
            {stageMode === 'gallery' && galleryUrl !== null ? <img src={galleryUrl} alt="" className="absolute inset-0 size-full object-cover" /> : null}
            {glory !== null && gloryKit !== null ? (
              <GamePhotoGloryCanvas scene={glory} kit={gloryKit} source={glorySource} banner={gloryBanner} recipe={gloryRecipe} />
            ) : null}
            <GamePhotoFrame moment={moment} dateLabel={dateLabel} format="story" author={author} referral={referral} glory={gloryKit === null ? null : gloryOverlay} />
          </div>
        ) : null}

        {cameraLive ? (
          <button
            type="button"
            data-photo-take="frame"
            aria-label={gameText('game.photo.take.frame', { title: moment.title })}
            onClick={() => shoot('frame')}
            className="mx-auto flex shrink-0 flex-col items-center gap-1 rounded-tile p-1"
            style={{ minHeight: 44, minWidth: 44 }}
          >
            <span
              aria-hidden="true"
              className="relative block shrink-0 overflow-hidden rounded-tile"
              style={{ width: 72, aspectRatio: '9 / 16', backgroundColor: 'var(--ios-indigo-950)', boxShadow: `0 0 0 3px ${GAME_BRAND}` }}
            >
              <video ref={tileVideo} playsInline muted autoPlay className="absolute inset-0 size-full object-cover" style={{ transform: 'scaleX(-1)' }} />
              <GamePhotoFrame moment={moment} dateLabel={dateLabel} format="story" author={author} referral={null} />
            </span>
            <span data-photo-take-label="" className="text-caption font-semibold" style={{ color: GAME_INK }}>
              {moment.title}
            </span>
          </button>
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
            {state.camera === 'denied' && env.openSettings ? (
              <Button attr={{ 'data-photo-camera-settings': '' }} onClick={env.openSettings}>
                {gameText('game.photo.camera.settings')}
              </Button>
            ) : null}
            {galleryError ? (
              <p role="alert" className="text-caption" style={{ color: GAME_ERROR }}>
                {gameText('game.photo.gallery.unreadable')}
              </p>
            ) : null}
            <p className="text-caption" style={{ color: GAME_INK_2 }} data-photo-image-right="">
              {gameText('game.photo.image_right')}
            </p>
            {options}
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
              <Button attr={{ 'data-photo-format': 'story' }} primary={format === 'story'} onClick={() => chooseFormat('story')}>
                {gameText('game.photo.format.story')}
              </Button>
              <Button attr={{ 'data-photo-format': 'square' }} primary={format === 'square'} onClick={() => chooseFormat('square')}>
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
            {canSave ? (
              <Button attr={{ 'data-photo-save': '' }} onClick={save}>
                {gameText('game.photo.save')}
              </Button>
            ) : null}
            <Button attr={{ 'data-photo-keep': '' }} onClick={() => void keep()} disabled={state.kept === true}>
              {state.kept === true ? gameText('game.photo.kept') : gameText('game.photo.keep')}
            </Button>
            {notice === null ? null : (
              <div role={notice.tone === 'error' ? 'alert' : 'status'} className="flex flex-col gap-2 text-caption" style={{ color: notice.tone === 'error' ? GAME_ERROR : GAME_GOOD }}>
                <p>{notice.text}</p>
                {notice.action === 'save' && canSave ? (
                  <Button attr={{ 'data-photo-no-space-save': '' }} onClick={save}>
                    {gameText('game.photo.notice.no_space_save')}
                  </Button>
                ) : null}
              </div>
            )}
          </div>
        ) : null}

        {state.step === 'result' && composedReferral?.placeholder === true ? (
          <div ref={artFrame} hidden data-photo-art-frame="" className="relative" style={{ aspectRatio: '9 / 16' }}>
            <GamePhotoFrame moment={moment} dateLabel={dateLabel} format="story" author={author} referral={composedReferral} />
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
