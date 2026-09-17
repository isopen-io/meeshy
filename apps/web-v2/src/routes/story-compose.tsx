import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';

import { credentialFromSession, httpTransport } from '@/lib/api/client';
import { apiConfig } from '@/lib/api/config';
import { attachmentSrc } from '@/lib/api/media-url';
import type { ApiResult, HttpTransport } from '@/lib/api/http';
import { appQueryClient } from '@/lib/api/query-client';
import { uploadPostMedia, type PostMediaUploadResult } from '@/lib/api/post-media-upload';
import { sessionStore } from '@/lib/api/session';
import { STORIES_QUERY_PREFIX } from '@/lib/api/stories';
import { publishStory } from '@/lib/api/stories-publish';
import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage, type InterfaceLanguage } from '@/lib/interface-language';
import { useOnline } from '@/lib/net/online';
import { sendFailureReason } from '@/lib/send/failure-reason';
import {
  buildPreviewCanvasDocument,
  buildStoryCanvasEffects,
  studioMediaIds,
  studioMediaKindOf,
} from '@/lib/stories/story-document';
import { studioDraftStore, type StudioDraftSnapshot } from '@/lib/stories/studio-draft-store';
import {
  canPublishStudioDraft,
  emptyStudioDraft,
  readyAssetOf,
  withBackground,
  withBackgroundUpload,
  withoutBackground,
  withoutSound,
  withSound,
  withSoundUpload,
  withText,
  type StudioBackgroundAsset,
  type StudioDraft,
  type StudioSoundAsset,
} from '@/lib/stories/studio';
import { useComposeLanguage } from '@/lib/view/use-compose-language';
import { useReaderLanguages } from '@/lib/view/use-reader';
import { Glyph } from '@/components/glyph';
import { Link, href, navigate } from '@/routes/route-table';

/**
 * **CRÉER UNE STORY** (#6900) — un fond (image/vidéo), un son de fond, un
 * texte, un aperçu par le MOTEUR PARTAGÉ (`ScenePlayer`, D-79), publiée en
 * CanvasV3 comme iOS. La référence est le code Swift cité par la
 * spécification (§ 1.2 à 1.7) : `docs/product/meeshy-composer-modele.md`
 * § 1, § 4, § 6 ter pour la sémantique et le chrome ; `MeeshyComposerHost+*`
 * pour l'ingestion, la pré-montée et le menu du fond.
 *
 * P1 (« un début, pas les 31 vues ») : UNE scène, UN fond, UN son, UN texte —
 * pas de rail de diapositives, pas de type de publication à choisir (story
 * seule), pas de sélecteur d'audience (défaut serveur `FRIENDS`,
 * `core.ts:420-421`), pas d'appui long sur le fond (retirer/réessayer
 * passent par des boutons visibles, 44 px, question 9.2 de la spécification).
 * Chacun de ces manques est une issue compagnon, jamais un contournement.
 */

const ScenePlayer = lazy(() => import('@/components/scene-player'));

/**
 * LA SEULE DÉPENDANCE RÉSEAU INJECTABLE DE CET ÉCRAN — le transport de
 * `publishStory` (`POST /posts`). `httpTransport` fige son `fetchImpl` à sa
 * CONSTRUCTION (`createHttpTransport`, `client.ts`) : un témoin qui rebranche
 * `globalThis.fetch` APRÈS l'import du module n'a alors plus aucune prise sur
 * lui (mesuré en revue-correction de ce lot — la publication contactait la
 * VRAIE passerelle de production). `deps.transport` est le SEUL point que ce
 * fichier ouvre, exactement comme `createHttpTransport({ fetchImpl })` l'ouvre
 * déjà pour les ports (`stories-publish.test.ts`) — pas une jumelle du motif,
 * la même porte. `uploadPostMedia`, lui, résout `fetch` à CHAQUE appel (une
 * simple référence globale, jamais figée) : `globalThis.fetch` suffit à le
 * bouchonner, comme le prouve `post-media-upload.test.ts`.
 */
export type StoryStudioDeps = { readonly transport: HttpTransport };
const defaultStoryStudioDeps: StoryStudioDeps = { transport: httpTransport };

function currentCredential() {
  return credentialFromSession(sessionStore.getState().session);
}

function revokeIfLocal(url: string | undefined): void {
  if (url !== undefined && url.startsWith('blob:')) URL.revokeObjectURL(url);
}

/** Le brouillon RESTAURÉ (§0, « brouillon conservé sur échec ») — seules les
 * références SERVEUR survivent (aucun `File` ne traverse une reprise de
 * session), relues via `attachmentSrc` : un aperçu restauré reste un aperçu
 * RÉEL, jamais un cadre vide. */
function draftFromSnapshot(snapshot: StudioDraftSnapshot | null): StudioDraft {
  let draft = emptyStudioDraft();
  if (snapshot === null) return draft;
  draft = withText(draft, snapshot.text);
  if (snapshot.background !== undefined) {
    draft = withBackground(draft, {
      previewUrl: attachmentSrc(snapshot.background.fileUrl),
      mediaType: snapshot.background.mediaType,
      upload: { phase: 'ready', postMediaId: snapshot.background.postMediaId, fileUrl: snapshot.background.fileUrl },
    });
  }
  if (snapshot.sound !== undefined) {
    draft = withSound(draft, {
      previewUrl: attachmentSrc(snapshot.sound.fileUrl),
      upload: { phase: 'ready', postMediaId: snapshot.sound.postMediaId, fileUrl: snapshot.sound.fileUrl },
    });
  }
  return draft;
}

/** `null`/succès ⇒ rien à dire ; un échec ⇒ sa phrase (`sendFailureReason`).
 * Isolé pour que le contrôle de flot de `publish()` n'ait jamais à prouver
 * `!ok` à travers un `||` composé — TypeScript strict le narrrowe mal. */
function uploadFailureReason(result: ApiResult<PostMediaUploadResult> | null): string | undefined {
  if (result === null || result.ok) return undefined;
  return sendFailureReason(result);
}

function snapshotOfDraft(draft: StudioDraft): StudioDraftSnapshot {
  const backgroundReady = draft.background !== null ? readyAssetOf(draft.background.upload) : null;
  const soundReady = draft.sound !== null ? readyAssetOf(draft.sound.upload) : null;
  return {
    text: draft.text,
    ...(backgroundReady !== null ? { background: { ...backgroundReady, mediaType: draft.background!.mediaType } } : {}),
    ...(soundReady !== null ? { sound: soundReady } : {}),
  };
}

/** Porte d'ingestion du couloir gauche (§1.7, « à GAUCHE ce qui pose un objet
 * SUR la scène ») — un `<label>` autour d'un `<input type=file>` masqué,
 * MÊME motif que le tiroir du composeur (`composer-tray.tsx` : bouton +
 * `ref.click()` imbriquerait un élément interactif dans un autre, invalide en
 * HTML). 44 px, un glyphe et son libellé visible : jamais une icône seule
 * sans nom accessible. */
function RailButton({
  label,
  glyph,
  onSelect,
  accept,
}: {
  readonly label: string;
  readonly glyph: 'image' | 'microphone';
  readonly onSelect: (file: File) => void;
  readonly accept: string;
}) {
  return (
    <label
      className="grid cursor-pointer place-items-center gap-1 rounded-chip px-2 py-2 text-center"
      style={{ minHeight: 44, minWidth: 44, color: 'var(--color-ios-ink-1)' }}
    >
      <input
        type="file"
        accept={accept}
        className="sr-only"
        aria-label={label}
        onChange={(e) => {
          const file = e.currentTarget.files?.[0];
          e.currentTarget.value = '';
          if (file !== undefined) onSelect(file);
        }}
      />
      <Glyph name={glyph} size={22} />
      <span aria-hidden="true" className="text-check leading-tight">
        {label}
      </span>
    </label>
  );
}

/** L'état d'un asset posé — pastille d'ENVOI, refus + réessayer, retrait
 * (44 px, question 9.2 : pas d'appui long, un bouton visible fait l'affaire). */
function AssetStatusRow({
  lang,
  phase,
  reason,
  onRetry,
  onRemove,
}: {
  readonly lang: InterfaceLanguage;
  readonly phase: 'uploading' | 'ready' | 'failed';
  readonly reason?: string | undefined;
  readonly onRetry?: (() => void) | undefined;
  readonly onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-2 text-check" style={{ color: 'var(--color-ios-ink-2)' }}>
      {phase === 'uploading' ? <span>{translate(lang, 'story.studio.upload.uploading')}</span> : null}
      {phase === 'failed' ? (
        <>
          <span role="alert" style={{ color: 'var(--ios-error)' }}>
            {reason ?? translate(lang, 'story.studio.error.upload')}
          </span>
          {onRetry !== undefined ? (
            <button type="button" onClick={onRetry} className="font-semibold underline">
              {translate(lang, 'story.studio.upload.retry')}
            </button>
          ) : null}
        </>
      ) : null}
      <button
        type="button"
        onClick={onRemove}
        aria-label={translate(lang, 'story.studio.asset.remove')}
        className="ms-auto grid place-items-center rounded-full"
        style={{ width: 28, height: 28, color: 'var(--color-ios-ink-2)' }}
      >
        <Glyph name="x" size={14} />
      </button>
    </div>
  );
}

export default function StoryComposeScreen({ deps = defaultStoryStudioDeps }: { readonly deps?: StoryStudioDeps } = {}) {
  const lang = currentInterfaceLanguage();
  const reader = useReaderLanguages();
  const { language, setText: reportComposeText } = useComposeLanguage({ preferred: reader.languages });
  const online = useOnline();

  const [draft, setDraft] = useState<StudioDraft>(() => draftFromSnapshot(studioDraftStore.get()));
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);

  const backgroundUploadRef = useRef<Promise<ApiResult<PostMediaUploadResult>> | null>(null);
  const soundUploadRef = useRef<Promise<ApiResult<PostMediaUploadResult>> | null>(null);
  const backgroundAbortRef = useRef<AbortController | null>(null);
  const soundAbortRef = useRef<AbortController | null>(null);

  // Réf « dernière valeur connue » pour le nettoyage au démontage —
  // l'effet plus bas ne se rejoue jamais (tableau vide), donc il ne peut
  // lire l'asset courant qu'à travers une réf tenue à jour à chaque rendu.
  const backgroundRefLatest = useRef(draft.background);
  backgroundRefLatest.current = draft.background;
  const soundRefLatest = useRef(draft.sound);
  soundRefLatest.current = draft.sound;

  // Démonte : les URL locales encore VIVANTES (jamais publiées) sont
  // relâchées — une pièce ENVOYÉE (déjà référencée par une story publiée)
  // n'existe plus ici, l'écran a navigué ailleurs.
  useEffect(
    () => () => {
      revokeIfLocal(backgroundRefLatest.current?.previewUrl);
      revokeIfLocal(soundRefLatest.current?.previewUrl);
    },
    [],
  );

  function selectBackground(file: File) {
    const previous = draft.background;
    const mediaType = studioMediaKindOf(file.type !== '' ? file.type : 'image/*');
    const previewUrl = URL.createObjectURL(file);
    const asset: StudioBackgroundAsset = { file, previewUrl, mediaType, upload: { phase: 'uploading' } };
    setDraft((d) => withBackground(d, asset));
    revokeIfLocal(previous?.previewUrl);

    backgroundAbortRef.current?.abort();
    const controller = new AbortController();
    backgroundAbortRef.current = controller;
    const promise = uploadPostMedia({
      file,
      uploadContext: 'story',
      base: apiConfig.base,
      credential: currentCredential,
      signal: controller.signal,
    });
    backgroundUploadRef.current = promise;
    void promise.then((result) => {
      if (backgroundUploadRef.current !== promise) return; // remplacé par une sélection plus récente
      setDraft((d) =>
        withBackgroundUpload(
          d,
          result.ok
            ? { phase: 'ready', postMediaId: result.data.postMediaId, fileUrl: result.data.fileUrl }
            : { phase: 'failed', reason: sendFailureReason(result) ?? translate(lang, 'story.studio.error.upload') },
        ),
      );
    });
  }

  function removeBackground() {
    backgroundAbortRef.current?.abort();
    backgroundUploadRef.current = null;
    revokeIfLocal(draft.background?.previewUrl);
    setDraft((d) => withoutBackground(d));
  }

  function retryBackground() {
    if (draft.background?.file !== undefined) selectBackground(draft.background.file);
  }

  function selectSound(file: File) {
    const previous = draft.sound;
    const previewUrl = URL.createObjectURL(file);
    const asset: StudioSoundAsset = { file, previewUrl, upload: { phase: 'uploading' } };
    setDraft((d) => withSound(d, asset));
    revokeIfLocal(previous?.previewUrl);

    soundAbortRef.current?.abort();
    const controller = new AbortController();
    soundAbortRef.current = controller;
    const promise = uploadPostMedia({
      file,
      uploadContext: 'story',
      base: apiConfig.base,
      credential: currentCredential,
      signal: controller.signal,
    });
    soundUploadRef.current = promise;
    void promise.then((result) => {
      if (soundUploadRef.current !== promise) return;
      setDraft((d) =>
        withSoundUpload(
          d,
          result.ok
            ? { phase: 'ready', postMediaId: result.data.postMediaId, fileUrl: result.data.fileUrl }
            : { phase: 'failed', reason: sendFailureReason(result) ?? translate(lang, 'story.studio.error.upload') },
        ),
      );
    });
  }

  function removeSound() {
    soundAbortRef.current?.abort();
    soundUploadRef.current = null;
    revokeIfLocal(draft.sound?.previewUrl);
    setDraft((d) => withoutSound(d));
  }

  function retrySound() {
    if (draft.sound?.file !== undefined) selectSound(draft.sound.file);
  }

  function onTextChange(value: string) {
    setDraft((d) => withText(d, value));
    reportComposeText(value);
  }

  const previewDocument = useMemo(
    () =>
      buildPreviewCanvasDocument({
        text: '',
        locale: language,
        ...(draft.background !== null ? { background: { previewUrl: draft.background.previewUrl, mediaType: draft.background.mediaType } } : {}),
        ...(draft.sound !== null ? { sound: { previewUrl: draft.sound.previewUrl } } : {}),
      }),
    [draft.background, draft.sound, language],
  );

  async function publish() {
    if (!canPublishStudioDraft(draft) || publishing) return;
    setPublishing(true);
    setPublishError(null);

    const backgroundResult = draft.background !== null ? await backgroundUploadRef.current : null;
    if (draft.background !== null && (backgroundResult === null || !backgroundResult.ok)) {
      const reason = uploadFailureReason(backgroundResult) ?? translate(lang, 'story.studio.error.upload');
      setPublishing(false);
      setDraft((d) => withBackgroundUpload(d, { phase: 'failed', reason }));
      setPublishError(translate(lang, 'story.studio.error.upload'));
      studioDraftStore.set(snapshotOfDraft(draft));
      return;
    }

    const soundResult = draft.sound !== null ? await soundUploadRef.current : null;
    if (draft.sound !== null && (soundResult === null || !soundResult.ok)) {
      const reason = uploadFailureReason(soundResult) ?? translate(lang, 'story.studio.error.upload');
      setPublishing(false);
      setDraft((d) => withSoundUpload(d, { phase: 'failed', reason }));
      setPublishError(translate(lang, 'story.studio.error.upload'));
      studioDraftStore.set(snapshotOfDraft(draft));
      return;
    }

    const backgroundReady =
      backgroundResult !== null && backgroundResult.ok
        ? { postMediaId: backgroundResult.data.postMediaId, fileUrl: backgroundResult.data.fileUrl }
        : undefined;
    const soundReady =
      soundResult !== null && soundResult.ok ? { postMediaId: soundResult.data.postMediaId, fileUrl: soundResult.data.fileUrl } : undefined;

    const trimmedText = draft.text.trim();
    const effects = buildStoryCanvasEffects({
      text: trimmedText,
      locale: language,
      ...(backgroundReady !== undefined ? { background: { ready: backgroundReady, mediaType: draft.background!.mediaType } } : {}),
      ...(soundReady !== undefined ? { sound: { ready: soundReady } } : {}),
    });

    if (effects === null) {
      // `canPublishStudioDraft` l'écarte déjà — filet, jamais un envoi vide.
      setPublishing(false);
      return;
    }

    const result = await publishStory({
      transport: deps.transport,
      content: trimmedText,
      ...(trimmedText !== '' ? { originalLanguage: language } : {}),
      storyEffects: effects,
      mediaIds: studioMediaIds({ background: backgroundReady, sound: soundReady }),
    });

    setPublishing(false);

    if (!result.ok) {
      setPublishError(sendFailureReason(result) ?? translate(lang, 'story.studio.error.publish'));
      studioDraftStore.set(snapshotOfDraft(draft));
      return;
    }

    studioDraftStore.clear();
    revokeIfLocal(draft.background?.previewUrl);
    revokeIfLocal(draft.sound?.previewUrl);
    await appQueryClient.invalidateQueries({ queryKey: STORIES_QUERY_PREFIX });
    navigate(href('stories'));
  }

  const disabled = !canPublishStudioDraft(draft) || publishing;

  return (
    <main className="flex h-dvh flex-col overflow-hidden pt-safe">
      <header className="flex shrink-0 items-center gap-3 px-4 pt-3 pb-2">
        <Link
          to="list"
          aria-label={translate(lang, 'story.studio.cancel')}
          className="grid size-11 shrink-0 place-items-center rounded-chip focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{ outlineColor: 'var(--color-ios-brand)' }}
        >
          <Glyph name="x" size={18} />
        </Link>
        <h1 className="flex-1 text-body font-semibold" style={{ color: 'var(--color-ios-ink-1)' }}>
          {translate(lang, 'story.studio.title')}
        </h1>
        <button
          type="button"
          onClick={() => void publish()}
          disabled={disabled}
          className="grid place-items-center rounded-chip px-4 py-2 text-body font-semibold text-white disabled:opacity-40"
          style={{ background: 'var(--color-ios-brand)', minHeight: 44 }}
        >
          {publishing ? translate(lang, 'story.studio.publishing') : translate(lang, 'story.studio.publish')}
        </button>
      </header>

      {!online ? (
        <p role="status" className="shrink-0 px-4 pb-2 text-check" style={{ color: 'var(--color-ios-ink-2)' }}>
          {translate(lang, 'story.studio.offline')}
        </p>
      ) : null}

      <div className="flex flex-1 gap-3 overflow-hidden px-4 pb-3">
        {/* LE COULOIR GAUCHE — ce qui pose un objet SUR la scène (§1.7 du
            modèle de composeur : « à GAUCHE ce qu'on POSE sur la scène »). */}
        <div className="flex shrink-0 flex-col items-center gap-2 pt-2">
          <RailButton
            label={translate(lang, 'story.studio.background.add')}
            glyph="image"
            accept="image/*,video/*"
            onSelect={selectBackground}
          />
          <RailButton label={translate(lang, 'story.studio.sound.add')} glyph="microphone" accept="audio/*" onSelect={selectSound} />
        </div>

        {/* LA SCÈNE — carte 9:16, centrée (§1.7, la même carte que le
            lecteur, `readerCardFraming`). */}
        <div className="flex flex-1 flex-col items-center justify-center gap-2 overflow-hidden">
          <div
            data-scene-stage
            className="relative overflow-hidden rounded-card"
            style={{ aspectRatio: '9 / 16', height: 'min(70dvh, 100%)', maxWidth: '100%', background: 'var(--color-ios-card)' }}
          >
            {previewDocument !== null ? (
              <Suspense fallback={null}>
                <ScenePlayer
                  document={previewDocument}
                  sceneIndex={0}
                  mode="preview"
                  playing={false}
                  carrier={{ postId: 'draft', media: [] }}
                  preferredLanguages={reader.languages}
                />
              </Suspense>
            ) : null}
            <label htmlFor="story-studio-text" className="offscreen">
              {translate(lang, 'story.studio.text.label')}
            </label>
            {/* Le BLANC suppose une photo/vidéo DERRIÈRE (comme le texte publié,
                `TEXT_COLOR` de `story-document.ts`) : sur la carte VIDE (aplat
                clair du thème), il devient illisible — mesuré au premier rendu,
                capture claire, contraste proche de 1:1. Sans fond, le texte suit
                l'encre du thème comme n'importe quel champ de l'écran. */}
            <textarea
              id="story-studio-text"
              data-story-text-input
              value={draft.text}
              onInput={(e) => onTextChange(e.currentTarget.value)}
              placeholder={translate(lang, 'story.studio.text.placeholder')}
              rows={3}
              className={`absolute inset-x-4 top-1/2 resize-none bg-transparent text-center font-semibold ${
                draft.background !== null ? 'placeholder:text-white/70' : 'placeholder:text-ios-ink-3'
              }`}
              style={{
                transform: 'translateY(-50%)',
                color: draft.background !== null ? '#fff' : 'var(--color-ios-ink-1)',
                ...(draft.background !== null ? { textShadow: '0 1px 4px rgba(0,0,0,0.6)' } : {}),
              }}
            />
          </div>

          <div className="flex w-full flex-col gap-1">
            {draft.background !== null ? (
              <AssetStatusRow
                lang={lang}
                phase={draft.background.upload.phase}
                reason={draft.background.upload.phase === 'failed' ? draft.background.upload.reason : undefined}
                onRetry={draft.background.file !== undefined ? retryBackground : undefined}
                onRemove={removeBackground}
              />
            ) : null}
            {draft.sound !== null ? (
              <AssetStatusRow
                lang={lang}
                phase={draft.sound.upload.phase}
                reason={draft.sound.upload.phase === 'failed' ? draft.sound.upload.reason : undefined}
                onRetry={draft.sound.file !== undefined ? retrySound : undefined}
                onRemove={removeSound}
              />
            ) : null}
          </div>

          <p className="text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
            {translate(lang, 'story.studio.hint.duration')}
          </p>
          {publishError !== null ? (
            <p role="alert" className="text-check" style={{ color: 'var(--ios-error)' }}>
              {publishError}
            </p>
          ) : null}
        </div>
      </div>
    </main>
  );
}
