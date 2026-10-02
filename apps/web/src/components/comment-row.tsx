import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { trackingLinksOf } from '@meeshy/shared/utils/text-segments';

import { Avatar } from '@/components/avatar';
import { CommentBody } from '@/components/comment-body';
import { CommentMedia } from '@/components/comment-media';
import { CommentRowMenu, type CommentMenuPick } from '@/components/comment-row-menu';
import { CommentSwipe } from '@/components/comment-swipe';
import { MentionFieldPanel } from '@/components/mention-suggestions';
import { PersonName } from '@/components/person-name';
import { GlyphSvg } from '@/components/glyph';
import { FEED_GLYPHS } from '@/components/glyphs-feed';
import type {
  CommentGestureIssue,
  CommentGestureMessageKey,
  CommentGestureReasonKey,
} from '@/lib/api/comment-gestures';
import { COMMENT_MAX_LENGTH, type PostComment } from '@/lib/api/publication-comments';
import type { ReportReason } from '@/lib/api/reports';
import { resolveFeedText } from '@/lib/feed/text';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { STICKER_SIDE } from '@/lib/reading-mode/metrics';
import { shortRelativeTime } from '@/lib/relative-time';
import { commentMenuEntries, type CommentMenuEntry } from '@/lib/view/comment-menu';
import { commentStickerOf } from '@/lib/view/comment-sticker';
import { replyTargetOf, type CommentReplyTarget } from '@/lib/view/comment-reply-target';
import { initialsOf } from '@/lib/view/conversation';
import type { MentionSource } from '@/lib/view/mention-source';
import { useMentionField } from '@/lib/view/use-mention-field';
import { PrismPastille } from './message-blocks';
import { StickerArtwork } from './message-body-blocks';
import { RichText } from './rich-text';

/**
 * **UNE RANGÉE DE COMMENTAIRE ET SES TROIS GESTES** (#7135) — miroir de
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
   * l'état du cœur — et elle voyage ensuite avec la requête (défaut majeur 2).
   * `parentId` n'est passé que pour une RÉPONSE (#8583) : le geste vise alors
   * la caisse des réponses de sa racine. */
  readonly onLike: (commentId: string, on: boolean, parentId?: string) => void;
  readonly onEdit: (commentId: string, content: string, parentId?: string) => void;
  readonly onDelete: (commentId: string, parentId?: string) => void;
  /**
   * RÉPONDRE (#8583) — le glissé vers la droite ET le bouton « Répondre »
   * appellent CE rappel, avec la cible déjà composée (racine, extrait servi,
   * mention) : deux portes, un seul geste. Absent ⇒ ni bouton ni glissé.
   */
  readonly onReply?: (target: CommentReplyTarget) => void;
  /**
   * « IMAGER » (#8693) — le commentaire ET le texte que la rangée en AFFICHE
   * (le Prisme, ou l'original que le lecteur a demandé) : la carte montre ce
   * qu'on lit. `withReplies` (#8734) : une racine emporte ses réponses sous
   * elle. Absent ⇒ aucune entrée.
   */
  readonly onImage?: (comment: PostComment, servedText: string, options: { readonly withReplies: boolean }) => void;
  /** « COPIER » (#8734) — le texte AFFICHÉ ; l'hôte annonce l'issue. Absent ⇒ aucune entrée. */
  readonly onCopy?: (text: string) => void;
  /** « SIGNALER » (#8734) — le motif choisi dans la feuille ; aux autres seuls. Absent ⇒ aucune entrée. */
  readonly onReport?: (commentId: string, reason: ReportReason) => void;
  /** Le dernier geste EN ÉCHEC sur cette rangée, avec SA classe d'issue. */
  readonly failureOf: (commentId: string) => CommentGestureRowFailure | undefined;
  /** Rejoue ce geste-là — l'hôte se souvient duquel il s'agit. */
  readonly onRetryGesture: (commentId: string) => void;
  /** VRAI tant qu'un geste de cette rangée est EN VOL — l'indisponibilité
   * s'ANNONCE (`CommentRowView.swift:284`, `.disabled(isInFlight)`), elle ne
   * se contente pas d'avaler le second tap (défaut majeur 7). */
  readonly busyOf: (commentId: string) => boolean;
  /** LE CONTEXTE DES MENTIONS de la publication (#7846) — le champ de
   * modification mentionne comme le composeur, par le même mécanisme. */
  readonly mentionSource?: MentionSource | null;
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
  /** LES RÉPONSES de cette racine (#8583), posées DANS sa rangée — une liste
   * imbriquée appartient à l'élément qu'elle détaille. */
  readonly children?: ReactNode;
};

/** LE PSEUDO, pour que l'avatar d'un commentaire ouvre le profil de son
 *  auteur (#6396). Absent ⇒ aucun lien : `/u/` n'est pas une adresse. */
const handleOf = (author: PostComment['author']): string | undefined =>
  typeof author.username === 'string' && author.username !== '' ? author.username : undefined;

const displayName = (author: PostComment['author']): string => {
  const display = typeof author.displayName === 'string' && author.displayName !== '' ? author.displayName : null;
  const username = typeof author.username === 'string' && author.username !== '' ? author.username : null;
  return display ?? username ?? '';
};

/** La racine d'une RÉPONSE, en argument optionnel — rien pour un premier niveau. */
const parentArgs = (comment: PostComment): [] | [string] =>
  typeof comment.parentId === 'string' && comment.parentId !== '' ? [comment.parentId] : [];

const countOf = (value: number | null | undefined): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0;

/* `inline-flex`, JAMAIS `grid place-items-center` : le cœur et son compte sont
   DEUX enfants, et une grille d'une colonne les empile — le chiffre passait
   SOUS l'icône (mesuré à la capture). `display` ne se surcharge pas en
   ajoutant `flex` derrière `grid` dans la liste de classes : c'est l'ordre de
   la FEUILLE qui tranche, pas celui de l'attribut. */
const COMMENT_TEXT_STYLE = { color: 'var(--color-ios-ink)' } as const;

const GESTURE_BUTTON =
  'inline-flex items-center justify-center gap-1 rounded-chip px-2 focus-visible:outline-2 focus-visible:outline-offset-2';

function GestureBar({
  comment,
  language,
  gestures,
  menuEntries,
  authorName,
  menuRef,
  onPick,
  onReply,
}: {
  readonly comment: PostComment;
  readonly language: InterfaceLanguage;
  readonly gestures: CommentGestureHandlers;
  readonly menuEntries: readonly CommentMenuEntry[];
  readonly authorName: string;
  readonly menuRef: { current: HTMLButtonElement | null };
  readonly onPick: (pick: CommentMenuPick) => void;
  readonly onReply: (() => void) | undefined;
}) {
  const isLiked = comment.isLikedByMe === true;
  const likes = countOf(comment.likeCount);
  const busy = gestures.busyOf(comment.id);

  return (
    /* Le retrait compense le `px-2` des boutons : la rangée de gestes
       s'aligne alors sur le TEXTE qu'elle suit, pas deux crans à sa droite.
       Le « … » (#8734) se pose au BOUT de la rangée, comme le `Menu` de
       `CommentRowView.swift` après son `Spacer()`. */
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
          gestures.onLike(comment.id, !isLiked, ...parentArgs(comment));
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
      {/* **« RÉPONDRE » À LA SOURIS ET AU CLAVIER** (#8583) — le glissé est un
          geste de DOIGT ; ce bouton est la même porte pour qui n'en a pas, et
          il appelle le MÊME rappel que le glissé. */}
      {onReply === undefined ? null : (
        <button
          type="button"
          data-comment-gesture="reply"
          onClick={onReply}
          className={`${GESTURE_BUTTON} text-check`}
          style={{ minHeight: 44, color: 'var(--color-ios-ink-3)', outlineColor: 'var(--color-ios-brand)' }}
        >
          {translate(language, 'comments.action.reply')}
        </button>
      )}
      {/* **LE MENU « … »** (#8734) — Copier, Imager (avec les réponses),
          Modifier et Supprimer (l'auteur), Signaler (les autres). SUPPRIMER y
          coûte DEUX gestes, comme sur iOS : ouvrir, puis choisir le verbe
          rouge — le web le posait à découvert, à côté du verbe réversible. */}
      <CommentRowMenu entries={menuEntries} language={language} authorName={authorName} triggerRef={menuRef} onPick={onPick} />
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
  mentionSource,
  onSave,
  onCancel,
}: {
  readonly comment: PostComment;
  readonly language: InterfaceLanguage;
  readonly mentionSource: MentionSource | null;
  readonly onSave: (content: string) => void;
  readonly onCancel: () => void;
}) {
  const [draft, setDraft] = useState(comment.content);
  const trimmed = draft.trim();
  const submittable = trimmed !== '' && trimmed.length <= COMMENT_MAX_LENGTH;
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const mention = useMentionField({ text: draft, fieldRef, onText: setDraft, source: mentionSource });

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
    <div className="relative flex flex-col gap-2 pt-1">
      <MentionFieldPanel field={mention} language={language} placement="below" />
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
        onInput={(event) => {
          setDraft(event.currentTarget.value);
          mention.syncCaret(event.currentTarget);
        }}
        onFocus={mention.onFocus}
        onBlur={mention.onBlur}
        onClick={(event) => mention.syncCaret(event.currentTarget)}
        onKeyUp={(event) => mention.syncCaret(event.currentTarget)}
        onKeyDown={(event) => void mention.onKeyDown(event.nativeEvent)}
        {...mention.aria}
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
          className="rounded-chip px-5 text-check font-semibold text-ios-on-brand focus-visible:outline-2 focus-visible:outline-offset-2"
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

export function CommentRow({ comment, language, preferredLanguages, locale, now, gestures, children }: CommentRowProps) {
  const [editing, setEditing] = useState(false);
  const name = displayName(comment.author);
  const servi = resolveFeedText({
    preferredLanguages,
    originalLanguage: comment.originalLanguage,
    translations: comment.translations,
    content: comment.content,
  });
  /**
   * **CE QUI EST RÉELLEMENT RENDU** (#7141) — le Prisme sert la traduction par
   * défaut (§ Automatisme) ; ce drapeau ne dit que le GESTE du lecteur, qui a
   * demandé à voir l'original.
   *
   * L'état vit ICI, sur la rangée, et non chez l'hôte : ouvrir un commentaire
   * dans sa langue d'origine ne dit rien des autres, et un registre partagé
   * ferait re-rendre tout le fil à chaque geste sur une seule rangée.
   *
   * Et il gouverne le TEXTE **et** `lang` ensemble : les séparer prononcerait
   * l'espagnol avec une voix anglaise — le défaut exact que `lang` existe pour
   * empêcher, déplacé d'un cran. C'est la dette du motif `showContent={false}`
   * que le `CLAUDE.md` racine décrit (cycle 123) : une surface qui ANNONCE une
   * langue sans la SERVIR est pire qu'une surface non câblée.
   */
  const [showingOriginal, setShowingOriginal] = useState(false);
  const originalLanguage = comment.originalLanguage ?? '';
  /* `marque` garde la règle d'ORIGINE — `lang` se pose parce que le texte est
     TRADUIT, jamais parce qu'il diffère de la langue d'interface (une rangée
     non traduite ne doit rien porter, sans quoi la voix ment). Montrer
     l'original ne se produit QUE sur une rangée traduite : la marque y vaut
     donc aussi, avec la langue de l'original. */
  const lu = showingOriginal
    ? { text: comment.content, language: originalLanguage, marque: originalLanguage !== '' }
    : { text: servi.text, language: servi.language, marque: servi.translated && servi.language !== '' };
  /* LA CARTE DES ADRESSES SUIVIES (#9074) — décodée une fois par commentaire. */
  const trackingLinks = useMemo(() => trackingLinksOf(comment), [comment]);
  /* LE STICKER (#9080) — peint par le MÊME rendu que la bulle d'un message ;
     un commentaire-sticker sans texte ne monte pas de paragraphe vide. */
  const sticker = useMemo(() => commentStickerOf(comment), [comment]);
  /* Les photos et vidéos jointes (#9167) — sans l'image du sticker, qui est
     son premier média (`commentStickerOf`) et qu'il peint déjà. */
  const media = useMemo(() => (sticker === null ? comment.media ?? [] : (comment.media ?? []).slice(1)), [comment.media, sticker]);
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
      actionable?.onEdit(comment.id, content, ...parentArgs(comment));
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
    actionable?.onDelete(comment.id, ...parentArgs(comment));
    target?.focus();
  }, [actionable, comment.id]);

  const onReplyHandler = actionable?.onReply;
  const reply = useMemo(
    () =>
      onReplyHandler === undefined || editing
        ? undefined
        : () => onReplyHandler(replyTargetOf(comment, { authorName: name, displayedText: lu.text })),
    [onReplyHandler, editing, comment, name, lu.text],
  );
  const menuEntries =
    actionable === undefined
      ? []
      : commentMenuEntries({
          comment,
          viewerId: actionable.viewerId,
          servedText: lu.text,
          canCopy: actionable.onCopy !== undefined,
          canImage: actionable.onImage !== undefined,
          canReport: actionable.onReport !== undefined,
        });
  const pick = (choice: CommentMenuPick) => {
    switch (choice.entry) {
      case 'copy':
        actionable?.onCopy?.(lu.text);
        return;
      case 'image':
      case 'imageWithReplies':
        actionable?.onImage?.(comment, lu.text, { withReplies: choice.entry === 'imageWithReplies' });
        return;
      case 'edit':
        setEditing(true);
        return;
      case 'delete':
        requestDelete();
        return;
      case 'report':
        actionable?.onReport?.(comment.id, choice.reason);
        return;
    }
  };

  return (
    <li
      ref={rowRef}
      data-comment-row={comment.id}
      {...(comment.pending === true ? { 'data-comment-pending': '' } : {})}
      style={{ opacity: comment.pending === true ? 0.6 : 1 }}
    >
      <CommentSwipe onReply={reply}>
        <div className="flex gap-3 py-2">
          <Avatar
            initials={initialsOf(name)}
            color="var(--color-ios-brand)"
            size={32}
            name={name}
            {...(photo === undefined ? {} : { src: photo })}
            {...(handleOf(comment.author) === undefined ? {} : { profileUsername: handleOf(comment.author) as string })}
          />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <div className="flex min-w-0 items-baseline gap-2">
              {/* LE NOM MÈNE OÙ L'AVATAR MÈNE (#7241) — même pseudo, même loi
                  (`identityTarget`), jamais une seconde décision à faire dériver. */}
              <PersonName
                name={name}
                username={handleOf(comment.author)}
                className="truncate text-check font-semibold"
                style={{ color: 'var(--color-ios-ink)' }}
              />
              <span className="shrink-0 text-check" style={{ color: 'var(--color-ios-ink-3)' }}>
                {comment.pending === true
                  ? translate(language, 'comments.row.pending')
                  : shortRelativeTime(new Date(comment.createdAt), now, locale)}
              </span>
              {/* LA PASTILLE SE GARDE ELLE-MÊME : `servedLanguage === originalLanguage`
                  ⇒ elle rend `null`. Une rangée non traduite n'annonce donc rien, et
                  aucune condition n'est à tenir ici en double. */}
              <PrismPastille
                servedLanguage={servi.language}
                originalLanguage={originalLanguage}
                active={showingOriginal ? originalLanguage : null}
                language={language}
                subject="comment"
                onToggle={() => setShowingOriginal((open) => !open)}
              />
            </div>
            {editing && actionable !== undefined ? (
              <EditForm
                comment={comment}
                language={language}
                mentionSource={gestures?.mentionSource ?? null}
                onSave={save}
                onCancel={() => setEditing(false)}
              />
            ) : (
              /* `lang` UNIQUEMENT quand le texte servi n'est PAS la langue du
                 document : poser `lang` partout ferait mentir la voix sur les
                 rangées non traduites. */
              <CommentBody comment={comment} contentLength={lu.text.length}>
                {sticker !== null ? (
                  <div data-comment-sticker className="py-1">
                    <StickerArtwork sticker={sticker.sticker} picture={sticker.picture} side={STICKER_SIDE} />
                  </div>
                ) : null}
                {(sticker === null && media.length === 0) || lu.text.trim() !== '' ? (
                  <RichText
                    text={lu.text}
                    trackingLinks={trackingLinks}
                    className="text-body break-words whitespace-pre-wrap"
                    style={COMMENT_TEXT_STYLE}
                    {...(lu.marque ? { lang: lu.language } : {})}
                  />
                ) : null}
                {media.length > 0 ? <CommentMedia media={media} /> : null}
              </CommentBody>
            )}
            {actionable !== undefined && !editing ? (
              <GestureBar
                comment={comment}
                language={language}
                gestures={actionable}
                menuEntries={menuEntries}
                authorName={name}
                menuRef={editRef}
                onPick={pick}
                onReply={reply}
              />
            ) : null}
            {actionable !== undefined && failure !== undefined ? (
              <GestureFailure language={language} failure={failure} onRetry={() => actionable.onRetryGesture(comment.id)} />
            ) : null}
          </div>
        </div>
      </CommentSwipe>
      {children}
    </li>
  );
}
