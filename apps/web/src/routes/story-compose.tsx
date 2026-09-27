import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useStore } from 'zustand';

import type { ConversationsDeps } from '@/lib/api/conversations';
import { apiDeps, postMediaUploadDeps } from '@/lib/api/deps';
import type { ApiFailure } from '@/lib/api/http';
import { attachmentSrc } from '@/lib/api/media-url';
import type { PostMediaUploadDeps } from '@/lib/api/post-media-upload';
import { protectedMediaDeps, type ProtectedMediaDeps } from '@/lib/api/protected-media';
import { appQueryClient } from '@/lib/api/query-client';
import { sessionStore } from '@/lib/api/session';
import { STORIES_QUERY_PREFIX } from '@/lib/api/stories';
import { refreshFeedAction } from '@/lib/api/query';
import { useProtectedMediaSrc } from '@/lib/api/use-protected-media';
import { backgroundCss } from '@/lib/canvas/background';
import { electBackgroundTrack } from '@/lib/canvas/background-sound';
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
import {
  buildPreviewCanvasDocument,
  composeStoryCanvas,
  STORY_PLAIN_BACKGROUND,
  studioMediaKindOf,
} from '@/lib/stories/story-document';
import {
  pageWithMediaDuration,
  pageWithSound,
  pageWithSoundUpload,
  pageWithVisual,
  pageWithVisualAspectRatio,
  pageWithVisualUpload,
  type StudioDoor,
  type StudioPage,
  type StudioUploadState,
} from '@/lib/stories/studio-page';
import {
  STUDIO_PAGE_MAX,
  canPublishStudioDraft,
  currentStudioPage,
  selectedTextLayer,
  studioDraftFromSnapshot,
  studioPlaceRefusal,
  studioPublishablePageCount,
  studioSnapshotOf,
  withAddedPage,
  withAddedText,
  withCurrentPage,
  withPage,
  withSelected,
  withSoundPlane,
  withAudience,
  withBackgroundFrame,
  withPostText,
  withText,
  withTextLayer,
  withVisualCaption,
  withVisualPose,
  withoutPage,
  withoutPages,
  withoutSound,
  withoutText,
  withoutVisual,
  type StudioDraft,
} from '@/lib/stories/studio';
import { takeStudioSeed } from '@/lib/stories/studio-seed';
import { studioDraftStore, type StudioDraftStore } from '@/lib/stories/studio-draft-store';
import { settlePages, studioPublishPlan, uploadStateOf, type PendingUpload } from '@/lib/stories/studio-publish';
import { publishStudioPlan } from '@/lib/stories/studio-publish-flow';
import { studioFloor } from '@/lib/stories/studio-floor';
import { emptyStudioHistory, rebaseStudioLive, recordStudioStep, redoStudioStep, undoStudioStep } from '@/lib/stories/studio-history';
import { clampPose, type StudioPose } from '@/lib/stories/studio-pose';
import type { StoryFrame } from '@/lib/stories/story-document';
import type { StudioTextLayer } from '@/lib/stories/studio-text';
import { useComposeLanguage } from '@/lib/view/use-compose-language';
import { useReaderLanguages } from '@/lib/view/use-reader';
import { GlyphSvg } from '@/components/glyph';
import { MEDIA_TRANSPORT_GLYPHS } from '@/components/glyphs-media-transport';
import { PublishSplitButton, publishTitleKey } from '@/components/publish-split-button';
import { href, navigate } from '@/routes/route-table';
import { StudioShell } from '@/routes/story-compose-shell';
import { AudienceChip, type AudienceSource } from '@/routes/story-compose-audience';
import { publicationRefusalText, StudioFooterMessage, StudioPageAssets, type StudioPlaceRefusalNotice, type StudioPublishFailureNotice } from '@/routes/story-compose-footer';
import { measureAspectRatio, measureDurationMs } from '@/routes/story-compose-measure';
import { StudioFloorLayer, StudioMoreMenu, StudioPostTextButton, type StudioMenuItem } from '@/routes/story-compose-chrome';
import { StudioFramePanel } from '@/routes/story-compose-frame';
import { StudioRefusal } from '@/routes/story-compose-parts';
import { StudioLeadingRail, StudioTrailingRail } from '@/routes/story-compose-rail';
import { StudioObjectHandles } from '@/routes/story-compose-stage';
import { measureSceneText, sameSceneTextBox, type SceneTextBox } from '@/routes/story-compose-text-box';
import { StudioTextInput } from '@/routes/story-compose-text-input';

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

const ScenePlayer = lazy(() => import('@/components/scene-player'));

/** LA FEUILLE D'AUDIENCE, CHARGÉE À LA DEMANDE (#7683) — même discipline que
 * `LanguageSheet`/`EffectsSheet` du composeur du fil : elle ne pèse sur le
 * chunk du studio que si l'auteur touche la pastille. */
const StudioObjectEditor = lazy(() => import('@/routes/story-compose-editor').then((m) => ({ default: m.StudioObjectEditor })));

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
const StudioPostTextSheet = lazy(() => import('@/routes/story-compose-overlays').then((m) => ({ default: m.StudioPostTextSheet })));

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

/** Les montées EN VOL sont adressées par PAGE — un fichier posé sur la page 2
 * ne se confond pas avec celui de la page 1 quand l'auteur bascule pendant le
 * transport (#7684). */
const uploadKey = (pageId: string, door: StudioDoor): string => `${pageId}:${door}`;

const ALL_DOORS: readonly StudioDoor[] = ['visual', 'overlay', 'sound'];

/** Ce qu'UNE porte occupe sur une page — le fond, le calque ou le son. */
const slotOf = (page: StudioPage, door: StudioDoor) => (door === 'sound' ? page.sound : door === 'visual' ? page.background : page.overlay);

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
}: {
  readonly deps?: StoryStudioDeps;
  readonly initialKind?: PublicationKind;
  readonly requestedAudience?: ChoosableAudience | null;
  readonly origin?: StudioOrigin | null;
} = {}) {
  const session = useStore(sessionStore, (s) => s.session);
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
}: {
  readonly deps: StoryStudioDeps;
  readonly viewerId: string | null;
  readonly initialKind: PublicationKind;
  readonly requestedAudience: ChoosableAudience | null;
  readonly origin: StudioOrigin | null;
}) {
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
  const [editorOpen, setEditorOpen] = useState(false);
  /** Le panneau Cadre (#8414), l'aperçu et le texte du post (#8413) — fermés
   * par défaut, comme les contrôleurs. */
  const [frameOpen, setFrameOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [postTextOpen, setPostTextOpen] = useState(false);

  /** La page COURANTE — LE SITE UNIQUE de lecture (#7684) : tout ce qui lisait
   * `draft.texts`/`draft.background`/… lit désormais `page.X`. Son IDENTITÉ ne
   * change que lorsque CETTE page est celle qui vient de muter (`withPage`) —
   * les autres pages restent immobiles (Zero Unnecessary Re-render). */
  const page = currentStudioPage(draft);

  const pendingRef = useRef<Record<string, PendingUpload | null>>({});
  const abortRef = useRef<Record<string, AbortController | null>>({});
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
  /** L'HISTORIQUE (#8413, `studio-history.ts`) — une ref : chaque geste
   * l'écrit dans l'updater qui change le brouillon, et le rendu que ce
   * changement provoque le relit (tuiles Annuler / Rétablir). */
  const historyRef = useRef(emptyStudioHistory);
  /** Chaque aperçu local créé — révoqués au DÉPART du studio seulement : un
   * média retiré peut revenir par Annuler, son `blob:` doit vivre jusque-là. */
  const blobsRef = useRef(new Set<string>());
  /** Le fichier dont la montée est EN COURS, par emplacement — la reprise
   * après Annuler / Rétablir ne relance que ce qui ne monte plus. */
  const uploadingRef = useRef<Record<string, string | null>>({});

  /** UN GESTE SUR LA SCÈNE — le site unique qui écrit l'historique. `key`
   * coalise les gestes continus (la frappe dans un même texte) en un pas. */
  const edit = useCallback((change: (current: StudioDraft) => StudioDraft, key: string | null = null) => {
    setDraft((current) => {
      const next = change(current);
      if (next !== current) historyRef.current = recordStudioStep(historyRef.current, current, key);
      return next;
    });
  }, []);

  useEffect(() => {
    if (viewerId !== null && !purgedRef.current) deps.drafts.set(viewerId, studioSnapshotOf(draft, language));
  }, [draft, language, viewerId, deps.drafts]);

  useEffect(
    () => () => {
      Object.values(abortRef.current).forEach((controller) => controller?.abort());
      sendRef.current?.abort();
      blobsRef.current.forEach((url) => URL.revokeObjectURL(url));
    },
    [],
  );

  /** Un accusé de montée ne s'applique qu'au fichier qu'il concerne : après
   * Annuler, l'emplacement peut porter un AUTRE fichier que celui en vol. */
  function applyUpload(pageId: string, door: StudioDoor, previewUrl: string, upload: StudioUploadState) {
    setDraft((current) =>
      withPage(current, pageId, (p) => {
        if (slotOf(p, door)?.previewUrl !== previewUrl) return p;
        return door === 'sound' ? pageWithSoundUpload(p, upload) : pageWithVisualUpload(p, door, upload);
      }),
    );
  }

  function startUpload(pageId: string, door: StudioDoor, file: File, previewUrl: string) {
    const key = uploadKey(pageId, door);
    uploadingRef.current[key] = previewUrl;
    abortRef.current[key]?.abort();
    const controller = new AbortController();
    abortRef.current[key] = controller;
    const pending: PendingUpload = import('@/lib/api/post-media-upload')
      .then(({ uploadPostMedia }) =>
        uploadPostMedia({
          ...deps.upload,
          file,
          uploadContext: 'story',
          signal: controller.signal,
          onProgress: (progress) => {
            if (!controller.signal.aborted) applyUpload(pageId, door, previewUrl, { phase: 'uploading', progress });
          },
        }),
      )
      .catch((): ApiFailure => ({ ok: false, status: 0, error: 'Module de téléversement indisponible', code: 'NETWORK' }));
    pendingRef.current[key] = pending;
    void pending.then((result) => {
      if (pendingRef.current[key] !== pending) return;
      const upload = uploadStateOf(result);
      if (upload !== null) applyUpload(pageId, door, previewUrl, upload);
    });
  }

  function place(door: StudioDoor, file: File) {
    const refusal = studioPlaceRefusal(draft, door, file.type);
    if (refusal !== null) {
      setPlaceRefusal({ door, reason: refusal });
      return;
    }
    setPlaceRefusal(null);
    const pageId = page.id;
    const previewUrl = URL.createObjectURL(file);
    blobsRef.current.add(previewUrl);
    const uploading: StudioUploadState = { phase: 'uploading', progress: 0 };
    if (door === 'sound') {
      edit((current) => withPage(current, pageId, (p) => pageWithSound(p, { file, previewUrl, upload: uploading, plane: p.sound?.plane ?? 'background' })));
      void measureDurationMs(previewUrl, 'audio').then((durationMs) => {
        if (durationMs !== null) setDraft((current) => withPage(current, pageId, (p) => pageWithMediaDuration(p, 'sound', previewUrl, durationMs)));
      });
    } else {
      const mediaType = studioMediaKindOf(file.type);
      edit((current) =>
        withPage(current, pageId, (p) =>
          pageWithVisual(p, door, { file, previewUrl, mediaType, upload: uploading, caption: '', pose: p.overlay?.pose ?? clampPose({ x: 0.5, y: 0.5, scale: 1, rotation: 0 }) }),
        ),
      );
      // La mesure décode le fichier LOCAL, hors du chemin de montée — un
      // format que ce navigateur ne sait pas décoder (§ 0, défaut 7) ne
      // bloque ni l'aperçu ni la publication, il en prive seulement le cadrage.
      void measureAspectRatio(previewUrl, mediaType).then((aspectRatio) => {
        if (aspectRatio !== null) setDraft((current) => withPage(current, pageId, (p) => pageWithVisualAspectRatio(p, door, previewUrl, aspectRatio)));
      });
      if (mediaType === 'video') {
        void measureDurationMs(previewUrl, 'video').then((durationMs) => {
          if (durationMs !== null) setDraft((current) => withPage(current, pageId, (p) => pageWithMediaDuration(p, door, previewUrl, durationMs)));
        });
      }
    }
    startUpload(pageId, door, file, previewUrl);
  }

  /* « CRÉER AVEC CE MÉDIA » (#6303) — la visionneuse du fil a déposé la pièce
     avant de naviguer : elle devient le FOND de la page courante par la MÊME
     porte qu'un fichier choisi (montée, cadrage, publication ordinaires). */
  useEffect(() => {
    const seed = takeStudioSeed();
    if (seed !== null) place('visual', seed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Une montée qu'on ABANDONNE — la page ou le média qu'elle servait est
   * retiré : elle ne coûte plus de bande passante, et son accusé ne revient
   * sur rien. */
  const forgetUpload = useCallback((pageId: string, door: StudioDoor) => {
    const key = uploadKey(pageId, door);
    abortRef.current[key]?.abort();
    abortRef.current[key] = null;
    pendingRef.current[key] = null;
    uploadingRef.current[key] = null;
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

  function retry(door: StudioDoor) {
    const asset = slotOf(page, door);
    if (asset === null || asset.file === undefined) return;
    applyUpload(page.id, door, asset.previewUrl, { phase: 'uploading', progress: 0 });
    startUpload(page.id, door, asset.file, asset.previewUrl);
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

  /** LA REPRISE DES MONTÉES — un média rendu par Annuler (une page ou un fond
   * retirés, dont la montée avait été abandonnée) remonte seul : sans cela,
   * Publier attendrait un transfert qui ne reviendra jamais. */
  useEffect(() => {
    draft.pages.forEach((p) =>
      ALL_DOORS.forEach((door) => {
        const asset = slotOf(p, door);
        if (asset === null || asset.upload.phase !== 'uploading' || asset.file === undefined) return;
        if (uploadingRef.current[uploadKey(p.id, door)] === asset.previewUrl) return;
        startUpload(p.id, door, asset.file, asset.previewUrl);
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.pages]);

  const selectedLayer = selectedTextLayer(draft);
  const selectedId = page.selected;

  function onTextChange(value: string) {
    if (selectedId === null) return;
    edit((current) => withText(current, selectedId, value), `text:${selectedId}`);
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
  async function publish(chosen: PublishChoice = choice) {
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

  const publishRef = useRef(publish);
  publishRef.current = publish;
  useEffect(() => {
    if (!online || !awaitingNetwork) return;
    setAwaitingNetwork(false);
    void publishRef.current();
  }, [online, awaitingNetwork]);

  /** LE DOCUMENT D'APERÇU — le moteur partagé (`ScenePlayer`) dessine ce que
   * l'auteur publiera, au pixel près (mêmes styles, même largeur `cqw`) ;
   * l'éditeur posé par-dessus n'est qu'une SAISIE transparente, jamais une
   * SECONDE peinture qui pouvait couper ses lignes autrement. */
  const previewDocument = useMemo(
    () =>
      buildPreviewCanvasDocument({
        texts: page.texts,
        ...(page.background !== null
          ? {
              background: {
                source: page.background.previewUrl,
                mediaType: page.background.mediaType,
                ...(page.background.aspectRatio !== undefined ? { aspectRatio: page.background.aspectRatio } : {}),
                ...(page.background.frame !== undefined ? { frame: page.background.frame } : {}),
              },
            }
          : {}),
        ...(page.overlay !== null
          ? {
              overlay: {
                source: page.overlay.previewUrl,
                mediaType: page.overlay.mediaType,
                ...(page.overlay.aspectRatio !== undefined ? { aspectRatio: page.overlay.aspectRatio } : {}),
                pose: page.overlay.pose,
              },
            }
          : {}),
        ...(page.sound !== null ? { sound: { source: page.sound.previewUrl, plane: page.sound.plane } } : {}),
      }),
    [page.texts, page.background, page.overlay, page.sound],
  );

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

  /** LE SON DE FOND S'ÉCOUTE (défaut 6, revue-correction #6900) — la MÊME
   * élection que le lecteur (`electBackgroundTrack`), sur l'URL locale :
   * `ScenePlayer` ne joue AUCUN objet `audio` — c'est aux HÔTES de jouer le
   * son, comme `StorySceneLayer` le fait déjà pour la lecture. Un son POSÉ
   * n'est pas élu : il ne s'écoute pas ici, et c'est cohérent avec ce que le
   * lecteur en fera. */
  const backgroundTrack = useMemo(
    () => (previewDocument === null ? null : electBackgroundTrack({ document: previewDocument, sceneIndex: 0, carrier: PREVIEW_CARRIER })),
    [previewDocument],
  );
  /**
   * #7015, revue-correction — **LE TROISIÈME `<audio>` DE LA MÊME SOURCE.**
   *
   * L'aperçu élit sa piste avec `electBackgroundTrack`, exactement comme le
   * lecteur de story et celui des Réels, et posait sa `src` TELLE QUELLE. Une
   * piste EMPRUNTÉE est servie par `GET static.byFilename`, une route
   * AUTHENTIFIÉE : la balise part sans en-tête et rend `401`. La
   * bibliothèque n'est pas encore branchée à cet écran (`background-sound.ts`
   * : « `library` reste HORS PÉRIMÈTRE »), donc rien ne l'atteint AUJOURD'HUI
   * — c'est précisément pourquoi le site unique se branche maintenant, avant
   * qu'un emprunt ne rouvre le défaut. Sur un `blob:` ou une pièce jointe
   * ordinaire, le hook rend la source INCHANGÉE et SYNCHRONEMENT : rien ne
   * change pour le chemin nominal.
   */
  const { src: soundSrc } = useProtectedMediaSrc(backgroundTrack?.src ?? '', deps.media ?? protectedMediaDeps);
  const [soundMuted, setSoundMuted] = useState(true);
  const soundAudioRef = useRef<HTMLAudioElement | null>(null);
  // La dépendance est la source RÉSOLUE, jamais celle qu'on a demandée : une
  // piste protégée n'est montée qu'APRÈS sa résolution, et un effet calé sur
  // `track.src` ne se rejouerait pas — il aurait tourné une fois, sur un `ref`
  // nul, et la piste ne démarrerait jamais.
  useEffect(() => {
    const el = soundAudioRef.current;
    if (el === null || backgroundTrack === null) return;
    el.volume = backgroundTrack.volume;
    void el.play().catch(() => {
      // La politique de lecture automatique refuse le son NON coupé : le
      // bouton — un vrai geste utilisateur — reste la seule voie, jamais un
      // second essai silencieux qui masquerait le refus.
    });
  }, [soundSrc]);

  /** LA SAISIE ADOPTE LA BOÎTE DU TEXTE SÉLECTIONNÉ, jamais une formule
   * recopiée (défaut 1, revue-correction #6900) — `stageRef` porte l'ancêtre
   * positionné commun aux deux. */
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [textBox, setTextBox] = useState<SceneTextBox | null>(null);

  const remeasureText = useCallback(() => {
    const stage = stageRef.current;
    if (stage === null) return;
    const next = measureSceneText(stage, selectedId);
    setTextBox((current) => (sameSceneTextBox(current, next) ? current : next));
  }, [selectedId]);

  // Chemin RAPIDE, synchrone AVANT peinture : le texte, la sélection ou le
  // style changent toujours par un état React — `useLayoutEffect` remesure
  // dans le MÊME commit, jamais un instant de curseur désaligné.
  useLayoutEffect(() => {
    remeasureText();
  }, [page.texts, selectedId, textAppearance, remeasureText]);

  // Chemin de SECOURS : le redimensionnement de la CARTE (rotation, fenêtre)
  // change la police en `cqw` sans toucher l'état — le seul cas que le chemin
  // rapide ne voit pas venir. La résolution ASYNCHRONE du chunk `ScenePlayer`
  // est couverte par `onContentReady`, le contrat déjà posé par le moteur.
  useEffect(() => {
    const stage = stageRef.current;
    if (stage === null) return;
    const resizeObserver = new ResizeObserver(remeasureText);
    resizeObserver.observe(stage);
    return () => resizeObserver.disconnect();
  }, [remeasureText]);

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

  const selectedPose: StudioPose | null =
    selectedId === 'overlay' ? (page.overlay?.pose ?? null) : (selectedLayer?.pose ?? null);

  /** LE SOL (#8413) — recalculé quand la MATIÈRE change, jamais à la frappe. */
  const floor = useMemo(() => studioFloor({ page }), [page.background, page.overlay]); // eslint-disable-line react-hooks/exhaustive-deps
  const frame = page.background?.frame ?? DEFAULT_FRAME;
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
      floor={<StudioFloorLayer floor={floor} />}
      menu={<StudioMoreMenu lang={lang} items={menuItems} disabled={publishing} />}
      rail={
        draft.pages.length > 1 ? (
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

        <StudioLeadingRail
          lang={lang}
          page={page}
          locked={publishing}
          onPlace={place}
          onSelect={(id) => setDraft((current) => withSelected(current, id))}
        />

        <div className="absolute inset-0 grid place-items-center py-1" style={{ containerType: 'size' }}>
          {/* LE PLATEAU EN LECTURE SEULE PENDANT L'ENVOI (#7707) — le plan
              publié lit le brouillon tel qu'il était au premier clic sur
              Publier : un geste après coup ne changerait plus rien à ce qui
              part (`StoryViewModel+Publication.swift:549`). */}
          <div
            data-scene-stage
            data-story-studio-current-page={page.id}
            ref={stageRef}
            role="group"
            aria-label={translate(lang, 'story.studio.stage')}
            className="relative overflow-hidden"
            style={{
              width: 'min(100cqw, 100cqh * 9 / 16)',
              height: 'min(100cqh, 100cqw * 16 / 9)',
              containerType: 'inline-size',
              borderRadius: 22,
              backgroundColor: backgroundCss(STORY_PLAIN_BACKGROUND, 'var(--color-ios-card)'),
            }}
            inert={publishing}
          >
            {previewDocument !== null ? (
              <Suspense fallback={null}>
                <ScenePlayer
                  document={previewDocument}
                  sceneIndex={0}
                  mode="preview"
                  playing
                  carrier={PREVIEW_CARRIER}
                  preferredLanguages={reader.languages}
                  muted={soundMuted}
                  onContentReady={remeasureText}
                />
              </Suspense>
            ) : null}
            {soundSrc !== null && soundSrc !== '' ? (
              <>
                {/* eslint-disable-next-line jsx-a11y/media-has-caption -- son de fond décoratif, aucun sous-titre à porter ici (P1) */}
                <audio ref={soundAudioRef} data-story-studio-sound src={soundSrc} loop muted={soundMuted} />
                <button
                  type="button"
                  data-story-studio-sound-toggle
                  aria-label={translate(lang, soundMuted ? 'story.studio.sound.unmute' : 'story.studio.sound.mute')}
                  aria-pressed={!soundMuted}
                  onClick={() => setSoundMuted((current) => !current)}
                  className="absolute start-2 bottom-2 grid place-items-center rounded-full"
                  style={{ width: 44, height: 44, backgroundColor: 'rgba(0,0,0,0.45)', color: 'white', zIndex: 3 }}
                >
                  <GlyphSvg glyph={soundMuted ? MEDIA_TRANSPORT_GLYPHS.speakerSlash : MEDIA_TRANSPORT_GLYPHS.speakerHigh} size={20} />
                </button>
              </>
            ) : null}
            <StudioTextInput
              lang={lang}
              targetId={selectedId}
              layer={selectedLayer}
              fallbackLanguage={language}
              textBox={textBox}
              fontSize={textAppearance !== null ? `${textAppearance.widthFraction * 100}cqw` : null}
              onText={onTextChange}
              onPublish={() => void publish()}
              locked={publishing}
            />
            {/* LES POIGNÉES — elles ne règlent rien : elles SONT l'objet qu'on
                saisit ; pendant le geste, le contour et les aimants. */}
            {selectedId !== null && selectedPose !== null ? (
              <StudioObjectHandles
                key={`${page.id}:${selectedId}`}
                lang={lang}
                name={objectName(selectedId)}
                pose={selectedPose}
                stageRef={stageRef}
                objectId={selectedId}
                onCommit={commitPose}
              />
            ) : null}
          </div>
        </div>

        {page.background !== null && frameOpen ? (
          <div className="absolute bottom-2 z-20" style={{ insetInlineEnd: 76 }} inert={publishing}>
            <StudioFramePanel lang={lang} frame={frame} onChange={(next) => edit((current) => withBackgroundFrame(current, next))} onClose={() => setFrameOpen(false)} />
          </div>
        ) : null}
        <StudioTrailingRail
          lang={lang}
          locked={publishing}
          onAddPage={draft.pages.length < STUDIO_PAGE_MAX ? () => edit((current) => withAddedPage(current, language)) : null}
          onAddText={() => edit((current) => withAddedText(current, language))}
          editorOpen={editorOpen}
          onToggleEditor={() => setEditorOpen((open) => !open)}
          frameOpen={frameOpen}
          onToggleFrame={page.background !== null ? () => setFrameOpen((open) => !open) : null}
          onUndo={history.past.length > 0 ? undo : null}
          onRedo={history.future.length > 0 ? redo : null}
        />
      </div>

      {/* LE SOCLE — sous la scène, jamais sur elle. Les contrôleurs de l'outil
          ouvert et les médias de la page vivent dans sa carte de verre ; la
          rangée iOS (`MeeshyComposerHost+Socle.swift:43-51`) dessous :
          l'audience, un espace, le texte du post (un POST seulement), la
          capsule Publier. VERROUILLÉ pendant l'envoi (#7707). */}
      <div data-story-studio-bottom className="relative z-20 flex shrink-0 flex-col gap-2 px-3 pt-1 pb-safe">
        <div className="glass flex flex-col gap-1 rounded-2xl px-3 py-2">
          {editorOpen ? (
            <div data-story-editor-panel className="overflow-y-auto" style={{ maxHeight: 200 }} inert={publishing}>
              <Suspense fallback={null}>
                <StudioObjectEditor
                  lang={lang}
                  layer={selectedLayer}
                  onChange={changeLayer}
                  onPose={commitPose}
                  onRemove={() =>
                    edit((current) => {
                      const selected = currentStudioPage(current).selected;
                      return selected === null ? current : withoutText(current, selected);
                    })
                  }
                />
              </Suspense>
            </div>
          ) : null}
          <StudioPageAssets
            lang={lang}
            page={page}
            onRetry={retry}
            onRemove={remove}
            onCaption={(door, value) => edit((current) => withVisualCaption(current, door, value), `caption:${door}`)}
            onSoundPlane={(plane) => edit((current) => withSoundPlane(current, plane))}
            locked={publishing}
          />
          <StudioFooterMessage lang={lang} placeRefusal={placeRefusal} kindRefusal={kindRefusal} publishFailure={publishFailure} />
        </div>
        <div className="flex items-center gap-2.5 pb-3">
          <AudienceChip lang={lang} value={audienceValue} source={audienceSource} open={audienceOpen} onOpen={openAudience} disabled={publishing} />
          <span aria-hidden="true" className="flex-1" />
          {kind === 'POST' ? (
            <StudioPostTextButton lang={lang} written={draft.postText.trim() !== ''} onOpen={() => setPostTextOpen(true)} disabled={publishing} />
          ) : null}
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
            onPrimary={() => void publish()}
            onChoose={setChoice}
          />
        </div>
      </div>

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
      {postTextOpen && kind === 'POST' ? (
        <Suspense fallback={null}>
          <StudioPostTextSheet
            lang={lang}
            value={draft.postText}
            onChange={(value) => setDraft((current) => withPostText(current, value))}
            onClose={() => setPostTextOpen(false)}
          />
        </Suspense>
      ) : null}
    </StudioShell>
  );
}
