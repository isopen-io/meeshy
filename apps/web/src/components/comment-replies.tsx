import { useId, useMemo } from 'react';

import { CommentRow, type CommentGestureHandlers } from '@/components/comment-row';
import { flattenCommentPages, type CommentInfiniteData, type PostComment } from '@/lib/api/publication-comments';
import { useCommentReplies } from '@/lib/api/query';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

/**
 * **LES RÉPONSES D'UN COMMENTAIRE, DÉPLIÉES SOUS LUI** (#8583) — miroir de
 * `ThreadedCommentSection.swift` réduit au dépliage : « Voir les réponses
 * (N) » les charge (`GET …/replies`, `comment-replies.ts`), « Masquer » les
 * replie. Chaque réponse est une `CommentRow` ENTIÈRE — mêmes gestes, même
 * glissé « répondre », mêmes effets, même Prisme : une réponse est un
 * commentaire, et une seconde rangée pour elle serait la jumelle divergente.
 *
 * **LE DÉPLIAGE EST TENU PAR L'HÔTE** (`comment-thread.tsx`) — c'est lui qui
 * sait qu'on vient de répondre à cette racine, et qui la déplie pour que la
 * réponse posée se VOIE. Un fil replié ne coûte aucune requête.
 *
 * Le compte annoncé est le plus grand de ce que la passerelle dit
 * (`replyCount`) et de ce que la caisse porte : une réponse qu'on vient de
 * poser compte avant que la passerelle l'ait confirmée.
 */
export function CommentReplies({
  postId,
  parent,
  expanded,
  onToggle,
  language,
  preferredLanguages,
  locale,
  now,
  gestures,
}: {
  readonly postId: string;
  readonly parent: PostComment;
  readonly expanded: boolean;
  readonly onToggle: () => void;
  readonly language: InterfaceLanguage;
  readonly preferredLanguages: readonly string[];
  readonly locale: string;
  readonly now: Date;
  readonly gestures?: CommentGestureHandlers | undefined;
}) {
  const listId = useId();
  const query = useCommentReplies(postId, parent.id, { enabled: expanded && parent.pending !== true });
  const replies = useMemo(() => flattenCommentPages(query.data as CommentInfiniteData | undefined), [query.data]);
  const served = typeof parent.replyCount === 'number' && Number.isFinite(parent.replyCount) ? parent.replyCount : 0;
  const count = Math.max(served, replies.length);
  if (parent.pending === true || count === 0) return null;

  const name = parent.author.displayName ?? parent.author.username ?? '';
  return (
    <div data-comment-replies={parent.id} className="flex flex-col" style={{ marginInlineStart: 44 }}>
      <button
        type="button"
        data-comment-replies-toggle
        aria-expanded={expanded}
        aria-controls={listId}
        onClick={onToggle}
        className="self-start rounded-chip px-2 text-check font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{ minHeight: 44, marginInlineStart: -8, color: 'var(--color-ios-brand)', outlineColor: 'var(--color-ios-brand)' }}
      >
        {expanded
          ? translate(language, 'comments.replies.hide')
          : translate(language, 'comments.replies.show', { count: String(count) })}
      </button>
      {expanded ? (
        <div id={listId}>
          {replies.length === 0 && query.isError ? (
            <p role="alert" data-comment-replies-state="error" className="flex flex-wrap items-center gap-2">
              <span className="text-caption" style={{ color: 'var(--color-error)' }}>
                {translate(language, 'comments.replies.error')}
              </span>
              <button
                type="button"
                data-comment-replies-retry
                onClick={() => void query.refetch()}
                className="rounded-chip px-2 text-check font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
                style={{ minHeight: 44, color: 'var(--color-ios-brand)', outlineColor: 'var(--color-ios-brand)' }}
              >
                {translate(language, 'comments.retry')}
              </button>
            </p>
          ) : null}
          {replies.length === 0 && query.isPending && !query.isError ? (
            <p data-comment-replies-state="loading" aria-busy="true" className="text-caption py-2" style={{ color: 'var(--color-ios-ink-3)' }}>
              {translate(language, 'comments.loading')}
            </p>
          ) : null}
          {replies.length > 0 ? (
            <ul
              data-comment-reply-list
              aria-label={translate(language, 'comments.replies.label', { name })}
              className="flex list-none flex-col"
            >
              {replies.map((reply) => (
                <CommentRow
                  key={reply.id}
                  comment={reply}
                  language={language}
                  preferredLanguages={preferredLanguages}
                  locale={locale}
                  now={now}
                  {...(gestures === undefined ? {} : { gestures })}
                />
              ))}
            </ul>
          ) : null}
          {query.hasNextPage ? (
            <button
              type="button"
              data-comment-replies-more
              onClick={() => void query.fetchNextPage()}
              disabled={query.isFetchingNextPage}
              className="rounded-chip px-2 text-check font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
              style={{ minHeight: 44, color: 'var(--color-ios-brand)', outlineColor: 'var(--color-ios-brand)' }}
            >
              {translate(language, query.isFetchingNextPage ? 'comments.loading' : 'comments.replies.more')}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
