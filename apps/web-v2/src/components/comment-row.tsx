import { useCallback, useEffect, useRef, useState } from 'react';

import { Avatar } from '@/components/avatar';
import { GlyphSvg } from '@/components/glyph';
import { FEED_GLYPHS } from '@/components/glyphs-feed';
import type {
  CommentGestureIssue,
  CommentGestureMessageKey,
  CommentGestureReasonKey,
} from '@/lib/api/comment-gestures';
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
  /** `on` est la direction VOULUE, élue ici parce que c'est ici qu'on voit
   * l'état du cœur — et elle voyage ensuite avec la requête (défaut majeur 2). */
  readonly onLike: (commentId: string, on: boolean) => void;
  readonly onEdit: (commentId: string, content: string) => void;
  readonly onDelete: (commentId: string) => void;
  /** Le dernier geste EN ÉCHEC sur cette rangée, avec SA classe d'issue. */
  readonly failureOf: (commentId: string) => CommentGestureRowFailure | undefined;
  /** Rejoue ce geste-là — l'hôte se souvient duquel il s'agit. */
  readonly onRetryGesture: (commentId: string) => void;
  /** VRAI tant qu'un geste de cette rangée est EN VOL — l'indisponibilité
   * s'ANNONCE (`CommentRowView.swift:284`, `.disabled(isInFlight)`), elle ne
   * se contente pas d'avaler le second tap (défaut majeur 7). */
  readonly busyOf: (commentId: string) => boolean;
};

/** Ce que la rangée a besoin de savoir d'un échec : quoi dire, et si un rejeu
 * peut aboutir. La RAISON remplace « Réessayer » quand il ne le peut pas. */
export type CommentGestureRowFailure = {
  readonly message: CommentGestureMessageKey;
  readonly issue: CommentGestureIssue;
  readonly reason?: CommentGestureReasonKey | undefined;
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

/**
 * LE DÉLAI DE RÉTRACTATION DU VERBE DESTRUCTEUR — assez long pour viser
 * « Confirmer » sans se presser, assez court pour qu'un tap oublié ne laisse
 * pas une rangée armée quand on y revient. La valeur est ici, à son SITE
 * UNIQUE, pour que le témoin la lise plutôt que de la redire.
 */
export const COMMENT_DELETE_CONFIRM_MS = 4000;

function GestureBar({
  comment,
  language,
  gestures,
  editRef,
  onStartEdit,
  onDelete,
}: {
  readonly comment: PostComment;
  readonly language: InterfaceLanguage;
  readonly gestures: CommentGestureHandlers;
  readonly editRef: { current: HTMLButtonElement | null };
  readonly onStartEdit: () => void;
  readonly onDelete: () => void;
}) {
  const isLiked = comment.isLikedByMe === true;
  const likes = countOf(comment.likeCount);
  const isMine = comment.author.id === gestures.viewerId;
  const busy = gestures.busyOf(comment.id);

  /**
   * **SUPPRIMER DEMANDE DEUX GESTES, COMME SUR iOS** (revue-correction #7135,
   * défaut majeur 5). `CommentRowView.swift:364` enferme
   * `Button(role: .destructive)` dans un menu « … » : ouvrir, puis choisir.
   * Le web posait le verbe irréversible À DÉCOUVERT, immédiatement à droite du
   * verbe réversible — un pouce qui vise « Modifier » atteignait « Supprimer »,
   * et le commentaire partait sans qu'aucun dialogue ne s'interpose. La
   * confirmation SUR PLACE coûte le même second geste qu'iOS sans imposer une
   * feuille modale, et elle se rétracte seule.
   */
  const [confirming, setConfirming] = useState(false);
  useEffect(() => {
    if (!confirming) return undefined;
    const timer = setTimeout(() => setConfirming(false), COMMENT_DELETE_CONFIRM_MS);
    return () => clearTimeout(timer);
  }, [confirming]);

  return (
    /* Le retrait compense le `px-2` des boutons : la rangée de gestes
       s'aligne alors sur le TEXTE qu'elle suit, pas deux crans à sa droite. */
    <div className="flex items-center gap-1 pt-0.5" style={{ marginInlineStart: -8 }}>
      <button
        type="button"
        data-comment-gesture="like"
        aria-pressed={isLiked}
        /* `aria-disabled` ET `aria-busy`, JAMAIS `disabled` — un `disabled`
           posé sur le bouton qu'on vient d'actionner lui retire le focus, qui
           retombe sur `<body>` : on corrigerait le défaut majeur 7 en
           rejouant le défaut majeur 6 sur le geste le plus fréquent. Le clic
           est retenu ici, à la source, et l'indisponibilité est ANNONCÉE. */
        aria-disabled={busy}
        aria-busy={busy}
        onClick={() => {
          if (busy) return;
          gestures.onLike(comment.id, !isLiked);
        }}
        className={GESTURE_BUTTON}
        style={{
          minHeight: 44,
          color: isLiked ? 'var(--color-error)' : 'var(--color-ios-ink-3)',
          opacity: busy ? 0.5 : 1,
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
            ref={editRef}
            data-comment-gesture="edit"
            onClick={onStartEdit}
            className={`${GESTURE_BUTTON} text-check`}
            style={{ minHeight: 44, color: 'var(--color-ios-ink-3)', outlineColor: 'var(--color-ios-brand)' }}
          >
            {translate(language, 'comments.action.edit')}
          </button>
          {/* **L'ENCRE DESTRUCTRICE** — `Button(role: .destructive)`
              (`CommentRowView.swift:364`), que SwiftUI peint en rouge. Ici le
              signal compte DOUBLE : iOS enferme « Supprimer » dans un menu
              « … » (deux gestes, et le rouge au bout), le web le pose à
              découvert et détruit au PREMIER tap. Sans cette encre, le geste
              irréversible avait l'apparence exacte du geste réversible posé
              juste à sa gauche. Le MÊME jeton que l'alerte d'échec — une
              seule encre de refus pour toute la rangée. */}
          <button
            type="button"
            data-comment-gesture="delete"
            data-comment-delete-armed={confirming ? '' : undefined}
            onClick={() => {
              if (!confirming) {
                setConfirming(true);
                return;
              }
              setConfirming(false);
              onDelete();
            }}
            className={`${GESTURE_BUTTON} text-check`}
            style={{
              minHeight: 44,
              /* L'ÉCART MESURÉ AU RECTANGLE, pas au texte — 4 px séparaient
                 deux cibles dont l'une est irréversible, moitié moins que le
                 minimum entre cibles adjacentes. `gap-1` (4) + 12 = 16 px. */
              marginInlineStart: 12,
              color: 'var(--color-error)',
              fontWeight: confirming ? 600 : undefined,
              outlineColor: 'var(--color-ios-brand)',
            }}
          >
            {translate(language, confirming ? 'comments.action.delete.confirm' : 'comments.action.delete')}
          </button>
        </>
      ) : null}
    </div>
  );
}

/**
 * L'ÉCHEC D'UN GESTE EST VISIBLE SUR SA RANGÉE — jamais un silence : la rangée
 * est revenue à son état d'avant, et sans ce constat le lecteur croirait que
 * son tap n'a pas été pris.
 *
 * **ET IL PORTE SA CLASSE D'ISSUE** (revue-correction #7135, défaut majeur 1).
 * « Réessayer » n'était offert QUE sur les refus que `outcome.ts` déclare
 * NON-REJOUABLES : un 403 retapé rendait la même alerte indéfiniment, pendant
 * que le seul cas où le rejeu sert — la panne passagère — n'avait qu'une ligne
 * grise au bas du fil. Les deux sont inversés ici :
 *
 *  - `refused` : encre d'erreur, `role="alert"`, la RAISON à la place du
 *    rejeu (`comment.refused.*`) — dire pourquoi vaut mieux qu'offrir un
 *    bouton dont on sait qu'il ne peut pas aboutir ;
 *  - `unconfirmed` : encre neutre, `role="status"` (rien n'est perdu, rien
 *    n'est acquis), et « Réessayer » qui rejoue la requête EXACTE.
 */
function GestureFailure({
  language,
  failure,
  onRetry,
}: {
  readonly language: InterfaceLanguage;
  readonly failure: CommentGestureRowFailure;
  readonly onRetry: () => void;
}) {
  const refused = failure.issue === 'refused';
  return (
    <p
      role={refused ? 'alert' : 'status'}
      {...(refused ? {} : { 'aria-live': 'polite' as const })}
      data-comment-gesture-error={failure.message}
      data-comment-gesture-issue={failure.issue}
      className="flex flex-wrap items-center gap-2 pt-0.5"
    >
      <span className="text-caption" style={{ color: refused ? 'var(--color-error)' : 'var(--color-ios-ink-2)' }}>
        {translate(language, failure.message)}
        {failure.reason === undefined ? null : ` ${translate(language, failure.reason)}`}
      </span>
      {refused ? null : (
        <button
          type="button"
          data-comment-gesture-retry
          onClick={onRetry}
          className="rounded-chip px-2 text-check font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{ minHeight: 44, color: 'var(--color-ios-brand)', outlineColor: 'var(--color-ios-brand)' }}
        >
          {translate(language, 'comments.retry')}
        </button>
      )}
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
  const fieldRef = useRef<HTMLTextAreaElement>(null);

  /**
   * LE FOCUS SUIT LE GESTE — « Modifier » démonte la barre entière, donc le
   * bouton qu'on vient d'actionner : sans cette reprise, le focus retombe sur
   * `<body>` et qui navigue au clavier ou au lecteur d'écran perd sa place,
   * devant retraverser la page pour atteindre le champ qu'il vient d'ouvrir.
   * Même discipline que le composeur quand un refus lui rend son texte
   * (`comment-composer.tsx:59`).
   *
   * LE CURSEUR VA À LA FIN, jamais sur une sélection totale : on ouvre ce
   * champ pour corriger une lettre, et la première frappe effacerait tout le
   * commentaire. `setSelectionRange` est gardé — un environnement de test
   * peut ne pas l'offrir, et le focus vaut mieux que rien.
   */
  useEffect(() => {
    const field = fieldRef.current;
    if (field === null) return;
    field.focus();
    field.setSelectionRange?.(field.value.length, field.value.length);
  }, []);

  return (
    <div className="flex flex-col gap-2 pt-1">
      <textarea
        ref={fieldRef}
        data-comment-edit-field={comment.id}
        aria-label={translate(language, 'comments.edit.label')}
        value={draft}
        rows={2}
        /* LA MÊME BORNE QUE LE COMPOSEUR (`comment-composer.tsx:91`) — sans
           elle, on tapait au-delà de 2000 et « Enregistrer » s'éteignait en
           silence : un bouton devenu inerte sans qu'un mot dise pourquoi. La
           borne est celle de la passerelle, lue au site UNIQUE. */
        maxLength={COMMENT_MAX_LENGTH}
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

  /**
   * **LE FOCUS REVIENT D'OÙ IL EST PARTI** (revue-correction #7135, défaut
   * majeur 6) — la moitié manquante de « le focus suit le geste ». L'aller
   * était posé (`EditForm` prend le focus à l'ouverture) ; au RETOUR,
   * « Annuler » et « Enregistrer » démontaient le champ ET leurs deux boutons
   * sans rendre le focus à rien, et le lecteur d'écran repartait du haut du
   * document. Le bouton « Modifier » est remonté par le même rendu : on le
   * refocalise, ce qui est exactement la place d'où le geste est parti.
   */
  const editRef = useRef<HTMLButtonElement>(null);
  const rowRef = useRef<HTMLLIElement>(null);
  const wasEditing = useRef(false);
  useEffect(() => {
    if (wasEditing.current && !editing) editRef.current?.focus();
    wasEditing.current = editing;
  }, [editing]);

  const save = useCallback(
    (content: string) => {
      setEditing(false);
      actionable?.onEdit(comment.id, content);
    },
    [actionable, comment.id],
  );

  /**
   * **SUPPRIMER EMPORTE LA RANGÉE ENTIÈRE, DONC LE FOCUS AVEC ELLE.** La
   * destination se lit AVANT l'appel, tant que la rangée est encore montée :
   * le cœur de la rangée SUIVANTE, ou à défaut le fil lui-même, qui porte son
   * nom accessible (« Commentaires »). Après coup il n'y aurait plus de nœud
   * d'où regarder le voisinage.
   */
  const requestDelete = useCallback(() => {
    const row = rowRef.current;
    const next = row?.nextElementSibling ?? row?.previousElementSibling ?? null;
    const target =
      next?.querySelector<HTMLElement>('[data-comment-gesture="like"]') ??
      row?.closest<HTMLElement>('[data-comment-thread]') ??
      null;
    actionable?.onDelete(comment.id);
    target?.focus();
  }, [actionable, comment.id]);

  return (
    <li
      ref={rowRef}
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
          <GestureBar
            comment={comment}
            language={language}
            gestures={actionable}
            editRef={editRef}
            onStartEdit={() => setEditing(true)}
            onDelete={requestDelete}
          />
        ) : null}
        {actionable !== undefined && failure !== undefined ? (
          <GestureFailure language={language} failure={failure} onRetry={() => actionable.onRetryGesture(comment.id)} />
        ) : null}
      </div>
    </li>
  );
}
