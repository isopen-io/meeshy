import type { KeyboardEvent, WheelEvent } from 'react';

import { carouselStep } from '@/lib/calls/call-mode-carousel';

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
 */

export type MoodChip = { readonly id: string; readonly label: string };

type Props = {
  readonly label: string;
  readonly chips: readonly MoodChip[];
  readonly selected: string;
  readonly onPick: (id: string) => void;
  readonly onWheel?: ((event: WheelEvent<HTMLElement>) => void) | undefined;
};

const CHIP = 'grid min-h-11 min-w-11 shrink-0 touch-manipulation select-none place-items-center rounded-full px-4 text-mini font-semibold transition-transform duration-100 active:scale-95 motion-reduce:transition-none';

export function MoodChips({ label, chips, selected, onPick, onWheel }: Props) {
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-call-frame-mood]')];
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
    </div>
  );
}
