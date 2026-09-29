import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from 'zustand';

import type { ConversationsDeps } from '@/lib/api/conversations';
import { apiDeps, postMediaUploadDeps } from '@/lib/api/deps';
import { attachmentSrc } from '@/lib/api/media-url';
import type { PostMediaUploadDeps } from '@/lib/api/post-media-upload';
import { protectedMediaDeps, type ProtectedMediaDeps } from '@/lib/api/protected-media';
import { appQueryClient } from '@/lib/api/query-client';
import { sessionStore } from '@/lib/api/session';
import { STORIES_QUERY_PREFIX } from '@/lib/api/stories';
import { refreshFeedAction } from '@/lib/api/query';
import type { SceneCarrier } from '@/lib/canvas/carrier';
import { parseCanvasDocument } from '@/lib/canvas/document';
import { resolveSceneText } from '@/lib/canvas/text';
import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { useOnline } from '@/lib/net/online';
import { storyReturn } from '@/lib/onboarding/story-return';
import { audienceLabelKey, defaultAudienceOf, seededAudience, type ChoosableAudience } from '@/lib/stories/publication-audience';
import { studioPublishRefusal, type PublicationKind, type StudioOrigin } from '@/lib/stories/publication-kind';
import { layoutIsServed, type PublishChoice } from '@/lib/stories/publication-layout';
import { composeStoryCanvas } from '@/lib/stories/story-document';
import type { StudioDoor, StudioPage } from '@/lib/stories/studio-page';
import type { StudioPageEdit } from '@/lib/stories/studio-page-edit';
import {
  STUDIO_PAGE_MAX,
  canPublishStudioDraft,
  isStudioDraftEmpty,
  currentStudioPage,
  selectedTextLayer,
  studioDraftFromSnapshot,
  studioPublishablePageCount,
  studioSnapshotOf,
  withAddedPage,
  withAddedText,
  withCurrentPage,
  withPage,
  withSelected,
  withSoundPlane,
  withAnimated,
  withStatic,
  withAudience,
  withBackgroundFrame,
  withPlacedWhileAnimated,
  withPostText,
  withText,
  withTextLayer,
  withTrackTiming,
  withVisualCaption,
  withVisualFilter,
  withVisualPose,
  withoutPage,
  withoutPages,
  withoutSound,
  withoutText,
  withoutVisual,
  type StudioDraft,
} from '@/lib/stories/studio';
import { takeStudioSeed } from '@/lib/stories/studio-seed';
import { studioPreviewDocument } from '@/lib/stories/studio-preview';
import { studioDraftStore, type StudioDraftStore } from '@/lib/stories/studio-draft-store';
import { settlePages, studioPublishPlan } from '@/lib/stories/studio-publish';
import { publishStudioPlan } from '@/lib/stories/studio-publish-flow';
import { useStudioReelOffer } from '@/routes/story-compose-reel-offer';
import type { StudioCompositeDeps } from '@/lib/stories/studio-composite-plan';
import { studioFloor } from '@/lib/stories/studio-floor';
import { emptyStudioHistory, rebaseStudioLive, recordStudioStep, redoStudioStep, undoStudioStep } from '@/lib/stories/studio-history';
import { clampPose, type StudioPose } from '@/lib/stories/studio-pose';
import { pageIsAnimated, studioPageDuration, studioTracks, timingEnteringAt, timingExitingAt, type StudioTrack } from '@/lib/stories/studio-timeline';
import type { StudioTiming } from '@/lib/stories/studio-text';
import type { StoryFrame } from '@/lib/stories/story-document';
import type { StudioTextLayer } from '@/lib/stories/studio-text';
import { useComposeLanguage } from '@/lib/view/use-compose-language';
import { useReaderLanguages } from '@/lib/view/use-reader';
import { PublishSplitButton, publishTitleKey } from '@/components/publish-split-button';
import { href, navigate } from '@/routes/route-table';
import { StudioShell } from '@/routes/story-compose-shell';
import { AudienceChip, type AudienceSource } from '@/routes/story-compose-audience';
import { publicationRefusalText, studioAssetsShown, StudioFooterMessage, studioFooterSpeaks, StudioPageAssets, type StudioPlaceRefusalNotice, type StudioPublishFailureNotice } from '@/routes/story-compose-footer';
import { StudioAnimatedToggle, StudioMoreMenu, StudioPostTextButton, type StudioMenuItem } from '@/routes/story-compose-chrome';
import { StudioRefusal } from '@/routes/story-compose-parts';
import { StudioLeadingRail, StudioTrailingRail } from '@/routes/story-compose-rail';
import { StudioScene } from '@/routes/story-compose-scene';
import { studioPlacer } from '@/routes/story-compose-place';
import { useStudioBackgroundSound } from '@/routes/use-studio-background-sound';
import { useStudioCompositeHash } from '@/routes/use-studio-composite-hash';
import { useStudioTextBox } from '@/routes/use-studio-text-box';
import { RETOUCH_DRAFTS, useStudioRetouchFinish, type StudioRetouch } from '@/routes/use-studio-retouch';
import { useStudioObjects } from '@/routes/use-studio-objects';
import { ALL_DOORS, uploadKey, useStudioUploads } from '@/routes/use-studio-uploads';
import { useStudioTimeline } from '@/routes/use-studio-timeline';

/**
 * **CRÉER UNE STORY** (#6900, devenue un PLATEAU par #6943/#6944) — plusieurs
 * objets texte (chacun avec sa pose, sa langue et son style), un fond, un
 * calque d'avant-plan, un son qui se place en fond ou sur la scène, une
 * légende par média, un aperçu par le MOTEUR PARTAGÉ (`ScenePlayer`, D-79),
 * publiée en CanvasV3 comme iOS.
 *
 * **La géographie plein écran** (maquette `docs/product/composer-plein-ecran/`,
 * #8370, #8413) : une COLONNE — la barre haute (✕, scènes, ⋯), la zone de la
 * scène, le socle ; la carte 9:16 se cadre ENTRE eux, sur un sol peint de son
 * thumbhash. Le couloir GAUCHE porte ce qu'on POSE, le rail DROIT les tuiles
 * (scène, objet, Cadre, historique) ; seules les poignées sont SUR la scène.
 *
 * QUATRE lois tenues ici, les trois premières inchangées depuis #6900 :
 *  - **le brouillon est persisté à CHAQUE changement** (par lecteur,
 *    `studio-draft-store.ts`) — un échec, un départ par ✕, un rechargement le
 *    conservent ; seul un succès le purge ;
 *  - **un média PRÊT n'est jamais remonté** : la publication lit son identité
 *    dans le brouillon ; seul un média EN VOL est attendu (§ 1.4) ;
 *  - **hors ligne, l'intention de publier est ARMÉE** et part seule au retour
 *    du réseau — l'écran ne promet que ce qu'il fait ;
 *  - **LE PLAN EST FIGÉ AU PREMIER CLIC SUR PUBLIER** (#7707, revue-correction)
 *    — `studioPublishPlan` lit le brouillon UNE fois, avant la première
 *    requête de la séquence ; tant que `publishing` est vrai, la composition
 *    entière (couloirs, plateau, rail de pages, pied, audience) passe en
 *    LECTURE SEULE, comme iOS ferme le composer à la publication
 *    (`StoryViewModel+Publication.swift:549`). Sans ce verrou, une page
 *    retirée du rail pendant l'envoi partait quand même, une retouche de
 *    texte partait dans son ancienne version puis se perdait, et un
 *    changement d'audience était ignoré en silence (défauts 1 et 2, revue de
 *    #7707). Seuls le ✕ (`StudioShell`) et la capsule Publier restent actifs.
 */

/** LA FEUILLE D'AUDIENCE, CHARGÉE À LA DEMANDE (#7683) — même discipline que
 * `LanguageSheet`/`EffectsSheet` du composeur du fil : elle ne pèse sur le
 * chunk du studio que si l'auteur touche la pastille. */
const StudioObjectEditor = lazy(() => import('@/routes/story-compose-editor').then((m) => ({ default: m.StudioObjectEditor })));
const StudioEditPlaque = lazy(() => import('@/routes/story-compose-editor').then((m) => ({ default: m.StudioEditPlaque })));
const StudioOverlayEditor = lazy(() => import('@/routes/story-compose-editor').then((m) => ({ default: m.StudioOverlayEditor })));
/** Le menu d'un objet (appui long, clic droit), à la demande. */
const StudioObjectMenu = lazy(() => import('@/routes/story-compose-object-menu').then((m) => ({ default: m.StudioObjectMenu })));

const AudienceSheet = lazy(() => import('@/routes/story-compose-audience-sheet').then((m) => ({ default: m.AudienceSheet })));

/** LE RAIL DES PAGES (#7684), CHARGÉ À LA DEMANDE — même discipline que
 * `StudioObjectEditor`/`AudienceSheet` : il ne pèse sur le chunk du studio
 * que si le document porte DEUX pages ou plus (`ComposerTopBar.swift:90-93` :
 * « un rail d'un seul élément ne navigue vers rien », loi 4). Un post d'UNE
 * page ne le télécharge jamais. */
const StudioPageRail = lazy(() => import('@/routes/story-compose-pages').then((m) => ({ default: m.StudioPageRail })));

/** L'APERÇU et le TEXTE DU POST (#8413), CHARGÉS À LA DEMANDE — ils ne pèsent
 * que si l'auteur ouvre ⋯ › Aperçu ou touche le bouton document du socle. */
const StudioPreviewSheet = lazy(() => import('@/routes/story-compose-overlays').then((m) => ({ default: m.StudioPreviewSheet })));
const StudioPostTextFrame = lazy(() => import('@/routes/story-compose-overlays').then((m) => ({ default: m.StudioPostTextFrame })));

/** LA FRISE DU MODE ANIMÉ (#8415), CHARGÉE À LA DEMANDE — elle ne pèse que si
 * l'auteur ouvre Animé. */
const StudioTimelinePanel = lazy(() => import('@/routes/story-compose-timeline').then((m) => ({ default: m.StudioTimelinePanel })));

/** LE PANNEAU CADRE (#8414), CHARGÉ À LA DEMANDE — il ne pèse que si
 * l'auteur touche la tuile Cadre. */
/** LE SOL (#8413), CHARGÉ À LA DEMANDE (#8534) — il n'existe qu'avec un média. */
const StudioFloorLayer = lazy(() => import('@/routes/story-compose-floor').then((m) => ({ default: m.StudioFloorLayer })));

const StudioFramePanel = lazy(() => import('@/routes/story-compose-frame').then((m) => ({ default: m.StudioFramePanel })));

/** Le Cadre d'un fond qu'on n'a pas encore réglé — le contrat (#8414). */
const DEFAULT_FRAME: StoryFrame = { fitMode: 'fit', backdrop: 'blur' };

export type StoryStudioDeps = {
  readonly api: ConversationsDeps;
  readonly upload: PostMediaUploadDeps;
  readonly drafts: StudioDraftStore;
  /** LE TRANSPORT D'UNE PISTE PROTÉGÉE (#7015) — injectable pour les témoins
   * UNIQUEMENT, comme tout le réseau de cet écran. La production prend
   * `protectedMediaDeps`, le site UNIQUE. */
  readonly media?: ProtectedMediaDeps;
  /** LE RENDU RÉDUIT de la scène pour le sol (#8425) — injectable pour les
   * témoins ; la production dessine dans un canvas hors écran. */
  readonly composite?: StudioCompositeDeps;
};

const defaultStoryStudioDeps: StoryStudioDeps = {
  api: apiDeps,
  upload: postMediaUploadDeps,
  drafts: studioDraftStore,
  media: protectedMediaDeps,
};

/** L'aperçu adresse ses médias par `mediaURL` (URL locale) : le porteur est
 * VIDE, et CONSTANT — une nouvelle identité à chaque rendu re-rendrait le
 * moteur à chaque frappe. */
const PREVIEW_CARRIER: SceneCarrier = { postId: 'story-studio-preview', media: [] };

function revokeIfLocal(url: string | undefined): void {
  if (url !== undefined && url.startsWith('blob:')) URL.revokeObjectURL(url);
}

/** Les TROIS aperçus locaux d'UNE page — fond, calque, son — révoqués
 * ensemble : une page qui quitte le brouillon (retrait, publication) ne
 * laisse aucun `blob:` derrière elle. */
function revokePageMedia(page: StudioPage): void {
  revokeIfLocal(page.background?.previewUrl);
  revokeIfLocal(page.overlay?.previewUrl);
  revokeIfLocal(page.sound?.previewUrl);
}

/**
 * LE COMPOSER UNIQUE de la story, du post et du réel (#7497) — `initialKind`
 * est le format du POINT D'ENTRÉE (`/stories/new` ⇒ story, `/posts/new` ⇒
 * post, `?type=` le précise) ; la capsule `[Publier … | ▾]` en choisit un
 * autre au moment de publier.
 */
export default function StoryComposeScreen({
  deps = defaultStoryStudioDeps,
  initialKind = 'STORY',
  requestedAudience = null,
  origin = null,
  retouch,
}: {
  readonly deps?: StoryStudioDeps;
  readonly initialKind?: PublicationKind;
  readonly requestedAudience?: ChoosableAudience | null;
  readonly origin?: StudioOrigin | null;
  /** LA RETOUCHE d'une image du fil (#8416) — voir `StudioRetouch`. */
  readonly retouch?: StudioRetouch;
} = {}) {
  const session = useStore(sessionStore, (s) => s.session);
  // Une retouche ne publie rien et ne touche AUCUN brouillon de story : ni
  // compte exigé, ni lecteur (`viewerId` nul ⇒ rien de persisté ni de mémorisé).
  if (retouch !== undefined) {
    return <StoryStudio deps={{ ...deps, drafts: RETOUCH_DRAFTS }} viewerId={null} initialKind="POST" requestedAudience={null} origin={null} retouch={retouch} />;
  }
  if (session.status === 'guest') {
    return <StudioShell kind={initialKind} origin={origin}>{<StudioRefusal lang={currentInterfaceLanguage()} />}</StudioShell>;
  }
  const viewerId = session.status === 'authenticated' ? session.user.id : null;
  return (
    <StoryStudio
      key={viewerId ?? 'anonymous'}
      deps={deps}
      viewerId={viewerId}
      initialKind={initialKind}
      requestedAudience={requestedAudience}
      origin={origin}
    />
  );
}

function StoryStudio({
  deps,
  viewerId,
  initialKind,
  requestedAudience,
  origin,
  retouch,
}: {
  readonly deps: StoryStudioDeps;
  readonly viewerId: string | null;
  readonly initialKind: PublicationKind;
  readonly requestedAudience: ChoosableAudience | null;
  readonly origin: StudioOrigin | null;
  readonly retouch?: StudioRetouch;
}) {
  const retouching = retouch !== undefined;
  const lang = currentInterfaceLanguage();
  const reader = useReaderLanguages();
  const online = useOnline();

  const [draft, setDraft] = useState<StudioDraft>(() => {
    const snapshot = viewerId === null ? null : deps.drafts.get(viewerId);
    const seeded = studioDraftFromSnapshot(snapshot, attachmentSrc, reader.languages[0] ?? 'fr');
    // **RANG 1 le brouillon, RANG 2 la mémoire du dernier choix** (#7683,
    // `publication-audience.ts` § `seededAudience`) — relue UNE FOIS, à
    // l'ouverture, jamais à une bascule de format (`ComposerMoodSurface.swift:662-703`).
    const memoryVisibility = viewerId === null ? null : deps.drafts.lastAudience(viewerId);
    return { ...seeded, visibility: seededAudience({ draftVisibility: seeded.visibility, requestedVisibility: requestedAudience, memoryVisibility }) };
  });
  /** LA FEUILLE D'AUDIENCE (#7683) — fermée par défaut, comme les
   * contrôleurs de l'outil ouvert (§ « les contrôleurs de l'outil »). */
  const [audienceOpen, setAudienceOpen] = useState(false);
  const openAudience = useCallback(() => setAudienceOpen(true), []);
  const { language, setText: reportComposeText } = useComposeLanguage({
    preferred: reader.languages,
    ...(draft.language !== undefined ? { initialLanguage: draft.language } : {}),
  });
  /** Le GESTE que la partie principale publie — le format de l'entrée, puis
   * le dernier que le chevron a choisi AVEC sa disposition (`PublishChoice`,
   * #7684) : une intention armée hors ligne, ou un échec, repart comme
   * l'auteur l'a DIT. Aucune disposition tant qu'il n'en a choisi aucune.
   * Le chevron CHOISIT, il ne publie jamais : seul Publier envoie
   * (maquette plein écran, porteur 2026-09-27). */
  const [choice, setChoice] = useState<PublishChoice>({ kind: initialKind, layout: null });
  const kind = choice.kind;
  const [publishing, setPublishing] = useState(false);
  const [awaitingNetwork, setAwaitingNetwork] = useState(false);
  const [publishFailure, setPublishFailure] = useState<StudioPublishFailureNotice | null>(null);
  /** Où en est la séquence (#7707) — la capsule dit « Publication k/N… » dès
   * que le plan porte deux publications ou plus. */
  const [publishProgress, setPublishProgress] = useState<{ readonly published: number; readonly total: number } | null>(null);
  const [placeRefusal, setPlaceRefusal] = useState<StudioPlaceRefusalNotice | null>(null);
  /** Les contrôleurs de l'outil ouvert (zone BASSE d'iOS) — FERMÉS par défaut :
   * la scène garde toute sa hauteur tant que l'auteur ne règle rien. */
  /** Le panneau Cadre (#8414), l'aperçu et le texte du post (#8413) — fermés
   * par défaut, comme les contrôleurs. */
  const [frameOpen, setFrameOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [postTextOpen, setPostTextOpen] = useState(false);
  const { finishing, retouchFailed, finishRetouch } = useStudioRetouchFinish(retouch, () => currentStudioPage(latestDraft.current));

  /** La page COURANTE — LE SITE UNIQUE de lecture (#7684) : tout ce qui lisait
   * `draft.texts`/`draft.background`/… lit désormais `page.X`. Son IDENTITÉ ne
   * change que lorsque CETTE page est celle qui vient de muter (`withPage`) —
   * les autres pages restent immobiles (Zero Unnecessary Re-render). */
  const page = currentStudioPage(draft);

  /** L'envoi EN COURS — abandonné au démontage : la séquence s'arrête entre
   * deux requêtes, jamais au milieu d'une (`runStudioPublish`). */
  const sendRef = useRef<AbortController | null>(null);
  /** Vrai dès que la publication a TOUT emporté : le brouillon est purgé, et
   * un rendu tardif (une page retirée en cours de séquence, rendue APRÈS la
   * purge) ne le réécrit plus — sans quoi le brouillon rouvert reposterait la
   * dernière page retirée. */
  const purgedRef = useRef(false);
  const latestDraft = useRef(draft);
  latestDraft.current = draft;
  const { pendingRef, startUpload, forgetUpload, retry } = useStudioUploads({ pages: draft.pages, page, upload: deps.upload, setDraft, paused: retouching });
  /** L'HISTORIQUE (#8413, `studio-history.ts`) — une ref : chaque geste
   * l'écrit dans l'updater qui change le brouillon, et le rendu que ce
   * changement provoque le relit (tuiles Annuler / Rétablir). */
  const historyRef = useRef(emptyStudioHistory);
  /** Chaque aperçu local créé — révoqués au DÉPART du studio seulement : un
   * média retiré peut revenir par Annuler, son `blob:` doit vivre jusque-là. */
  const blobsRef = useRef(new Set<string>());
  /** UN GESTE SUR LA SCÈNE — le site unique qui écrit l'historique. `key`
   * coalise les gestes continus (la frappe dans un même texte) en un pas. */
  const edit = useCallback((change: (current: StudioDraft) => StudioDraft, key: string | null = null) => {
    setDraft((current) => {
      const next = change(current);
      if (next !== current) historyRef.current = recordStudioStep(historyRef.current, current, key);
      return next;
    });
  }, []);
  /** La page COURANTE, écrite par une plaque à la demande (#8518). */
  const editPage = useCallback<StudioPageEdit>((change, key) => edit((current) => withPage(current, current.currentPage, change), key), [edit]);

  useEffect(() => {
    if (viewerId !== null && !purgedRef.current) deps.drafts.set(viewerId, studioSnapshotOf(draft, language));
  }, [draft, language, viewerId, deps.drafts]);

  useEffect(
    () => () => {
      sendRef.current?.abort();
      blobsRef.current.forEach((url) => URL.revokeObjectURL(url));
    },
    [],
  );

  const { place, importMedia } = studioPlacer({
    latest: latestDraft,
    edit,
    setDraft,
    blobs: blobsRef,
    head: () => clock?.now() ?? 0,
    language,
    startUpload,
    retouching,
    refuse: setPlaceRefusal,
  });

  /* « CRÉER AVEC CE MÉDIA » (#6303) — la visionneuse du fil a déposé la pièce
     avant de naviguer : elle devient le FOND de la page courante par la MÊME
     porte qu'un fichier choisi (montée, cadrage, publication ordinaires). */
  useEffect(() => {
    const seed = retouch?.file ?? takeStudioSeed();
    if (seed !== null) place('visual', seed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** RETIRER UNE PAGE (`removeSlide`, #7684) — ses montées en vol sont
   * ABANDONNÉES, comme le retrait d'un média : une page retirée ne coûte plus
   * de bande passante. Ses aperçus locaux, eux, vivent jusqu'au départ du
   * studio : Annuler peut la rendre (#8413), et sa montée reprend alors. */
  const deletePage = useCallback(
    (id: string) => {
      const removed = latestDraft.current.pages.find((p) => p.id === id);
      if (removed === undefined || latestDraft.current.pages.length <= 1) return;
      ALL_DOORS.forEach((door) => forgetUpload(id, door));
      edit((current) => withoutPage(current, id));
    },
    [forgetUpload, edit],
  );
  const selectPage = useCallback((id: string) => setDraft((current) => withCurrentPage(current, id)), []);

  function remove(door: StudioDoor) {
    forgetUpload(page.id, door);
    edit((current) => (door === 'sound' ? withoutSound(current) : withoutVisual(current, door)));
  }

  /** ANNULER / RÉTABLIR (#8413) — le brouillon d'avant, rebasé sur les faits
   * établis depuis (montées, audience, texte du post : `rebaseStudioLive`). */
  const undo = useCallback(() => {
    const step = undoStudioStep(historyRef.current, latestDraft.current);
    if (step === null) return;
    historyRef.current = step.history;
    setDraft((current) => rebaseStudioLive(step.draft, current));
  }, []);
  const redo = useCallback(() => {
    const step = redoStudioStep(historyRef.current, latestDraft.current);
    if (step === null) return;
    historyRef.current = step.history;
    setDraft((current) => rebaseStudioLive(step.draft, current));
  }, []);

  const selectedLayer = selectedTextLayer(draft);
  const selectedId = page.selected;

  /** L'INVITE À ÉCRIRE (#8515) — le texte sélectionné, sinon le premier texte
   * VIDE de la page ; la saisie la cible et le doigt l'ouvre. Sans texte vide
   * ni sélection, elle ne s'affiche que sur une page sans aucun texte écrit :
   * la toucher y pose un texte neuf. */
  // Un MÉDIA sélectionné n'est pas un texte : aucune invite peinte dessus (#8517).
  const mediaSelected = selectedId !== null && selectedLayer === null;
  const inviteLayer = mediaSelected ? null : (selectedLayer ?? page.texts.find((layer) => layer.text.trim() === '') ?? null);
  const inviteShown = !mediaSelected && (inviteLayer !== null || page.texts.every((layer) => layer.text.trim() === ''));

  function onTextChange(value: string) {
    const target = inviteLayer?.id;
    if (target === undefined) return;
    edit((current) => withText(current, target, value), `text:${target}`);
    reportComposeText(value);
  }

  /**
   * **L'AUDIENCE COMMISE** (#7683) — un seul site, comme `chooseAudience`
   * iOS (`MeeshyComposerHost+Socle.swift:270-284`) : choisir écrit le
   * brouillon (persisté par l'effet existant) ET la mémoire, dans le MÊME
   * geste, puis ferme la feuille — choisir applique et ferme (§ 1.6).
   */
  function chooseAudience(visibility: ChoosableAudience) {
    setDraft((current) => withAudience(current, visibility));
    if (viewerId !== null) deps.drafts.rememberAudience(viewerId, visibility);
    setAudienceOpen(false);
  }

  /** LA POSE COMMISE — un seul site : le geste sur la scène, le clavier et les
   * boutons du rail y aboutissent tous, pour que « quel objet, quelles
   * bornes ? » se réponde une fois. */
  const commitPose = useCallback((pose: StudioPose) => {
    edit((current) => {
      const selected = currentStudioPage(current).selected;
      if (selected === 'overlay') return withVisualPose(current, 'overlay', pose);
      if (selected === null) return current;
      return withTextLayer(current, selected, (layer) => ({ ...layer, pose: clampPose(pose) }));
    });
  }, [edit]);

  const changeLayer = useCallback(
    (change: (layer: StudioTextLayer) => StudioTextLayer) => {
      edit((current) => {
        const selected = currentStudioPage(current).selected;
        return selected === null ? current : withTextLayer(current, selected, change);
      });
    },
    [edit],
  );

  /** **UNE PAGE PARTIE NE REPART JAMAIS** (#7707, miroir `publishedPostIds`,
   * `StoryViewModel+Publication.swift:240-245` : « otherwise a partial-failure
   * retry creates duplicate slides ») — retirée du brouillon DÈS que sa story
   * est commise, pas à la fin de la séquence : le rail la perd sous les yeux
   * de l'auteur, et le magasin est écrit ICI, en plus de l'effet de
   * persistance, parce qu'un studio quitté pendant l'envoi ne rend plus rien
   * — sans cette écriture, le brouillon rouvert republierait la page 1. */
  function dropPublishedPages(pageIds: readonly string[]) {
    latestDraft.current.pages.filter((p) => pageIds.includes(p.id)).forEach((p) => {
      ALL_DOORS.forEach((door) => forgetUpload(p.id, door));
      revokePageMedia(p);
    });
    const reduced = withoutPages(latestDraft.current, pageIds);
    latestDraft.current = reduced;
    // Une page PARTIE ne revient jamais par Annuler : elle repartirait.
    historyRef.current = emptyStudioHistory;
    if (viewerId !== null) deps.drafts.set(viewerId, studioSnapshotOf(reduced, language));
    setDraft((c) => withoutPages(c, pageIds));
  }

  /**
   * **PLUSIEURS PAGES, PLUSIEURS PUBLICATIONS** (#7684, canal `.scene` #7707)
   * — `settlePages` règle les montées, `studioPublishPlan` décide du NOMBRE
   * de publications (une par page pour une story, une pour tout le reste),
   * `publishStudioPlan` les envoie en séquence. `chosen` porte le GESTE
   * entier (format et disposition) : un échec ou une intention armée hors
   * ligne repart avec les deux.
   */
  async function publish(chosen: PublishChoice = choice, promoted: boolean = reelOffer.promoted) {
    if (!canPublishStudioDraft(draft) || publishing) return;
    if (studioPublishRefusal(draft, chosen.kind) !== null) return;
    setChoice(chosen);
    if (!online) {
      setAwaitingNetwork(true);
      return;
    }
    setAwaitingNetwork(false);
    setPublishing(true);
    setPublishFailure(null);

    const settledByPage = await settlePages(draft.pages, (pageId, door) => pendingRef.current[uploadKey(pageId, door)] ?? null);
    const current = latestDraft.current;
    const plan = studioPublishPlan({ pages: current.pages, settled: settledByPage, choice: chosen });
    if (plan.kind !== 'ready') {
      setPublishing(false);
      return;
    }

    const send = new AbortController();
    sendRef.current = send;
    setPublishProgress({ published: 0, total: plan.publications.length });
    const outcome = await publishStudioPlan({
      plan,
      api: deps.api,
      kind: chosen.kind,
      visibility: current.visibility,
      language,
      postText: current.postText,
      promotedFromPost: promoted,
      signal: send.signal,
      onPublished: ({ pageIds, published, total }) => {
        dropPublishedPages(pageIds);
        setPublishProgress({ published, total });
      },
    });

    if (outcome.kind !== 'published') {
      setPublishProgress(null);
      setPublishing(false);
      if (outcome.kind === 'failed') setPublishFailure({ failure: outcome.failure, published: outcome.published, total: outcome.total });
      return;
    }

    // `publishing` RESTE vrai jusqu'à la navigation : la relâcher ici rouvrait
    // Publier le temps de l'invalidation, et un second geste publiait la même
    // story deux fois.

    purgedRef.current = true;
    if (viewerId !== null) deps.drafts.clear(viewerId);
    current.pages.forEach(revokePageMedia);
    if (chosen.kind === 'STORY') {
      await appQueryClient.invalidateQueries({ queryKey: STORIES_QUERY_PREFIX });
      // La PREMIÈRE story de la séquence — celle par laquelle le lecteur
      // commence — porte le retour de l'accueil post-inscription.
      const firstPostId = outcome.postIds[0];
      // L'auteur a QUITTÉ le studio pendant la dernière requête : la story est
      // partie et le brouillon purgé, mais l'écran ne le ramène pas de force.
      if (send.signal.aborted) return;
      if (origin === 'onboarding' && firstPostId !== undefined) {
        storyReturn.note(firstPostId);
        navigate(href('onboarding', undefined, { story: firstPostId }), true);
        return;
      }
      navigate(href('stories'), false);
      return;
    }
    // Le rafraîchissement du fil ne retient pas la navigation, et son
    // annulation (le cache vidé en route) n'est pas un échec de publication.
    void refreshFeedAction().catch(() => undefined);
    if (!send.signal.aborted) navigate(href('feed'), true);
  }

  const reelOffer = useStudioReelOffer({ lang, draft, choice, setChoice, publish: (chosen, promoted) => void publish(chosen, promoted) });
  const publishRef = useRef(publish);
  publishRef.current = publish;
  useEffect(() => {
    if (!online || !awaitingNetwork) return;
    setAwaitingNetwork(false);
    void publishRef.current();
  }, [online, awaitingNetwork]);

  /** LE DOCUMENT D'APERÇU (`studio-preview.ts`) — ce qui partira, adressé en local. */
  const previewDocument = useMemo(() => studioPreviewDocument(page), [page.texts, page.background, page.overlay, page.sound, page.duration]); // eslint-disable-line react-hooks/exhaustive-deps

  /** La saisie se DESSINE par le résolveur du player (`resolveSceneText`) :
   * même couleur, même taille relative à la largeur de la carte (`cqw`) que
   * le texte publié — jamais une taille de champ de formulaire. Elle suit le
   * style de l'objet SÉLECTIONNÉ, comme le texte qu'elle recouvre. */
  const textAppearance = useMemo(() => {
    if (selectedLayer === null) return null;
    const probe = parseCanvasDocument(composeStoryCanvas({ texts: [{ ...selectedLayer, text: '·' }] }))?.scenes[0]?.objects.find(
      (o) => o.kind === 'text',
    );
    return probe === undefined ? null : resolveSceneText({ object: probe, preferredLanguages: [selectedLayer.language] });
  }, [selectedLayer]);

  const { soundSrc, soundMuted, setSoundMuted, soundAudioRef } = useStudioBackgroundSound(previewDocument, deps.media ?? protectedMediaDeps);

  const stageRef = useRef<HTMLDivElement | null>(null);
  const { textBox, remeasureText } = useStudioTextBox({ stageRef, selectedId, texts: page.texts, textAppearance });

  const canPublish = canPublishStudioDraft(draft);
  const kindRefusal = studioPublishRefusal(draft, kind);
  const publishablePageCount = studioPublishablePageCount(draft);
  /** **CE QUI PARTIRA** (#7683) — l'audience CHOISIE, sinon le défaut de la
   * passerelle pour le format en cours (`defaultAudienceOf`) : la pastille
   * dit toujours ce qui part, même quand rien n'a été choisi. */
  const audienceValue = draft.visibility ?? defaultAudienceOf(kind);
  const audienceSource: AudienceSource = draft.visibility === null ? 'default' : 'chosen';
  /** Ce que CHAQUE format du menu partirait (§ 1.6) — un choix explicite
   * s'applique aux trois formats identiquement ; sans choix, chacun a son
   * propre défaut serveur. */
  const audienceOf = (candidate: PublicationKind) => draft.visibility ?? defaultAudienceOf(candidate);
  const publishLabel = publishing
    ? publishProgress !== null && publishProgress.total > 1
      ? translate(lang, 'story.studio.publishing.progress', {
          current: String(Math.min(publishProgress.published + 1, publishProgress.total)),
          total: String(publishProgress.total),
        })
      : translate(lang, 'story.studio.publishing')
    : awaitingNetwork
      ? translate(lang, 'story.studio.publish.waiting')
      : translate(lang, publishTitleKey(kind));

  const objectName = (id: string): string =>
    id === 'overlay'
      ? translate(lang, 'story.studio.object.overlay')
      : translate(lang, 'story.studio.object.text', { index: String(page.texts.findIndex((layer) => layer.id === id) + 1) });

  const { stageObjects, editing, setEditingId, objectMenu, setObjectMenu, startEditing, commitPoseOf, objectActions } = useStudioObjects({
    page,
    lang,
    edit,
    select: (id) => setDraft((current) => withSelected(current, id)),
    removeOverlay: () => remove('overlay'),
    closeFrame: () => setFrameOpen(false),
  });

  /** LE SOL (#8413) — le hash du COMPOSITE (#8425), sinon celui du fond ;
   * recalculé quand la MATIÈRE change, jamais à la frappe. */
  const sceneHash = useStudioCompositeHash(page, deps.composite ?? null);
  const floor = useMemo(
    () => studioFloor({ page, ...(sceneHash !== undefined ? { sceneHash } : {}) }),
    [page.background, page.overlay, sceneHash], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const frame = page.background?.frame ?? DEFAULT_FRAME;
  const animated = pageIsAnimated(page);
  const { timelineOpen, timelinePlaying, clock, setClock, toggleAnimated, toggleTime, playPause } = useStudioTimeline({
    animated,
    duration: studioPageDuration(page),
    animate: () => edit(withAnimated),
    makeStatic: () => edit(withStatic),
    closePanels: () => {
      setFrameOpen(false);
      setEditingId(null);
    },
  });
  /** « T+ » et l'invite sans texte (#8515) — pose un texte (entré à la tête
   * sur une scène animée) ET ouvre sa saisie : on tape aussitôt. */
  const addTextAndWrite = () => {
    const id = currentStudioPage(withAddedText(latestDraft.current, language)).selected;
    edit((current) => {
      const added = withAddedText(current, language);
      const placed = currentStudioPage(added).selected;
      return placed === null ? added : withPlacedWhileAnimated(added, placed, clock?.now() ?? 0);
    });
    if (id !== null) startEditing(id);
  };
  /** La carte du socle — hors retouche, un média en montée ou en échec, le
   * son, et le message du pied ; plus rien de ce qu'on touche (lot 6). */
  const showsSocleCard = !retouching && (studioAssetsShown(page) || studioFooterSpeaks({ kind, placeRefusal, kindRefusal, publishFailure }));
  /** UN PANNEAU OUVERT EN BAS (Cadre, édition) — sur mobile, le socle se
   * retire le temps du panneau (lot 6). */
  const panelOpen = (frameOpen && page.background !== null) || editing !== null;
  /** « Entre ici » / « Sort ici » — la fenêtre de l'objet SÉLECTIONNÉ, à la tête. */
  const moveSelectedEdge = (head: number, law: (timing: StudioTiming, head: number, duration: number) => StudioTiming) => {
    const track = studioTracks(page).find((candidate) => candidate.id === selectedId);
    if (track !== undefined) edit((current) => withTrackTiming(current, track.id, law(track.timing, head, studioPageDuration(page))));
  };
  const trackLabel = (track: StudioTrack): string =>
    track.kind === 'overlay' ? translate(lang, 'story.studio.timeline.overlay') : (page.texts.find((layer) => layer.id === track.id)?.text.trim() ?? '');
  const history = historyRef.current;
  const menuItems: readonly StudioMenuItem[] = [
    ...(previewDocument !== null ? [{ id: 'preview', label: translate(lang, 'story.studio.preview'), onSelect: () => setPreviewOpen(true) }] : []),
    ...(draft.pages.length > 1
      ? [{ id: 'remove-page', label: translate(lang, 'story.studio.page.remove.current'), onSelect: () => deletePage(page.id) }]
      : []),
  ];

  return (
    <StudioShell
      kind={kind}
      origin={origin}
      floor={
        floor === null ? undefined : (
          <Suspense fallback={null}>
            <StudioFloorLayer floor={floor} />
          </Suspense>
        )
      }
      {...(retouch !== undefined ? { onCancel: retouch.onCancel } : {})}
      menu={
        retouching ? undefined : (
          <>
            <StudioAnimatedToggle lang={lang} active={animated} onToggle={toggleAnimated} disabled={publishing} />
            <StudioMoreMenu lang={lang} items={menuItems} disabled={publishing} />
          </>
        )
      }
      rail={
        draft.pages.length > 1 && !retouching ? (
          <Suspense fallback={<span className="min-w-0 flex-1" />}>
            <StudioPageRail
              lang={lang}
              pages={draft.pages}
              currentPageId={draft.currentPage}
              onSelect={selectPage}
              onDelete={deletePage}
              locked={publishing}
            />
          </Suspense>
        ) : undefined
      }
    >
      {/* LA ZONE DE LA SCÈNE (#8413) — ENTRE la barre haute et le socle : ni ✕
          ni ⋯ ni Publier ne se posent sur le dessin. La carte reste 9:16 et se
          centre dans ce qui reste ; les deux rails flottent sur ses bords. */}
      <div data-story-studio-plateau className="relative z-10 min-h-0 flex-1">
        {!online ? (
          <p role="status" className="glass absolute inset-x-0 top-0 z-20 px-4 py-1 text-caption" style={{ color: 'var(--color-ios-ink)' }}>
            {translate(lang, 'story.studio.offline')}
          </p>
        ) : null}

        {timelineOpen ? null : (
          <StudioLeadingRail lang={lang} locked={publishing} onPlace={place} onAddText={addTextAndWrite} sound={!retouching} {...(retouching ? {} : { onImport: importMedia })} />
        )}

        {/* 10 px de RESPIRATION de chaque côté (lot 7, la marge des rails d'iOS) :
            la carte ne colle jamais au bord de l'écran. */}
        <StudioScene
          lang={lang}
          stageRef={stageRef}
          pageId={page.id}
          locked={publishing}
          preview={{ document: previewDocument, carrier: PREVIEW_CARRIER, preferredLanguages: reader.languages, onContentReady: remeasureText, onClock: setClock }}
          sound={{ src: soundSrc, muted: soundMuted, audioRef: soundAudioRef, onToggle: () => setSoundMuted((current) => !current) }}
          timeline={{ open: timelineOpen, playing: timelinePlaying, onEnded: () => clock?.seek(0) }}
          writing={
            inviteShown
              ? {
                  lang,
                  targetId: inviteLayer?.id ?? null,
                  layer: inviteLayer,
                  fallbackLanguage: language,
                  textBox,
                  fontSize: textAppearance !== null ? `${textAppearance.widthFraction * 100}cqw` : null,
                  onText: onTextChange,
                  onPublish: reelOffer.requestPublish,
                  locked: publishing,
                  editing: editing !== null && editing === inviteLayer?.id,
                }
              : null
          }
          objects={{
            items: stageObjects,
            nameOf: objectName,
            onSelect: (id) => {
              if (id !== editing) setEditingId(null);
              setDraft((current) => withSelected(current, id));
            },
            onEdit: startEditing,
            onCommit: commitPoseOf,
            onMenu: (id, point) => setObjectMenu({ id, point }),
            onWrite: (id) => (id === null ? addTextAndWrite() : startEditing(id)),
            editing,
          }}
        />

        {/* LE RAIL DROIT (#8516, `ComposerTrailingRail.tiles`) : annuler,
            rétablir, Temps, Cadre, nouvelle scène. Frise ouverte, seul Temps
            reste — le geste qui la RANGE demeure là où il l'a ouverte. */}
        <StudioTrailingRail
          lang={lang}
          locked={publishing}
          onUndo={!timelineOpen && history.past.length > 0 ? undo : null}
          onRedo={!timelineOpen && history.future.length > 0 ? redo : null}
          timeOpen={timelineOpen}
          onToggleTime={animated ? toggleTime : null}
          frameOpen={frameOpen}
          onToggleFrame={
            !timelineOpen && page.background !== null
              ? () => {
                  setEditingId(null);
                  setFrameOpen((open) => !open);
                }
              : null
          }
          onAddPage={!timelineOpen && draft.pages.length < STUDIO_PAGE_MAX && !retouching ? () => edit((current) => withAddedPage(current, language)) : null}
        />
      </div>

      {/* LE SOCLE — sous la scène, jamais sur elle. Les contrôleurs de l'outil
          ouvert et les médias de la page vivent dans sa carte de verre ; la
          rangée iOS (`MeeshyComposerHost+Socle.swift:43-51`) dessous :
          l'audience, un espace, le texte du post (un POST seulement), la
          capsule Publier. VERROUILLÉ pendant l'envoi (#7707). */}
      <footer data-story-studio-bottom className="relative z-20 flex shrink-0 flex-col gap-2 px-2 pt-1 pb-safe">
        {timelineOpen ? (
          <Suspense fallback={null}>
            <StudioTimelinePanel
              lang={lang}
              tracks={studioTracks(page)}
              labelOf={trackLabel}
              selectedId={selectedId}
              duration={studioPageDuration(page)}
              clock={clock}
              playing={timelinePlaying}
              onPlayPause={playPause}
              onSelect={(id) => setDraft((current) => withSelected(current, id))}
              onEnter={(head) => moveSelectedEdge(head, timingEnteringAt)}
              onExit={(head) => moveSelectedEdge(head, timingExitingAt)}
              onTiming={(id, timing) => edit((current) => withTrackTiming(current, id, timing))}
              onClose={toggleAnimated}
            />
          </Suspense>
        ) : null}
        {editing !== null ? (
          <Suspense fallback={null}>
            <StudioEditPlaque lang={lang} title={objectName(editing)} onDone={() => setEditingId(null)}>
              <div inert={publishing}>
                <Suspense fallback={null}>
                  {editing === 'overlay' && page.overlay !== null ? (
                    <StudioOverlayEditor
                      lang={lang}
                      pose={page.overlay.pose}
                      caption={page.overlay.caption}
                      {...(retouching ? {} : { alt: { value: page.overlay.alt ?? '', onPage: editPage } })}
                      filter={page.overlay.filter ?? null}
                      onFilter={(filter) => edit((current) => withVisualFilter(current, 'overlay', filter))}
                      onPose={(pose) => commitPoseOf('overlay', pose)}
                      onCaption={(value) => edit((current) => withVisualCaption(current, 'overlay', value), 'caption:overlay')}
                    />
                  ) : (
                    <StudioObjectEditor
                      lang={lang}
                      layer={selectedLayer}
                      onChange={changeLayer}
                      onPose={commitPose}
                      onRemove={() => {
                        setEditingId(null);
                        edit((current) => {
                          const selected = currentStudioPage(current).selected;
                          return selected === null ? current : withoutText(current, selected);
                        });
                      }}
                    />
                  )}
                </Suspense>
              </div>
            </StudioEditPlaque>
          </Suspense>
        ) : null}
        {frameOpen && page.background !== null && editing === null && !timelineOpen ? (
          <div inert={publishing}>
            <Suspense fallback={null}>
              <StudioFramePanel
                lang={lang}
                frame={frame}
                onChange={(next) => edit((current) => withBackgroundFrame(current, next))}
                onClose={() => setFrameOpen(false)}
                {...(retouching
                  ? {}
                  : {
                      caption: { value: page.background.caption, onChange: (value: string) => edit((current) => withVisualCaption(current, 'visual', value), 'caption:visual') },
                      media: { alt: page.background.alt ?? '', filter: page.background.filter ?? null, onPage: editPage },
                    })}
                onRemove={() => {
                  setFrameOpen(false);
                  remove('visual');
                }}
              />
            </Suspense>
          </div>
        ) : null}
        {/* La carte se MONTRE quand elle a une ligne visible ; sinon elle reste
            pour le lecteur d'écran et le clavier (l'état « Prêt », « Retirer »). */}
        {!retouching ? (
          <div
            {...(showsSocleCard && !timelineOpen && !panelOpen ? { 'data-story-studio-socle-card': '' } : {})}
            className={showsSocleCard && !timelineOpen && !panelOpen ? 'glass flex flex-col gap-1 rounded-2xl px-2.5 py-2' : 'sr-only'}
          >
            <StudioPageAssets
              lang={lang}
              page={page}
              onRetry={retry}
              onRemove={remove}
              onSoundPlane={(plane) => edit((current) => withSoundPlane(current, plane))}
              locked={publishing}
            />
            <StudioFooterMessage lang={lang} kind={kind} placeRefusal={placeRefusal} kindRefusal={kindRefusal} publishFailure={publishFailure} />
          </div>
        ) : null}
        {retouching ? (
          <div data-story-socle-row className={`flex items-center justify-end gap-2.5 pb-3 ${panelOpen ? 'max-md:hidden' : ''}`}>
            {retouchFailed ? (
              <p role="alert" className="flex-1 text-caption" style={{ color: 'var(--color-error)' }}>
                {translate(lang, 'story.studio.retouch.failed')}
              </p>
            ) : null}
            <button
              type="button"
              data-story-retouch-done
              disabled={finishing}
              onClick={() => void finishRetouch()}
              className="h-12 rounded-full px-6 text-body font-bold focus-visible:outline-2 focus-visible:outline-offset-2"
              style={{ backgroundColor: 'var(--color-ios-brand)', color: '#fff', outlineColor: 'var(--color-ios-brand)', opacity: finishing ? 0.6 : 1 }}
            >
              {translate(lang, 'story.studio.retouch.done')}
            </button>
          </div>
        ) : postTextOpen && kind === 'POST' ? (
          <div className="pb-3">
            <Suspense fallback={null}>
              <StudioPostTextFrame lang={lang} value={draft.postText} onChange={(value) => setDraft((current) => withPostText(current, value))} onClose={() => setPostTextOpen(false)} />
            </Suspense>
          </div>
        ) : (
          <div data-story-socle-row className={`flex items-center gap-2.5 pb-3 ${panelOpen ? 'max-md:hidden' : ''}`}>
            <AudienceChip lang={lang} value={audienceValue} source={audienceSource} open={audienceOpen} onOpen={openAudience} disabled={publishing} />
            <span aria-hidden="true" className="flex-1" />
            {kind === 'POST' ? (
              <StudioPostTextButton lang={lang} written={draft.postText.trim() !== ''} onOpen={() => setPostTextOpen(true)} disabled={publishing} />
            ) : null}
            {/* PAS de capsule tant qu'il n'y a rien à publier (lot 6) : ni
                bouton grisé, ni phrase ; elle paraît dès le premier objet. */}
            {!isStudioDraftEmpty(draft) || publishing ? (
            <PublishSplitButton
              language={lang}
              kind={kind}
              label={publishLabel}
              disabled={!canPublish || publishing || kindRefusal !== null}
              menuDisabled={!canPublish || publishing}
              busy={publishing || awaitingNetwork}
              refusalOf={(candidate) => {
                const refusal = studioPublishRefusal(draft, candidate);
                return refusal === null ? null : publicationRefusalText(lang, refusal);
              }}
              audienceLabelOf={(candidate) => translate(lang, audienceLabelKey(audienceOf(candidate)))}
              layoutsServedFor={(candidate) => layoutIsServed({ publishablePageCount, kind: candidate })}
              onPrimary={reelOffer.requestPublish}
              onChoose={reelOffer.choose}
            />
            ) : null}
          </div>
        )}
      </footer>

      {reelOffer.dialog}
      {audienceOpen ? (
        <Suspense fallback={null}>
          <AudienceSheet
            lang={lang}
            repostOfId={null}
            value={audienceValue}
            source={audienceSource}
            onChoose={chooseAudience}
            onClose={() => setAudienceOpen(false)}
          />
        </Suspense>
      ) : null}
      {objectMenu !== null ? (
        <Suspense fallback={null}>
          <StudioObjectMenu
            label={translate(lang, 'story.studio.object.menu', { name: objectName(objectMenu.id) })}
            point={objectMenu.point}
            actions={objectActions(objectMenu.id)}
            onClose={() => setObjectMenu(null)}
          />
        </Suspense>
      ) : null}
      {previewOpen && previewDocument !== null ? (
        <Suspense fallback={null}>
          <StudioPreviewSheet
            lang={lang}
            document={previewDocument}
            carrier={PREVIEW_CARRIER}
            preferredLanguages={reader.languages}
            muted={soundMuted}
            onClose={() => setPreviewOpen(false)}
          />
        </Suspense>
      ) : null}
    </StudioShell>
  );
}
