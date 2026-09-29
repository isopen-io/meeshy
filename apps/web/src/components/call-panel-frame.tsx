import { useLayoutEffect, useRef, type KeyboardEvent, type ReactNode, type WheelEvent } from 'react';

/**
 * **UN SOUS-MENU DE L'APPEL, DANS LE CADRE DE LA PILULE** (#8550, #8578) — la
 * forme commune des panneaux que le `(…)` ouvre : Réagir, Enregistrer,
 * Ajouter, Journal. Chacun s'ouvre DANS le cadre de la pilule et REMPLACE les
 * rangées d'actions (une chose à la fois), sous un petit en-tête (‹ Retour ·
 * titre · Fermer) : ‹ revient aux rangées, ✕ referme tout. Un fond à peine
 * plus clair le distingue ; jamais de verre dans le verre.
 *
 * Échap le ferme sans réduire l'appel ; à l'ouverture, le focus va au choix
 * coché ou au premier bouton ; en fermant, l'écran le rend au bouton qui l'a
 * ouvert. Les flèches d'une rangée lui sont REMISES (`onRowKeyDown`) : ce
 * module, partagé par des chunks chargés à part, n'importe rien de l'écran
 * d'appel.
 */

export type RowKeyDown = (event: KeyboardEvent<HTMLElement>) => void;

export type RowWheel = (event: WheelEvent<HTMLElement>) => void;

/** La rangée d'un panneau : comme celles du `(…)`, libre et sans élasticité (#8736). */
export const PANEL_ROW_SCROLL = 'flex gap-1.5 overflow-x-auto overscroll-x-none px-1 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [&>*]:shrink-0';

export const PANEL_ROW_TITLE = 'px-2 text-mini font-semibold tracking-wide text-white/70 [font-variant-caps:all-small-caps]';

/** Une pastille de choix dans une rangée : 44 de haut au moins, cochée en blanc. */
export const CHIP = 'flex min-h-11 items-center gap-2 whitespace-nowrap rounded-full px-3 text-mini font-semibold transition-colors motion-reduce:transition-none';

export const chipStyle = (checked: boolean) =>
  checked ? { background: 'white', color: 'var(--ios-indigo-950)' } : { background: 'rgb(255 255 255 / 0.08)', color: 'white', boxShadow: 'inset 0 0 0 1px rgb(255 255 255 / 0.28)' };

const FOCUS_ORDER = ['[data-panel-first]', '[aria-checked="true"]', 'input', '[data-row-item]', 'button:not([data-panel-close]):not([data-panel-back])'] as const;

type FrameProps = {
  readonly id: string;
  readonly title: string;
  readonly closeLabel: string;
  readonly closeGlyph: ReactNode;
  readonly onClose: () => void;
  readonly children: ReactNode;
  readonly data: Readonly<Record<`data-${string}`, string>>;
  readonly closeData?: Readonly<Record<`data-${string}`, string>>;
  /** ‹ : revenir au menu des rangées (#8578). */
  readonly back?: PanelBack | undefined;
};

export type PanelBack = { readonly label: string; readonly onPress: () => void };

const chevron = (
  <svg aria-hidden viewBox="0 0 24 24" className="size-5 rtl:-scale-x-100" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="m15 5-7 7 7 7" />
  </svg>
);

export function CallPanelFrame({ id, title, closeLabel, closeGlyph, onClose, children, data, closeData = {}, back }: FrameProps) {
  const panel = useRef<HTMLDivElement>(null);
  const titleId = `${id}-title`;
  useLayoutEffect(() => {
    const root = panel.current;
    const first = root === null ? undefined : FOCUS_ORDER.map((selector) => root.querySelector<HTMLElement>(selector)).find((element) => element !== null);
    first?.focus();
  }, []);
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Escape') return;
    event.stopPropagation();
    onClose();
  };
  return (
    <div
      ref={panel}
      id={id}
      role="group"
      aria-labelledby={titleId}
      onKeyDown={onKeyDown}
      className="flex min-w-0 flex-col gap-1.5 rounded-[22px] pb-1.5 text-white"
      style={{ background: 'rgb(255 255 255 / 0.07)' }}
      {...data}
    >
      <div className={`flex items-center gap-1 ${back === undefined ? 'ps-3' : ''}`}>
        {back === undefined ? null : (
          <button type="button" aria-label={back.label} title={back.label} onClick={back.onPress} className="grid size-11 shrink-0 place-items-center rounded-full transition-transform active:scale-95 motion-reduce:transition-none" data-panel-back="">
            {chevron}
          </button>
        )}
        <h2 id={titleId} className="min-w-0 flex-1 truncate text-body font-semibold">
          {title}
        </h2>
        <button
          type="button"
          aria-label={closeLabel}
          title={closeLabel}
          onClick={onClose}
          className="grid size-11 shrink-0 place-items-center rounded-full transition-transform active:scale-95 motion-reduce:transition-none"
          data-panel-close=""
          {...closeData}
        >
          {closeGlyph}
        </button>
      </div>
      {children}
    </div>
  );
}

type RowProps = {
  readonly title: string;
  readonly role: 'toolbar' | 'radiogroup';
  readonly onRowKeyDown: RowKeyDown;
  readonly onRowWheel?: RowWheel | undefined;
  readonly children: ReactNode;
  readonly data?: Readonly<Record<`data-${string}`, string>>;
};

/** Une rangée du panneau : sa légende, puis ses choix qui défilent à l'horizontale. */
export function PanelRow({ title, role, onRowKeyDown, onRowWheel, children, data = {} }: RowProps) {
  return (
    <div className="flex min-w-0 flex-col gap-1" {...data}>
      <span aria-hidden className={PANEL_ROW_TITLE}>
        {title}
      </span>
      <div role={role} aria-label={title} {...(role === 'toolbar' ? { 'aria-orientation': 'horizontal' as const } : {})} onKeyDown={onRowKeyDown} {...(onRowWheel === undefined ? {} : { onWheel: onRowWheel })} className={PANEL_ROW_SCROLL} data-call-row-scroll="">
        {children}
      </div>
    </div>
  );
}
