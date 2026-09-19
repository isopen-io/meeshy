import { CommentRow, type CommentGestureHandlers } from '@/components/comment-row';
import { Glyph } from '@/components/glyph';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import type { PostComment } from '@/lib/api/publication-comments';

/**
 * **LA LISTE DES COMMENTAIRES D'UNE PUBLICATION** — miroir de
 * `CommentListView.swift` réduit à ce que la v3.1 sait faire : les QUATRE
 * états dessinés, la pagination, et une rangée par commentaire
 * (`comment-row.tsx`, qui porte le texte, l'auteur, l'heure et les trois
 * gestes). Répondre à un commentaire (`parentId`), les réponses imbriquées et
 * leurs médias restent des marches à part (#7118) — leurs boutons n'existent
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
 * **CE COMPOSANT NE CHARGE RIEN.** Il reçoit la liste, son état et les
 * RAPPELS de geste ; l'hôte (`comment-thread.tsx`) tient la requête, le réseau
 * et l'état d'échec. C'est ce qui le rend éprouvable sans réseau, et ce qui
 * permet aux DEUX surfaces de partager exactement la même liste.
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
  /**
   * ABSENT ⇒ AUCUN bouton de geste sur aucune rangée. Un visiteur anonyme ne
   * peut ni aimer ni modifier (`requiredAuth` + `registeredUser` sur les trois
   * routes) : l'hôte ne câble alors rien, plutôt que d'offrir des contrôles
   * qui refuseraient au premier tap (loi 4, même argument que `canWrite` sur
   * le composeur).
   */
  readonly gestures?: CommentGestureHandlers | undefined;
};

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

export function CommentList({
  comments,
  state,
  language,
  preferredLanguages,
  locale,
  now,
  onRetry,
  onMore,
  gestures,
}: CommentListProps) {
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
            <span className="animate-pulse rounded-full" style={{ width: 32, height: 32, background: 'var(--color-ios-card)' }} />
            <span className="h-8 flex-1 animate-pulse rounded-chip" style={{ background: 'var(--color-ios-card)' }} />
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
            {...(gestures === undefined ? {} : { gestures })}
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
