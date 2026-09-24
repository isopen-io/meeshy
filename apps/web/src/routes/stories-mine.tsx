import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from 'zustand';

import { Glyph, GlyphSvg } from '@/components/glyph';
import { STORIES_MINE_GLYPHS } from '@/components/glyphs-stories-mine';
import { PublicationViewersSheetPortal } from '@/components/publication-viewers-sheet-lazy';
import { apiDeps } from '@/lib/api/deps';
import { deletePostAction, useStoryTray } from '@/lib/api/query';
import { sessionStore } from '@/lib/api/session';
import type { StoryTrayPost } from '@/lib/api/stories';
import { resolveViewer } from '@/lib/api/viewer';
import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage, type InterfaceLanguage } from '@/lib/interface-language';
import { myActiveStories, myStoryDateLabel, myStoryThumbnail, type MyStoryThumbnail } from '@/lib/view/my-stories';
import { useBackDismiss } from '@/lib/view/use-back-dismiss';
import { useCommentsSheetHost } from '@/lib/view/use-comments-sheet-host';
import { useLiveAnnouncer } from '@/lib/view/use-live-announcer';
import { Link } from '@/routes/route-table';

import { StoriesHeader, StoriesLoadError, StoriesLoading } from './stories-parts';

/**
 * **« MES STORIES »** (#6149) — le listing que la pastille « moi » du rail
 * ouvre désormais, TOUJOURS, dès que j'ai publié au moins une story (miroir
 * `MyStoriesView.swift`, `ConversationListView.swift:1394-1397`). Voir la
 * spécification #6149 pour le tableau complet des équivalences iOS → web.
 *
 * **LE MÊME CACHE QUE LE RAIL** (`useStoryTray`, `STORY_TRAY_QUERY_KEY`) —
 * arriver ici depuis `/` ne déclenche AUCUNE requête et n'affiche AUCUN
 * squelette (cache-first, § Instant App Principles) : `myActiveStories` en
 * est une PROJECTION pure, jamais un second port réseau pour la même donnée.
 *
 * **SUPPRIMER EST LE MÊME GESTE QUE LE MENU « ⋯ » D'UNE CARTE DU FLUX**
 * (`deletePostAction`, `story-caches.ts`) : optimiste, et un refus RELIT
 * `STORIES_QUERY_PREFIX` — la story revient au listing exactement comme une
 * carte revient au Flux (écart assumé avec iOS, qui attend le serveur avant
 * de purger, `StoryViewModel.swift:470-481`).
 *
 * **SEUL L'ONGLET « PUBLIÉES » EST PORTÉ** — File / Brouillons / Archive
 * restent des issues compagnons (§ 1.2 de la spécification) : aucun `Picker`
 * n'est rendu tant qu'il n'y a qu'un seul corpus à montrer.
 */

function ThumbnailImage({ thumbnail }: { readonly thumbnail: MyStoryThumbnail }) {
  if (thumbnail.kind === 'placeholder') {
    return (
      <span
        aria-hidden="true"
        data-my-story-thumb-placeholder
        className="grid h-full w-full place-items-center"
        style={{ background: 'color-mix(in srgb, var(--color-ios-brand) 20%, transparent)' }}
      >
        <Glyph name="image" size={28} style={{ color: 'var(--color-ios-brand)' }} />
      </span>
    );
  }
  return (
    <img
      src={thumbnail.url}
      alt=""
      className="h-full w-full object-cover"
      style={
        thumbnail.placeholder === undefined
          ? undefined
          : { backgroundImage: `url("${thumbnail.placeholder}")`, backgroundSize: 'cover' }
      }
    />
  );
}

/**
 * **LA BANDE À TROIS ACTIONS** (#6149) — Ouvrir (`fillPlay`, socle) · Vues
 * (`eye`, socle, compte affiché SEULEMENT si `> 0` — jamais de « 0 »
 * décoratif, `MyStoryActionBar.swift:69`) · Supprimer (`trash`, jeu propre à
 * cet écran). Trois actions tiennent dans la bande sans menu « ⋯ » : un menu
 * de trois lignes ajouterait un geste (dimension 7) là où iOS en dispensait
 * l'auteur d'un tap de plus sur les trois qui comptent le plus.
 */
export function MyStoryCard({
  story,
  language,
  now,
  onOpenViews,
  onRequestDelete,
  deleteDisabled,
}: {
  readonly story: StoryTrayPost;
  readonly language: InterfaceLanguage;
  readonly now: Date;
  readonly onOpenViews: (postId: string) => void;
  readonly onRequestDelete: (postId: string) => void;
  readonly deleteDisabled: boolean;
}) {
  const thumbnail = myStoryThumbnail(story.media);
  const dateLabel = myStoryDateLabel(new Date(story.createdAt), now, language);
  const viewCount = story.viewCount ?? 0;
  const viewsLabel =
    viewCount > 0
      ? translate(language, viewCount === 1 ? 'story.views.count.one' : 'story.views.count.other', { count: String(viewCount) })
      : translate(language, 'story.action.views');

  return (
    <li data-my-story={story.id} className="flex flex-col gap-1.5">
      <Link
        to="story"
        params={{ post: story.id }}
        aria-label={dateLabel}
        data-my-story-open
        className="block overflow-hidden rounded-card focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{ aspectRatio: '9 / 16', outlineColor: 'var(--color-ios-brand)' }}
      >
        <ThumbnailImage thumbnail={thumbnail} />
      </Link>

      <div className="flex items-center justify-between" data-my-story-actions>
        <Link
          to="story"
          params={{ post: story.id }}
          aria-label={translate(language, 'storiesMine.action.open')}
          data-my-story-open-action
          className="grid place-items-center rounded-chip"
          style={{ minWidth: 44, minHeight: 44, color: 'var(--color-ios-ink-2)' }}
        >
          <Glyph name="fillPlay" size={20} />
        </Link>

        <button
          type="button"
          onClick={() => onOpenViews(story.id)}
          aria-label={viewsLabel}
          data-my-story-views
          className="flex items-center gap-1 rounded-chip"
          style={{ minWidth: 44, minHeight: 44, color: 'var(--color-ios-ink-2)' }}
        >
          <Glyph name="eye" size={20} />
          {viewCount > 0 ? <span className="text-check">{viewCount}</span> : null}
        </button>

        <button
          type="button"
          onClick={() => onRequestDelete(story.id)}
          disabled={deleteDisabled}
          aria-label={translate(language, 'storiesMine.action.delete')}
          data-my-story-delete
          className="grid place-items-center rounded-chip disabled:opacity-40"
          style={{ minWidth: 44, minHeight: 44, color: 'var(--color-error)' }}
        >
          <GlyphSvg glyph={STORIES_MINE_GLYPHS.trash} size={20} />
        </button>
      </div>

      <span data-my-story-date className="truncate text-check" style={{ color: 'var(--color-ios-ink-2)' }}>
        {dateLabel}
      </span>
    </li>
  );
}

export function MyStoriesEmpty({ language }: { readonly language: InterfaceLanguage }) {
  return (
    <div className="grid flex-1 content-center justify-items-center gap-3 px-6 py-12 text-center" data-my-stories-empty>
      <p className="text-body font-semibold" style={{ color: 'var(--color-ios-ink)' }}>
        {translate(language, 'storiesMine.empty.title')}
      </p>
      <p className="text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
        {translate(language, 'storiesMine.empty.subtitle')}
      </p>
      <Link
        to="storyCompose"
        className="grid place-items-center rounded-chip px-5 py-2 text-body font-semibold text-white"
        style={{ background: 'var(--color-ios-brand)' }}
      >
        {translate(language, 'stories.create')}
      </Link>
    </div>
  );
}

export function MyStoriesList({
  stories,
  language,
  now,
  onOpenViews,
  onRequestDelete,
  deleteDisabled,
}: {
  readonly stories: readonly StoryTrayPost[];
  readonly language: InterfaceLanguage;
  readonly now: Date;
  readonly onOpenViews: (postId: string) => void;
  readonly onRequestDelete: (postId: string) => void;
  readonly deleteDisabled: boolean;
}) {
  return (
    <ul
      className="grid gap-3 py-2 pb-6"
      style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}
      data-my-stories-list
    >
      {stories.map((story) => (
        <MyStoryCard
          key={story.id}
          story={story}
          language={language}
          now={now}
          onOpenViews={onOpenViews}
          onRequestDelete={onRequestDelete}
          deleteDisabled={deleteDisabled}
        />
      ))}
    </ul>
  );
}

/**
 * LA CONFIRMATION DE « SUPPRIMER » — même dispositif qu'iOS
 * (`MyStoriesDeleteConfirmation.swift:19-38`) : un `<dialog>` modal, fermé
 * aussi par le retour matériel d'Android (`useBackDismiss`). Le texte dit ce
 * que le geste FAIT — la story cesse d'être visible par quiconque — sans
 * promettre plus que ce qu'il tient.
 */
function DeleteConfirmDialog({
  language,
  busy,
  onConfirm,
  onCancel,
}: {
  readonly language: InterfaceLanguage;
  readonly busy: boolean;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useBackDismiss(onCancel);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog === null) return undefined;
    if (!dialog.open && typeof dialog.showModal === 'function') dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      data-my-story-delete-dialog
      aria-labelledby="my-story-delete-title"
      aria-describedby="my-story-delete-body"
      onClose={onCancel}
      className="m-auto w-[min(26rem,calc(100%-2rem))] rounded-[24px] p-0 backdrop:bg-black/40"
      style={{ backgroundColor: 'var(--color-ios-card)', color: 'var(--color-ios-ink)', border: 0 }}
    >
      <div className="grid gap-3 p-5">
        <h2 id="my-story-delete-title" className="text-thread font-extrabold">
          {translate(language, 'storiesMine.delete.title')}
        </h2>
        <p id="my-story-delete-body" className="text-body" style={{ color: 'var(--color-ios-ink-2)' }}>
          {translate(language, 'storiesMine.delete.body')}
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            data-my-story-delete-cancel
            className="rounded-chip font-semibold"
            style={{ minHeight: 48, color: 'var(--color-ios-ink)', border: '1.5px solid var(--color-ios-ink-3)' }}
          >
            {translate(language, 'common.cancel')}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            data-my-story-delete-confirm
            className="rounded-chip font-semibold disabled:opacity-60"
            style={{ minHeight: 48, color: 'white', background: 'var(--color-error)' }}
          >
            {translate(language, 'storiesMine.action.delete')}
          </button>
        </div>
      </div>
    </dialog>
  );
}

export default function StoriesMineScreen() {
  const language = currentInterfaceLanguage();
  const session = useStore(sessionStore, (s) => s.session);
  const viewer = useMemo(() => resolveViewer({ source: apiDeps.source, session }), [session]);
  const tray = useStoryTray();
  const viewsHost = useCommentsSheetHost(undefined);
  const { text: announcement, tone, announce } = useLiveAnnouncer();
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [busyDeleteId, setBusyDeleteId] = useState<string | null>(null);

  const mine = useMemo(
    () => myActiveStories({ stories: tray.data ?? [], viewerId: viewer.id ?? undefined, now: Date.now() }),
    [tray.data, viewer.id],
  );

  const requestDelete = useCallback((postId: string) => setPendingDeleteId(postId), []);
  const cancelDelete = useCallback(() => setPendingDeleteId(null), []);
  const confirmDelete = useCallback(() => {
    const postId = pendingDeleteId;
    if (postId === null) return;
    setBusyDeleteId(postId);
    void deletePostAction(postId).then((result) => {
      setBusyDeleteId(null);
      setPendingDeleteId(null);
      announce(
        translate(language, result === 'done' ? 'storiesMine.delete.success' : 'storiesMine.delete.failure'),
        result === 'done' ? 'neutral' : 'error',
      );
    });
  }, [pendingDeleteId, announce, language]);

  const chargement = tray.data === undefined && !tray.isError;
  const openViewCount = mine.find((story) => story.id === viewsHost.postId)?.viewCount ?? null;

  return (
    <main className="flex h-dvh flex-col overflow-hidden pt-safe">
      <StoriesHeader language={language} title={translate(language, 'storiesMine.title')} />
      <p role="status" aria-live="polite" className="sr-only" data-tone={tone}>
        {announcement}
      </p>

      <div className="scrollbar-none flex-1 overflow-y-auto px-4 pb-safe">
        {chargement ? (
          <StoriesLoading language={language} />
        ) : tray.isError ? (
          <StoriesLoadError language={language} />
        ) : mine.length === 0 ? (
          <MyStoriesEmpty language={language} />
        ) : (
          <MyStoriesList
            stories={mine}
            language={language}
            now={new Date()}
            onOpenViews={viewsHost.open}
            onRequestDelete={requestDelete}
            deleteDisabled={busyDeleteId !== null}
          />
        )}
      </div>

      {pendingDeleteId === null ? null : (
        <DeleteConfirmDialog
          language={language}
          busy={busyDeleteId === pendingDeleteId}
          onConfirm={confirmDelete}
          onCancel={cancelDelete}
        />
      )}

      <PublicationViewersSheetPortal host={viewsHost} viewCount={openViewCount} />
    </main>
  );
}
