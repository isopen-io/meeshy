import { Avatar } from '@/components/avatar';
import { Glyph } from '@/components/glyph';
import { resolveFeedText } from '@/lib/feed/text';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { shortRelativeTime } from '@/lib/relative-time';
import type { PostComment } from '@/lib/api/publication-comments';
import { initialsOf } from '@/lib/view/conversation';

/**
 * **LA LISTE DES COMMENTAIRES D'UNE PUBLICATION** — miroir de
 * `CommentListView.swift` + `CommentRowView.swift` réduit à ce que la v3.1
 * sait faire : le texte, l'auteur, l'heure, et les QUATRE états dessinés.
 * Aimer un commentaire, répondre à un commentaire (`parentId`), l'éditer, le
 * supprimer et ses médias sont des marches à part — leurs boutons n'existent
 * donc pas ici (loi 4), et aucune n'est annoncée.
 *
 * **LE PRISME PASSE PAR LE SITE PARTAGÉ** — `resolveFeedText` (`lib/feed/text.ts`
 * → `served()`, `lib/api/prism.ts`), la MÊME descente que le corps d'une carte
 * du fil : `PostComment.translations` porte la forme `{ langue: { text, … } }`
 * d'un POST. Réécrire la boucle ici serait la quatrième famille de résolveurs
 * divergents (CLAUDE.md § Prisme, cycles 118-123). Et ce que le résolveur
 * ÉLIT, la rangée l'AFFICHE avec son `lang=` : un lecteur d'écran qui
 * prononce un texte français avec une voix anglaise est le défaut du cycle
 * 122 rendu audible.
 *
 * **CE COMPOSANT NE CHARGE RIEN.** Il reçoit la liste et son état ; l'hôte
 * (`routes/post.tsx`, le panneau du lecteur de story) tient la requête. C'est
 * ce qui le rend éprouvable sans réseau, et ce qui permet aux DEUX surfaces
 * de partager exactement la même liste.
 */

export type CommentListState = {
  readonly loading: boolean;
  readonly error: boolean;
  readonly online: boolean;
  readonly hasMore: boolean;
  readonly loadingMore: boolean;
};

export type CommentListProps = {
  readonly comments: readonly PostComment[];
  readonly state: CommentListState;
  readonly language: InterfaceLanguage;
  readonly preferredLanguages: readonly string[];
  readonly locale: string;
  readonly now: Date;
  readonly onRetry: () => void;
  readonly onMore: () => void;
};

const displayName = (author: PostComment['author']): string => {
  const display = typeof author.displayName === 'string' && author.displayName !== '' ? author.displayName : null;
  const username = typeof author.username === 'string' && author.username !== '' ? author.username : null;
  return display ?? username ?? '';
};

function CommentRow({
  comment,
  language,
  preferredLanguages,
  locale,
  now,
}: {
  readonly comment: PostComment;
  readonly language: InterfaceLanguage;
  readonly preferredLanguages: readonly string[];
  readonly locale: string;
  readonly now: Date;
}) {
  const name = displayName(comment.author);
  const servi = resolveFeedText({
    preferredLanguages,
    originalLanguage: comment.originalLanguage,
    translations: comment.translations,
    content: comment.content,
  });
  const photo = typeof comment.author.avatar === 'string' && comment.author.avatar !== '' ? comment.author.avatar : undefined;

  return (
    <li
      data-comment-row={comment.id}
      {...(comment.pending === true ? { 'data-comment-pending': '' } : {})}
      className="flex gap-3 py-2"
      style={{ opacity: comment.pending === true ? 0.6 : 1 }}
    >
      <Avatar initials={initialsOf(name)} color="var(--color-ios-brand)" size={32} {...(photo === undefined ? {} : { src: photo })} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="truncate text-check font-semibold" style={{ color: 'var(--color-ios-ink)' }}>
            {name}
          </span>
          <span className="shrink-0 text-check" style={{ color: 'var(--color-ios-ink-3)' }}>
            {comment.pending === true
              ? translate(language, 'comments.row.pending')
              : shortRelativeTime(new Date(comment.createdAt), now, locale)}
          </span>
        </div>
        {/* `lang` UNIQUEMENT quand le texte servi n'est PAS la langue du
            document : poser `lang` partout ferait mentir la voix sur les
            rangées non traduites. */}
        <p
          className="text-body break-words whitespace-pre-wrap"
          style={{ color: 'var(--color-ios-ink)' }}
          {...(servi.translated && servi.language !== '' ? { lang: servi.language } : {})}
        >
          {servi.text}
        </p>
      </div>
    </li>
  );
}

function CommentState({
  glyph,
  title,
  hint,
  action,
}: {
  readonly glyph: 'chatCircle' | 'warningCircle';
  readonly title: string;
  readonly hint: string;
  readonly action?: { readonly label: string; readonly onPress: () => void };
}) {
  return (
    <div
      {...(glyph === 'warningCircle' ? { role: 'alert' as const } : {})}
      data-comment-state={glyph === 'warningCircle' ? 'error' : 'empty'}
      className="grid justify-items-center gap-2 px-6 py-8 text-center"
    >
      <span style={{ color: glyph === 'warningCircle' ? 'var(--color-error)' : 'var(--color-ios-ink-3)' }}>
        <Glyph name={glyph === 'warningCircle' ? 'warningCircle' : 'users'} size={26} />
      </span>
      <p className="text-body font-semibold" style={{ color: 'var(--color-ios-ink)' }}>
        {title}
      </p>
      <p className="text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
        {hint}
      </p>
      {action !== undefined ? (
        <button
          type="button"
          data-comment-retry
          onClick={action.onPress}
          className="grid place-items-center rounded-chip px-5 text-body font-semibold text-white"
          style={{ backgroundColor: 'var(--color-ios-brand)', minHeight: 44 }}
        >
          {action.label}
        </button>
      ) : null}
    </div>
  );
}

export function CommentList({ comments, state, language, preferredLanguages, locale, now, onRetry, onMore }: CommentListProps) {
  /* CACHE D'ABORD — le squelette n'apparaît que sur une liste VIDE. Une
     relecture en fond sur une liste déjà peinte ne détruit rien : c'est la
     règle « jamais de spinner sur un cache non vide » des Instant App
     Principles, et l'erreur d'un rafraîchissement ne remplace pas non plus
     les commentaires déjà lus (voir l'ordre des branches ci-dessous). */
  if (comments.length === 0 && state.loading) {
    return (
      <div data-comment-state="loading" aria-busy="true" aria-label={translate(language, 'comments.loading')} className="grid gap-3 py-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex gap-3">
            <span className="animate-pulse rounded-full" style={{ width: 32, height: 32, background: 'var(--color-ios-fill-2)' }} />
            <span className="h-8 flex-1 animate-pulse rounded-chip" style={{ background: 'var(--color-ios-fill-2)' }} />
          </div>
        ))}
      </div>
    );
  }

  if (comments.length === 0 && state.error) {
    return (
      <CommentState
        glyph="warningCircle"
        title={translate(language, state.online ? 'comments.error' : 'comments.offline')}
        hint={translate(language, 'comments.error.hint')}
        {...(state.online ? { action: { label: translate(language, 'comments.retry'), onPress: onRetry } } : {})}
      />
    );
  }

  if (comments.length === 0) {
    return (
      <CommentState glyph="chatCircle" title={translate(language, 'comments.empty')} hint={translate(language, 'comments.empty.hint')} />
    );
  }

  return (
    <div className="flex flex-col">
      {/* HORS LIGNE SUR UNE LISTE PEUPLÉE : on ne DÉTRUIT rien, on DIT l'état.
          Un écran blanc n'est pas un état, et une liste effacée par une
          coupure réseau serait pire qu'une liste datée. */}
      {!state.online ? (
        <p role="status" data-comment-state="offline" className="text-caption px-1 pb-1" style={{ color: 'var(--color-ios-ink-2)' }}>
          {translate(language, 'comments.offline')}
        </p>
      ) : null}
      <ul data-comment-list className="flex list-none flex-col">
        {comments.map((comment) => (
          <CommentRow
            key={comment.id}
            comment={comment}
            language={language}
            preferredLanguages={preferredLanguages}
            locale={locale}
            now={now}
          />
        ))}
      </ul>
      {state.hasMore ? (
        <button
          type="button"
          data-comment-more
          onClick={onMore}
          disabled={state.loadingMore}
          className="self-center rounded-chip px-4 text-check font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{ color: 'var(--color-ios-brand)', minHeight: 44, outlineColor: 'var(--color-ios-brand)' }}
        >
          {translate(language, state.loadingMore ? 'comments.loading' : 'comments.more')}
        </button>
      ) : null}
    </div>
  );
}
