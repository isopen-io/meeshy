import { useLayoutEffect, useRef, type KeyboardEvent, type ReactNode, type WheelEvent } from 'react';

import type { CallButton } from '@/components/call-glass-button';
import { ROW_EDGE_FADE } from '@/lib/calls/call-row-keys';

/**
 * **UN SOUS-MENU DE L'APPEL, DANS LE CADRE DE LA PILULE** (#8550, #8578) — la
 * forme commune des panneaux que le `(…)` ouvre : Réagir, Enregistrer,
 * Ajouter, Journal. Chacun s'ouvre DANS le cadre de la pilule et REMPLACE les
 * rangées d'actions (une chose à la fois), sous un petit en-tête (‹ Retour ·
 * titre centré · Fermer) : ‹ revient aux rangées, ✕ referme tout. Un fond à peine
 * plus clair le distingue ; ‹ et ✕ sont des disques de verre de 44, comme chaque
 * bouton de la pilule : c'est le MÊME bouton, `CallButton` ton `disc` (#17345, G3.6),
 * un voile et un liseré (`.glass-call-disc`) sans flou à eux, donc sans verre dans le
 * verre. L'écran le REMET (`Button`), comme il remet le glyphe de Fermer : il vit dans
 * `call_overlay` (`dynamic_only`), et ce module, chargé à part, n'en importe rien.
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
export const PANEL_ROW_SCROLL = 'flex gap-1.5 overflow-x-auto overscroll-x-none px-2 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [&>*]:shrink-0';

export const PANEL_ROW_TITLE = 'px-2 text-mini font-semibold tracking-wide text-on-media-3 [font-variant-caps:all-small-caps]';

/** Une pastille de choix dans une rangée : 44 de haut au moins, cochée en blanc. */
export const CHIP = 'flex min-h-11 items-center gap-2 whitespace-nowrap rounded-full px-3 text-mini font-semibold transition-colors motion-reduce:transition-none';

export const chipStyle = (checked: boolean) =>
  checked ? { background: 'var(--color-on-media)', color: 'var(--ios-indigo-950)' } : { background: 'var(--color-media-fill)', color: 'var(--color-on-media)', boxShadow: 'inset 0 0 0 1px var(--color-media-hairline)' };

const FOCUS_ORDER = ['[data-panel-first]', '[aria-checked="true"]', 'input', '[data-row-item]', 'button:not([data-panel-close]):not([data-panel-back])'] as const;

/**
 * La tête d'un panneau DANS la pilule : ‹ · titre centré · ✕. Le bouton rond et le
 * glyphe de Fermer sont remis par l'écran ; un panneau posé en colonne n'en reçoit
 * aucun — sa tête n'a pas de ✕ par construction (#17932).
 */
export type PillPanelHead = {
  readonly closeLabel: string;
  readonly closeGlyph: ReactNode;
  /** Le bouton rond de l'appel (`CallButton`), remis par l'écran : ‹ et ✕ en sont deux disques. */
  readonly Button: typeof CallButton;
  readonly closeData?: Readonly<Record<`data-${string}`, string>>;
  /** ‹ : revenir au menu des rangées (#8578). */
  readonly back?: PanelBack | undefined;
};

/** Le panneau prend toute la hauteur de son hôte (la colonne du journal sur grand écran, #16942) : sa tête est « titre à gauche, bascule à droite », sans ‹ ni ✕ (W1.9, #17932) — la colonne se referme par « Journal », par Échap. */
export type ColumnPanelHead = { readonly fill: true };

type FrameProps = {
  readonly id: string;
  readonly title: string;
  readonly onClose: () => void;
  readonly children: ReactNode;
  readonly data: Readonly<Record<`data-${string}`, string>>;
  /** Ce qui se pose dans l'en-tête, avant ✕ (la bascule Traduit / Original du journal, loi 7). */
  readonly trailing?: ReactNode;
} & (ColumnPanelHead | (PillPanelHead & { readonly fill?: false }));

export type PanelBack = { readonly label: string; readonly onPress: () => void };

const chevron = (
  <svg aria-hidden viewBox="0 0 24 24" className="size-5 rtl:-scale-x-100" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="m15 5-7 7 7 7" />
  </svg>
);

function PillHead({ head, titleId, title, trailing, onClose }: { readonly head: PillPanelHead; readonly titleId: string; readonly title: string; readonly trailing: ReactNode; readonly onClose: () => void }) {
  const { Button, back } = head;
  return (
    <div className="flex items-center gap-1">
      {back === undefined ? (
        <span aria-hidden className="size-11 shrink-0" />
      ) : (
        <Button label={back.label} glyph={chevron} onPress={back.onPress} size={44} data={{ 'data-panel-back': '' }} />
      )}
      <h2 id={titleId} className="min-w-0 flex-1 truncate text-center text-body font-semibold">
        {title}
      </h2>
      {trailing}
      <Button label={head.closeLabel} glyph={head.closeGlyph} onPress={onClose} size={44} data={{ 'data-panel-close': '', ...head.closeData }} />
    </div>
  );
}

export function CallPanelFrame(props: FrameProps) {
  const { id, title, onClose, children, data, trailing = null } = props;
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
      className={`flex min-w-0 flex-col gap-1.5 rounded-field-ios pb-1.5 text-on-media ${props.fill === true ? 'h-full min-h-0' : ''}`}
      style={props.fill === true ? undefined : { background: 'var(--color-media-fill)' }}
      {...data}
    >
      {props.fill === true ? (
        <div className="flex items-center gap-2 ps-3">
          <h2 id={titleId} className="min-w-0 flex-1 truncate text-start text-body font-semibold">
            {title}
          </h2>
          {trailing}
        </div>
      ) : (
        <PillHead head={props} titleId={titleId} title={title} trailing={trailing} onClose={onClose} />
      )}
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
      <div role={role} aria-label={title} {...(role === 'toolbar' ? { 'aria-orientation': 'horizontal' as const } : {})} onKeyDown={onRowKeyDown} {...(onRowWheel === undefined ? {} : { onWheel: onRowWheel })} className={PANEL_ROW_SCROLL} style={ROW_EDGE_FADE} data-call-row-scroll="">
        {children}
      </div>
    </div>
  );
}
