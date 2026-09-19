import { useCallback, useState } from 'react';

import { Avatar } from '@/components/avatar';
import { GlyphSvg } from '@/components/glyph';
import { FEED_GLYPHS } from '@/components/glyphs-feed';
import type { CommentGestureMessageKey } from '@/lib/api/comment-gestures';
import { COMMENT_MAX_LENGTH, type PostComment } from '@/lib/api/publication-comments';
import { resolveFeedText } from '@/lib/feed/text';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { shortRelativeTime } from '@/lib/relative-time';
import { initialsOf } from '@/lib/view/conversation';

/**
 * **UNE RANGÉE DE COMMENTAIRE ET SES TROIS GESTES** (#7133) — miroir de
 * `CommentRowView.swift` : le cœur et son compte à gauche, le menu « … » à
 * droite, et ce menu « n'est affiché que s'il contient au moins une action »
 * (`:107-111`).
 *
 * **AIMER EST OFFERT À TOUS ; MODIFIER ET SUPPRIMER, À L'AUTEUR SEUL** — et
 * c'est le reflet EXACT de la passerelle, pas une politesse d'interface :
 * `PATCH` et `DELETE …/comments/:commentId` ne gardent PAS l'audience du post
 * mais le contrôle d'AUTEUR du service (`comments.ts:500-523`, qui explique
 * pourquoi). Offrir ces deux boutons sur le commentaire d'un autre serait un
 * contrôle qui ment (loi 4) : un 403 au premier tap.
 *
 * **UNE RANGÉE EN VOL N'OFFRE AUCUN GESTE.** Son `id` est temporaire
 * (`newClientMessageId`) : la passerelle ne le connaît pas, et le geste
 * partirait vers une adresse qui n'existe pas.
 *
 * **CE COMPOSANT NE CHARGE RIEN NON PLUS** — le contrat de `comment-list.tsx`
 * vaut ici : les gestes sont des RAPPELS, l'hôte (`comment-thread.tsx`) tient
 * le réseau et l'état d'échec. C'est ce qui rend la rangée éprouvable sans
 * passerelle, et ce qui permet aux DEUX surfaces (détail de publication,
 * lecteur de stories) de partager exactement la même.
 */

/**
 * LES RAPPELS DE GESTE — absents ⇒ AUCUN bouton. Un visiteur anonyme ne peut
 * ni aimer ni écrire (`requiredAuth` + `registeredUser` sur les trois routes),
 * donc l'hôte ne les câble pas, et la rangée n'affiche rien d'inerte.
 */
export type CommentGestureHandlers = {
  /** L'identité qui décide de « Modifier » et « Supprimer » — jamais recalculée ici. */
  readonly viewerId: string;
  readonly onLike: (commentId: string) => void;
  readonly onEdit: (commentId: string, content: string) => void;
  readonly onDelete: (commentId: string) => void;
  /** La clé de catalogue du dernier geste EN ÉCHEC sur cette rangée, s'il y en a un. */
  readonly failureOf: (commentId: string) => CommentGestureMessageKey | undefined;
  /** Rejoue ce geste-là — l'hôte se souvient duquel il s'agit. */
  readonly onRetryGesture: (commentId: string) => void;
};

export type CommentRowProps = {
  readonly comment: PostComment;
  readonly language: InterfaceLanguage;
  readonly preferredLanguages: readonly string[];
  readonly locale: string;
  readonly now: Date;
  readonly gestures?: CommentGestureHandlers | undefined;
};

const displayName = (author: PostComment['author']): string => {
  const display = typeof author.displayName === 'string' && author.displayName !== '' ? author.displayName : null;
  const username = typeof author.username === 'string' && author.username !== '' ? author.username : null;
  return display ?? username ?? '';
};

const countOf = (value: number | null | undefined): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0;

/* `inline-flex`, JAMAIS `grid place-items-center` : le cœur et son compte sont
   DEUX enfants, et une grille d'une colonne les empile — le chiffre passait
   SOUS l'icône (mesuré à la capture). `display` ne se surcharge pas en
   ajoutant `flex` derrière `grid` dans la liste de classes : c'est l'ordre de
   la FEUILLE qui tranche, pas celui de l'attribut. */
const GESTURE_BUTTON =
  'inline-flex items-center justify-center gap-1 rounded-chip px-2 focus-visible:outline-2 focus-visible:outline-offset-2';

function GestureBar({
  comment,
  language,
  gestures,
  onStartEdit,
}: {
  readonly comment: PostComment;
  readonly language: InterfaceLanguage;
  readonly gestures: CommentGestureHandlers;
  readonly onStartEdit: () => void;
}) {
  const isLiked = comment.isLikedByMe === true;
  const likes = countOf(comment.likeCount);
  const isMine = comment.author.id === gestures.viewerId;

  return (
    /* Le retrait compense le `px-2` des boutons : la rangée de gestes
       s'aligne alors sur le TEXTE qu'elle suit, pas deux crans à sa droite. */
    <div className="flex items-center gap-1 pt-0.5" style={{ marginInlineStart: -8 }}>
      <button
        type="button"
        data-comment-gesture="like"
        aria-pressed={isLiked}
        onClick={() => gestures.onLike(comment.id)}
        className={GESTURE_BUTTON}
        style={{
          minHeight: 44,
          color: isLiked ? 'var(--color-error)' : 'var(--color-ios-ink-3)',
          outlineColor: 'var(--color-ios-brand)',
        }}
      >
        {/* LE MÊME JEU QUE LA CARTE DU FIL (`FEED_GLYPHS`, chargé avec la
            route qui porte ce fil) — aucun second jeu à faire descendre pour
            un cœur déjà présent, et le même tracé des deux côtés.

            **LE NOM ACCESSIBLE VIT SUR LE GLYPHE, PAS SUR L'ENVELOPPE** — la
            leçon déjà payée par la rangée de statistiques du fil
            (`feed-post-card.tsx:85-92`) : un `aria-label` posé sur le BOUTON
            REMPLACE son contenu, et le compte devient INAUDIBLE. Ici il est
            du TEXTE lu, et le nom composé dit « J'aime 4 » — exactement ce
            qu'iOS énonce en `accessibilityLabel` + `accessibilityValue`
            (`CommentRowView.swift:288-291`). */}
        <GlyphSvg
          glyph={isLiked ? FEED_GLYPHS.heartFill : FEED_GLYPHS.heart}
          size={16}
          title={translate(language, isLiked ? 'comments.action.unlike' : 'comments.action.like')}
        />
        {likes > 0 ? <span className="text-check">{likes}</span> : null}
      </button>
      {isMine ? (
        <>
          <button
            type="button"
            data-comment-gesture="edit"
            onClick={onStartEdit}
            className={`${GESTURE_BUTTON} text-check`}
            style={{ minHeight: 44, color: 'var(--color-ios-ink-3)', outlineColor: 'var(--color-ios-brand)' }}
          >
            {translate(language, 'comments.action.edit')}
          </button>
          <button
            type="button"
            data-comment-gesture="delete"
            onClick={() => gestures.onDelete(comment.id)}
            className={`${GESTURE_BUTTON} text-check`}
            style={{ minHeight: 44, color: 'var(--color-ios-ink-3)', outlineColor: 'var(--color-ios-brand)' }}
          >
            {translate(language, 'comments.action.delete')}
          </button>
        </>
      ) : null}
    </div>
  );
}

/** L'ÉCHEC D'UN GESTE EST VISIBLE ET SE REJOUE — jamais un silence : la rangée
 * est revenue à son état d'avant, et sans ce constat le lecteur croirait que
 * son tap n'a pas été pris. */
function GestureFailure({
  language,
  message,
  onRetry,
}: {
  readonly language: InterfaceLanguage;
  readonly message: CommentGestureMessageKey;
  readonly onRetry: () => void;
}) {
  return (
    <p role="alert" data-comment-gesture-error={message} className="flex flex-wrap items-center gap-2 pt-0.5">
      <span className="text-caption" style={{ color: 'var(--color-error)' }}>
        {translate(language, message)}
      </span>
      <button
        type="button"
        data-comment-gesture-retry
        onClick={onRetry}
        className="rounded-chip px-2 text-check font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{ minHeight: 44, color: 'var(--color-ios-brand)', outlineColor: 'var(--color-ios-brand)' }}
      >
        {translate(language, 'comments.retry')}
      </button>
    </p>
  );
}

/** LA MODIFICATION SE FAIT SUR PLACE — la rangée devient son propre champ,
 * comme `PostDetailView+CommentEdit.swift` fait basculer le composeur en mode
 * édition : aucune feuille, aucun écran de plus pour corriger une faute. */
function EditForm({
  comment,
  language,
  onSave,
  onCancel,
}: {
  readonly comment: PostComment;
  readonly language: InterfaceLanguage;
  readonly onSave: (content: string) => void;
  readonly onCancel: () => void;
}) {
  const [draft, setDraft] = useState(comment.content);
  const trimmed = draft.trim();
  const submittable = trimmed !== '' && trimmed.length <= COMMENT_MAX_LENGTH;

  return (
    <div className="flex flex-col gap-2 pt-1">
      <textarea
        data-comment-edit-field={comment.id}
        aria-label={translate(language, 'comments.edit.label')}
        value={draft}
        rows={2}
        /* `onInput`, JAMAIS `onChange` — la MÊME raison que le composeur
           (`comment-composer.tsx:93-98`) : sous le runtime Preact (D-2),
           `onChange` est l'événement NATIF `change`, qui ne part qu'à la perte
           du focus. « Enregistrer » serait resté désactivé toute la frappe. */
        onInput={(event) => setDraft((event.currentTarget as HTMLTextAreaElement).value)}
        /* LA MÊME PEAU QUE LE COMPOSEUR — c'est le même métier (un champ de
           commentaire), donc un seul vocabulaire de forme. */
        className="w-full resize-none rounded-chip px-3 py-2.5 text-body focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{
          background: 'var(--color-ios-card)',
          color: 'var(--color-ios-ink)',
          outlineColor: 'var(--color-ios-brand)',
        }}
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          data-comment-edit-save
          disabled={!submittable}
          onClick={() => onSave(trimmed)}
          className="rounded-chip px-5 text-check font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{
            minHeight: 44,
            backgroundColor: 'var(--color-ios-brand)',
            opacity: submittable ? 1 : 0.5,
            outlineColor: 'var(--color-ios-brand)',
          }}
        >
          {translate(language, 'comments.edit.save')}
        </button>
        <button
          type="button"
          data-comment-edit-cancel
          onClick={onCancel}
          className="rounded-chip px-3 text-check focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{ minHeight: 44, color: 'var(--color-ios-ink-2)', outlineColor: 'var(--color-ios-brand)' }}
        >
          {translate(language, 'comments.edit.cancel')}
        </button>
      </div>
    </div>
  );
}

export function CommentRow({ comment, language, preferredLanguages, locale, now, gestures }: CommentRowProps) {
  const [editing, setEditing] = useState(false);
  const name = displayName(comment.author);
  const servi = resolveFeedText({
    preferredLanguages,
    originalLanguage: comment.originalLanguage,
    translations: comment.translations,
    content: comment.content,
  });
  const photo = typeof comment.author.avatar === 'string' && comment.author.avatar !== '' ? comment.author.avatar : undefined;
  /* Une rangée EN VOL n'a pas d'adresse chez la passerelle — aucun geste. */
  const actionable = comment.pending !== true ? gestures : undefined;
  const failure = actionable?.failureOf(comment.id);

  const save = useCallback(
    (content: string) => {
      setEditing(false);
      actionable?.onEdit(comment.id, content);
    },
    [actionable, comment.id],
  );

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
        {editing && actionable !== undefined ? (
          <EditForm comment={comment} language={language} onSave={save} onCancel={() => setEditing(false)} />
        ) : (
          /* `lang` UNIQUEMENT quand le texte servi n'est PAS la langue du
             document : poser `lang` partout ferait mentir la voix sur les
             rangées non traduites. */
          <p
            className="text-body break-words whitespace-pre-wrap"
            style={{ color: 'var(--color-ios-ink)' }}
            {...(servi.translated && servi.language !== '' ? { lang: servi.language } : {})}
          >
            {servi.text}
          </p>
        )}
        {actionable !== undefined && !editing ? (
          <GestureBar comment={comment} language={language} gestures={actionable} onStartEdit={() => setEditing(true)} />
        ) : null}
        {actionable !== undefined && failure !== undefined ? (
          <GestureFailure language={language} message={failure} onRetry={() => actionable.onRetryGesture(comment.id)} />
        ) : null}
      </div>
    </li>
  );
}
