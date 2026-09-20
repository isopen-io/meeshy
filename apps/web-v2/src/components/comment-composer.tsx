import { useCallback, useId, useRef, useState } from 'react';

import { Glyph } from '@/components/glyph';
import { COMMENT_MAX_LENGTH } from '@/lib/api/publication-comments';
import { translate, type InterfaceCatalogKey } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

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
};

export function CommentComposer({ language, onSend, canWrite }: CommentComposerProps) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<ComposerNotice | null>(null);
  const fieldRef = useRef<HTMLTextAreaElement | null>(null);
  const fieldId = useId();

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
    }
  }, [text, sending, onSend, language]);

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
      data-comment-composer
      className="flex flex-col gap-1 px-3 py-2"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div className="flex items-end gap-2">
      <label className="sr-only" htmlFor={fieldId}>
        {translate(language, 'comments.placeholder')}
      </label>
      <textarea
        id={fieldId}
        ref={fieldRef}
        data-comment-field
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
        onInput={(e) => setText(e.currentTarget.value)}
        onKeyDown={(e) => {
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
        }}
      />
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
          color: vide || sending ? 'var(--color-ios-ink-3)' : '#fff',
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
    </form>
  );
}
