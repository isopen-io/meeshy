import { useEffect, useId, useRef } from 'react';

import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { useBackDismiss } from '@/lib/view/use-back-dismiss';

/**
 * **« PUBLIER EN RÉEL ? »** (#8603, demande porteur 2026-09-28) — un post
 * dont le seul média est une vidéo part en RÉEL, sauf si l'auteur dit
 * vraiment « C'est un Post ». Miroir de l'alerte iOS
 * (`ComposerReelOffer`, `.alert` à action préférée) : trois issues, une par
 * bouton, et la principale en tête, pleine, focalisée d'office — Entrée la
 * choisit.
 *
 * `<dialog>` ouvert par `showModal()`, comme `ConfirmDialog` : piège de focus,
 * Échap et inertie de l'arrière-plan NATIFS ; l'événement `close` (Échap) et
 * « Annuler » passent par le MÊME chemin, qui ne publie rien. Le retour
 * matériel d'Android le ferme sans quitter le studio (`useBackDismiss`).
 */
export function ReelOfferDialog({
  lang,
  onReel,
  onPost,
  onCancel,
}: {
  readonly lang: InterfaceLanguage;
  readonly onReel: () => void;
  readonly onPost: () => void;
  readonly onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const reelRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const bodyId = useId();
  useBackDismiss(onCancel);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog === null) return undefined;
    if (!dialog.open && typeof dialog.showModal === 'function') dialog.showModal();
    reelRef.current?.focus();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, []);

  const secondary = {
    minHeight: 48,
    color: 'var(--color-ios-ink)',
    border: '1.5px solid color-mix(in srgb, var(--color-ios-ink-3) 45%, transparent)',
    outlineColor: 'var(--color-ios-brand)',
  } as const;

  return (
    <dialog
      ref={ref}
      data-reel-offer
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      onClose={onCancel}
      className="m-auto w-[min(26rem,calc(100%-2rem))] rounded-card p-0 backdrop:bg-black/40"
      style={{ backgroundColor: 'var(--color-ios-card)', color: 'var(--color-ios-ink)', border: 0 }}
    >
      <div className="grid gap-3 p-5">
        <h2 id={titleId} className="text-thread font-extrabold">
          {translate(lang, 'composer.reelOffer.title')}
        </h2>
        <p id={bodyId} className="text-body" style={{ color: 'var(--color-ios-ink-2)' }}>
          {translate(lang, 'composer.reelOffer.body')}
        </p>
        <div className="mt-2 grid gap-2.5">
          <button
            ref={reelRef}
            type="button"
            data-reel-offer-choice="reel"
            onClick={onReel}
            className="grid place-items-center rounded-chip px-3 text-body font-bold focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{ minHeight: 48, backgroundColor: 'var(--color-ios-brand)', color: '#fff', outlineColor: 'var(--color-ios-brand)' }}
          >
            {translate(lang, 'composer.reelOffer.reel')}
          </button>
          <button
            type="button"
            data-reel-offer-choice="post"
            onClick={onPost}
            className="grid place-items-center rounded-chip px-3 text-body font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
            style={secondary}
          >
            {translate(lang, 'composer.reelOffer.post')}
          </button>
          <button
            type="button"
            data-reel-offer-choice="cancel"
            onClick={onCancel}
            className="grid place-items-center rounded-chip px-3 text-body focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{ minHeight: 44, color: 'var(--color-ios-ink-2)', outlineColor: 'var(--color-ios-brand)' }}
          >
            {translate(lang, 'common.cancel')}
          </button>
        </div>
      </div>
    </dialog>
  );
}
