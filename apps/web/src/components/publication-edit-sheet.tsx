import { useEffect, useRef, useState } from 'react';

import type { EditPostOutcome } from '@/lib/api/publication-actions';
import { POST_CONTENT_MAX_LENGTH, publicationEditState } from '@/lib/feed/publication-edit';
import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';

import { Sheet } from './sheet';

/**
 * **LA FEUILLE D'ÉDITION D'UNE PUBLICATION** (#7534) — chargée À LA DEMANDE
 * depuis `publication-menu-panel.tsx` (motif `report-sheet.tsx`), pour que le
 * fil ne paie l'éditeur qu'au premier « Modifier ». Miroir
 * `EditPostSheet.swift:254-320` :
 *
 * - un champ plein cadre (`data-publication-edit-field`) hydraté par
 *   `original` — le texte tel que l'auteur l'a écrit, JAMAIS la traduction
 *   affichée (le doc-comment de `FeedPostMenu` ci-contre) ;
 * - un compteur de caractères restants, en alerte SOUS 100 (`publicationEditState`) ;
 * - « Annuler » (`common.cancel`) et « Publier » (`feed.post.edit.publish`,
 *   `data-publication-edit-save`), désactivé tant que rien n'a changé, que le
 *   texte est invalide, ou que l'appel est en vol ;
 * - un échec (`'offline'`/`'failed'`/`'busy'`) laisse la feuille OUVERTE avec
 *   le brouillon INTACT (`data-publication-edit-error`) — jamais de reprise
 *   silencieuse en tâche de fond sur un texte qu'on n'a peut-être plus envie
 *   de publier ainsi (§ doc-comment de `publication-actions.ts#editPost`) ;
 *   `'offline'` ET `'busy'` offrent « Réessayer » (`data-publication-edit-retry`,
 *   `feed.retry`, réutilisé plutôt qu'une clé de plus) — `'failed'` est un
 *   refus SERVI (403, texte invalide côté passerelle) qu'un rejeu IDENTIQUE
 *   ne changerait pas. **`'busy'`** (revue-correction #7534, défaut majeur 1)
 *   est un SECOND texte tapé et publié pendant qu'un premier PUT vole encore
 *   pour la MÊME publication (rouvrir « Modifier » pendant le vol, § FERMER
 *   PENDANT LE VOL FERME ci-dessous) : ni la caisse ni le réseau n'ont vu ce
 *   second texte, qui reste donc dans CE brouillon jusqu'à ce que le premier
 *   revienne — jamais l'annonce « Publication modifiée » pour un texte parti
 *   nulle part.
 *
 * **FERMER PENDANT LE VOL FERME** (revue-correction #7534, § Q5 de la
 * spécification). La croix de `Sheet`, Échap et le retour matériel ferment le
 * `<dialog>` NATIVEMENT avant d'appeler `onClose` : l'ignorer pendant le vol
 * laissait une feuille fermée pour le navigateur mais montée pour React —
 * l'invariant que `Sheet` documente —, l'erreur s'y peignait invisible et
 * « Modifier » ne la rouvrait plus. La requête continue donc sans la feuille ;
 * l'HÔTE (`usePostGesture`) annonce l'issue dans sa région `status`, et le
 * cache est déjà juste (optimiste, hydraté ou restauré). Une issue arrivée
 * APRÈS le démontage n'écrit rien ici — ni état, ni `onClose`, qui rendrait le
 * focus au « ⋯ » alors que l'auteur est passé ailleurs. « Annuler » et
 * « Publier » restent éteints pendant le vol, comme iOS
 * (`EditPostSheet.swift:298-320`) : ils couvrent le geste au doigt.
 *
 * Le champ porte `lang` = la langue de l'ORIGINAL : c'est dans cette langue
 * qu'il est écrit, pas dans celle de l'interface (lecteur d'écran, correcteur).
 */
export function PublicationEditSheet({
  postId,
  original,
  originalLanguage,
  onSave,
  onClose,
}: {
  readonly postId: string;
  readonly original: string;
  /** La langue d'`original` (`FeedCardText.originalLanguage`) — vide quand la
   * passerelle n'en sert pas : aucun `lang` n'est alors inventé. */
  readonly originalLanguage: string;
  readonly onSave: (postId: string, content: string) => Promise<EditPostOutcome>;
  readonly onClose: () => void;
}) {
  const language = currentInterfaceLanguage();
  const [draft, setDraft] = useState(original);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<'offline' | 'failed' | 'busy' | null>(null);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const { submittable, remaining, warning } = publicationEditState({ original, draft });

  /* LE FOCUS SUIT L'OUVERTURE, LE CURSEUR VA À LA FIN — même discipline que
     `EditForm` (`comment-row.tsx`) : on ouvre cette feuille pour corriger une
     ligne, pas pour retaper la publication entière. */
  useEffect(() => {
    const field = fieldRef.current;
    if (field === null) return;
    field.focus();
    field.setSelectionRange?.(field.value.length, field.value.length);
  }, []);

  const save = () => {
    if (!submittable || busy) return;
    setBusy(true);
    setError(null);
    void onSave(postId, draft).then((outcome) => {
      if (!mounted.current) return;
      setBusy(false);
      if (outcome === 'done') {
        onClose();
        return;
      }
      setError(outcome);
    });
  };

  return (
    <Sheet
      title={translate(language, 'feed.post.edit.title')}
      bodyAs="div"
      onClose={onClose}
    >
      <div data-publication-edit-sheet className="flex min-h-0 flex-1 flex-col gap-3 px-4 pb-4">
        <textarea
          ref={fieldRef}
          data-publication-edit-field
          {...(originalLanguage === '' ? {} : { lang: originalLanguage })}
          aria-label={translate(language, 'feed.post.edit.body.a11y')}
          value={draft}
          readOnly={busy}
          maxLength={POST_CONTENT_MAX_LENGTH}
          /* `onInput`, JAMAIS `onChange` (D-89) — sous le runtime Preact,
             `onChange` est l'événement NATIF `change`, qui n'arrive qu'à la
             perte du focus : « Publier » resterait désactivé toute la frappe. */
          onInput={(event) => setDraft(event.currentTarget.value)}
          /* Rayon 14 (`EditPostSheet.swift:259-274` : `cornerRadius: 14`) —
             JAMAIS `rounded-chip` (un plein pill, `--radius-chip:
             var(--radius-pill)`) : juste sur un bouton, il déforme un champ
             de plusieurs lignes en stade. */
          className="min-h-40 flex-1 resize-none rounded-[14px] border px-3 py-2.5 text-body focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{
            background: 'var(--color-ios-card)',
            color: 'var(--color-ios-ink)',
            borderColor: 'var(--color-edge)',
            outlineColor: 'var(--color-ios-brand)',
          }}
        />

        <p
          className="text-caption text-right font-medium"
          style={{ color: warning ? 'var(--color-warning)' : 'var(--color-ios-ink-3)' }}
        >
          <span aria-hidden>{remaining}</span>
          <span className="sr-only">{translate(language, 'feed.post.edit.remaining.a11y', { count: String(remaining) })}</span>
        </p>

        {error !== null ? (
          <p data-publication-edit-error role="alert" className="text-caption" style={{ color: 'var(--color-error)' }}>
            {translate(language, error === 'busy' ? 'feed.post.edit_busy' : 'feed.post.edit_failed')}
            {error === 'offline' || error === 'busy' ? (
              <button
                type="button"
                data-publication-edit-retry
                onClick={save}
                className="ml-2 inline-flex items-center px-1 font-semibold underline"
                style={{ minHeight: 44, color: 'var(--color-ios-brand)' }}
              >
                {translate(language, 'feed.retry')}
              </button>
            ) : null}
          </p>
        ) : null}

        <div className="mt-auto flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            data-publication-edit-cancel
            disabled={busy}
            onClick={onClose}
            className="rounded-chip px-4 text-body font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{ minHeight: 44, color: 'var(--color-ios-ink-2)', outlineColor: 'var(--color-ios-brand)', opacity: busy ? 0.5 : 1 }}
          >
            {translate(language, 'common.cancel')}
          </button>
          <button
            type="button"
            data-publication-edit-save
            disabled={!submittable || busy}
            onClick={save}
            className="rounded-chip px-5 text-body font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{
              minHeight: 44,
              backgroundColor: 'var(--color-ios-brand)',
              opacity: submittable && !busy ? 1 : 0.5,
              outlineColor: 'var(--color-ios-brand)',
            }}
          >
            {translate(language, 'feed.post.edit.publish')}
          </button>
        </div>
      </div>
    </Sheet>
  );
}
