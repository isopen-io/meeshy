import type { KeyboardEvent, WheelEvent } from 'react';

import { carouselStep } from '@/lib/calls/call-mode-carousel';
import { ROW_EDGE_FADE } from '@/lib/calls/call-row-keys';

/**
 * **LES PUCES D'AMBIANCE DU MODE MONTAGE** (#8742, spec § 3) — au-dessus du
 * carrousel, une rangée de puces de verre : « Classiques » (les treize
 * montages) puis les ambiances qui ont au moins un cadre pour le nombre de
 * personnes de l'appel. Toucher une puce change le carrousel dans la même
 * image : rien ne s'attend, le catalogue est déjà là.
 *
 * Chaque puce est une cible de 44 au moins, qui s'enfonce dès le doigt posé
 * (`active:`) ; au clavier, la puce choisie reçoit le focus, les flèches
 * passent à la voisine (sens inversé en arabe), Début et Fin aux bouts, et
 * Entrée ou Espace la choisit. L'anneau de focus est celui de l'application.
 *
 * La rangée s'efface en fondu à ses deux bords (C1.4, `ROW_EDGE_FADE` : la recette unique du
 * dépôt). Quand la mise en avant cache des ambiances, sa dernière puce — « Plus d'ambiances »,
 * « Moins d'ambiances » une fois dépliée — les ouvre ou les range (C1.3, #12692, comme iOS et
 * Android) : une puce de verre qui n'est pas une ambiance, donc jamais « pressée ».
 */

export type MoodChip = { readonly id: string; readonly label: string };

/** L'interrupteur de portée : ce qu'il dit, ce qu'il décrit, et son geste. `showsAll` vrai, il replie. */
export type ScopeToggle = { readonly showsAll: boolean; readonly label: string; readonly hint: string; readonly onToggle: () => void };

type Props = {
  readonly label: string;
  readonly chips: readonly MoodChip[];
  readonly selected: string;
  readonly onPick: (id: string) => void;
  readonly onWheel?: ((event: WheelEvent<HTMLElement>) => void) | undefined;
  /** `undefined` : rien de caché, pas de puce. */
  readonly scopeToggle?: ScopeToggle | undefined;
};

const CHIP = 'grid min-h-11 min-w-11 shrink-0 touch-manipulation select-none place-items-center rounded-full px-4 text-mini font-semibold transition-transform duration-100 active:scale-95 motion-reduce:transition-none';

const glyph = (path: string) => (
  <svg aria-hidden viewBox="0 0 24 24" className="size-4 rtl:-scale-x-100" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
    <path d={path} />
  </svg>
);

/** « … » replie en « ‹ » : le geste dit ce qu'il fait avant qu'on lise. */
const MORE_GLYPH = glyph('M5 12h.01M12 12h.01M19 12h.01');

const LESS_GLYPH = glyph('M15 5l-7 7 7 7');

export function MoodChips({ label, chips, selected, onPick, onWheel, scopeToggle }: Props) {
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-call-frame-mood], [data-call-frame-scope]')];
    const index = buttons.findIndex((button) => button === event.target);
    if (index < 0) return;
    const rtl = typeof getComputedStyle === 'function' && getComputedStyle(event.currentTarget).direction === 'rtl';
    const next = carouselStep({ key: event.key, index, count: buttons.length, rtl });
    const target = next === null ? undefined : buttons[next];
    if (target === undefined) return;
    event.preventDefault();
    target.focus();
  };

  return (
    <div
      role="group"
      aria-label={label}
      onKeyDown={onKeyDown}
      {...(onWheel === undefined ? {} : { onWheel })}
      className="flex w-full items-center gap-2 overflow-x-auto overscroll-x-none px-4 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      style={{ ...ROW_EDGE_FADE }}
      data-call-frame-moods=""
    >
      {chips.map((chip) => {
        const pressed = chip.id === selected;
        return (
          <button
            key={chip.id}
            type="button"
            aria-pressed={pressed}
            tabIndex={pressed ? 0 : -1}
            onClick={() => onPick(chip.id)}
            className={pressed ? `bg-on-media text-[var(--ios-indigo-950)] ${CHIP}` : `glass-call text-on-media ${CHIP}`}
            data-call-frame-mood={chip.id}
          >
            {chip.label}
          </button>
        );
      })}
      {scopeToggle === undefined ? null : (
        <button
          type="button"
          tabIndex={-1}
          aria-label={scopeToggle.label}
          aria-description={scopeToggle.hint}
          onClick={scopeToggle.onToggle}
          className={`glass-call grid-flow-col gap-1.5 text-on-media ${CHIP}`}
          data-call-frame-scope={scopeToggle.showsAll ? 'less' : 'more'}
        >
          {scopeToggle.showsAll ? LESS_GLYPH : MORE_GLYPH}
          <span>{scopeToggle.label}</span>
        </button>
      )}
    </div>
  );
}
