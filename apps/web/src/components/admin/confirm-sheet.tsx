import { useEffect, useId, useRef, useState } from 'react';

import { Sheet } from '@/components/sheet';
import { useAdminReach } from '@/lib/admin/use-admin-reach';
import { translateAdmin, type AdminLanguage } from '@/lib/i18n-admin-catalog';

import { BRAND, EDGE, INK, INK2, SURFACE } from './tone';

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2';

/**
 * **TOUT GESTE DESTRUCTIF OU SENSIBLE PASSE PAR ICI** (#8876) — une feuille
 * centrée qui DIT ce qui va se passer (effets de bord compris), nomme le geste
 * par son verbe exact (« Fermer le lien », jamais « OK »), et, quand la
 * passerelle exige un motif, le DEMANDE : tant qu'il est plus court que son
 * minimum, la confirmation reste désactivée.
 *
 * Le focus part sur le champ du motif s'il y en a un, sinon sur « Annuler » :
 * le geste destructif n'est jamais celui que « Entrée » déclenche par
 * inadvertance. Échap et le retour matériel annulent (la feuille s'en charge).
 *
 * `onConfirm` reçoit le motif NETTOYÉ (espaces de bord retirés), ou `null` sans
 * champ de motif. Pendant `busy`, les deux boutons sont désactivés ; une
 * `error` se dit sous le corps, en alerte.
 *
 * **LE RANG SOUVERAIN N'ÉCRIT PAS DE MOTIF** (spec 2026-10-04 § 4, directive
 * porteur : « BIGBOSS n'a besoin de rien justifier »). La feuille lit le rang
 * SERVI (`useAdminReach().isSovereign`, la lecture unique de la matrice) : pour
 * lui, le champ n'est pas rendu, quel que soit `motive`, et la confirmation
 * rend `null` — l'appelant envoie alors le geste SANS `reason`, ce que la
 * passerelle accepte de ce seul rang (le geste reste consigné au journal). La
 * décision vit ICI, une fois : chaque écran qui passe par cette feuille en
 * profite sans la recopier. Tant que la matrice n'est pas lue, le lecteur
 * n'est pas souverain — le champ s'affiche (fermé par défaut).
 *
 * Une NOTE n'est pas un motif (`motive.kind === 'note'`) : les notes d'un
 * dossier de signalement sont son CONTENU, pas une justification du geste —
 * elles restent offertes à tous les rangs, souverain compris.
 */
export function AdminConfirmSheet({
  language,
  title,
  body,
  confirmLabel,
  tone,
  motive: requested,
  busy,
  error,
  onConfirm,
  onCancel,
}: {
  readonly language: AdminLanguage;
  readonly title: string;
  readonly body: string;
  readonly confirmLabel: string;
  readonly tone: 'danger' | 'primary';
  readonly motive?: {
    readonly label: string;
    readonly minLength: number;
    readonly required: boolean;
    /** `'motive'` (défaut) : une justification, que le rang souverain n'écrit pas. `'note'` : un contenu du dossier, offert à tous. */
    readonly kind?: 'motive' | 'note';
  };
  readonly busy: boolean;
  readonly error?: string | null;
  readonly onConfirm: (motive: string | null) => void;
  readonly onCancel: () => void;
}) {
  const reach = useAdminReach();
  const motive = reach.isSovereign && requested?.kind !== 'note' ? undefined : requested;
  const [text, setText] = useState('');
  const field = useRef<HTMLTextAreaElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const motiveId = useId();

  /* `<dialog>.showModal()` (la feuille) place le focus sur le premier élément
     focalisable APRÈS les effets des enfants : on attend un tour pour le
     reprendre, sans quoi il resterait sur la croix de fermeture. */
  useEffect(() => {
    const timer = setTimeout(() => (motive === undefined ? cancel.current : field.current)?.focus(), 0);
    return () => clearTimeout(timer);
  }, [motive]);

  const trimmed = text.trim();
  const tooShort = motive !== undefined && (motive.required || trimmed !== '') && trimmed.length < motive.minLength;
  const blocked = busy || tooShort;

  return (
    <Sheet title={title} presentation="centered" bodyAs="div" closeLabel={translateAdmin(language, 'admin.kit.close')} onClose={onCancel}>
      <div data-admin-confirm className="grid gap-4 px-4 pb-4 pt-2">
        <p className="text-body" style={{ color: INK }}>
          {body}
        </p>

        {motive === undefined ? null : (
          <label htmlFor={motiveId} className="grid gap-1">
            <span className="text-caption font-medium" style={{ color: INK2 }}>
              {motive.label}
            </span>
            <textarea
              id={motiveId}
              ref={field}
              data-admin-motive
              rows={3}
              value={text}
              onInput={(event) => setText(event.currentTarget.value)}
              onChange={() => undefined}
              aria-describedby={`${motiveId}-count`}
              className={`rounded-card px-4 py-3 text-body ${FOCUS}`}
              style={{ backgroundColor: SURFACE, border: `1px solid ${EDGE}`, color: INK, outlineColor: BRAND }}
            />
            <span id={`${motiveId}-count`} data-admin-motive-count className="text-caption tabular-nums" style={{ color: tooShort ? 'var(--color-danger)' : INK2 }}>
              {translateAdmin(language, 'admin.kit.confirm.motiveCount', { count: String(trimmed.length), min: String(motive.minLength) })}
            </span>
          </label>
        )}

        {error === undefined || error === null || error === '' ? null : (
          <p role="alert" data-admin-confirm-error className="text-caption font-medium" style={{ color: 'var(--color-danger)' }}>
            {error}
          </p>
        )}

        <div className="flex flex-wrap justify-end gap-3">
          <button
            type="button"
            ref={cancel}
            data-admin-action="cancel"
            disabled={busy}
            onClick={onCancel}
            className={`rounded-chip px-5 text-body font-semibold disabled:opacity-40 ${FOCUS}`}
            style={{ minHeight: 44, border: `1px solid ${EDGE}`, color: INK, backgroundColor: SURFACE, outlineColor: BRAND }}
          >
            {translateAdmin(language, 'admin.kit.cancel')}
          </button>
          <button
            type="button"
            data-admin-action="confirm"
            disabled={blocked}
            aria-busy={busy}
            onClick={() => onConfirm(motive === undefined ? null : trimmed)}
            className={`rounded-chip px-5 text-body font-semibold text-ios-on-brand disabled:opacity-40 ${FOCUS}`}
            style={{ minHeight: 44, backgroundColor: tone === 'danger' ? 'var(--color-danger)' : BRAND, outlineColor: BRAND }}
          >
            {busy ? translateAdmin(language, 'admin.kit.confirm.busy') : confirmLabel}
          </button>
        </div>
      </div>
    </Sheet>
  );
}
