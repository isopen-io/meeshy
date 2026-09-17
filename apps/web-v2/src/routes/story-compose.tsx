import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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
import type { SceneCarrier } from '@/lib/canvas/carrier';
import { parseCanvasDocument } from '@/lib/canvas/document';
import { resolveSceneText } from '@/lib/canvas/text';
import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { useOnline } from '@/lib/net/online';
import {
  buildPreviewCanvasDocument,
  buildStoryCanvasEffects,
  composeStoryCanvas,
  STORY_PLAIN_BACKGROUND,
  studioMediaIds,
  studioMediaKindOf,
  type StudioReadyAsset,
} from '@/lib/stories/story-document';
import {
  canPublishStudioDraft,
  studioDoorAccepts,
  studioDraftFromSnapshot,
  studioFailureKey,
  studioSnapshotOf,
  withBackground,
  withBackgroundUpload,
  withoutBackground,
  withoutSound,
  withSound,
  withSoundUpload,
  withText,
  type StudioDoor,
  type StudioDraft,
  type StudioFailureKey,
  type StudioUploadState,
} from '@/lib/stories/studio';
import { studioDraftStore, type StudioDraftStore } from '@/lib/stories/studio-draft-store';
import { useComposeLanguage } from '@/lib/view/use-compose-language';
import { useReaderLanguages } from '@/lib/view/use-reader';
import { Glyph } from '@/components/glyph';
import { Link, href, navigate } from '@/routes/route-table';
import { StudioAssetRow, StudioDoorButton, StudioRefusal } from '@/routes/story-compose-parts';

/**
 * **CRÉER UNE STORY** (#6900) — un fond (image/vidéo), un son de fond, un
 * texte, un aperçu par le MOTEUR PARTAGÉ (`ScenePlayer`, D-79), publiée en
 * CanvasV3 comme iOS. La référence est le code Swift cité par la
 * spécification (§ 1.2 à 1.7) : `meeshy-composer-modele.md` § 1, § 4, § 6
 * pour la sémantique et le chrome (✕ en haut, portes dans le couloir GAUCHE,
 * carte 9:16 CENTRÉE, Publier au SOCLE) ; `MeeshyComposerHost+PreUpload`
 * pour la pré-montée.
 *
 * P1 (« un début, pas les 31 vues ») : UNE scène, UN fond, UN son, UN texte —
 * ni rail de diapositives, ni type de publication, ni sélecteur d'audience
 * (défaut serveur `FRIENDS`, `core.ts:420-421`), ni appui long sur le fond
 * (question 9.2 : un bouton « Retirer » visible, 44 px).
 *
 * TROIS lois tenues ici :
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

function revokeIfLocal(url: string | undefined): void {
  if (url !== undefined && url.startsWith('blob:')) URL.revokeObjectURL(url);
}

function uploadStateOf(result: ApiResult<PostMediaUploadResult>): StudioUploadState | null {
  if (result.ok) return { phase: 'ready', postMediaId: result.data.postMediaId, fileUrl: result.data.fileUrl };
  const reasonKey = studioFailureKey(result, 'upload');
  return reasonKey === null ? null : { phase: 'failed', reasonKey };
}

/** Un média tel que la publication le LIT : prêt dans le brouillon, sinon
 * l'accusé de SA montée en vol — jamais un second envoi. */
async function settle(upload: StudioUploadState | undefined, pending: PendingUpload | null): Promise<SettledAsset> {
  if (upload === undefined) return { kind: 'none' };
  if (upload.phase === 'ready') return { kind: 'ready', ready: { postMediaId: upload.postMediaId, fileUrl: upload.fileUrl } };
  if (upload.phase === 'failed' || pending === null) return { kind: 'failed' };
  const result = await pending;
  return result.ok ? { kind: 'ready', ready: { postMediaId: result.data.postMediaId, fileUrl: result.data.fileUrl } } : { kind: 'failed' };
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

  const [draft, setDraft] = useState<StudioDraft>(() =>
    studioDraftFromSnapshot(viewerId === null ? null : deps.drafts.get(viewerId), attachmentSrc),
  );
  const { language, setText: reportComposeText } = useComposeLanguage({
    preferred: reader.languages,
    ...(draft.language !== undefined ? { initialLanguage: draft.language } : {}),
  });
  const [publishing, setPublishing] = useState(false);
  const [awaitingNetwork, setAwaitingNetwork] = useState(false);
  const [publishFailure, setPublishFailure] = useState<StudioFailureKey | null>(null);
  const [doorRefusal, setDoorRefusal] = useState<StudioDoor | null>(null);

  const pendingRef = useRef<Record<StudioDoor, PendingUpload | null>>({ visual: null, sound: null });
  const abortRef = useRef<Record<StudioDoor, AbortController | null>>({ visual: null, sound: null });
  const latestDraft = useRef(draft);
  latestDraft.current = draft;

  useEffect(() => {
    if (viewerId !== null) deps.drafts.set(viewerId, studioSnapshotOf(draft, language));
  }, [draft, language, viewerId, deps.drafts]);

  useEffect(
    () => () => {
      abortRef.current.visual?.abort();
      abortRef.current.sound?.abort();
      revokeIfLocal(latestDraft.current.background?.previewUrl);
      revokeIfLocal(latestDraft.current.sound?.previewUrl);
    },
    [],
  );

  function applyUpload(door: StudioDoor, upload: StudioUploadState) {
    setDraft((current) => (door === 'visual' ? withBackgroundUpload(current, upload) : withSoundUpload(current, upload)));
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
    if (door === 'visual') {
      revokeIfLocal(draft.background?.previewUrl);
      setDraft((current) => withBackground(current, { file, previewUrl, mediaType: studioMediaKindOf(file.type), upload: uploading }));
    } else {
      revokeIfLocal(draft.sound?.previewUrl);
      setDraft((current) => withSound(current, { file, previewUrl, upload: uploading }));
    }
    startUpload(door, file);
  }

  function remove(door: StudioDoor) {
    abortRef.current[door]?.abort();
    pendingRef.current[door] = null;
    if (door === 'visual') {
      revokeIfLocal(draft.background?.previewUrl);
      setDraft(withoutBackground);
    } else {
      revokeIfLocal(draft.sound?.previewUrl);
      setDraft(withoutSound);
    }
  }

  function retry(door: StudioDoor) {
    const file = door === 'visual' ? draft.background?.file : draft.sound?.file;
    if (file === undefined) return;
    applyUpload(door, { phase: 'uploading', progress: 0 });
    startUpload(door, file);
  }

  function onTextChange(value: string) {
    setDraft((current) => withText(current, value));
    reportComposeText(value);
  }

  async function publish() {
    if (!canPublishStudioDraft(draft) || publishing) return;
    if (!online) {
      setAwaitingNetwork(true);
      return;
    }
    setAwaitingNetwork(false);
    setPublishing(true);
    setPublishFailure(null);

    const [background, sound] = await Promise.all([
      settle(draft.background?.upload, pendingRef.current.visual),
      settle(draft.sound?.upload, pendingRef.current.sound),
    ]);
    const current = latestDraft.current;
    const backgroundReady = background.kind === 'ready' && current.background !== null ? background.ready : undefined;
    const soundReady = sound.kind === 'ready' && current.sound !== null ? sound.ready : undefined;
    if ((current.background !== null && backgroundReady === undefined) || (current.sound !== null && soundReady === undefined)) {
      setPublishing(false);
      setPublishFailure(null);
      return;
    }

    const text = current.text.trim();
    const storyEffects = buildStoryCanvasEffects({
      text,
      locale: language,
      ...(backgroundReady !== undefined && current.background !== null ? { background: { ready: backgroundReady, mediaType: current.background.mediaType } } : {}),
      ...(soundReady !== undefined ? { sound: { ready: soundReady } } : {}),
    });
    if (storyEffects === null) {
      setPublishing(false);
      return;
    }

    const result = await publishStory({
      ...deps.api,
      content: text,
      ...(text !== '' ? { originalLanguage: language } : {}),
      storyEffects,
      mediaIds: studioMediaIds({ background: backgroundReady, sound: soundReady }),
    });

    setPublishing(false);
    if (!result.ok) {
      setPublishFailure(studioFailureKey(result, 'publish') ?? 'story.studio.failure.network');
      return;
    }

    if (viewerId !== null) deps.drafts.clear(viewerId);
    revokeIfLocal(current.background?.previewUrl);
    revokeIfLocal(current.sound?.previewUrl);
    await appQueryClient.invalidateQueries({ queryKey: STORIES_QUERY_PREFIX });
    navigate(href('stories'));
  }

  const publishRef = useRef(publish);
  publishRef.current = publish;
  useEffect(() => {
    if (online && awaitingNetwork) void publishRef.current();
  }, [online, awaitingNetwork]);

  const previewDocument = useMemo(
    () =>
      buildPreviewCanvasDocument({
        text: '',
        locale: language,
        ...(draft.background !== null ? { background: { previewUrl: draft.background.previewUrl, mediaType: draft.background.mediaType } } : {}),
        ...(draft.sound !== null ? { sound: { previewUrl: draft.sound.previewUrl } } : {}),
      }),
    [draft.background?.previewUrl, draft.background?.mediaType, draft.sound?.previewUrl, language],
  );

  /** Le texte se DESSINE par le résolveur du player (`resolveSceneText`) :
   * même couleur, même taille relative à la largeur de la carte (`cqw`) que
   * le texte publié — jamais une taille de champ de formulaire. */
  const textAppearance = useMemo(() => {
    const probe = parseCanvasDocument(composeStoryCanvas({ text: '·', locale: language }))?.scenes[0]?.objects.find((o) => o.kind === 'text');
    return probe === undefined ? null : resolveSceneText({ object: probe, preferredLanguages: [language] });
  }, [language]);

  const canPublish = canPublishStudioDraft(draft);
  const publishLabel = publishing
    ? translate(lang, 'story.studio.publishing')
    : awaitingNetwork
      ? translate(lang, 'story.studio.publish.waiting')
      : translate(lang, 'story.studio.publish');

  return (
    <StudioShell>
      {!online ? (
        <p role="status" className="shrink-0 px-4 pb-2 text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
          {translate(lang, 'story.studio.offline')}
        </p>
      ) : null}

      <div className="flex min-h-0 flex-1 gap-2 px-2">
        <div className="flex w-14 shrink-0 flex-col items-center gap-3 pt-2">
          <StudioDoorButton
            door="visual"
            label={translate(lang, 'story.studio.background.add')}
            glyph="image"
            accept="image/*,video/*"
            onSelect={(file) => place('visual', file)}
          />
          <StudioDoorButton
            door="sound"
            label={translate(lang, 'story.studio.sound.add')}
            glyph="microphone"
            accept="audio/*"
            onSelect={(file) => place('sound', file)}
          />
        </div>

        <div className="grid min-w-0 flex-1 place-items-center" style={{ containerType: 'size' }}>
          <div
            data-scene-stage
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
                />
              </Suspense>
            ) : null}
            <label htmlFor="story-studio-text" className="offscreen">
              {translate(lang, 'story.studio.text.label')}
            </label>
            <textarea
              id="story-studio-text"
              data-story-text-input
              lang={language}
              dir="auto"
              value={draft.text}
              onInput={(event) => onTextChange(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault();
                  void publish();
                }
              }}
              placeholder={translate(lang, 'story.studio.text.placeholder')}
              rows={3}
              className="absolute top-1/2 left-1/2 w-[85%] resize-none bg-transparent text-center font-semibold placeholder:opacity-60"
              style={{
                transform: 'translate(-50%, -50%)',
                ...(textAppearance !== null ? { color: textAppearance.color, fontSize: `${textAppearance.widthFraction * 100}cqw` } : {}),
                lineHeight: 1.2,
                textShadow: '0 1px 4px rgba(0,0,0,0.45)',
              }}
            />
          </div>
        </div>

        <div aria-hidden="true" className="w-14 shrink-0" />
      </div>

      <footer className="flex shrink-0 flex-col gap-1 px-4 pt-2 pb-safe">
        {draft.background !== null || draft.sound !== null ? (
          <ul className="flex flex-col">
            {draft.background !== null ? (
              <StudioAssetRow
                lang={lang}
                glyph="image"
                label={translate(lang, 'story.studio.background.label')}
                removeLabel={translate(lang, 'story.studio.background.remove')}
                upload={draft.background.upload}
                onRetry={draft.background.file !== undefined ? () => retry('visual') : undefined}
                onRemove={() => remove('visual')}
              />
            ) : null}
            {draft.sound !== null ? (
              <StudioAssetRow
                lang={lang}
                glyph="microphone"
                label={translate(lang, 'story.studio.sound.label')}
                removeLabel={translate(lang, 'story.studio.sound.remove')}
                upload={draft.sound.upload}
                onRetry={draft.sound.file !== undefined ? () => retry('sound') : undefined}
                onRemove={() => remove('sound')}
              />
            ) : null}
          </ul>
        ) : null}
        <div className="flex items-center gap-3 pb-3">
          <div className="min-w-0 flex-1 text-caption">
            {doorRefusal !== null ? (
              <p role="alert" style={{ color: 'var(--color-error)' }}>
                {translate(lang, doorRefusal === 'visual' ? 'story.studio.refusal.door.visual' : 'story.studio.refusal.door.sound')}
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
