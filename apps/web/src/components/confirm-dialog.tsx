import { useEffect, useId, useRef } from 'react';

import { useBackDismiss } from '@/lib/view/use-back-dismiss';

/**
 * **LA CONFIRMATION D'UN GESTE, UNE SEULE FOIS POUR TOUS LES ÉCRANS**
 * (revue-correction #6149) — l'`alert` d'iOS (`.alert(…)` + un bouton de rôle
 * `.destructive`, `MyStoriesDeleteConfirmation.swift:19-38`) est UNE
 * présentation système que chaque écran iOS réutilise. Le web en portait déjà
 * TROIS copies divergentes (`LogoutConfirm` de `settings.tsx`,
 * `UnblockConfirm` de `discover-parts.tsx`, `ConfirmDelete` de
 * `share-link-edit.tsx` : trois largeurs, trois voiles, trois rouges) ; le
 * listing « Mes stories » en recopiait une quatrième. Ce composant est celle
 * que le prochain écran importe — la migration des trois autres est #7858,
 * pas une jumelle de plus.
 *
 * `<dialog>` ouvert par `showModal()`, comme `Sheet` : piège de focus, Échap
 * et inertie de l'arrière-plan NATIFS. `onClose` est branché sur l'événement
 * `close` du dialogue — Échap et « Annuler » passent par le MÊME chemin — et
 * le retour matériel d'Android le ferme sans quitter l'écran
 * (`useBackDismiss`).
 *
 * **LE GESTE DESTRUCTIF EST UN TEXTE ROUGE, JAMAIS DU BLANC SUR DU ROUGE** —
 * c'est la forme de l'alerte iOS, et c'est la seule qui tienne AA dans les
 * deux schémas : `--color-danger` vaut #f45b5b en sombre, où du blanc ne
 * contraste qu'à 3,2:1 ; le même rouge sur la carte sombre (#13111c) tient
 * 5,7:1, et #c81e1e sur la carte claire 5,3:1.
 *
 * Les identifiants du titre et du corps viennent de `useId()` : deux
 * confirmations montées dans la même page (un écran et sa feuille) ne se
 * volent jamais leur nom.
 */
export type ConfirmTone = 'destructive' | 'default';

const TONE_INK: Readonly<Record<ConfirmTone, string>> = {
  destructive: 'var(--color-error)',
  default: 'var(--color-ios-brand)',
};

export function ConfirmDialog({
  name,
  title,
  body,
  cancelLabel,
  confirmLabel,
  tone,
  onConfirm,
  onCancel,
}: {
  /** La prise des témoins et des gates (`data-confirm-dialog`). */
  readonly name: string;
  readonly title: string;
  readonly body: string;
  readonly cancelLabel: string;
  readonly confirmLabel: string;
  readonly tone: ConfirmTone;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const bodyId = useId();
  useBackDismiss(onCancel);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog === null) return undefined;
    if (!dialog.open && typeof dialog.showModal === 'function') dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, []);

  const ink = TONE_INK[tone];

  return (
    <dialog
      ref={ref}
      data-confirm-dialog={name}
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      onClose={onCancel}
      className="m-auto w-[min(26rem,calc(100%-2rem))] rounded-card p-0 backdrop:bg-black/40"
      style={{ backgroundColor: 'var(--color-ios-card)', color: 'var(--color-ios-ink)', border: 0 }}
    >
      <div className="grid gap-3 p-5">
        <h2 id={titleId} className="text-thread font-extrabold">
          {title}
        </h2>
        <p id={bodyId} className="text-body" style={{ color: 'var(--color-ios-ink-2)' }}>
          {body}
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2.5">
          <button
            type="button"
            data-confirm="cancel"
            onClick={onCancel}
            className="grid place-items-center rounded-chip px-3 text-body font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{
              minHeight: 48,
              color: 'var(--color-ios-ink)',
              border: '1.5px solid color-mix(in srgb, var(--color-ios-ink-3) 45%, transparent)',
              outlineColor: 'var(--color-ios-brand)',
            }}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            data-confirm="confirm"
            onClick={onConfirm}
            className="grid place-items-center rounded-chip px-3 text-body font-bold focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{
              minHeight: 48,
              color: ink,
              border: `1.5px solid color-mix(in srgb, ${ink} 55%, transparent)`,
              outlineColor: ink,
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
