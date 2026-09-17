import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useStore } from 'zustand';

import type { ConversationsDeps } from '@/lib/api/conversations';
import { apiDeps, postMediaUploadDeps } from '@/lib/api/deps';
import type { ApiFailure, ApiResult } from '@/lib/api/http';
import { attachmentSrc } from '@/lib/api/media-url';
import type { PostMediaUploadDeps, PostMediaUploadResult } from '@/lib/api/post-media-upload';
import { appQueryClient } from '@/lib/api/query-client';
import { sessionStore } from '@/lib/api/session';
import { STORIES_QUERY_PREFIX } from '@/lib/api/stories';
import { publishStory } from '@/lib/api/stories-publish';
import { backgroundCss } from '@/lib/canvas/background';
import { electBackgroundTrack } from '@/lib/canvas/background-sound';
import type { SceneCarrier } from '@/lib/canvas/carrier';
import { parseCanvasDocument } from '@/lib/canvas/document';
import { resolveSceneText } from '@/lib/canvas/text';
import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { useOnline } from '@/lib/net/online';
import { storyMediaCaptionPayload } from '@/lib/stories/media-caption';
import {
  buildPreviewCanvasDocument,
  buildStoryCanvasEffects,
  composeStoryCanvas,
  STORY_PLAIN_BACKGROUND,
  studioMediaIds,
  studioMediaKindOf,
  type StudioMediaKind,
  type StudioPlane,
  type StudioReadyAsset,
} from '@/lib/stories/story-document';
import {
  canPublishStudioDraft,
  emptyStudioDraft,
  selectedTextLayer,
  studioDoorAccepts,
  studioDraftFromSnapshot,
  studioFailureKey,
  studioSnapshotOf,
  withAddedText,
  withSelected,
  withSound,
  withSoundPlane,
  withSoundUpload,
  withText,
  withTextLayer,
  withVisual,
  withVisualAspectRatio,
  withVisualCaption,
  withVisualPose,
  withVisualUpload,
  withoutSound,
  withoutText,
  withoutVisual,
  type StudioDoor,
  type StudioDraft,
  type StudioFailureKey,
  type StudioUploadState,
} from '@/lib/stories/studio';
import { studioDraftStore, type StudioDraftStore } from '@/lib/stories/studio-draft-store';
import { clampPose, type StudioPose } from '@/lib/stories/studio-pose';
import type { StudioTextLayer } from '@/lib/stories/studio-text';
import { useComposeLanguage } from '@/lib/view/use-compose-language';
import { useReaderLanguages } from '@/lib/view/use-reader';
import { Glyph, GlyphSvg } from '@/components/glyph';
import { MEDIA_TRANSPORT_GLYPHS } from '@/components/glyphs-media-transport';
import { Link, href, navigate } from '@/routes/route-table';
import { StudioObjectEditor } from '@/routes/story-compose-editor';
import { LayerMark, SlidersMark, StudioAssetRow, StudioChip, StudioDoorButton, StudioRefusal, StudioSoundPlaneToggle } from '@/routes/story-compose-parts';
import { StudioObjectHandles } from '@/routes/story-compose-stage';

/**
 * **CRÉER UNE STORY** (#6900, devenue un PLATEAU par #6943/#6944) — plusieurs
 * objets texte (chacun avec sa pose, sa langue et son style), un fond, un
 * calque d'avant-plan, un son qui se place en fond ou sur la scène, une
 * légende par média, un aperçu par le MOTEUR PARTAGÉ (`ScenePlayer`, D-79),
 * publiée en CanvasV3 comme iOS.
 *
 * **La géographie du dépôt** (`apps/ios/CLAUDE.md` § 1, #4561/#4633) : aucun
 * RÉGLAGE ne se pose sur le canvas. Le couloir GAUCHE porte ce qu'on POSE
 * (les trois portes) et les objets déjà posés ; le couloir DROIT porte les
 * dimensions d'un objet ; les contrôleurs de l'outil ouvert s'ouvrent au BAS.
 * Les seules choses SUR la scène sont les poignées de manipulation directe —
 * elles ne règlent rien, elles SONT l'objet qu'on saisit
 * (`story-compose-stage.tsx`).
 *
 * TROIS lois tenues ici, inchangées depuis #6900 :
 *  - **le brouillon est persisté à CHAQUE changement** (par lecteur,
 *    `studio-draft-store.ts`) — un échec, un départ par ✕, un rechargement le
 *    conservent ; seul un succès le purge ;
 *  - **un média PRÊT n'est jamais remonté** : la publication lit son identité
 *    dans le brouillon ; seul un média EN VOL est attendu (§ 1.4) ;
 *  - **hors ligne, l'intention de publier est ARMÉE** et part seule au retour
 *    du réseau — l'écran ne promet que ce qu'il fait.
 */

const ScenePlayer = lazy(() => import('@/components/scene-player'));

export type StoryStudioDeps = {
  readonly api: ConversationsDeps;
  readonly upload: PostMediaUploadDeps;
  readonly drafts: StudioDraftStore;
};

const defaultStoryStudioDeps: StoryStudioDeps = { api: apiDeps, upload: postMediaUploadDeps, drafts: studioDraftStore };

/** L'aperçu adresse ses médias par `mediaURL` (URL locale) : le porteur est
 * VIDE, et CONSTANT — une nouvelle identité à chaque rendu re-rendrait le
 * moteur à chaque frappe. */
const PREVIEW_CARRIER: SceneCarrier = { postId: 'story-studio-preview', media: [] };

type PendingUpload = Promise<ApiResult<PostMediaUploadResult>>;

type SettledAsset = { readonly kind: 'none' } | { readonly kind: 'ready'; readonly ready: StudioReadyAsset } | { readonly kind: 'failed' };

const VISUAL_DOORS = ['visual', 'overlay'] as const;

function revokeIfLocal(url: string | undefined): void {
  if (url !== undefined && url.startsWith('blob:')) URL.revokeObjectURL(url);
}

/** La boîte RÉELLEMENT peinte par le texte SÉLECTIONNÉ, relative à la carte —
 * ni recopiée ni recalculée : la saisie l'ADOPTE telle quelle (défaut 1,
 * revue-correction #6900), quel que soit le retour à la ligne ou la largeur
 * que le moteur a effectivement rendus. `null` tant qu'aucun texte n'est
 * peint (objet vide, ou chunk `ScenePlayer` pas encore résolu) — la saisie
 * retombe alors sur sa position par défaut. */
type SceneTextBox = { readonly top: number; readonly left: number; readonly width: number; readonly height: number };

/** L'élément que le moteur a peint POUR CET OBJET — `[data-scene-object-id]`,
 * posé par `SceneObjectFrame` (#6943). Avec un seul texte, un
 * `querySelector('[data-scene-text]')` suffisait ; avec plusieurs, il désigne
 * le premier venu. */
function paintedObject(stage: HTMLElement | null, id: string | null): HTMLElement | null {
  if (stage === null || id === null) return null;
  return stage.querySelector<HTMLElement>(`[data-scene-object-id="${CSS.escape(id)}"]`);
}

function measureSceneText(stage: HTMLElement, id: string | null): SceneTextBox | null {
  const painted = paintedObject(stage, id);
  const textEl = painted?.querySelector<HTMLElement>('[data-scene-text]') ?? stage.querySelector<HTMLElement>('[data-scene-text]');
  if (textEl === null || textEl === undefined) return null;
  const stageRect = stage.getBoundingClientRect();
  const textRect = textEl.getBoundingClientRect();
  return { top: textRect.top - stageRect.top, left: textRect.left - stageRect.left, width: textRect.width, height: textRect.height };
}

function sameSceneTextBox(a: SceneTextBox | null, b: SceneTextBox | null): boolean {
  if (a === null || b === null) return a === b;
  return Math.abs(a.top - b.top) < 0.05 && Math.abs(a.left - b.left) < 0.05 && Math.abs(a.width - b.width) < 0.05 && Math.abs(a.height - b.height) < 0.05;
}

function uploadStateOf(result: ApiResult<PostMediaUploadResult>): StudioUploadState | null {
  if (result.ok) {
    return {
      phase: 'ready',
      postMediaId: result.data.postMediaId,
      fileUrl: result.data.fileUrl,
      ...(result.data.thumbHash !== undefined ? { thumbHash: result.data.thumbHash } : {}),
    };
  }
  const reasonKey = studioFailureKey(result, 'upload');
  return reasonKey === null ? null : { phase: 'failed', reasonKey };
}

function readyAssetFromUpload(upload: Extract<StudioUploadState, { phase: 'ready' }>): StudioReadyAsset {
  return { postMediaId: upload.postMediaId, fileUrl: upload.fileUrl, ...(upload.thumbHash !== undefined ? { thumbHash: upload.thumbHash } : {}) };
}

function readyAssetFromResult(data: PostMediaUploadResult): StudioReadyAsset {
  return { postMediaId: data.postMediaId, fileUrl: data.fileUrl, ...(data.thumbHash !== undefined ? { thumbHash: data.thumbHash } : {}) };
}

/** Un média tel que la publication le LIT : prêt dans le brouillon, sinon
 * l'accusé de SA montée en vol — jamais un second envoi. */
async function settle(upload: StudioUploadState | undefined, pending: PendingUpload | null): Promise<SettledAsset> {
  if (upload === undefined) return { kind: 'none' };
  if (upload.phase === 'ready') return { kind: 'ready', ready: readyAssetFromUpload(upload) };
  if (upload.phase === 'failed' || pending === null) return { kind: 'failed' };
  const result = await pending;
  return result.ok ? { kind: 'ready', ready: readyAssetFromResult(result.data) } : { kind: 'failed' };
}

/**
 * LE RAPPORT DU FICHIER LOCAL (§ 0, défaut 7) — connu SANS réseau, dès la
 * sélection : c'est lui, jamais une mesure serveur, que le document (aperçu
 * ET publication) porte dans `payload.aspectRatio`. `null` sur tout échec de
 * décodage (fichier corrompu, format non supporté par ce navigateur) — le
 * document part alors SANS le champ, jamais avec une valeur inventée.
 */
function measureAspectRatio(previewUrl: string, mediaType: StudioMediaKind): Promise<number | null> {
  return new Promise((resolve) => {
    if (mediaType === 'video') {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.onloadedmetadata = () => {
        resolve(video.videoWidth > 0 && video.videoHeight > 0 ? video.videoWidth / video.videoHeight : null);
      };
      video.onerror = () => resolve(null);
      video.src = previewUrl;
      return;
    }
    const image = new Image();
    image.onload = () => resolve(image.naturalWidth > 0 && image.naturalHeight > 0 ? image.naturalWidth / image.naturalHeight : null);
    image.onerror = () => resolve(null);
    image.src = previewUrl;
  });
}

export default function StoryComposeScreen({ deps = defaultStoryStudioDeps }: { readonly deps?: StoryStudioDeps } = {}) {
  const session = useStore(sessionStore, (s) => s.session);
  if (session.status === 'guest') {
    return <StudioShell>{<StudioRefusal lang={currentInterfaceLanguage()} />}</StudioShell>;
  }
  const viewerId = session.status === 'authenticated' ? session.user.id : null;
  return <StoryStudio key={viewerId ?? 'anonymous'} deps={deps} viewerId={viewerId} />;
}

function StudioShell({ children }: { readonly children: ReactNode }) {
  const lang = currentInterfaceLanguage();
  return (
    <main data-story-studio className="flex h-dvh flex-col overflow-hidden pt-safe" style={{ backgroundColor: 'var(--color-ios-surface)' }}>
      <header className="flex shrink-0 items-center gap-3 px-4 pt-3 pb-2">
        <Link
          to="list"
          aria-label={translate(lang, 'story.studio.cancel')}
          className="grid size-11 shrink-0 place-items-center rounded-chip focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{ outlineColor: 'var(--color-ios-brand)', color: 'var(--color-ios-ink)' }}
        >
          <Glyph name="x" size={18} />
        </Link>
        <h1 className="flex-1 text-body font-semibold" style={{ color: 'var(--color-ios-ink)' }}>
          {translate(lang, 'story.studio.title')}
        </h1>
      </header>
      {children}
    </main>
  );
}

function StoryStudio({ deps, viewerId }: { readonly deps: StoryStudioDeps; readonly viewerId: string | null }) {
  const lang = currentInterfaceLanguage();
  const reader = useReaderLanguages();
  const online = useOnline();

  const [draft, setDraft] = useState<StudioDraft>(() => {
    const snapshot = viewerId === null ? null : deps.drafts.get(viewerId);
    return studioDraftFromSnapshot(snapshot, attachmentSrc, reader.languages[0] ?? 'fr');
  });
  const { language, setText: reportComposeText } = useComposeLanguage({
    preferred: reader.languages,
    ...(draft.language !== undefined ? { initialLanguage: draft.language } : {}),
  });
  const [publishing, setPublishing] = useState(false);
  const [awaitingNetwork, setAwaitingNetwork] = useState(false);
  const [publishFailure, setPublishFailure] = useState<StudioFailureKey | null>(null);
  const [doorRefusal, setDoorRefusal] = useState<StudioDoor | null>(null);
  /** Les contrôleurs de l'outil ouvert (zone BASSE d'iOS) — FERMÉS par défaut :
   * la scène garde toute sa hauteur tant que l'auteur ne règle rien. */
  const [editorOpen, setEditorOpen] = useState(false);

  const pendingRef = useRef<Record<StudioDoor, PendingUpload | null>>({ visual: null, overlay: null, sound: null });
  const abortRef = useRef<Record<StudioDoor, AbortController | null>>({ visual: null, overlay: null, sound: null });
  const latestDraft = useRef(draft);
  latestDraft.current = draft;

  useEffect(() => {
    if (viewerId !== null) deps.drafts.set(viewerId, studioSnapshotOf(draft, language));
  }, [draft, language, viewerId, deps.drafts]);

  useEffect(
    () => () => {
      abortRef.current.visual?.abort();
      abortRef.current.overlay?.abort();
      abortRef.current.sound?.abort();
      revokeIfLocal(latestDraft.current.background?.previewUrl);
      revokeIfLocal(latestDraft.current.overlay?.previewUrl);
      revokeIfLocal(latestDraft.current.sound?.previewUrl);
    },
    [],
  );

  function applyUpload(door: StudioDoor, upload: StudioUploadState) {
    setDraft((current) => (door === 'sound' ? withSoundUpload(current, upload) : withVisualUpload(current, door, upload)));
  }

  function startUpload(door: StudioDoor, file: File) {
    abortRef.current[door]?.abort();
    const controller = new AbortController();
    abortRef.current[door] = controller;
    const pending: PendingUpload = import('@/lib/api/post-media-upload')
      .then(({ uploadPostMedia }) =>
        uploadPostMedia({
          ...deps.upload,
          file,
          uploadContext: 'story',
          signal: controller.signal,
          onProgress: (progress) => {
            if (!controller.signal.aborted) applyUpload(door, { phase: 'uploading', progress });
          },
        }),
      )
      .catch((): ApiFailure => ({ ok: false, status: 0, error: 'Module de téléversement indisponible', code: 'NETWORK' }));
    pendingRef.current[door] = pending;
    void pending.then((result) => {
      if (pendingRef.current[door] !== pending) return;
      const upload = uploadStateOf(result);
      if (upload !== null) applyUpload(door, upload);
    });
  }

  function place(door: StudioDoor, file: File) {
    if (!studioDoorAccepts(door, file.type)) {
      setDoorRefusal(door);
      return;
    }
    setDoorRefusal(null);
    const previewUrl = URL.createObjectURL(file);
    const uploading: StudioUploadState = { phase: 'uploading', progress: 0 };
    if (door === 'sound') {
      revokeIfLocal(draft.sound?.previewUrl);
      setDraft((current) => withSound(current, { file, previewUrl, upload: uploading, plane: current.sound?.plane ?? 'background' }));
    } else {
      revokeIfLocal((door === 'visual' ? draft.background : draft.overlay)?.previewUrl);
      const mediaType = studioMediaKindOf(file.type);
      setDraft((current) =>
        withVisual(current, door, { file, previewUrl, mediaType, upload: uploading, caption: '', pose: current.overlay?.pose ?? clampPose({ x: 0.5, y: 0.5, scale: 1, rotation: 0 }) }),
      );
      // La mesure décode le fichier LOCAL, hors du chemin de montée — un
      // format que ce navigateur ne sait pas décoder (§ 0, défaut 7) ne
      // bloque ni l'aperçu ni la publication, il en prive seulement le cadrage.
      void measureAspectRatio(previewUrl, mediaType).then((aspectRatio) => {
        if (aspectRatio !== null) setDraft((current) => withVisualAspectRatio(current, door, previewUrl, aspectRatio));
      });
    }
    startUpload(door, file);
  }

  function remove(door: StudioDoor) {
    abortRef.current[door]?.abort();
    pendingRef.current[door] = null;
    if (door === 'sound') {
      revokeIfLocal(draft.sound?.previewUrl);
      setDraft(withoutSound);
    } else {
      revokeIfLocal((door === 'visual' ? draft.background : draft.overlay)?.previewUrl);
      setDraft((current) => withoutVisual(current, door));
    }
  }

  function retry(door: StudioDoor) {
    const file = door === 'sound' ? draft.sound?.file : (door === 'visual' ? draft.background : draft.overlay)?.file;
    if (file === undefined) return;
    applyUpload(door, { phase: 'uploading', progress: 0 });
    startUpload(door, file);
  }

  const selectedLayer = selectedTextLayer(draft);
  const selectedId = draft.selected;

  function onTextChange(value: string) {
    if (selectedId === null) return;
    setDraft((current) => withText(current, selectedId, value));
    reportComposeText(value);
  }

  /** LA POSE COMMISE — un seul site : le geste sur la scène, le clavier et les
   * boutons du rail y aboutissent tous, pour que « quel objet, quelles
   * bornes ? » se réponde une fois. */
  const commitPose = useCallback((pose: StudioPose) => {
    setDraft((current) => {
      if (current.selected === 'overlay') return withVisualPose(current, 'overlay', pose);
      if (current.selected === null) return current;
      return withTextLayer(current, current.selected, (layer) => ({ ...layer, pose: clampPose(pose) }));
    });
  }, []);

  const changeLayer = useCallback(
    (change: (layer: StudioTextLayer) => StudioTextLayer) => {
      setDraft((current) => (current.selected === null ? current : withTextLayer(current, current.selected, change)));
    },
    [],
  );

  async function publish() {
    if (!canPublishStudioDraft(draft) || publishing) return;
    if (!online) {
      setAwaitingNetwork(true);
      return;
    }
    setAwaitingNetwork(false);
    setPublishing(true);
    setPublishFailure(null);

    const [background, overlay, sound] = await Promise.all([
      settle(draft.background?.upload, pendingRef.current.visual),
      settle(draft.overlay?.upload, pendingRef.current.overlay),
      settle(draft.sound?.upload, pendingRef.current.sound),
    ]);
    const current = latestDraft.current;
    const backgroundReady = background.kind === 'ready' && current.background !== null ? background.ready : undefined;
    const overlayReady = overlay.kind === 'ready' && current.overlay !== null ? overlay.ready : undefined;
    const soundReady = sound.kind === 'ready' && current.sound !== null ? sound.ready : undefined;
    if (
      (current.background !== null && backgroundReady === undefined) ||
      (current.overlay !== null && overlayReady === undefined) ||
      (current.sound !== null && soundReady === undefined)
    ) {
      setPublishing(false);
      setPublishFailure(null);
      return;
    }

    const storyEffects = buildStoryCanvasEffects({
      texts: current.texts,
      ...(backgroundReady !== undefined && current.background !== null
        ? {
            background: {
              source: backgroundReady,
              mediaType: current.background.mediaType,
              ...(current.background.aspectRatio !== undefined ? { aspectRatio: current.background.aspectRatio } : {}),
            },
          }
        : {}),
      ...(overlayReady !== undefined && current.overlay !== null
        ? {
            overlay: {
              source: overlayReady,
              mediaType: current.overlay.mediaType,
              ...(current.overlay.aspectRatio !== undefined ? { aspectRatio: current.overlay.aspectRatio } : {}),
              pose: current.overlay.pose,
            },
          }
        : {}),
      ...(soundReady !== undefined && current.sound !== null ? { sound: { source: soundReady, plane: current.sound.plane } } : {}),
    });
    if (storyEffects === null) {
      setPublishing(false);
      return;
    }

    // **AUCUN `content`** (défaut 4, revue-correction #6900) : le texte d'une
    // story vit dans `storyEffects` — l'envoyer en `content` le ferait rendre
    // DEUX FOIS chez le lecteur, miroir du `content: nil` iOS
    // (`StoryViewModel+PublicationUpload.swift:378-391`). Le serveur traduit
    // les `textObjects` du canevas directement
    // (`PostService.triggerStoryTextObjectTranslation`), et `locale` sur chaque
    // objet porte la langue source de CETTE traduction.
    //
    // **`mediaCaption`, LUI, part** (#6944) : `PostMedia.caption` est un
    // TROISIÈME contenu, celui du média, que `PostService.applyMediaCaption`
    // écrit et fait traduire. Le confondre avec `content` est exactement ce
    // que la directive porteur du 2026-09-17 a levé.
    const mediaCaption = storyMediaCaptionPayload([
      { postMediaId: backgroundReady?.postMediaId, caption: current.background?.caption },
      { postMediaId: overlayReady?.postMediaId, caption: current.overlay?.caption },
    ]);

    const result = await publishStory({
      ...deps.api,
      ...(current.texts.some((layer) => layer.text.trim() !== '') ? { originalLanguage: language } : {}),
      ...(mediaCaption !== undefined ? { mediaCaption } : {}),
      storyEffects,
      mediaIds: studioMediaIds({ background: backgroundReady, overlay: overlayReady, sound: soundReady }),
    });

    if (!result.ok) {
      setPublishing(false);
      setPublishFailure(studioFailureKey(result, 'publish') ?? 'story.studio.failure.network');
      return;
    }

    // `publishing` RESTE vrai jusqu'à la navigation : la relâcher ici rouvrait
    // Publier le temps de l'invalidation, et un second geste publiait la même
    // story deux fois.

    if (viewerId !== null) deps.drafts.clear(viewerId);
    revokeIfLocal(current.background?.previewUrl);
    revokeIfLocal(current.overlay?.previewUrl);
    revokeIfLocal(current.sound?.previewUrl);
    await appQueryClient.invalidateQueries({ queryKey: STORIES_QUERY_PREFIX });
    navigate(href('stories'));
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
        texts: draft.texts,
        ...(draft.background !== null
          ? {
              background: {
                source: draft.background.previewUrl,
                mediaType: draft.background.mediaType,
                ...(draft.background.aspectRatio !== undefined ? { aspectRatio: draft.background.aspectRatio } : {}),
              },
            }
          : {}),
        ...(draft.overlay !== null
          ? {
              overlay: {
                source: draft.overlay.previewUrl,
                mediaType: draft.overlay.mediaType,
                ...(draft.overlay.aspectRatio !== undefined ? { aspectRatio: draft.overlay.aspectRatio } : {}),
                pose: draft.overlay.pose,
              },
            }
          : {}),
        ...(draft.sound !== null ? { sound: { source: draft.sound.previewUrl, plane: draft.sound.plane } } : {}),
      }),
    [draft.texts, draft.background, draft.overlay, draft.sound],
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
  const [soundMuted, setSoundMuted] = useState(true);
  const soundAudioRef = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    const el = soundAudioRef.current;
    if (el === null || backgroundTrack === null) return;
    el.volume = backgroundTrack.volume;
    void el.play().catch(() => {
      // La politique de lecture automatique refuse le son NON coupé : le
      // bouton — un vrai geste utilisateur — reste la seule voie, jamais un
      // second essai silencieux qui masquerait le refus.
    });
  }, [backgroundTrack?.src]);

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
  }, [draft.texts, selectedId, textAppearance, remeasureText]);

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
  const publishLabel = publishing
    ? translate(lang, 'story.studio.publishing')
    : awaitingNetwork
      ? translate(lang, 'story.studio.publish.waiting')
      : translate(lang, 'story.studio.publish');

  const objectName = (id: string): string =>
    id === 'overlay'
      ? translate(lang, 'story.studio.object.overlay')
      : translate(lang, 'story.studio.object.text', { index: String(draft.texts.findIndex((layer) => layer.id === id) + 1) });

  const selectedPose: StudioPose | null =
    selectedId === 'overlay' ? (draft.overlay?.pose ?? null) : (selectedLayer?.pose ?? null);

  return (
    <StudioShell>
      {!online ? (
        <p role="status" className="shrink-0 px-4 pb-2 text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
          {translate(lang, 'story.studio.offline')}
        </p>
      ) : null}

      <div className="flex min-h-0 flex-1 gap-2 px-2">
        {/* COULOIR GAUCHE — ce qu'on POSE sur la scène, puis ce qui y est déjà
            posé (`meeshy-composer-modele.md` § 6, `apps/ios/CLAUDE.md` § 1). */}
        <div className="flex w-14 shrink-0 flex-col items-center gap-2 overflow-y-auto pt-2 pb-2">
          <StudioDoorButton
            door="visual"
            label={translate(lang, 'story.studio.background.add')}
            glyph="image"
            accept="image/*,video/*"
            onSelect={(file) => place('visual', file)}
          />
          <StudioDoorButton
            door="overlay"
            label={translate(lang, 'story.studio.overlay.add')}
            glyph="layer"
            accept="image/*,video/*"
            onSelect={(file) => place('overlay', file)}
          />
          <StudioDoorButton
            door="sound"
            label={translate(lang, 'story.studio.sound.add')}
            glyph="microphone"
            accept="audio/*"
            onSelect={(file) => place('sound', file)}
          />
          <div
            role="group"
            aria-label={translate(lang, 'story.studio.objects.label')}
            className="flex w-full flex-col items-center gap-1 pt-1"
          >
            {draft.texts.map((layer, index) => (
              <StudioChip
                key={layer.id}
                label={translate(lang, 'story.studio.object.select', {
                  name: translate(lang, 'story.studio.object.text', { index: String(index + 1) }),
                })}
                pressed={selectedId === layer.id}
                onPress={() => setDraft((current) => withSelected(current, layer.id))}
                probe={`select:${layer.id}`}
                style={{ minWidth: 44, paddingInline: 0 }}
              >
                <span aria-hidden="true">T{index + 1}</span>
              </StudioChip>
            ))}
            {draft.overlay !== null ? (
              <StudioChip
                label={translate(lang, 'story.studio.object.select', { name: translate(lang, 'story.studio.object.overlay') })}
                pressed={selectedId === 'overlay'}
                onPress={() => setDraft((current) => withSelected(current, 'overlay'))}
                probe="select:overlay"
                style={{ minWidth: 44, paddingInline: 0 }}
              >
                <LayerMark size={16} />
              </StudioChip>
            ) : null}
          </div>
        </div>

        <div className="grid min-w-0 flex-1 place-items-center" style={{ containerType: 'size' }}>
          <div
            data-scene-stage
            ref={stageRef}
            role="group"
            aria-label={translate(lang, 'story.studio.stage')}
            className="relative overflow-hidden"
            style={{
              width: 'min(100cqw, 100cqh * 9 / 16)',
              height: 'min(100cqh, 100cqw * 16 / 9)',
              borderRadius: 22,
              containerType: 'inline-size',
              backgroundColor: backgroundCss(STORY_PLAIN_BACKGROUND, 'var(--color-ios-card)'),
            }}
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
            {backgroundTrack !== null ? (
              <>
                {/* eslint-disable-next-line jsx-a11y/media-has-caption -- son de fond décoratif, aucun sous-titre à porter ici (P1) */}
                <audio ref={soundAudioRef} data-story-studio-sound src={backgroundTrack.src} loop muted={soundMuted} />
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
            <label htmlFor="story-studio-text" className="offscreen">
              {translate(lang, 'story.studio.text.label')}
            </label>
            {/* LA SAISIE, TRANSPARENTE ET ALIGNÉE AU PIXEL PRÈS sur ce que le
             * moteur peint pour l'objet SÉLECTIONNÉ (défaut 1,
             * revue-correction #6900) : sa boîte est celle MESURÉE, jamais une
             * largeur/hauteur fixes qui coupaient les lignes ou décalaient le
             * curseur d'une ligne entière. Sans texte peint (objet vide), elle
             * retombe sur le centre par défaut, à la même ancre que l'objet. */}
            <textarea
              id="story-studio-text"
              data-story-text-input
              data-story-text-target={selectedId ?? undefined}
              lang={selectedLayer?.language ?? language}
              dir="auto"
              disabled={selectedLayer === null}
              value={selectedLayer?.text ?? ''}
              onInput={(event) => onTextChange(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault();
                  void publish();
                }
              }}
              placeholder={translate(lang, 'story.studio.text.placeholder')}
              rows={1}
              className="absolute resize-none overflow-hidden border-0 bg-transparent p-0 text-center font-semibold text-transparent caret-white placeholder:text-white placeholder:opacity-60"
              style={{
                ...(textBox !== null
                  ? { top: textBox.top, left: textBox.left, width: textBox.width, height: textBox.height }
                  : { top: '50%', left: '50%', width: '85%', transform: 'translate(-50%, -50%)' }),
                ...(textAppearance !== null ? { fontSize: `${textAppearance.widthFraction * 100}cqw` } : {}),
                lineHeight: 1.2,
                zIndex: 2,
              }}
            />
            {/* LES POIGNÉES — seule chose posée sur la scène, et elles ne
                règlent rien : elles SONT l'objet qu'on saisit. */}
            {selectedId !== null && selectedPose !== null ? (
              <StudioObjectHandles
                key={selectedId}
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

        {/* COULOIR DROIT — les DIMENSIONS des objets : ajouter un texte, et la
            porte des contrôleurs de l'outil (qui s'ouvrent au BAS). */}
        <div className="flex w-14 shrink-0 flex-col items-center gap-2 pt-2">
          <StudioChip
            label={translate(lang, 'story.studio.text.add')}
            pressed={false}
            onPress={() => setDraft((current) => withAddedText(current, language))}
            probe="add-text"
            style={{ minWidth: 44, paddingInline: 0 }}
          >
            <Glyph name="plus" size={18} />
          </StudioChip>
          <StudioChip
            label={translate(lang, 'story.studio.editor.label')}
            pressed={editorOpen}
            onPress={() => setEditorOpen((open) => !open)}
            probe="editor-toggle"
            style={{ minWidth: 44, paddingInline: 0 }}
          >
            <SlidersMark size={18} />
          </StudioChip>
        </div>
      </div>

      {/* LES CONTRÔLEURS DE L'OUTIL OUVERT — la zone BASSE d'iOS, plafonnée en
          hauteur pour que la scène garde sa place. */}
      {editorOpen ? (
        <div
          data-story-editor-panel
          className="shrink-0 overflow-y-auto border-t px-4 py-2"
          style={{ maxHeight: 200, borderColor: 'var(--color-ios-separator)' }}
        >
          <StudioObjectEditor
            lang={lang}
            layer={selectedLayer}
            onChange={changeLayer}
            onPose={commitPose}
            onRemove={() => setDraft((current) => (current.selected === null ? current : withoutText(current, current.selected)))}
          />
        </div>
      ) : null}

      <footer className="flex shrink-0 flex-col gap-1 px-4 pt-2 pb-safe">
        {draft.background !== null || draft.overlay !== null || draft.sound !== null ? (
          <ul className="flex flex-col gap-1">
            {VISUAL_DOORS.map((door) => {
              const asset = door === 'visual' ? draft.background : draft.overlay;
              if (asset === null) return null;
              return (
                <StudioAssetRow
                  key={door}
                  lang={lang}
                  glyph={door === 'visual' ? 'image' : 'layer'}
                  label={translate(lang, door === 'visual' ? 'story.studio.background.label' : 'story.studio.overlay.label')}
                  removeLabel={translate(lang, door === 'visual' ? 'story.studio.background.remove' : 'story.studio.overlay.remove')}
                  upload={asset.upload}
                  onRetry={asset.file !== undefined ? () => retry(door) : undefined}
                  onRemove={() => remove(door)}
                  caption={{
                    value: asset.caption,
                    inputId: `story-studio-caption-${door}`,
                    onChange: (value) => setDraft((current) => withVisualCaption(current, door, value)),
                  }}
                />
              );
            })}
            {draft.sound !== null ? (
              <StudioAssetRow
                lang={lang}
                glyph="microphone"
                label={translate(lang, 'story.studio.sound.label')}
                removeLabel={translate(lang, 'story.studio.sound.remove')}
                upload={draft.sound.upload}
                onRetry={draft.sound.file !== undefined ? () => retry('sound') : undefined}
                onRemove={() => remove('sound')}
              >
                <StudioSoundPlaneToggle
                  lang={lang}
                  plane={draft.sound.plane}
                  onChange={(plane: StudioPlane) => setDraft((current) => withSoundPlane(current, plane))}
                />
              </StudioAssetRow>
            ) : null}
          </ul>
        ) : null}
        <div className="flex items-center gap-3 pb-3">
          <div className="min-w-0 flex-1 text-caption">
            {doorRefusal !== null ? (
              <p role="alert" style={{ color: 'var(--color-error)' }}>
                {translate(lang, doorRefusal === 'sound' ? 'story.studio.refusal.door.sound' : 'story.studio.refusal.door.visual')}
              </p>
            ) : publishFailure !== null ? (
              <p role="alert" style={{ color: 'var(--color-error)' }}>
                {translate(lang, 'story.studio.error.publish')} {translate(lang, publishFailure)}
              </p>
            ) : (
              <p style={{ color: 'var(--color-ios-ink-2)' }}>{translate(lang, 'story.studio.hint.duration')}</p>
            )}
          </div>
          <button
            type="button"
            data-story-publish
            onClick={() => void publish()}
            disabled={!canPublish || publishing}
            aria-busy={publishing || awaitingNetwork}
            className="grid shrink-0 place-items-center rounded-chip px-5 text-body font-semibold text-white disabled:opacity-40"
            style={{ backgroundColor: 'var(--color-ios-brand)', minHeight: 44 }}
          >
            {publishLabel}
          </button>
        </div>
      </footer>
    </StudioShell>
  );
}

/** Les portes visuelles, dans l'ordre du couloir — le fond d'abord, le calque
 * ensuite, comme `mediaIds` les attend. */
export const STUDIO_VISUAL_DOORS = VISUAL_DOORS;

/** Le plateau NEUF, exposé pour les témoins : la graine d'un studio sans
 * brouillon. */
export const newStudioDraft = emptyStudioDraft;
