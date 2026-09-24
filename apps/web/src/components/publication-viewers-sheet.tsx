import { useQuery } from '@tanstack/react-query';

import { colorForName } from '@meeshy/shared/utils/conversation-colors';

import { Avatar } from '@/components/avatar';
import { Glyph } from '@/components/glyph';
import { Sheet } from '@/components/sheet';
import { ApiError } from '@/lib/api/client';
import { apiDeps } from '@/lib/api/deps';
import { storyViewersQueryOptions, type PostViewerRow } from '@/lib/api/publication-viewers';
import { time } from '@/lib/grouping';
import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage, type InterfaceLanguage } from '@/lib/interface-language';
import { coldStateOf } from '@/lib/view/cold-state';
import { initialsOf } from '@/lib/view/conversation';
import { Link } from '@/routes/route-table';

/**
 * **« QUI A VU MA STORY »** (#7116) — le PATRON est `MessageReceiptsSheet`
 * (`components/message-receipts-sheet.tsx`) : `useQuery` `staleTime: 0`, une
 * ligne par personne. Miroir de `StoryViewersSheet`
 * (`StoryViewerView+Content.swift:1340-1500`) : avatar, nom, réaction posée,
 * heure de vue à droite, et **un tap ouvre le profil** (`onOpenProfile`,
 * `:1427-1483`) — ici un LIEN, qui garde une adresse partageable.
 *
 * **Nommé `publication-viewers-sheet`, pas `story-viewers-sheet`** : le motif
 * de `story_reader` (`^assets/story-(?!compose-|tray-|scene-)…`,
 * `budgets.json`) l'aurait capté dans le plafond NON ARBITRÉ du lecteur — ce
 * fichier est chargé À LA DEMANDE (`lazy()`, D-54) et compté à part
 * (`on_demand_chunks.publication_viewers_sheet`).
 *
 * **CINQ ÉTATS DESSINÉS** (revue #7116 — le premier jet en avait trois) :
 * chargement (cache VIDE seulement), HORS LIGNE (TanStack met la requête en
 * pause : lue comme une liste vide, elle affichait « Aucune vue » à un auteur
 * que huit personnes avaient vu — `coldStateOf`, la loi partagée), REFUS
 * (403 : « réessayer » n'y changerait rien, on dit pourquoi), erreur avec
 * « Réessayer », vide, et la liste.
 *
 * **L'EN-TÊTE LIT LE COMPTE AUTORITATIF** (`story.viewCount`, iOS note C4,
 * `:1381`), jamais la longueur d'une page qui peut être partielle — et
 * retombe sur la liste servie quand le corpus ne le porte pas, plutôt que
 * d'afficher « 0 vue » au-dessus de trois lecteurs.
 */
export function PublicationViewersSheet({
  postId,
  viewCount,
  onClose,
}: {
  readonly postId: string;
  readonly viewCount: number | null | undefined;
  readonly onClose: () => void;
}) {
  const lang = currentInterfaceLanguage();
  const query = useQuery({ ...storyViewersQueryOptions({ ...apiDeps, postId }), staleTime: 0 });
  const viewers: readonly PostViewerRow[] = query.data?.viewers ?? [];
  const count = viewCount ?? query.data?.pagination.total;
  const title =
    count === undefined
      ? translate(lang, 'story.action.views')
      : translate(lang, count === 1 ? 'story.views.count.one' : 'story.views.count.other', { count: String(count) });

  return (
    <Sheet title={title} onClose={onClose}>
      <ViewersBody query={query} viewers={viewers} lang={lang} />
    </Sheet>
  );
}

function ViewersBody({
  query,
  viewers,
  lang,
}: {
  readonly query: { readonly data: unknown; readonly isError: boolean; readonly isPaused: boolean; readonly error: unknown; readonly refetch: () => unknown };
  readonly viewers: readonly PostViewerRow[];
  readonly lang: InterfaceLanguage;
}) {
  const state = coldStateOf(query);
  if (state === 'loading') {
    return (
      <li className="px-4 py-3 text-body" style={{ color: 'var(--color-ios-ink-3)' }} data-viewers-loading>
        {translate(lang, 'story.views.loading')}
      </li>
    );
  }
  if (state === 'offline') {
    return (
      <li className="px-4 py-3 text-body" style={{ color: 'var(--color-ios-ink-3)' }} data-viewers-offline>
        {translate(lang, 'story.views.offline')}
      </li>
    );
  }
  if (state === 'error') {
    if (query.error instanceof ApiError && query.error.status === 403) {
      return (
        <li className="px-4 py-3 text-body" style={{ color: 'var(--color-ios-ink-3)' }} data-viewers-forbidden>
          {translate(lang, 'story.views.forbidden')}
        </li>
      );
    }
    return (
      <li className="flex items-center gap-3 px-4 py-3 text-body" style={{ color: 'var(--color-ios-ink-3)' }} data-viewers-error>
        <span className="flex-1">{translate(lang, 'message-detail.load-error')}</span>
        <button
          type="button"
          className="rounded-full px-3 font-semibold"
          style={{ minHeight: 44, color: 'var(--color-primary)' }}
          onClick={() => void query.refetch()}
          data-viewers-retry
        >
          {translate(lang, 'message-detail.retry')}
        </button>
      </li>
    );
  }
  if (viewers.length === 0) {
    return (
      <li className="grid justify-items-center gap-2 px-8 py-10 text-center" data-viewers-empty>
        <Glyph name="eyeSlash" size={28} style={{ color: 'var(--color-ios-ink-3)' }} />
        <p className="text-title font-semibold" style={{ color: 'var(--color-ios-ink)' }}>
          {translate(lang, 'story.views.empty.title')}
        </p>
        <p className="text-body" style={{ color: 'var(--color-ios-ink-3)' }}>
          {translate(lang, 'story.views.empty.subtitle')}
        </p>
      </li>
    );
  }
  return (
    <>
      {viewers.map((viewer) => {
        const label = viewer.displayName ?? viewer.username;
        return (
          <li key={viewer.id} data-story-viewer={viewer.id}>
            <Link
              to="userProfile"
              params={{ username: viewer.username }}
              className="flex items-center gap-3 px-4"
              style={{ minHeight: 56, color: 'var(--color-ios-ink)' }}
            >
              <Avatar
                initials={initialsOf(label)}
                color={colorForName(label)}
                size={40}
                name={label}
                {...(viewer.avatarUrl === null ? {} : { src: viewer.avatarUrl })}
              />
              <span className="flex-1 truncate text-body font-medium">{label}</span>
              {viewer.reaction !== null ? <span data-story-viewer-reaction>{viewer.reaction}</span> : null}
              <span className="text-mini" style={{ color: 'var(--color-ios-ink-3)' }} data-story-viewer-time>
                {time(viewer.viewedAt)}
              </span>
            </Link>
          </li>
        );
      })}
    </>
  );
}
