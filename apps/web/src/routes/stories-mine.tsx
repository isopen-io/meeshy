import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from 'zustand';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { Glyph, GlyphSvg } from '@/components/glyph';
import { STORIES_MINE_GLYPHS } from '@/components/glyphs-stories-mine';
import { LiveAnnouncement } from '@/components/live-announcement';
import { PublicationViewersSheetPortal } from '@/components/publication-viewers-sheet-lazy';
import { apiDeps } from '@/lib/api/deps';
import type { PostActionOutcome } from '@/lib/api/publication-actions';
import { deletePostAction, useStoryTray } from '@/lib/api/query';
import { sessionStore } from '@/lib/api/session';
import type { StoryTrayPost } from '@/lib/api/stories';
import { resolveViewer } from '@/lib/api/viewer';
import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage, type InterfaceLanguage } from '@/lib/interface-language';
import { useOnline } from '@/lib/net/online';
import { myActiveStories, myStoryDateLabel, myStoryThumbnail, type MyStoryThumbnail } from '@/lib/view/my-stories';
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
 * **LA CONFIRMATION SE FERME AU GESTE** (revue-correction #6149) : la rangée
 * quitte le listing ET la modale se retire dans le MÊME rendu — une modale
 * restée ouverte sur un bouton grisé jusqu'à la réponse réseau n'était pas un
 * geste optimiste, c'était une attente déguisée. Les suppressions ne se
 * sérialisent pas : `deletePost` réapplique son retrait à la confirmation,
 * une relecture concurrente ne ressuscite donc rien.
 *
 * **HORS LIGNE, « SUPPRIMER » S'ÉTEINT ET L'ÉCRAN LE DIT AVANT LE GESTE**
 * (D-83, § 0 de la spécification) : le retour en arrière d'un refus est une
 * RELECTURE, qu'aucun réseau ne pourrait servir — un retrait optimiste hors
 * ligne laisserait la rangée disparue sur une story restée en ligne.
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
      loading="lazy"
      decoding="async"
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

  /* LA CARTE EST UNE SURFACE, ET TOUT Y VIT (`MyStoryCard.swift:75-100`) :
     `VStack { vignette, bande, date }` sous UN rectangle arrondi rempli qui
     rogne la vignette — jamais une vignette arrondie seule, avec une bande et
     une date posées à côté, sur le fond de la page. */
  return (
    <li
      data-my-story={story.id}
      className="flex flex-col overflow-hidden rounded-card"
      style={{ backgroundColor: 'var(--color-ios-card)' }}
    >
      {/* `?scope=mine` (revue de #6149, défaut majeur 3) — mesuré au
          navigateur : sans lui, le lecteur poursuivait sur les stories
          D'AUTRES auteurs une fois mon groupe épuisé. Miroir
          `StoryViewerRequest(singleGroup: true)` (`StoryTrayView.swift:75`) :
          `scopeToSingleGroup` (`lib/stories/playback.ts`) referme le lecteur
          en fin de MON groupe. */}
      <Link
        to="story"
        params={{ post: story.id }}
        search={{ scope: 'mine' }}
        aria-label={dateLabel}
        data-my-story-open
        className="block focus-visible:outline-2 focus-visible:-outline-offset-2"
        style={{ aspectRatio: '9 / 16', outlineColor: 'var(--color-ios-brand)' }}
      >
        <ThumbnailImage thumbnail={thumbnail} />
      </Link>

      <div className="flex items-center justify-between px-1" data-my-story-actions>
        <Link
          to="story"
          params={{ post: story.id }}
          search={{ scope: 'mine' }}
          aria-label={translate(language, 'storiesMine.action.open')}
          data-my-story-open-action
          className="grid place-items-center rounded-chip focus-visible:outline-2"
          style={{ minWidth: 44, minHeight: 44, color: 'var(--color-ios-ink-2)', outlineColor: 'var(--color-ios-brand)' }}
        >
          <Glyph name="fillPlay" size={20} />
        </Link>

        <button
          type="button"
          onClick={() => onOpenViews(story.id)}
          aria-label={viewsLabel}
          data-my-story-views
          className="flex items-center justify-center gap-1 rounded-chip focus-visible:outline-2"
          style={{ minWidth: 44, minHeight: 44, color: 'var(--color-ios-ink-2)', outlineColor: 'var(--color-ios-brand)' }}
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
          className="grid place-items-center rounded-chip focus-visible:outline-2 disabled:opacity-40"
          style={{ minWidth: 44, minHeight: 44, color: 'var(--color-error)', outlineColor: 'var(--color-error)' }}
        >
          <GlyphSvg glyph={STORIES_MINE_GLYPHS.trash} size={20} />
        </button>
      </div>

      <span data-my-story-date className="truncate px-2 pb-2 text-check" style={{ color: 'var(--color-ios-ink-2)' }}>
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

/** Le geste de suppression, injectable pour que le témoin de rendu fasse
 * répondre la passerelle comme il l'entend (refus, attente) sans toucher au
 * client de requêtes global. Par défaut : le MÊME geste que le menu « ⋯ »
 * d'une carte du Flux. */
export type RemoveStory = (postId: string) => Promise<PostActionOutcome>;

export function StoriesMineView({ remove = deletePostAction }: { readonly remove?: RemoveStory }) {
  const language = currentInterfaceLanguage();
  const session = useStore(sessionStore, (s) => s.session);
  const viewer = useMemo(() => resolveViewer({ source: apiDeps.source, session }), [session]);
  const tray = useStoryTray();
  const online = useOnline();
  const viewsHost = useCommentsSheetHost(undefined);
  const { text: announcement, tone, announce } = useLiveAnnouncer();
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [focusTitleTick, setFocusTitleTick] = useState(0);

  const mine = useMemo(
    () => myActiveStories({ stories: tray.data ?? [], viewerId: viewer.id ?? undefined, now: Date.now() }),
    [tray.data, viewer.id],
  );

  /* LE FOCUS NE TOMBE PAS SUR `<body>` : le bouton qui avait ouvert la
     confirmation vient de quitter l'écran avec sa rangée — le dialogue
     n'a plus où le rendre. Le titre le reçoit, APRÈS le rendu qui retire la
     modale (un effet, jamais dans le gestionnaire : la fermeture du dialogue
     rendrait sinon le focus à un nœud détaché, par-dessus). */
  useEffect(() => {
    if (focusTitleTick > 0) titleRef.current?.focus();
  }, [focusTitleTick]);

  const requestDelete = useCallback((postId: string) => setPendingDeleteId(postId), []);
  const cancelDelete = useCallback(() => setPendingDeleteId(null), []);
  const confirmDelete = useCallback(() => {
    const postId = pendingDeleteId;
    setPendingDeleteId(null);
    if (postId === null || !online) return;
    setFocusTitleTick((tick) => tick + 1);
    void remove(postId).then((result) => {
      announce(
        translate(language, result === 'done' ? 'storiesMine.delete.success' : 'storiesMine.delete.failure'),
        result === 'done' ? 'neutral' : 'error',
      );
    });
  }, [pendingDeleteId, online, remove, announce, language]);

  const chargement = tray.data === undefined && !tray.isError;
  const openViewCount = mine.find((story) => story.id === viewsHost.postId)?.viewCount ?? null;

  return (
    <main className="relative flex h-dvh flex-col overflow-hidden pt-safe">
      <StoriesHeader
        language={language}
        title={translate(language, 'storiesMine.title')}
        titleRef={titleRef}
        action={
          /* LE (+) DE LA BARRE (`MyStoriesView.swift:174-186`) : iOS le pose
             en tête de barre parce qu'une feuille n'a pas de retour ; ici le
             début de ligne porte déjà le retour, le (+) prend la fin. Disque
             de 32 dans une cible de 44. */
          <Link
            to="storyCompose"
            aria-label={translate(language, 'stories.create')}
            data-my-stories-create
            className="grid size-11 shrink-0 place-items-center rounded-chip focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{ outlineColor: 'var(--color-ios-brand)' }}
          >
            <span
              aria-hidden="true"
              className="grid size-8 place-items-center rounded-full text-white"
              style={{ background: 'var(--color-ios-brand)' }}
            >
              <Glyph name="plus" size={16} />
            </span>
          </Link>
        }
      />

      {online ? null : (
        <p role="status" data-my-stories-offline className="px-4 pb-2 text-check" style={{ color: 'var(--color-ios-ink-2)' }}>
          {translate(language, 'storiesMine.offline')}
        </p>
      )}

      <div className="scrollbar-none flex-1 overflow-y-auto px-4 pb-safe">
        {chargement ? (
          <StoriesLoading language={language} />
        ) : tray.isError && tray.data === undefined ? (
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
            deleteDisabled={!online}
          />
        )}
      </div>

      {pendingDeleteId === null ? null : (
        <ConfirmDialog
          name="my-story-delete"
          title={translate(language, 'storiesMine.delete.title')}
          body={translate(language, 'storiesMine.delete.body')}
          cancelLabel={translate(language, 'common.cancel')}
          confirmLabel={translate(language, 'storiesMine.action.delete')}
          tone="destructive"
          onConfirm={confirmDelete}
          onCancel={cancelDelete}
        />
      )}

      <LiveAnnouncement text={announcement} tone={tone} marker="myStories" />

      <PublicationViewersSheetPortal host={viewsHost} viewCount={openViewCount} />
    </main>
  );
}

export default function StoriesMineScreen() {
  return <StoriesMineView />;
}
