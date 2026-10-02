import { useCallback, useEffect, useId, useRef, useState } from 'react';

import { Glyph, GlyphSvg } from '@/components/glyph';
import { FEED_GLYPHS } from '@/components/glyphs-feed';
import { MentionFieldPanel } from '@/components/mention-suggestions';
import { COMMENT_MAX_LENGTH } from '@/lib/api/publication-comments';
import { translate, type InterfaceCatalogKey } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { withReplyMention, type CommentReplyTarget } from '@/lib/view/comment-reply-target';
import type { MentionSource } from '@/lib/view/mention-source';
import { useMentionField } from '@/lib/view/use-mention-field';

/**
 * **LE COMPOSEUR DE COMMENTAIRE** — miroir réduit de
 * `PostDetailView+CommentComposer.swift` et de `StoryComposerBarView`
 * (`StoryViewerView+CanvasComposerBar.swift`) : **UNE seule zone de saisie**
 * (spécification porteur du 2026-05-28 citée par le fichier Swift), pièces
 * jointes, voix et lieu hors tranche — donc aucun de leurs boutons ici.
 *
 * **LE CHAMP SE VIDE AVANT LE RÉSEAU.** L'optimiste vit dans la liste
 * (`performComment` l'y pose) : garder le texte dans le champ le montrerait
 * DEUX FOIS. Un refus permanent le REND — sans quoi ce que le lecteur vient
 * d'écrire serait perdu par un 403, ce qu'aucun produit ne fait.
 *
 * **LE BOUTON D'ENVOI EXISTE TOUJOURS, IL EST DÉSACTIVÉ À VIDE** — et c'est
 * la seule forme d'inertie acceptable ici (loi 4) : `disabled` ANNONCE
 * l'indisponibilité au lecteur d'écran, au lieu d'un bouton actif qui ne fait
 * rien. Un envoi EN VOL le désactive aussi : deux taps enverraient deux
 * commentaires (`replayCost: 'diverges'` côté passerelle — l'idempotence par
 * `X-Client-Mutation-Id` garde un REJEU, pas deux intentions distinctes).
 */

/** La cible du ⌄ : 44 px, la taille minimale d'un contrôle au doigt. */
const FOLD_TARGET_PX = 44;

/**
 * LE FOCUS EST-IL DANS LE COMPOSEUR ? — écouté sur `focusin`/`focusout` de la
 * forme (ils bouillonnent, `focus`/`blur` non), et annoncé à l'hôte à chaque
 * changement. Une sortie vers un élément ENCORE dans la forme (champ → ⌄ →
 * envoi, à la tabulation) n'est pas une sortie.
 */
function useComposerWriting(
  formRef: { readonly current: HTMLFormElement | null },
  onWritingChange: ((writing: boolean) => void) | undefined,
  mounted: boolean,
): boolean {
  const [writing, setWriting] = useState(false);
  const report = useRef(onWritingChange);
  report.current = onWritingChange;
  useEffect(() => {
    const form = formRef.current;
    if (form === null) return;
    const onIn = () => setWriting(true);
    const onOut = (e: FocusEvent) => {
      if (e.relatedTarget instanceof Node && form.contains(e.relatedTarget)) return;
      setWriting(false);
    };
    form.addEventListener('focusin', onIn);
    form.addEventListener('focusout', onOut);
    return () => {
      form.removeEventListener('focusin', onIn);
      form.removeEventListener('focusout', onOut);
    };
  }, [formRef, mounted]);
  useEffect(() => {
    report.current?.(writing);
  }, [writing]);
  useEffect(() => () => report.current?.(false), []);
  return writing;
}

export type CommentComposerResult = { readonly ok: boolean; readonly message?: InterfaceCatalogKey | undefined };

/** CE QUE LE COMPOSEUR A À DIRE, et de quelle encre — `refused` a perdu le
 * texte (il est rendu au champ) ; `unconfirmed` l'a posé sans confirmation. */
type ComposerNotice = { readonly text: string; readonly issue: 'refused' | 'unconfirmed' };

export type CommentComposerProps = {
  readonly language: InterfaceLanguage;
  readonly onSend: (content: string) => Promise<CommentComposerResult>;
  /** Absent ⇒ le composeur laisse place à une invitation à se connecter :
   * `POST /posts/:postId/comments` exige un `registeredUser` (`comments.ts:184`),
   * donc un champ offert à un visiteur anonyme serait un contrôle qui ment. */
  readonly canWrite: boolean;
  /** LE CONTEXTE DES MENTIONS (#7846) — la publication commentée
   * (`useMentionSource`) ; `null` : aucune liste ne s'ouvre. */
  readonly mentionSource?: MentionSource | null;
  /**
   * **LA CIBLE D'UNE RÉPONSE** (#8583) — posée par le glissé d'une rangée ou
   * son bouton « Répondre ». Le composeur l'ANNONCE (bandeau « Répondre à X »
   * et son ×), prend le FOCUS, et préremplit la @mention d'une réponse à une
   * réponse — miroir de `commentReplyBanner` et `beginReply(to:)`
   * (`FeedCommentsSheet.swift`). C'est l'hôte qui tient la cible et l'envoie
   * avec le texte : le composeur ne connaît ni la racine ni le réseau.
   */
  readonly replyTo?: CommentReplyTarget | null;
  readonly onCancelReply?: () => void;
  /**
   * **ON ÉCRIT** (#8643) — vrai tant que le focus est DANS le composeur (champ,
   * ⌄, envoi). L'hôte d'un lecteur plein écran en fait réduire la scène
   * au-dessus de la barre (`lib/view/scene-yields.ts`).
   */
  readonly onWritingChange?: (writing: boolean) => void;
  /** Un envoi RÉUSSI replie la saisie (lecteur de story ou de réel : on
   * revient à la lecture, la scène reprend sa taille). Absent : on enchaîne. */
  readonly foldOnSend?: boolean;
};

export function CommentComposer({
  language,
  onSend,
  canWrite,
  mentionSource = null,
  replyTo = null,
  onCancelReply,
  onWritingChange,
  foldOnSend = false,
}: CommentComposerProps) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<ComposerNotice | null>(null);
  const fieldRef = useRef<HTMLTextAreaElement | null>(null);
  const fieldId = useId();
  const mention = useMentionField({ text, fieldRef, onText: setText, source: mentionSource });
  const formRef = useRef<HTMLFormElement | null>(null);
  const [userFolded, setUserFolded] = useState(false);
  const folded = userFolded && replyTo === null;
  const writing = useComposerWriting(formRef, onWritingChange, canWrite);

  /* RENDRE LA LECTURE (un envoi réussi chez un hôte `foldOnSend`, ou le ⌄) :
     le focus quitte le composeur pour le FIL qui le porte (sa racine
     `tabIndex=-1`), jamais pour `<body>` — au clavier, on repartirait du haut
     du document. */
  const release = useCallback(() => {
    const thread = formRef.current?.parentElement?.closest<HTMLElement>('[tabindex="-1"]') ?? null;
    if (thread !== null) thread.focus();
    else if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  }, []);

  /* LE REPLI (#9122, miroir `StoryComposerFold`) — le ⌄, visible d'emblée,
     réduit la barre à UNE icône de commentaire ; le brouillon reste dans
     `text`. Une réponse en cours la rouvre : sa bannière vit dedans. */
  const fold = useCallback(() => {
    release();
    setUserFolded(true);
  }, [release]);
  const unfold = useCallback(() => {
    setUserFolded(false);
    requestAnimationFrame(() => fieldRef.current?.focus());
  }, []);
  useEffect(() => {
    if (replyTo !== null) setUserFolded(false);
  }, [replyTo]);

  /* LA MENTION PRÉREMPLIE SUIT LA CIBLE — posée pour une réponse à une
     réponse, retirée quand la cible change ou disparaît, jamais cumulée
     (`withReplyMention`). Et le focus va au champ : glisser un commentaire,
     c'est demander à écrire. */
  const appliedMention = useRef<string | null>(null);
  useEffect(() => {
    const next = replyTo?.mention ?? null;
    const previous = appliedMention.current;
    appliedMention.current = next;
    if (previous !== next) setText((current) => withReplyMention(current, previous, next));
    if (replyTo !== null) fieldRef.current?.focus();
  }, [replyTo]);

  const submit = useCallback(async () => {
    const content = text.trim();
    if (content === '' || sending) return;
    setSending(true);
    setNotice(null);
    /* Vidé AVANT l'appel — l'optimiste est déjà dans la liste. */
    setText('');
    const result = await onSend(content);
    setSending(false);
    if (result.message !== undefined) {
      setNotice({
        text: translate(language, result.message as 'comment.send.error'),
        issue: result.ok ? 'unconfirmed' : 'refused',
      });
    }
    /* RENDU au lecteur sur un refus : son texte lui appartient. */
    if (!result.ok) {
      setText(content);
      fieldRef.current?.focus();
      return;
    }
    if (foldOnSend) release();
  }, [text, sending, onSend, language, foldOnSend, release]);

  if (!canWrite) {
    return (
      <p data-comment-composer="signed-out" className="text-caption px-3 py-3" style={{ color: 'var(--color-ios-ink-2)' }}>
        {translate(language, 'comments.signin')}
      </p>
    );
  }

  const vide = text.trim() === '';

  return (
    <form
      ref={formRef}
      data-comment-composer
      data-comment-writing={writing ? '' : undefined}
      className="flex flex-col gap-1 px-3 py-2"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      {/* REPLIÉE (#9122), la barre n'est plus qu'une icône de commentaire ; le
          champ reste MONTÉ, caché — miroir de la plaque iOS gardée à hauteur
          nulle : le brouillon ne dépend d'aucun démontage. */}
      {folded ? (
        <button
          type="button"
          data-comment-unfold=""
          aria-label={translate(language, 'comments.composer.unfold')}
          onClick={unfold}
          className="grid place-items-center self-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{ width: FOLD_TARGET_PX, height: FOLD_TARGET_PX, background: 'var(--color-ios-card)', color: 'var(--color-ios-ink)', outlineColor: 'var(--color-ios-brand)' }}
        >
          <span data-glyph="chatCircle" className="inline-flex">
            <GlyphSvg glyph={FEED_GLYPHS.chatCircle} size={20} />
          </span>
        </button>
      ) : null}
      <div data-comment-composer-body="" className={folded ? 'hidden' : 'contents'}>
      {replyTo === null ? null : (
        <div data-comment-reply-banner={replyTo.commentId} className="flex items-center gap-2 pb-1">
          <span aria-hidden className="shrink-0 rounded-full" style={{ width: 3, height: 32, background: 'var(--color-ios-brand)' }} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-check font-semibold" style={{ color: 'var(--color-ios-brand)' }}>
              {translate(language, 'comments.reply.to', { name: replyTo.authorName })}
            </p>
            {replyTo.excerpt === null ? null : (
              /* LA CIBLE RESTE LISIBLE (#8644) : pendant qu'on écrit dans une
                 feuille de lecteur, la liste s'efface — l'extrait est alors ce
                 qui garde en vue le commentaire auquel on répond. Trois lignes,
                 jamais une (140 caractères au plus, `comment-reply-target`). */
              <p
                data-comment-reply-excerpt=""
                className="line-clamp-3 text-caption"
                style={{ color: 'var(--color-ios-ink-2)' }}
              >
                {replyTo.excerpt}
              </p>
            )}
          </div>
          {onCancelReply === undefined ? null : (
            <button
              type="button"
              data-comment-reply-cancel
              aria-label={translate(language, 'comments.reply.cancel')}
              onClick={() => {
                onCancelReply();
                fieldRef.current?.focus();
              }}
              className="grid shrink-0 place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2"
              style={{ width: 44, height: 44, color: 'var(--color-ios-ink-2)', outlineColor: 'var(--color-ios-brand)' }}
            >
              <Glyph name="x" size={16} />
            </button>
          )}
        </div>
      )}
      <div className="relative flex items-end gap-2">
      <MentionFieldPanel field={mention} language={language} />
      <label className="sr-only" htmlFor={fieldId}>
        {translate(language, 'comments.placeholder')}
      </label>
      {/* LA PLAQUE DU CHAMP (#8643) — le ⌄ vit DEDANS, à l'angle haut-droit
          (haut-gauche en RTL : `insetInlineEnd`), visible d'emblée (#9122,
          `StoryComposerFold.offersFoldButton` côté iOS). */}
      <div data-comment-plate="" className="relative flex min-w-0 flex-1">
      <textarea
        id={fieldId}
        ref={fieldRef}
        data-comment-field
        enterKeyHint="send"
        value={text}
        rows={1}
        maxLength={COMMENT_MAX_LENGTH}
        placeholder={translate(language, 'comments.placeholder')}
        /* `onInput`, JAMAIS `onChange` — mesuré par son témoin : sous le
           runtime Preact (D-2), `onChange` d'un champ est l'événement NATIF
           `change`, qui ne part qu'à la PERTE DU FOCUS. Le bouton d'envoi
           serait donc resté désactivé pendant toute la frappe, et le texte
           n'aurait atteint l'état qu'après un clic ailleurs : un composeur
           qu'on ne peut pas envoyer sans d'abord en sortir. */
        onInput={(e) => {
          setText(e.currentTarget.value);
          mention.syncCaret(e.currentTarget);
        }}
        onFocus={mention.onFocus}
        onBlur={mention.onBlur}
        onClick={(e) => mention.syncCaret(e.currentTarget)}
        onKeyUp={(e) => mention.syncCaret(e.currentTarget)}
        {...mention.aria}
        onKeyDown={(e) => {
          if (mention.onKeyDown(e.nativeEvent)) return;
          /* Entrée ENVOIE, Maj+Entrée saute une ligne — la convention du
             composeur du fil (`composer.tsx`), jamais une seconde. */
          if (e.key !== 'Enter' || e.shiftKey) return;
          e.preventDefault();
          void submit();
        }}
        className="max-h-32 min-h-11 flex-1 resize-none rounded-chip px-3 py-2.5 text-body focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{
          background: 'var(--color-ios-card)',
          color: 'var(--color-ios-ink)',
          outlineColor: 'var(--color-ios-brand)',
          paddingInlineEnd: FOLD_TARGET_PX,
        }}
      />
      {folded ? null : (
      <button
        type="button"
        data-comment-fold=""
        aria-label={translate(language, 'comments.composer.fold')}
        /* Le doigt ne VOLE pas le focus au champ avant le clic : sans cela,
           le champ perdrait la rédaction au `pointerdown` et le ⌄ se
           démonterait avant de recevoir son propre clic. */
        onPointerDown={(e) => e.preventDefault()}
        onMouseDown={(e) => e.preventDefault()}
        onClick={fold}
        className="absolute grid place-items-center rounded-chip focus-visible:outline-2 focus-visible:outline-offset-[-2px]"
        style={{ top: 0, insetInlineEnd: '0px', width: FOLD_TARGET_PX, height: FOLD_TARGET_PX, color: 'var(--color-ios-ink-2)', outlineColor: 'var(--color-ios-brand)' }}
      >
        <Glyph name="caretDown" size={14} />
      </button>
      )}
      </div>
      <button
        type="submit"
        data-comment-send
        disabled={vide || sending}
        aria-label={translate(language, 'comments.send')}
        className="grid shrink-0 place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{
          width: 44,
          height: 44,
          background: vide || sending ? 'var(--color-ios-card)' : 'var(--color-ios-brand)',
          color: vide || sending ? 'var(--color-ios-ink-3)' : 'var(--color-ios-on-brand)',
          outlineColor: 'var(--color-ios-brand)',
        }}
      >
        <Glyph name="arrowUp" size={18} />
      </button>
      </div>
      {/**
       * L'ANNONCE — `performComment` distingue « parti » de « posé mais non
       * confirmé » ; sans ce texte, le second serait indiscernable du
       * premier (le défaut qu'a payé `REACTION_PENDING_MESSAGE`).
       *
       * **ET ELLE SE VOIT** (revue-correction #7135, défaut majeur 8). Elle
       * vivait en `sr-only`, mesurée à 1 × 1 px : quand la passerelle refusait
       * une publication, le seul signal offert à qui VOIT était un champ qui
       * se vide et une rangée fantôme qui reste. La même surface affiche
       * pourtant l'échec d'un GESTE de rangée en clair — l'écran parlait deux
       * langues. `role="status"` et `aria-live` restent : la voix n'y perd
       * rien, c'est l'œil qui y gagne. L'encre suit l'issue, comme sur la
       * rangée : refus en `--color-error`, non-confirmé en encre neutre.
       *
       * PAS DE « RÉESSAYER » ICI, ET C'EST MESURÉ : sur un refus PERMANENT,
       * `performComment` a déjà défait l'optimiste et RENDU le texte au champ
       * — le bouton d'envoi EST le rejeu, et un second bouton à côté ferait
       * deux portes pour un geste. Sur une issue passagère, la rangée
       * optimiste TIENT : rejouer enverrait un `X-Client-Mutation-Id` NEUF
       * (`replayCost: 'diverges'` côté passerelle), donc un SECOND
       * commentaire, pas une reprise du premier. La reprise de cette
       * famille-là est la file #5868.
       */}
      {notice === null ? null : (
        <p
          role="status"
          aria-live="polite"
          data-comment-notice
          data-comment-notice-issue={notice.issue}
          className="text-caption"
          style={{ color: notice.issue === 'refused' ? 'var(--color-error)' : 'var(--color-ios-ink-2)' }}
        >
          {notice.text}
        </p>
      )}
      </div>
    </form>
  );
}
