import { useQuery, type QueryKey } from '@tanstack/react-query';
import { Suspense, useMemo, useState, type KeyboardEvent } from 'react';

import { AdminGlyph } from '@/components/admin/admin-glyph';
import { AdminInterpretedBadge } from '@/components/admin/badges';
import { AdminLink } from '@/components/admin/entity-chip';
import { AdminErrorState, AdminSkeleton } from '@/components/admin/states';
import { BRAND, EDGE, INK, INK2, SURFACE } from '@/components/admin/tone';
import { lazyScenePlayer } from '@/components/scene-player-lazy';
import { Sheet } from '@/components/sheet';
import { interpretPostState, interpretPostType } from '@/lib/admin/interpret/enums';
import { personLabel } from '@/lib/admin/interpret/labels';
import { postStateOf } from '@/lib/admin/post-state';
import { neighborsOf, previewKeyOf, previewPlanOf, sceneCarrierOf, type PreviewMediaItem } from '@/lib/admin/post-preview';
import type { PostGestureIntent } from '@/lib/admin/post-gestures';
import { unwrap } from '@/lib/api/client';
import type { AdminDeps } from '@/lib/api/admin';
import { adminPostQueryKey, loadAdminPost, type AdminPostFiche } from '@/lib/api/admin-posts-detail';
import { apiDeps } from '@/lib/api/deps';
import { attachmentSrc } from '@/lib/api/media-url';
import { translateAdmin, type AdminLanguage } from '@/lib/i18n-admin-catalog';
import type { AnnouncementTone } from '@/lib/view/use-live-announcer';

import { AdminPostGestureBar } from './admin-post-gestures';

/**
 * **LE CONTENU ENTIER D'UNE PUBLICATION, SANS QUITTER LA LISTE** (#10393) — la feuille
 * d'aperçu ouverte depuis une ligne : le texte entier, la vidéo LUE, l'audio lu, les
 * images en plein format, et la scène d'une story ou d'un réel rendue par le lecteur
 * de scène de l'application (le même que le fil). Les gestes de la ligne y sont, et
 * « précédente » / « suivante » (boutons, j / k, flèches) passent d'une publication à
 * l'autre de la page sans fermer.
 *
 * La lecture est celle de la fiche (`GET /admin/posts/:postId`, `canModerateContent`) :
 * une publication déjà ouverte se montre depuis le cache, sans attente.
 */
const ScenePlayer = lazyScenePlayer.Component;
const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2';

export function AdminPostPreview({
  language,
  postId,
  rows,
  onNavigate,
  onClose,
  onAnnounce,
  listOptimistic,
  deps = apiDeps,
  now = new Date(),
}: {
  readonly language: AdminLanguage;
  readonly postId: string;
  /** La page de liste : la précédente et la suivante s'y lisent. */
  readonly rows: readonly { readonly id: string }[];
  readonly onNavigate: (postId: string) => void;
  readonly onClose: () => void;
  readonly onAnnounce: (message: string, tone?: AnnouncementTone) => void;
  readonly listOptimistic?: { readonly key: QueryKey; readonly apply: (before: unknown, postId: string, intent: PostGestureIntent, now: Date) => unknown };
  readonly deps?: AdminDeps;
  readonly now?: Date;
}) {
  const query = useQuery({
    queryKey: adminPostQueryKey(postId),
    queryFn: async ({ signal }) => unwrap(await loadAdminPost({ ...deps, postId, signal })),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    retry: false,
  });
  const { previous, next } = neighborsOf(rows, postId);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    const typing = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT';
    const media = target.tagName === 'VIDEO' || target.tagName === 'AUDIO';
    const move = previewKeyOf(event.key);
    if (move === null || typing || (media && event.key.startsWith('Arrow'))) return;
    const destination = move === 'next' ? next : previous;
    if (destination === null) return;
    event.preventDefault();
    onNavigate(destination);
  };

  const fiche = query.data ?? null;

  return (
    <Sheet title={translateAdmin(language, 'admin.gesture.preview.title')} presentation="wide" bodyAs="div" closeLabel={translateAdmin(language, 'admin.kit.close')} onClose={onClose}>
      <div data-admin-post-preview={postId} onKeyDown={onKeyDown} className="@container grid content-start gap-4 px-4 pb-4 pt-2">
        <nav className="flex flex-wrap items-center justify-between gap-2" aria-label={translateAdmin(language, 'admin.gesture.preview.title')}>
          <span className="flex gap-2">
            <NavButton label={translateAdmin(language, 'admin.gesture.preview.previous')} glyph="caretLeft" target={previous} onNavigate={onNavigate} anchor="previous" />
            <NavButton label={translateAdmin(language, 'admin.gesture.preview.next')} glyph="caretRight" target={next} onNavigate={onNavigate} anchor="next" />
          </span>
          <span className="text-caption" style={{ color: INK2 }}>
            {translateAdmin(language, 'admin.gesture.preview.keys')}
          </span>
        </nav>
        {fiche === null ? (
          query.isPending ? (
            <AdminSkeleton rows={4} />
          ) : (
            <AdminErrorState language={language} onRetry={() => void query.refetch()} />
          )
        ) : (
          <PreviewBody
            language={language}
            fiche={fiche}
            now={now}
            deps={deps}
            onAnnounce={onAnnounce}
            {...(listOptimistic === undefined ? {} : { listOptimistic })}
          />
        )}
      </div>
    </Sheet>
  );
}

function NavButton({
  label,
  glyph,
  target,
  onNavigate,
  anchor,
}: {
  readonly label: string;
  readonly glyph: 'caretLeft' | 'caretRight';
  readonly target: string | null;
  readonly onNavigate: (postId: string) => void;
  readonly anchor: string;
}) {
  return (
    <button
      type="button"
      data-admin-preview-nav={anchor}
      aria-label={label}
      title={label}
      disabled={target === null}
      onClick={() => target !== null && onNavigate(target)}
      className={`inline-flex items-center justify-center rounded-chip ${FOCUS}`}
      style={{ minWidth: 44, minHeight: 44, color: target === null ? INK2 : INK, backgroundColor: SURFACE, border: `1px solid ${EDGE}`, outlineColor: BRAND, opacity: target === null ? 0.5 : 1 }}
    >
      <AdminGlyph name={glyph} size={20} />
    </button>
  );
}

function PreviewBody({
  language,
  fiche,
  now,
  deps,
  onAnnounce,
  listOptimistic,
}: {
  readonly language: AdminLanguage;
  readonly fiche: AdminPostFiche;
  readonly now: Date;
  readonly deps: AdminDeps;
  readonly onAnnounce: (message: string, tone?: AnnouncementTone) => void;
  readonly listOptimistic?: { readonly key: QueryKey; readonly apply: (before: unknown, postId: string, intent: PostGestureIntent, now: Date) => unknown };
}) {
  const plan = previewPlanOf({ type: fiche.type, canvas: fiche.canvas, media: fiche.media });
  const state = postStateOf(fiche, now);
  const author = fiche.author === null ? personLabel(null, language) : personLabel(fiche.author, language);

  return (
    <article className="grid gap-4" data-admin-preview-plan={plan.kind}>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <span className="grid gap-1">
          <span className="text-body font-semibold" style={{ color: INK }}>
            {author}
          </span>
          <span className="flex flex-wrap gap-1">
            <AdminInterpretedBadge value={interpretPostType(fiche.type, language)} />
            <AdminInterpretedBadge value={interpretPostState(state, language)} />
          </span>
        </span>
        <AdminLink target={{ kind: 'entity', entity: 'post', id: fiche.id }} anchor="preview-fiche" className={`inline-flex items-center rounded-chip px-3 text-body font-medium ${FOCUS}`} style={{ minHeight: 44, color: BRAND }}>
          {translateAdmin(language, 'admin.gesture.preview.fiche')}
        </AdminLink>
      </header>
      <AdminPostGestureBar
        language={language}
        post={{ id: fiche.id, state, visibility: fiche.visibility, moderationPriorVisibility: fiche.moderationPriorVisibility }}
        onAnnounce={onAnnounce}
        deps={deps}
        {...(listOptimistic === undefined ? {} : { optimistic: { key: listOptimistic.key, apply: (before, intent, at) => listOptimistic.apply(before, fiche.id, intent, at) } })}
        invalidate={[['admin', 'posts']]}
      />
      {fiche.content === null ? null : (
        <p data-admin-preview-text className="whitespace-pre-wrap break-words text-body" style={{ color: INK }}>
          {fiche.moodEmoji === null ? '' : `${fiche.moodEmoji} `}
          {fiche.content}
        </p>
      )}
      {plan.kind === 'scene' ? (
        <PreviewScene language={language} fiche={fiche} mode={plan.mode} />
      ) : plan.kind === 'media' ? (
        <div className="grid gap-3">
          {plan.items.map((item) => (
            <PreviewMedia key={item.id} language={language} item={item} />
          ))}
        </div>
      ) : fiche.content === null ? (
        <p className="text-caption" style={{ color: INK2 }}>
          {translateAdmin(language, 'admin.gesture.preview.empty')}
        </p>
      ) : null}
    </article>
  );
}

function PreviewMedia({ language, item }: { readonly language: AdminLanguage; readonly item: PreviewMediaItem }) {
  const src = attachmentSrc(item.src);
  const poster = item.poster === null ? undefined : attachmentSrc(item.poster);
  const frame = { backgroundColor: SURFACE, border: `1px solid ${EDGE}` } as const;
  switch (item.player) {
    case 'video':
      return (
        <video data-admin-preview-media="video" src={src} poster={poster} controls autoPlay muted playsInline preload="metadata" className="block max-h-[70vh] w-full rounded-card object-contain" style={frame} />
      );
    case 'audio':
      return <audio data-admin-preview-media="audio" src={src} controls preload="metadata" className="w-full" style={{ minHeight: 44 }} />;
    case 'image':
      return <img data-admin-preview-media="image" src={src} alt="" decoding="async" className="block max-h-[80vh] w-full rounded-card object-contain" style={frame} />;
    case 'file':
      return (
        <a data-admin-preview-media="file" href={src} target="_blank" rel="noreferrer" className={`inline-flex items-center gap-2 rounded-chip px-3 ${FOCUS}`} style={{ minHeight: 44, color: BRAND, outlineColor: BRAND }}>
          <AdminGlyph name="file" size={18} />
          {translateAdmin(language, 'admin.gesture.preview.file')}
        </a>
      );
  }
}

function PreviewScene({ language, fiche, mode }: { readonly language: AdminLanguage; readonly fiche: AdminPostFiche; readonly mode: 'story' | 'reel' | 'card' }) {
  const document = fiche.canvas;
  const carrier = useMemo(() => sceneCarrierOf(fiche.id, fiche.media, attachmentSrc), [fiche.id, fiche.media]);
  const [sceneIndex, setSceneIndex] = useState(0);
  if (document === null) return null;
  const count = document.scenes.length;
  const index = Math.min(sceneIndex, count - 1);

  return (
    <div className="grid justify-items-center gap-2" data-admin-preview-scene={mode}>
      <div className="relative overflow-hidden rounded-card" style={{ aspectRatio: '9 / 16', height: 'min(70vh, 640px)', backgroundColor: '#000' }}>
        <Suspense fallback={<AdminSkeleton rows={2} />}>
          <ScenePlayer key={`${fiche.id}-${index}`} document={document} sceneIndex={index} mode={mode} playing carrier={carrier} preferredLanguages={[language]} />
        </Suspense>
      </div>
      {count < 2 ? null : (
        <span className="flex items-center gap-2">
          <button
            type="button"
            aria-label={translateAdmin(language, 'admin.gesture.preview.scenePrevious')}
            disabled={index === 0}
            onClick={() => setSceneIndex(index - 1)}
            className={`inline-flex items-center justify-center rounded-chip ${FOCUS}`}
            style={{ minWidth: 44, minHeight: 44, color: INK }}
          >
            <AdminGlyph name="caretLeft" size={18} />
          </button>
          <span className="text-caption tabular-nums" style={{ color: INK2 }} data-admin-preview-scene-index>
            {translateAdmin(language, 'admin.gesture.preview.scene', { index: String(index + 1), count: String(count) })}
          </span>
          <button
            type="button"
            aria-label={translateAdmin(language, 'admin.gesture.preview.sceneNext')}
            disabled={index >= count - 1}
            onClick={() => setSceneIndex(index + 1)}
            className={`inline-flex items-center justify-center rounded-chip ${FOCUS}`}
            style={{ minWidth: 44, minHeight: 44, color: INK }}
          >
            <AdminGlyph name="caretRight" size={18} />
          </button>
        </span>
      )}
    </div>
  );
}
