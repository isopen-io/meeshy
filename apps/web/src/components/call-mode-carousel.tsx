import { useEffect, useLayoutEffect, useRef, type KeyboardEvent, type ReactNode, type WheelEvent } from 'react';

import { carouselStep, nearestToCenter } from '@/lib/calls/call-mode-carousel';

/**
 * **LE CARROUSEL UNIQUE D'UN MODE** (#8578) — en bas, au milieu, seul : les
 * effets (ou les montages) défilent à l'horizontale, et celui qui s'arrête au
 * centre est CHOISI, en direct, pendant le glissé (anneau, plus grand ; ses
 * voisins plus petits et atténués). Toucher un élément le centre ; les
 * flèches passent au voisin (sens inversé en arabe), Début et Fin aux bouts ;
 * la molette d'une souris le fait défiler (`onWheel`, remis par l'écran).
 *
 * Sous le carrousel, la barre d'action du mode : ✕ Quitter à gauche, le
 * déclencheur (anneau de 72) au centre, une ou deux options discrètes à
 * droite (`CallModeBar`). Chunk partagé par les deux modes, qui n'importe rien
 * de l'écran d'appel.
 */

export type CarouselItem = { readonly id: string; readonly label: string; readonly visual: ReactNode };

type CarouselProps = {
  readonly label: string;
  readonly items: readonly CarouselItem[];
  readonly selected: string;
  readonly onSelect: (id: string) => void;
  readonly onWheel?: ((event: WheelEvent<HTMLElement>) => void) | undefined;
};

const ITEM = 64;

const reducedMotion = (): boolean => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function ModeCarousel({ label, items, selected, onSelect, onWheel }: CarouselProps) {
  const track = useRef<HTMLDivElement>(null);
  const settling = useRef<string | null>(null);
  const frame = useRef(0);
  const choose = useRef(onSelect);
  choose.current = onSelect;

  const center = (id: string, smooth: boolean): void => {
    const row = track.current;
    const item = row?.querySelector<HTMLElement>(`[data-carousel-item="${id}"]`);
    if (row == null || item == null) return;
    const shift = item.getBoundingClientRect().left + item.offsetWidth / 2 - (row.getBoundingClientRect().left + row.clientWidth / 2);
    if (Math.abs(shift) < 1) return;
    settling.current = id;
    row.scrollBy({ left: shift, behavior: smooth && !reducedMotion() ? 'smooth' : 'auto' });
  };

  useLayoutEffect(() => {
    center(selected, false);
    settling.current = null;
  }, []);

  useEffect(() => {
    const row = track.current;
    if (row === null) return undefined;
    const onScroll = (): void => {
      cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(() => {
        const box = row.getBoundingClientRect();
        const middle = box.left + box.width / 2;
        const centers = [...row.querySelectorAll<HTMLElement>('[data-carousel-item]')].map((item) => {
          const rect = item.getBoundingClientRect();
          return { id: item.getAttribute('data-carousel-item') ?? '', center: rect.left + rect.width / 2 };
        });
        const nearest = nearestToCenter(centers, middle);
        if (nearest === null) return;
        if (settling.current !== null) {
          if (nearest === settling.current) settling.current = null;
          return;
        }
        choose.current(nearest);
      });
    };
    const settle = (): void => void (settling.current = null);
    row.addEventListener('scroll', onScroll, { passive: true });
    row.addEventListener('scrollend', settle);
    return () => {
      cancelAnimationFrame(frame.current);
      row.removeEventListener('scroll', onScroll);
      row.removeEventListener('scrollend', settle);
    };
  }, []);

  const pick = (id: string): void => {
    choose.current(id);
    center(id, true);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const rtl = typeof getComputedStyle === 'function' && getComputedStyle(event.currentTarget).direction === 'rtl';
    const next = carouselStep({ key: event.key, index: items.findIndex((item) => item.id === selected), count: items.length, rtl });
    const target = next === null ? undefined : items[next];
    if (target === undefined) return;
    event.preventDefault();
    pick(target.id);
    track.current?.querySelector<HTMLElement>(`[data-carousel-item="${target.id}"]`)?.focus();
  };

  const current = items.find((item) => item.id === selected);

  return (
    <div className="flex w-full flex-col items-center gap-1.5" data-call-mode-carousel="">
      <div
        ref={track}
        role="radiogroup"
        aria-label={label}
        onKeyDown={onKeyDown}
        {...(onWheel === undefined ? {} : { onWheel })}
        className="flex w-full snap-x snap-mandatory items-center gap-2 overflow-x-auto overscroll-x-contain py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{ paddingInline: `calc(50% - ${ITEM / 2}px)` }}
        data-call-row-scroll=""
      >
        {items.map((item) => {
          const checked = item.id === selected;
          return (
            <button
              key={item.id}
              type="button"
              role="radio"
              aria-checked={checked}
              aria-label={item.label}
              tabIndex={checked ? 0 : -1}
              onClick={() => pick(item.id)}
              className={`grid shrink-0 snap-center place-items-center overflow-hidden rounded-full transition-[transform,opacity] duration-200 motion-reduce:transition-none ${checked ? 'scale-110 opacity-100' : 'scale-[0.82] opacity-60'}`}
              style={{ width: ITEM, height: ITEM, boxShadow: checked ? '0 0 0 3px white, 0 6px 18px rgb(0 0 0 / 0.45)' : 'inset 0 0 0 1px rgb(255 255 255 / 0.3)', background: 'rgb(0 0 0 / 0.35)' }}
              data-carousel-item={item.id}
            >
              {item.visual}
            </button>
          );
        })}
      </div>
      <p aria-hidden className="min-h-5 text-mini font-semibold text-white [text-shadow:0_1px_4px_rgb(0_0_0/0.6)]" data-call-mode-selected="">
        {current?.label ?? ''}
      </p>
    </div>
  );
}

type Action = { readonly label: string; readonly onPress: () => void; readonly data?: Readonly<Record<`data-${string}`, string>> };

type BarProps = {
  readonly quit: Action & { readonly glyph: ReactNode };
  readonly shutter: Action & { readonly glyph: ReactNode; readonly busy?: boolean };
  readonly options: ReactNode;
};

const SIDE = 'grid size-12 place-items-center rounded-full text-white transition-transform active:scale-95 motion-reduce:transition-none';

/** La barre d'un mode : ✕ Quitter · le déclencheur · les options. */
export function CallModeBar({ quit, shutter, options }: BarProps) {
  return (
    <div className="grid w-full grid-cols-[1fr_auto_1fr] items-center gap-4 px-6" data-call-mode-bar="">
      <div className="flex justify-start">
        <button type="button" aria-label={quit.label} title={quit.label} onClick={quit.onPress} className={`glass-call ${SIDE}`} {...(quit.data ?? {})}>
          {quit.glyph}
        </button>
      </div>
      <button
        type="button"
        aria-label={shutter.label}
        aria-disabled={shutter.busy === true}
        onClick={shutter.onPress}
        className="grid size-[72px] place-items-center rounded-full border-4 border-white transition-transform active:scale-95 motion-reduce:transition-none"
        style={{ boxShadow: '0 4px 20px rgb(0 0 0 / 0.45)' }}
        {...(shutter.data ?? {})}
      >
        <span className="grid size-[56px] place-items-center rounded-full bg-white text-[var(--ios-indigo-950)]">{shutter.glyph}</span>
      </button>
      <div className="flex justify-end gap-2">{options}</div>
    </div>
  );
}

/** Une option discrète de la barre : un rond de verre, pressé ou non. */
export function ModeOption({ label, glyph, onPress, pressed, data = {} }: { readonly label: string; readonly glyph: ReactNode; readonly onPress: () => void; readonly pressed?: boolean; readonly data?: Readonly<Record<`data-${string}`, string>> }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      {...(pressed === undefined ? {} : { 'aria-pressed': pressed })}
      onClick={onPress}
      className={`${pressed === true ? '' : 'glass-call '}${SIDE}`}
      style={pressed === true ? { background: 'white', color: 'var(--ios-indigo-950)' } : undefined}
      {...data}
    >
      {glyph}
    </button>
  );
}
