import { useCallback, useEffect, useId, useImperativeHandle, useRef, type ReactNode, type Ref, type RefObject } from 'react';

import '@/styles/send-sheet.css';

import { useBackDismiss } from '@/lib/view/use-back-dismiss';

/**
 * LE CADRE DES FEUILLES D'ENVOI ET DE PARTAGE (#8884, directive porteur
 * 2026-09-30 : « les feuilles de partage et de transfert reposent sur la MÊME
 * base, moderne »). La feuille d'envoi s'y pose, et toute autre feuille de
 * partage s'y posera : le COMPORTEMENT modal, l'en-tête « Annuler · titre ·
 * action » et le pied collant sont écrits UNE fois.
 *
 * **`<dialog>` ouvert par `showModal()`** — pour la même raison que
 * `sheet.tsx` : le piège de focus, Échap et l'inertie de l'arrière-plan sont
 * RENDUS par le navigateur, pas imités. Échap (`cancel`), « Annuler » et le
 * retour matériel d'Android (`useBackDismiss`) passent par UN chemin,
 * `dismiss`, et `onClose` n'est rappelé que par l'événement `close` du
 * dialogue : il n'existe aucun état où la feuille est fermée pour le
 * navigateur et montée pour l'hôte.
 *
 * **« Annuler » est un MOT, à gauche** — la directive demande un bouton
 * ANNULER clair : une croix grise se cherche, un mot se lit. Cible de 44.
 * L'encre est celle du TITRE, pas la marque : `--ios-indigo-500` sur ce verre
 * (`glass-prominent`, fond de repli sur noir ou blanc pur) mesure 3,91:1 en
 * clair et 3,98:1 en sombre (`glassContrastAudit`), sous le 4,5 d'un texte de
 * 17 px — un « Annuler » de marque serait le seul mot illisible de la feuille.
 *
 * **La sortie glisse, sauf si le lecteur a demandé moins de mouvement** : on
 * n'anime que quand le navigateur répond `no-preference` — un moteur qui ne
 * sait pas répondre ferme sur-le-champ, ce qui est aussi le bon défaut.
 */
export type SendSheetFrameHandle = {
  /** Ferme la feuille par le même chemin qu'« Annuler » (sortie animée). */
  readonly dismiss: () => void;
};

/** La durée de la sortie — celle de `send-sheet-sink` (`styles/send-sheet.css`). */
export const SEND_SHEET_EXIT_MS = 160;

const motionAllowed = (): boolean =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: no-preference)').matches;

export function SendSheetFrame({
  title,
  cancelLabel,
  onClose,
  trailing,
  footer,
  initialFocus,
  handleRef,
  children,
}: {
  readonly title: string;
  readonly cancelLabel: string;
  /** Rappelée UNE fois, quand le dialogue est effectivement fermé. */
  readonly onClose: () => void;
  /** L'action de droite de l'en-tête (facultative). */
  readonly trailing?: ReactNode;
  /** Le pied collant — l'action principale de la feuille. */
  readonly footer?: ReactNode;
  /** Ce qui reçoit le focus à l'ouverture ; défaut : le premier contrôle (« Annuler »). */
  readonly initialFocus?: RefObject<HTMLElement | null>;
  readonly handleRef?: Ref<SendSheetFrameHandle>;
  readonly children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const leaving = useRef(false);
  const disposed = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismiss = useCallback(() => {
    const dialog = ref.current;
    if (dialog === null || !dialog.open || leaving.current) return;
    if (!motionAllowed()) {
      dialog.close();
      return;
    }
    leaving.current = true;
    dialog.setAttribute('data-leaving', '');
    timer.current = setTimeout(() => {
      timer.current = null;
      if (dialog.open) dialog.close();
    }, SEND_SHEET_EXIT_MS);
  }, []);

  useImperativeHandle(handleRef, () => ({ dismiss }), [dismiss]);

  useBackDismiss(dismiss);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog === null) return;
    if (!dialog.open) dialog.showModal();
    initialFocus?.current?.focus();
    const onCancel = (event: Event) => {
      event.preventDefault();
      dismiss();
    };
    dialog.addEventListener('cancel', onCancel);
    disposed.current = false;
    return () => {
      disposed.current = true;
      dialog.removeEventListener('cancel', onCancel);
      if (timer.current !== null) clearTimeout(timer.current);
      if (dialog.open) dialog.close();
    };
    /* Le montage seul : le focus initial ne se rejoue pas à chaque rendu. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <dialog
      ref={ref}
      onClose={() => {
        if (!disposed.current) onClose();
      }}
      aria-labelledby={titleId}
      data-send-sheet-frame=""
      className="send-sheet glass-prominent rounded-sheet backdrop:bg-veil"
    >
      <div className="send-sheet-handle" aria-hidden="true" />
      <header className="grid shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-2 px-2 pt-1">
        <button
          type="button"
          onClick={dismiss}
          className="min-h-11 justify-self-start rounded-chip px-3 text-body font-semibold"
          style={{ color: 'var(--color-ios-ink)' }}
        >
          {cancelLabel}
        </button>
        <h2 id={titleId} className="truncate text-body font-semibold" style={{ color: 'var(--color-ios-ink)' }}>
          {title}
        </h2>
        <div className="justify-self-end">{trailing}</div>
      </header>
      <div className={`min-h-0 flex-1 overflow-y-auto overscroll-contain ${footer === undefined ? 'pb-safe' : ''}`}>{children}</div>
      {footer === undefined ? null : (
        <div
          data-send-sheet-footer=""
          className="shrink-0 px-4 pt-2 pb-safe"
          style={{ borderTop: '1px solid var(--color-ios-hairline)' }}
        >
          {footer}
        </div>
      )}
    </dialog>
  );
}
