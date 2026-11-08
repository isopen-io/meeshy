import { colorForName } from '@meeshy/shared/utils/conversation-colors';

import { Avatar } from '@/components/avatar';
import { Glyph } from '@/components/glyph';
import type { PersonSummary } from '@/lib/api/friend-requests';
import { postSearchTarget } from '@/lib/api/global-search';
import type { FeedPost } from '@/lib/api/feed-pages';
import { attachmentSrc } from '@/lib/api/media-url';
import { resolveFeedText } from '@/lib/feed/text';
import { useRingDesign } from '@/lib/profile-decor/author-ring';
import { globalSearchText, type GlobalSearchCatalogKey } from '@/lib/i18n-global-search-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { initialsOf } from '@/lib/view/conversation';
import type { SearchState } from '@/lib/view/global-search-state';
import type { MessageSearchRowModel } from '@/lib/view/message-search-row';
import { THREAD_ANCHOR_PARAM } from '@/lib/view/thread-anchor';
import { Link } from '@/routes/route-table';

/**
 * **LES RÉSULTATS DE LA RECHERCHE GÉNÉRALE** (#14619, #14620) — trois listes
 * PRÉSENTATIONNELLES (messages, posts, personnes) et l'état qui les entoure.
 * Elles ne lisent ni le réseau ni le cache : la section de la liste
 * (`list-message-search.tsx`) et l'écran `/search` les alimentent, et un
 * témoin les rend sans harnais.
 *
 * Un résultat est un LIEN, jamais un bouton qui navigue : un message ouvre son
 * fil SUR lui (`?message=`, comme les messages favoris), un post ouvre
 * `/post`, un réel `/reel`, une story `/story`, une personne son profil.
 */

const text = (language: InterfaceLanguage, key: GlobalSearchCatalogKey) => globalSearchText(language, key);

const POST_TYPE_KEY: Readonly<Record<string, GlobalSearchCatalogKey>> = { POST: 'type.post', REEL: 'type.reel', STORY: 'type.story' };

export function SearchStatus({
  language,
  state,
  isEmpty,
  emptyKey,
  onRetry,
}: {
  readonly language: InterfaceLanguage;
  readonly state: SearchState;
  readonly isEmpty: boolean;
  readonly emptyKey: GlobalSearchCatalogKey;
  readonly onRetry: () => void;
}) {
  if (state === 'idle') return null;
  if (state === 'loading' && isEmpty) {
    return (
      <p data-search-state="loading" aria-busy="true" className="px-4 py-3 text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
        {text(language, 'search.loading')}
      </p>
    );
  }
  if (state === 'error' || state === 'offline') {
    return (
      <div data-search-state={state} role="alert" className="flex items-center gap-3 px-4 py-3">
        <span style={{ color: 'var(--color-error)' }}>
          <Glyph name="warningCircle" size={18} />
        </span>
        <p className="min-w-0 flex-1 text-caption" style={{ color: 'var(--color-ios-ink)' }}>
          {text(language, state === 'offline' ? 'search.offline' : 'search.error')}
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="grid min-h-11 place-items-center rounded-chip px-4 text-caption font-semibold"
          style={{ color: 'var(--color-ios-brand)' }}
        >
          {text(language, 'search.retry')}
        </button>
      </div>
    );
  }
  if (state === 'ready' && isEmpty) {
    return (
      <p data-search-state="empty" className="px-4 py-3 text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
        {text(language, emptyKey)}
      </p>
    );
  }
  return null;
}

export function LoadMore({ language, busy, onMore }: { readonly language: InterfaceLanguage; readonly busy: boolean; readonly onMore: () => void }) {
  return (
    <button
      type="button"
      data-search-more
      onClick={onMore}
      disabled={busy}
      className="mx-auto grid min-h-11 place-items-center rounded-chip px-5 text-caption font-semibold"
      style={{ color: 'var(--color-ios-brand)' }}
    >
      {text(language, busy ? 'search.loading' : 'search.loadMore')}
    </button>
  );
}

export function MessageSearchRow({ model, language }: { readonly model: MessageSearchRowModel; readonly language: InterfaceLanguage }) {
  return (
    <li data-search-message={model.messageId}>
      <Link
        to="thread"
        params={{ conversation: model.conversationId }}
        search={{ [THREAD_ANCHOR_PARAM]: model.messageId }}
        className="flex min-w-0 gap-3 rounded-[12px] px-4 py-2.5 text-start focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{ color: 'var(--color-ios-ink)', outlineColor: 'var(--color-ios-brand)' }}
      >
        <span aria-hidden="true" className="w-[3px] shrink-0 self-stretch rounded-full" style={{ backgroundColor: model.accent }} />
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex items-baseline gap-2">
            <span className="min-w-0 flex-1 truncate text-caption font-semibold">{model.conversationName}</span>
            <time dateTime={model.sentAt} className="shrink-0 text-mini" style={{ color: 'var(--color-ios-ink-2)' }}>
              {model.dateLabel}
            </time>
          </span>
          <span className="line-clamp-2 text-body">
            {model.author === null ? null : <span className="font-medium">{model.author} · </span>}
            {model.excerpt}
          </span>
          {model.translated ? (
            <span className="flex items-center gap-1 text-mini" style={{ color: 'var(--color-ios-ink-2)' }}>
              <Glyph name="translate" size={12} />
              {text(language, 'translated')}
            </span>
          ) : null}
        </span>
      </Link>
    </li>
  );
}

export function PostSearchRow({
  post,
  language,
  preferredLanguages,
}: {
  readonly post: FeedPost;
  readonly language: InterfaceLanguage;
  readonly preferredLanguages: readonly string[];
}) {
  const target = postSearchTarget(post);
  const served = resolveFeedText({ preferredLanguages, originalLanguage: post.originalLanguage, translations: post.translations, content: post.content ?? '' });
  const author = post.author?.displayName || post.author?.username || '';
  const first = post.media?.[0];
  const thumbnail = first === undefined ? null : (first.thumbnailUrl ?? (first.mimeType?.startsWith('image/') ? first.fileUrl : null));
  return (
    <li data-search-post={post.id} data-search-post-type={post.type}>
      <Link
        to={target.to}
        params={target.params}
        className="flex min-w-0 gap-3 rounded-[12px] px-4 py-2.5 text-start focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{ color: 'var(--color-ios-ink)', outlineColor: 'var(--color-ios-brand)' }}
      >
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-caption font-semibold">{author}</span>
            <span className="shrink-0 rounded-chip px-2 text-mini font-semibold" style={{ color: 'var(--color-ios-brand)', border: '1px solid currentColor' }}>
              {text(language, POST_TYPE_KEY[post.type] ?? 'type.post')}
            </span>
          </span>
          {served.text.trim() === '' ? null : <span className="line-clamp-3 text-body">{served.text}</span>}
        </span>
        {thumbnail === null ? null : (
          <img src={attachmentSrc(thumbnail)} alt="" loading="lazy" decoding="async" className="size-14 shrink-0 rounded-lg object-cover" />
        )}
      </Link>
    </li>
  );
}

export function PersonSearchRow({ person }: { readonly person: PersonSummary }) {
  const name = person.displayName || person.username;
  const ring = useRingDesign(person.ring ?? null);
  return (
    <li data-search-person={person.id}>
      <Link
        to="userProfile"
        params={{ username: person.username }}
        className="flex min-w-0 items-center gap-3 rounded-[12px] px-4 py-2.5 text-start focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{ color: 'var(--color-ios-ink)', outlineColor: 'var(--color-ios-brand)' }}
      >
        <Avatar initials={initialsOf(name)} color={colorForName(name)} size={40} name={name} {...(person.avatar === null ? {} : { src: person.avatar })} {...(ring === null ? {} : { ring })} />
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-body font-semibold">{name}</span>
          <span className="truncate text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
            @{person.username}
          </span>
        </span>
      </Link>
    </li>
  );
}
