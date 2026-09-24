import { useQuery } from '@tanstack/react-query';

import { colorForName } from '@meeshy/shared/utils/conversation-colors';

import { Avatar } from '@/components/avatar';
import { Glyph } from '@/components/glyph';
import { Sheet } from '@/components/sheet';
import { apiDeps } from '@/lib/api/deps';
import { storyViewersQueryOptions, type PostViewerRow } from '@/lib/api/story-viewers';
import { time } from '@/lib/grouping';
import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { initialsOf } from '@/lib/view/conversation';

/**
 * **« QUI A VU MA STORY »** (#7116) — le PATRON est `MessageReceiptsSheet`
 * (`components/message-receipts-sheet.tsx`) : `useQuery` `staleTime: 0`,
 * états chargement/erreur+réessayer, une ligne par personne. Miroir de
 * `StoryViewersSheet` (`StoryViewerView+Content.swift:1340-1500`) : avatar,
 * nom, glyphe de réaction (cœur/emoji posé), heure de vue à droite.
 *
 * **Nommé `publication-viewers-sheet`, pas `story-viewers-sheet`** (revue de
 * #7116, § budget) : le motif de `story_reader`
 * (`^assets/story-(?!compose-|tray-|scene-)[A-Za-z0-9_-]+\.js$`, `budgets.json`)
 * l'aurait sinon capté dans le PLAFOND NON ARBITRÉ (11 Ko) du lecteur — ce
 * fichier est chargé À LA DEMANDE (`lazy()`, motif D-54), un lecteur qui
 * n'ouvre jamais « Vues » ne le télécharge pas.
 *
 * `story.viewCount` reste l'AUTORITATIF dénormalisé pour l'en-tête (iOS
 * `StoryViewersSheet:1381`, note C4) — cette feuille reçoit `viewCount` en
 * prop plutôt que de compter sa propre liste, dont la page peut être
 * partielle.
 */
export function PublicationViewersSheet({
  postId,
  viewCount,
  onClose,
}: {
  readonly postId: string;
  readonly viewCount: number;
  readonly onClose: () => void;
}) {
  const lang = currentInterfaceLanguage();
  const query = useQuery({ ...storyViewersQueryOptions({ ...apiDeps, postId }), staleTime: 0 });
  const viewers: readonly PostViewerRow[] = query.data?.viewers ?? [];

  return (
    <Sheet title={translate(lang, viewCount === 1 ? 'story.views.count.one' : 'story.views.count.other', { count: String(viewCount) })} onClose={onClose}>
      {query.isLoading ? (
        <li className="px-4 py-3 text-body" style={{ color: 'var(--color-ios-ink-3)' }} data-viewers-loading>
          {translate(lang, 'message-detail.loading')}
        </li>
      ) : query.isError ? (
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
      ) : viewers.length === 0 ? (
        <li className="grid justify-items-center gap-2 px-8 py-10 text-center" data-viewers-empty>
          <Glyph name="eyeSlash" size={28} style={{ color: 'var(--color-ios-ink-3)' }} />
          <p className="text-title font-semibold" style={{ color: 'var(--color-ios-ink)' }}>
            {translate(lang, 'story.views.empty.title')}
          </p>
          <p className="text-body" style={{ color: 'var(--color-ios-ink-3)' }}>
            {translate(lang, 'story.views.empty.subtitle')}
          </p>
        </li>
      ) : (
        viewers.map((viewer) => {
          const label = viewer.displayName ?? viewer.username;
          return (
            <li key={viewer.id} className="flex items-center gap-3 px-4" style={{ minHeight: 56 }} data-story-viewer={viewer.id}>
              <Avatar
                initials={initialsOf(label)}
                color={colorForName(label)}
                size={40}
                name={label}
                {...(viewer.avatarUrl === null ? {} : { src: viewer.avatarUrl })}
              />
              <span className="flex-1 truncate text-body font-medium" style={{ color: 'var(--color-ios-ink)' }}>
                {label}
              </span>
              {viewer.reaction !== null ? (
                <span aria-hidden="true" data-story-viewer-reaction>
                  {viewer.reaction}
                </span>
              ) : null}
              <span className="text-mini" style={{ color: 'var(--color-ios-ink-3)' }} data-story-viewer-time>
                {time(viewer.viewedAt)}
              </span>
            </li>
          );
        })
      )}
    </Sheet>
  );
}
