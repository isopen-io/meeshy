import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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
import { publishStory } from '@/lib/api/stories-publish';
import { useProtectedMediaSrc } from '@/lib/api/use-protected-media';
import { backgroundCss } from '@/lib/canvas/background';
import { electBackgroundTrack } from '@/lib/canvas/background-sound';
import type { SceneCarrier } from '@/lib/canvas/carrier';
import { parseCanvasDocument } from '@/lib/canvas/document';
import { resolveSceneText } from '@/lib/canvas/text';
import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { useOnline } from '@/lib/net/online';
import { audienceLabelKey, defaultAudienceOf, seededAudience, type ChoosableAudience } from '@/lib/stories/publication-audience';
import { studioPublishRefusal, type PublicationKind } from '@/lib/stories/publication-kind';
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
  type StudioFailureKey,
  type StudioUploadState,
} from '@/lib/stories/studio-page';
import {
  STUDIO_PAGE_MAX,
  canPublishStudioDraft,
  currentStudioPage,
  selectedTextLayer,
  studioDraftFromSnapshot,
  studioFailureKey,
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
  withText,
  withTextLayer,
  withVisualCaption,
  withVisualPose,
  withoutPage,
  withoutSound,
  withoutText,
  withoutVisual,
  type StudioDraft,
} from '@/lib/stories/studio';
import { studioDraftStore, type StudioDraftStore } from '@/lib/stories/studio-draft-store';
import { settle, studioPublishPayload, uploadStateOf, type PendingUpload, type SettledPage } from '@/lib/stories/studio-publish';
import { clampPose, type StudioPose } from '@/lib/stories/studio-pose';
import type { StudioTextLayer } from '@/lib/stories/studio-text';
import { useComposeLanguage } from '@/lib/view/use-compose-language';
import { useReaderLanguages } from '@/lib/view/use-reader';
import { Glyph, GlyphSvg } from '@/components/glyph';
import { MEDIA_TRANSPORT_GLYPHS } from '@/components/glyphs-media-transport';
import { PublishSplitButton, publishTitleKey } from '@/components/publish-split-button';
import { Link, href, navigate } from '@/routes/route-table';
import { AudienceChip, type AudienceSource } from '@/routes/story-compose-audience';
import { publicationRefusalText, StudioFooterMessage, StudioPageAssets, type StudioPlaceRefusalNotice } from '@/routes/story-compose-footer';
import { measureAspectRatio, measureDurationMs } from '@/routes/story-compose-measure';
import {
  LayerMark,
  PageMark,
  SlidersMark,
  StudioChip,
  StudioDoorButton,
  StudioRefusal,
} from '@/routes/story-compose-parts';
import { StudioObjectHandles } from '@/routes/story-compose-stage';
import { measureSceneText, sameSceneTextBox, type SceneTextBox } from '@/routes/story-compose-text-box';

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

function revokeIfLocal(url: string | undefined): void {
  if (url !== undefined && url.startsWith('blob:')) URL.revokeObjectURL(url);
}

const TITLE_KEY = { STORY: 'story.studio.title', POST: 'story.studio.title.post', REEL: 'story.studio.title.reel' } as const;

/**
 * LE COMPOSER UNIQUE de la story, du post et du réel (#7497) — `initialKind`
 * est le format du POINT D'ENTRÉE (`/stories/new` ⇒ story, `/posts/new` ⇒
 * post, `?type=` le précise) ; la capsule `[Publier … | ▾]` en choisit un
 * autre au moment de publier.
 */
export default function StoryComposeScreen({
  deps = defaultStoryStudioDeps,
  initialKind = 'STORY',
}: { readonly deps?: StoryStudioDeps; readonly initialKind?: PublicationKind } = {}) {
  const session = useStore(sessionStore, (s) => s.session);
  if (session.status === 'guest') {
    return <StudioShell kind={initialKind}>{<StudioRefusal lang={currentInterfaceLanguage()} />}</StudioShell>;
  }
  const viewerId = session.status === 'authenticated' ? session.user.id : null;
  return <StoryStudio key={viewerId ?? 'anonymous'} deps={deps} viewerId={viewerId} initialKind={initialKind} />;
}

/** La barre haute d'iOS (`ComposerTopBar.swift:49-71`) : ✕ · rail · ⋯. Le
 * rail des scènes (#7684) prend la place du titre dès la deuxième page — le
 * titre reste pour le lecteur d'écran, et la scène ne change pas de hauteur
 * quand le rail apparaît. */
function StudioShell({ kind, rail, children }: { readonly kind: PublicationKind; readonly rail?: ReactNode; readonly children: ReactNode }) {
  const lang = currentInterfaceLanguage();
  return (
    <main data-story-studio className="flex h-dvh flex-col overflow-hidden pt-safe" style={{ backgroundColor: 'var(--color-ios-surface)' }}>
      <header className="flex shrink-0 items-center gap-3 px-4 pt-3 pb-2">
        <Link
          to={kind === 'STORY' ? 'list' : 'feed'}
          aria-label={translate(lang, 'story.studio.cancel')}
          className="grid size-11 shrink-0 place-items-center rounded-chip focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{ outlineColor: 'var(--color-ios-brand)', color: 'var(--color-ios-ink)' }}
        >
          <Glyph name="x" size={18} />
        </Link>
        {rail}
        <h1 className={rail === undefined ? 'flex-1 text-body font-semibold' : 'offscreen'} style={{ color: 'var(--color-ios-ink)' }}>
          {translate(lang, TITLE_KEY[kind])}
        </h1>
      </header>
      {children}
    </main>
  );
}

function StoryStudio({
  deps,
  viewerId,
  initialKind,
}: {
  readonly deps: StoryStudioDeps;
  readonly viewerId: string | null;
  readonly initialKind: PublicationKind;
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
    return { ...seeded, visibility: seededAudience({ draftVisibility: seeded.visibility, memoryVisibility }) };
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
   * l'auteur l'a DIT. Aucune disposition tant qu'il n'en a choisi aucune. */
  const [choice, setChoice] = useState<PublishChoice>({ kind: initialKind, layout: null });
  const kind = choice.kind;
  const [publishing, setPublishing] = useState(false);
  const [awaitingNetwork, setAwaitingNetwork] = useState(false);
  const [publishFailure, setPublishFailure] = useState<StudioFailureKey | null>(null);
  const [placeRefusal, setPlaceRefusal] = useState<StudioPlaceRefusalNotice | null>(null);
  /** Les contrôleurs de l'outil ouvert (zone BASSE d'iOS) — FERMÉS par défaut :
   * la scène garde toute sa hauteur tant que l'auteur ne règle rien. */
  const [editorOpen, setEditorOpen] = useState(false);

  /** La page COURANTE — LE SITE UNIQUE de lecture (#7684) : tout ce qui lisait
   * `draft.texts`/`draft.background`/… lit désormais `page.X`. Son IDENTITÉ ne
   * change que lorsque CETTE page est celle qui vient de muter (`withPage`) —
   * les autres pages restent immobiles (Zero Unnecessary Re-render). */
  const page = currentStudioPage(draft);

  const pendingRef = useRef<Record<string, PendingUpload | null>>({});
  const abortRef = useRef<Record<string, AbortController | null>>({});
  const latestDraft = useRef(draft);
  latestDraft.current = draft;

  useEffect(() => {
    if (viewerId !== null) deps.drafts.set(viewerId, studioSnapshotOf(draft, language));
  }, [draft, language, viewerId, deps.drafts]);

  useEffect(
    () => () => {
      Object.values(abortRef.current).forEach((controller) => controller?.abort());
      latestDraft.current.pages.forEach((p) => {
        revokeIfLocal(p.background?.previewUrl);
        revokeIfLocal(p.overlay?.previewUrl);
        revokeIfLocal(p.sound?.previewUrl);
      });
    },
    [],
  );

  function applyUpload(pageId: string, door: StudioDoor, upload: StudioUploadState) {
    setDraft((current) => withPage(current, pageId, (p) => (door === 'sound' ? pageWithSoundUpload(p, upload) : pageWithVisualUpload(p, door, upload))));
  }

  function startUpload(pageId: string, door: StudioDoor, file: File) {
    const key = uploadKey(pageId, door);
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
            if (!controller.signal.aborted) applyUpload(pageId, door, { phase: 'uploading', progress });
          },
        }),
      )
      .catch((): ApiFailure => ({ ok: false, status: 0, error: 'Module de téléversement indisponible', code: 'NETWORK' }));
    pendingRef.current[key] = pending;
    void pending.then((result) => {
      if (pendingRef.current[key] !== pending) return;
      const upload = uploadStateOf(result);
      if (upload !== null) applyUpload(pageId, door, upload);
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
    const uploading: StudioUploadState = { phase: 'uploading', progress: 0 };
    if (door === 'sound') {
      revokeIfLocal(page.sound?.previewUrl);
      setDraft((current) => withPage(current, pageId, (p) => pageWithSound(p, { file, previewUrl, upload: uploading, plane: p.sound?.plane ?? 'background' })));
      void measureDurationMs(previewUrl, 'audio').then((durationMs) => {
        if (durationMs !== null) setDraft((current) => withPage(current, pageId, (p) => pageWithMediaDuration(p, 'sound', previewUrl, durationMs)));
      });
    } else {
      revokeIfLocal((door === 'visual' ? page.background : page.overlay)?.previewUrl);
      const mediaType = studioMediaKindOf(file.type);
      setDraft((current) =>
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
    startUpload(pageId, door, file);
  }

  /** Une montée qu'on ABANDONNE — la page ou le média qu'elle servait est
   * retiré : elle ne coûte plus de bande passante, et son accusé ne revient
   * sur rien. */
  const forgetUpload = useCallback((pageId: string, door: StudioDoor) => {
    const key = uploadKey(pageId, door);
    abortRef.current[key]?.abort();
    abortRef.current[key] = null;
    pendingRef.current[key] = null;
  }, []);

  /** RETIRER UNE PAGE (`removeSlide`, #7684) — ses montées en vol sont
   * ABANDONNÉES et ses aperçus locaux RÉVOQUÉS, comme le retrait d'un média :
   * une page retirée ne laisse ni transfert ni `blob:` derrière elle. */
  const deletePage = useCallback(
    (id: string) => {
      const removed = latestDraft.current.pages.find((p) => p.id === id);
      if (removed === undefined || latestDraft.current.pages.length <= 1) return;
      ALL_DOORS.forEach((door) => forgetUpload(id, door));
      revokeIfLocal(removed.background?.previewUrl);
      revokeIfLocal(removed.overlay?.previewUrl);
      revokeIfLocal(removed.sound?.previewUrl);
      setDraft((current) => withoutPage(current, id));
    },
    [forgetUpload],
  );
  const selectPage = useCallback((id: string) => setDraft((current) => withCurrentPage(current, id)), []);

  function remove(door: StudioDoor) {
    forgetUpload(page.id, door);
    if (door === 'sound') {
      revokeIfLocal(page.sound?.previewUrl);
      setDraft(withoutSound);
    } else {
      revokeIfLocal((door === 'visual' ? page.background : page.overlay)?.previewUrl);
      setDraft((current) => withoutVisual(current, door));
    }
  }

  function retry(door: StudioDoor) {
    const file = door === 'sound' ? page.sound?.file : (door === 'visual' ? page.background : page.overlay)?.file;
    if (file === undefined) return;
    applyUpload(page.id, door, { phase: 'uploading', progress: 0 });
    startUpload(page.id, door, file);
  }

  const selectedLayer = selectedTextLayer(draft);
  const selectedId = page.selected;

  function onTextChange(value: string) {
    if (selectedId === null) return;
    setDraft((current) => withText(current, selectedId, value));
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
    setDraft((current) => {
      const selected = currentStudioPage(current).selected;
      if (selected === 'overlay') return withVisualPose(current, 'overlay', pose);
      if (selected === null) return current;
      return withTextLayer(current, selected, (layer) => ({ ...layer, pose: clampPose(pose) }));
    });
  }, []);

  const changeLayer = useCallback(
    (change: (layer: StudioTextLayer) => StudioTextLayer) => {
      setDraft((current) => {
        const selected = currentStudioPage(current).selected;
        return selected === null ? current : withTextLayer(current, selected, change);
      });
    },
    [],
  );

  /**
   * **PLUSIEURS PAGES, PLUSIEURS SCÈNES, UN SEUL ENVOI** (#7684) — chaque
   * page règle ses TROIS montées en vol (`settle`, adressées par
   * `${pageId}:${door}`), jamais seulement celles de la page à l'écran.
   * `chosen` est le GESTE entier (format ET disposition, `PublishChoice`) :
   * une intention armée hors ligne, ou un échec, repart avec les deux.
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

    const settledByPage = new Map(
      await Promise.all(
        draft.pages.map(
          async (p): Promise<readonly [string, SettledPage]> => [
            p.id,
            await Promise.all([
              settle(p.background?.upload, pendingRef.current[uploadKey(p.id, 'visual')] ?? null),
              settle(p.overlay?.upload, pendingRef.current[uploadKey(p.id, 'overlay')] ?? null),
              settle(p.sound?.upload, pendingRef.current[uploadKey(p.id, 'sound')] ?? null),
            ]),
          ],
        ),
      ),
    );

    const current = latestDraft.current;
    // Le sous-menu n'offre une disposition QUE pour Post (`layoutIsServed`) :
    // un autre format part sans `layout`, même choisi plus tôt sur un Post.
    const payload = studioPublishPayload({ pages: current.pages, settled: settledByPage, layout: chosen.kind === 'POST' ? chosen.layout : null });
    if (payload.kind !== 'ready') {
      setPublishing(false);
      setPublishFailure(null);
      return;
    }

    // **AUCUN `content`** (défaut 4, revue-correction #6900) : le texte d'une
    // story vit dans `storyEffects` — l'envoyer en `content` le ferait rendre
    // DEUX FOIS chez le lecteur, miroir du `content: nil` iOS
    // (`StoryViewModel+PublicationUpload.swift:378-391`). `mediaCaption`, LUI,
    // part (#6944) : `PostMedia.caption` est le contenu du MÉDIA.
    const result = await publishStory({
      ...deps.api,
      type: chosen.kind,
      // **RIEN CHOISI ⇒ LA CLÉ EST ABSENTE** (loi 1, D-111/D-115) : le défaut
      // reste une règle SERVEUR (`core.ts:421`) — jamais un défaut recopié ici.
      ...(current.visibility !== null ? { visibility: current.visibility } : {}),
      ...(current.pages.some((p) => p.texts.some((layer) => layer.text.trim() !== '')) ? { originalLanguage: language } : {}),
      ...(payload.mediaCaption !== undefined ? { mediaCaption: payload.mediaCaption } : {}),
      storyEffects: payload.storyEffects,
      mediaIds: payload.mediaIds,
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
    current.pages.forEach((p) => {
      revokeIfLocal(p.background?.previewUrl);
      revokeIfLocal(p.overlay?.previewUrl);
      revokeIfLocal(p.sound?.previewUrl);
    });
    if (chosen.kind === 'STORY') {
      await appQueryClient.invalidateQueries({ queryKey: STORIES_QUERY_PREFIX });
      navigate(href('stories'));
      return;
    }
    // Le rafraîchissement du fil ne retient pas la navigation, et son
    // annulation (le cache vidé en route) n'est pas un échec de publication.
    void refreshFeedAction().catch(() => undefined);
    navigate(href('feed'), true);
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
   * piste EMPRUNTÉE est servie par `GET /api/v1/static/…`, une route
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
    ? translate(lang, 'story.studio.publishing')
    : awaitingNetwork
      ? translate(lang, 'story.studio.publish.waiting')
      : translate(lang, publishTitleKey(kind));

  const objectName = (id: string): string =>
    id === 'overlay'
      ? translate(lang, 'story.studio.object.overlay')
      : translate(lang, 'story.studio.object.text', { index: String(page.texts.findIndex((layer) => layer.id === id) + 1) });

  const selectedPose: StudioPose | null =
    selectedId === 'overlay' ? (page.overlay?.pose ?? null) : (selectedLayer?.pose ?? null);

  return (
    <StudioShell
      kind={kind}
      rail={
        draft.pages.length > 1 ? (
          <Suspense fallback={<span className="min-w-0 flex-1" />}>
            <StudioPageRail lang={lang} pages={draft.pages} currentPageId={draft.currentPage} onSelect={selectPage} onDelete={deletePage} />
          </Suspense>
        ) : undefined
      }
    >
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
            {page.texts.map((layer, index) => (
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
            {page.overlay !== null ? (
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
            data-story-studio-current-page={page.id}
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

        {/* COULOIR DROIT — les DIMENSIONS des objets : ajouter un texte, et la
            porte des contrôleurs de l'outil (qui s'ouvrent au BAS). `[+]`
            CRÉER UNE PAGE tout en HAUT, séparé des contrôleurs d'OBJET par un
            trait (#7684, `ComposerTrailingRail.swift:40-45,75-88` : « les
            contrôleurs modifient UN objet ; celle-ci ajoute une PAGE »).
            Absent au plafond (`STUDIO_PAGE_MAX`), jamais grisé (loi 4). */}
        <div className="flex w-14 shrink-0 flex-col items-center gap-2 pt-2">
          {draft.pages.length < STUDIO_PAGE_MAX ? (
            <>
              <StudioChip
                label={translate(lang, 'story.studio.page.add')}
                pressed={false}
                onPress={() => setDraft((current) => withAddedPage(current, language))}
                probe="add-page"
                style={{ minWidth: 44, paddingInline: 0 }}
              >
                <PageMark size={18} />
              </StudioChip>
              <span aria-hidden="true" className="w-8" style={{ height: 1, backgroundColor: 'var(--color-edge)' }} />
            </>
          ) : null}
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
          style={{ maxHeight: 200, borderColor: 'var(--color-edge)' }}
        >
          <Suspense fallback={null}>
            <StudioObjectEditor
              lang={lang}
              layer={selectedLayer}
              onChange={changeLayer}
              onPose={commitPose}
              onRemove={() =>
                setDraft((current) => {
                  const selected = currentStudioPage(current).selected;
                  return selected === null ? current : withoutText(current, selected);
                })
              }
            />
          </Suspense>
        </div>
      ) : null}

      <footer className="flex shrink-0 flex-col gap-1 px-4 pt-2 pb-safe">
        <StudioPageAssets
          lang={lang}
          page={page}
          onRetry={retry}
          onRemove={remove}
          onCaption={(door, value) => setDraft((current) => withVisualCaption(current, door, value))}
          onSoundPlane={(plane) => setDraft((current) => withSoundPlane(current, plane))}
        />
        <StudioFooterMessage lang={lang} placeRefusal={placeRefusal} kindRefusal={kindRefusal} publishFailure={publishFailure} />
        {/* La rangée du socle iOS (`MeeshyComposerHost+Socle.swift:43-51`) :
            l'audience en TÊTE, un espace, la capsule Publier. */}
        <div className="flex items-center gap-3 pb-3">
          <AudienceChip
            lang={lang}
            value={audienceValue}
            source={audienceSource}
            open={audienceOpen}
            onOpen={openAudience}
          />
          <span aria-hidden="true" className="flex-1" />
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
            onChoose={(chosen) => void publish(chosen)}
          />
        </div>
      </footer>

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
    </StudioShell>
  );
}
