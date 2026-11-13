import { useEffect, useId, useLayoutEffect, useRef, type ButtonHTMLAttributes, type KeyboardEvent, type PointerEvent, type ReactNode, type RefObject, type WheelEvent } from 'react';

import { CAPTURE_HOLD_MS, captureIntent, keyIntent, PRESS_SLOP_PX, tapGesture, type LastTap, type PressGesture } from '@/lib/calls/call-capture-gesture';
import { carouselStep, nearestToCenter } from '@/lib/calls/call-mode-carousel';
import { useModeGlass } from '@/lib/calls/use-mode-motion';

import { DeclinationActions, DeclinationPages, type CarouselDeclinations } from './call-declination-pages';

/**
 * **LE CARROUSEL UNIQUE D'UN MODE** (#8578) — en bas, au milieu, seul : les
 * effets (ou les montages) défilent à l'horizontale, et celui qui s'arrête au
 * centre est CHOISI, en direct, pendant le glissé (anneau, plus grand ; ses
 * voisins plus petits et atténués). Toucher un élément le CHOISIT puis le
 * centre : le glissé qui l'y amène ne choisit personne en chemin, jusqu'à ce
 * qu'il soit au centre — un `scrollend` arrivé avant ne le libère pas, un
 * doigt ou une molette posés sur la piste, si (ils reprennent la main). Les
 * flèches passent au voisin (sens inversé en arabe), Début et Fin aux bouts ;
 * la molette d'une souris le fait défiler (`onWheel`, remis par l'écran).
 *
 * Plus de déclencheur (#8625) : sur le style CHOISI, deux tapes prennent la
 * photo (Entrée au clavier) et un appui long lance la vidéo
 * (`call-capture-gesture.ts`) ; un doigt qui glisse fait défiler, ce n'est
 * pas un appui. Le geste est dit au lecteur d'écran (`aria-describedby`).
 *
 * Le doigt garde la main (#8736) : un appui long sur un AUTRE style le choisit
 * sans rien faire défiler sous le doigt encore posé (il se centre quand le
 * doigt se lève), et un doigt posé que la piste emporte n'est plus un appui
 * long. La piste ne rebondit pas à ses bouts (`overscroll-x-none`), et un
 * glissé ne redemande pas à chaque image le style déjà choisi.
 *
 * Choisir en direct ne remet RIEN en page autour de la piste (#8619) : sous
 * `scroll-snap-type: mandatory`, Chromium recalcule les points d'accroche à
 * chaque mise en page et, s'ils ont bougé, réaccroche au dernier élément
 * accroché — en plein glissé, le geste meurt. L'échelle et l'anneau vivent
 * donc dans la FACE d'un élément (la zone d'accroche garde sa boîte), et le
 * nom sous la piste est une boîte fixe, contenue.
 *
 * Une piste qui a quitté la page ne choisit rien : le démontage remet son
 * `scrollLeft` à zéro et émet un dernier `scroll`, qui rendait « Naturel » sous
 * l'Échap qui venait de rendre les effets d'avant.
 *
 * Seul un défilement TENU choisit (#8969) : un doigt (jusqu'au `scrollend`),
 * une molette ou une touche. Le réaccrochage de Chromium quand la mise en
 * page change (chunk chargé, piste remplacée) ne choisit rien — l'élément
 * choisi revient au centre —, et le centrage d'un toucher tient son choix
 * jusqu'au `scrollend` qui l'arrête sur lui.
 *
 * Sous le carrousel, la barre d'action du mode : ✕ Quitter à gauche, une ou
 * deux options discrètes à droite (`CallModeBar`). Chunk partagé par les deux
 * modes, qui n'importe rien de l'écran d'appel.
 */

/** Ce que le carrousel capture : `onCapture` reçoit la photo (deux tapes) ou la vidéo (appui long). */
export type CarouselCapture = {
  readonly recording: boolean;
  readonly onCapture: (intent: 'photo' | 'record') => void;
  /** Le geste, en une phrase, lu avec le style choisi. */
  readonly hint: string;
  readonly longPressMs?: number;
};

/**
 * `detail` : ce qu'on doit savoir de l'élément avant de le prendre — pour un cadre, où il sert (#10146) ; il se LIT
 * (lecteur d'écran, infobulle), il ne s'affiche pas sous le nom (C1.2, loi 18). `declinations` : les versions d'un
 * cadre, qui défilent au balayage vertical dans sa vignette quand il est choisi (C1.6).
 */
export type CarouselItem = { readonly id: string; readonly label: string; readonly visual: ReactNode; readonly detail?: string; readonly declinations?: CarouselDeclinations };

export type { CarouselDeclinations };

export type ItemSize = { readonly width: number; readonly height: number };

const describedBy = (...ids: readonly (string | null)[]): string | undefined => ids.filter((id) => id !== null).join(' ') || undefined;

type CarouselProps = {
  readonly label: string;
  readonly items: readonly CarouselItem[];
  readonly selected: string;
  readonly onSelect: (id: string) => void;
  readonly onWheel?: ((event: WheelEvent<HTMLElement>) => void) | undefined;
  readonly capture?: CarouselCapture | undefined;
  /** La boîte d'une vignette : le disque de 64 par défaut ; un portrait (48 × 85 au Montage, C1.5) montre l'aperçu entier. */
  readonly itemSize?: ItemSize | undefined;
};

const DISC: ItemSize = { width: 64, height: 64 };

/** Le disque est rond ; un portrait prend le rayon des tuiles du design system. */
const shapeOf = ({ width, height }: ItemSize): string => (width === height ? 'rounded-full' : 'rounded-tile');

/** La piste s'efface à ses deux bords (#17409) : la même largeur des deux côtés, rien à inverser en arabe. */
const EDGE_FADE_PX = 34;
// harmony-exempt: masque alpha du fondu de bord, seule l'opacité compte, aucune couleur n'est peinte
const EDGE_FADE = `linear-gradient(90deg, transparent 0, #000 ${EDGE_FADE_PX}px, #000 calc(100% - ${EDGE_FADE_PX}px), transparent 100%)`;

type Press = { readonly id: string; readonly x: number; readonly y: number; readonly timer: ReturnType<typeof setTimeout> };

/** Ce qui rend la main à l'utilisateur pendant qu'un toucher centre son élément — sauf re-toucher cet élément : c'est une double tape (#8625). */
const TAKE_OVER = ['pointerdown', 'pointercancel', 'wheel'] as const;

/** Ce qui TIENT la piste (#8969) : seul un défilement tenu choisit ; le doigt la tient jusqu'au `scrollend`, une molette ou une touche un instant. */
const GRIP = ['pointerdown', 'wheel', 'keydown'] as const;

const GRIP_MS = 250;

/** Sans `scrollend` (Safari d'avant 26), la piste est arrêtée après ce silence. */
const SCROLL_QUIET_MS = 200;

const reducedMotion = (): boolean => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function ModeCarousel({ label, items, selected, onSelect, onWheel, capture, itemSize = DISC }: CarouselProps) {
  const ITEM = itemSize.width;
  const shape = shapeOf(itemSize);
  const track = useRef<HTMLDivElement>(null);
  const settling = useRef<string | null>(null);
  const frame = useRef(0);
  const choose = useRef(onSelect);
  choose.current = onSelect;
  const press = useRef<Press | null>(null);
  const announced = useRef(selected);
  const aimed = useRef<string | null>(null);
  const consumed = useRef<string | null>(null);
  const lastTap = useRef<LastTap>(null);
  const travelled = useRef(false);
  const hintId = useId();

  const center = (id: string, smooth: boolean): void => {
    const row = track.current;
    const item = row?.querySelector<HTMLElement>(`[data-carousel-item="${id}"]`);
    if (row == null || item == null) return;
    const shift = item.getBoundingClientRect().left + item.offsetWidth / 2 - (row.getBoundingClientRect().left + row.clientWidth / 2);
    if (Math.abs(shift) < ITEM / 2) return;
    settling.current = id;
    travelled.current = false;
    row.scrollTo({ left: Math.round(row.scrollLeft + shift), behavior: smooth && !reducedMotion() ? 'smooth' : 'auto' });
  };

  useLayoutEffect(() => {
    center(selected, false);
    settling.current = null;
  }, []);

  useEffect(() => {
    announced.current = selected;
  }, [selected]);

  const announce = (id: string): void => {
    announced.current = id;
    choose.current(id);
  };

  useEffect(() => {
    const row = track.current;
    if (row === null) return undefined;
    let finger = false;
    let until = 0;
    let quiet: ReturnType<typeof setTimeout> | undefined;
    const held = (): boolean => finger || performance.now() < until;
    const centered = (): string | null => {
      const box = row.getBoundingClientRect();
      const centers = [...row.querySelectorAll<HTMLElement>('[data-carousel-item]')].map((item) => {
        const rect = item.getBoundingClientRect();
        return { id: item.getAttribute('data-carousel-item') ?? '', center: rect.left + rect.width / 2 };
      });
      return nearestToCenter(centers, box.left + box.width / 2);
    };
    const settle = (): void => {
      clearTimeout(quiet);
      if (!row.isConnected) return;
      const moved = travelled.current;
      const gripped = held();
      finger = false;
      until = 0;
      travelled.current = false;
      const nearest = centered();
      if (settling.current !== null) {
        if (nearest === settling.current) settling.current = null;
        else if (moved) center(settling.current, false);
        return;
      }
      if (!moved || nearest === null || nearest === announced.current) return;
      if (gripped) {
        cancelAnimationFrame(frame.current);
        announced.current = nearest;
        choose.current(nearest);
      } else center(announced.current, false);
    };
    const onScroll = (): void => {
      if (!row.isConnected) return;
      travelled.current = true;
      if (settling.current === null && press.current !== null) {
        clearTimeout(press.current.timer);
        press.current = null;
      }
      if (!('onscrollend' in row)) {
        clearTimeout(quiet);
        quiet = setTimeout(settle, SCROLL_QUIET_MS);
      }
      if (!held() || settling.current !== null) return;
      if (until > 0) until = performance.now() + GRIP_MS;
      cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(() => {
        const nearest = row.isConnected ? centered() : null;
        if (nearest === null || settling.current !== null || nearest === announced.current) return;
        announced.current = nearest;
        choose.current(nearest);
      });
    };
    const takeOver = (event: Event): void => {
      const pressed = event.type === 'pointerdown' && event.target instanceof Element ? event.target.closest('[data-carousel-item]')?.getAttribute('data-carousel-item') : null;
      if (pressed !== settling.current) settling.current = null;
    };
    const grab = (event: Event): void => {
      if (event.type !== 'pointerdown') {
        until = performance.now() + GRIP_MS;
        return;
      }
      finger = true;
      travelled.current = false;
    };
    const letGo = (): void => {
      if (!travelled.current) finger = false;
    };
    row.addEventListener('scroll', onScroll, { passive: true });
    row.addEventListener('scrollend', settle);
    TAKE_OVER.forEach((name) => row.addEventListener(name, takeOver, { passive: true }));
    GRIP.forEach((name) => row.addEventListener(name, grab, { passive: true }));
    row.addEventListener('pointerup', letGo, { passive: true });
    return () => {
      clearTimeout(quiet);
      cancelAnimationFrame(frame.current);
      row.removeEventListener('scroll', onScroll);
      row.removeEventListener('scrollend', settle);
      TAKE_OVER.forEach((name) => row.removeEventListener(name, takeOver));
      GRIP.forEach((name) => row.removeEventListener(name, grab));
      row.removeEventListener('pointerup', letGo);
    };
  }, []);

  const pick = (id: string): void => {
    announce(id);
    center(id, true);
  };

  useEffect(() => () => clearTimeout(press.current?.timer), []);

  const act = (id: string, gesture: PressGesture): void => {
    if (capture === undefined) {
      pick(id);
      return;
    }
    const intent = captureIntent({ gesture, selected: id === selected, recording: capture.recording });
    if (intent === 'select' && gesture === 'long-press') {
      announce(id);
      aimed.current = id;
    } else if (intent === 'select') pick(id);
    else if (intent !== 'none') capture.onCapture(intent);
  };

  const release = (): void => {
    clearTimeout(press.current?.timer);
    press.current = null;
  };

  const drop = (): void => {
    release();
    aimed.current = null;
  };

  const lift = (): void => {
    const target = aimed.current;
    drop();
    if (target !== null) center(target, true);
  };

  const pressStart = (id: string) => (event: PointerEvent<HTMLButtonElement>): void => {
    if (capture === undefined || !event.isPrimary) return;
    drop();
    consumed.current = null;
    const timer = setTimeout(() => {
      press.current = null;
      consumed.current = id;
      lastTap.current = null;
      act(id, 'long-press');
    }, capture.longPressMs ?? CAPTURE_HOLD_MS);
    press.current = { id, x: event.clientX, y: event.clientY, timer };
  };

  const pressMove = (event: PointerEvent<HTMLButtonElement>): void => {
    const current = press.current;
    if (current !== null && Math.hypot(event.clientX - current.x, event.clientY - current.y) > PRESS_SLOP_PX) release();
  };

  const tap = (id: string): void => {
    if (consumed.current === id) {
      consumed.current = null;
      return;
    }
    if (capture === undefined) {
      pick(id);
      return;
    }
    const now = Date.now();
    const gesture = tapGesture(lastTap.current, { id, at: now });
    lastTap.current = gesture === 'double-tap' ? null : { id, at: now, selected: id === selected };
    act(id, gesture);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const focused = event.target instanceof HTMLElement ? event.target.getAttribute('data-carousel-item') : null;
    if (capture !== undefined && keyIntent({ key: event.key, selected: focused === selected, recording: capture.recording }) === 'photo') {
      event.preventDefault();
      capture.onCapture('photo');
      return;
    }
    const declined = event.target instanceof HTMLElement && focused === selected ? items.find((item) => item.id === selected)?.declinations : undefined;
    if (declined !== undefined && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      event.preventDefault();
      const to = declined.index + (event.key === 'ArrowDown' ? 1 : -1);
      if (to >= 0 && to < declined.pages.length) declined.onSelect(to);
      return;
    }
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
        className="flex w-full snap-x snap-mandatory items-center gap-2 overflow-x-auto overscroll-x-none py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{ paddingInline: `calc(50% - ${ITEM / 2}px)`, maskImage: EDGE_FADE, WebkitMaskImage: EDGE_FADE }}
        data-call-row-scroll=""
      >
        {items.map((item, index) => {
          const checked = item.id === selected;
          const detailId = item.detail === undefined ? null : `${hintId}-detail-${index}`;
          return (
            <button
              key={item.id}
              type="button"
              role="radio"
              aria-checked={checked}
              aria-label={item.label}
              tabIndex={checked ? 0 : -1}
              onClick={() => tap(item.id)}
              title={item.detail}
              aria-describedby={describedBy(detailId, capture !== undefined && checked ? hintId : null)}
              {...(capture === undefined
                ? {}
                : {
                    onPointerDown: pressStart(item.id),
                    onPointerMove: pressMove,
                    onPointerUp: lift,
                    onPointerCancel: drop,
                    onPointerLeave: drop,
                    onContextMenu: (event: { preventDefault: () => void }) => event.preventDefault(),
                  })}
              className={`grid shrink-0 touch-manipulation select-none snap-center [-webkit-touch-callout:none] place-items-center ${shape}`}
              style={{ width: itemSize.width, height: itemSize.height }}
              data-carousel-item={item.id}
            >
              <span
                className={`relative grid size-full place-items-center overflow-hidden ${shape} transition-[scale,opacity] duration-200 motion-reduce:transition-none ${checked ? 'scale-110 opacity-100' : 'scale-[0.82] opacity-60'}`}
                style={{ boxShadow: checked ? '0 0 0 3px var(--color-on-media), var(--shadow-lg)' : 'inset 0 0 0 1px var(--color-media-hairline)', background: 'var(--color-scrim-soft)' }}
                data-carousel-face=""
              >
                {checked && item.declinations !== undefined && item.declinations.pages.length > 1 ? <DeclinationPages declinations={item.declinations} height={itemSize.height} /> : item.visual}
              </span>
              {detailId === null ? null : (
                <span id={detailId} className="sr-only">
                  {item.detail}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <p aria-hidden className="h-5 w-full truncate px-4 text-center text-mini font-semibold text-on-media [contain:strict] [text-shadow:0_1px_2px_var(--color-scrim)]" style={{ height: '1lh' }} data-call-mode-selected="">
        {current?.label ?? ''}
      </p>
      {current?.declinations === undefined || current.declinations.pages.length < 2 ? null : <DeclinationActions declinations={current.declinations} name={current.label} />}
      {capture === undefined ? null : (
        <span id={hintId} className="sr-only">
          {capture.hint}
        </span>
      )}
    </div>
  );
}

type Action = { readonly label: string; readonly onPress: () => void; readonly data?: Readonly<Record<`data-${string}`, string>> };

type BarProps = {
  readonly quit: Action & { readonly glyph: ReactNode };
  /** Au centre : rien de visible en Montage (la vidéo au clavier, #8625) ; en Effets, Réglages. */
  readonly center?: ReactNode;
  readonly options: ReactNode;
  /** Le verre : la barre est UNE surface, qui se resserre par morphisme quand `above` repart (P8b.8). */
  readonly glass?: boolean;
  /** Ce qui se pose AU-DESSUS de la rangée de base, dans le même verre (les puces, P8). */
  readonly above?: ReactNode;
  /** Ce qui est posé sur la barre, hors de son verre (le panneau, la bande de looks) : il suit son bord du haut pendant le morphisme. */
  readonly rider?: RefObject<HTMLElement | null>;
};

const SIDE_SHAPE = 'grid size-12 place-items-center rounded-full transition-transform active:scale-95 motion-reduce:transition-none';

const SIDE = `${SIDE_SHAPE} text-on-media`;

/** La largeur de la barre de verre, et du panneau qui la surmonte : celle de la pilule de l'appel, un liseré de chaque côté. */
export const GLASS_WIDTH = 'w-[calc(100%-2rem)] max-w-[560px]';

const GLASS_BAR = `relative isolate flex ${GLASS_WIDTH} flex-col items-center rounded-[24px] p-2`;

/**
 * Le verre de la barre : un élément à lui, seul mis à l'échelle par le morphisme (`createPillGlass`),
 * depuis son bord du bas — le contenu garde ses proportions, et la barre ne quitte pas le bas de l'écran.
 */
function GlassBar({ above, rider, children }: { readonly above: ReactNode; readonly rider: RefObject<HTMLElement | null> | undefined; readonly children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const skin = useRef<HTMLSpanElement>(null);
  useModeGlass(box, skin, rider);
  return (
    <div ref={box} className={GLASS_BAR} data-call-mode-bar="">
      <span ref={skin} aria-hidden className="glass-call absolute inset-0 -z-10 origin-bottom rounded-[24px]" data-call-mode-bar-skin="" />
      {above}
      {children}
    </div>
  );
}

/** La barre d'un mode : ✕ Quitter (‹ en Effets) · le centre · les options ; posée sur son verre quand `glass`. */
export function CallModeBar({ quit, center = null, options, glass: onGlass = false, above = null, rider }: BarProps) {
  const row = (
    <div className={`grid w-full grid-cols-[1fr_auto_1fr] items-center gap-4 ${onGlass ? '' : 'px-6'}`} {...(onGlass ? {} : { 'data-call-mode-bar': '' })}>
      <div className="flex justify-start">
        <button type="button" aria-label={quit.label} title={quit.label} onClick={quit.onPress} className={`glass-call ${SIDE}`} {...(quit.data ?? {})}>
          {quit.glyph}
        </button>
      </div>
      <div className="flex justify-center">{center}</div>
      <div className="flex justify-end gap-2">{options}</div>
    </div>
  );
  return onGlass ? (
    <GlassBar above={above} rider={rider}>
      {row}
    </GlassBar>
  ) : (
    row
  );
}

type OptionProps = {
  readonly label: string;
  readonly glyph: ReactNode;
  readonly onPress: () => void;
  readonly pressed?: boolean;
  readonly hint?: string;
  /** Une légende sous le disque (Réglages, P8b). */
  readonly caption?: string;
  readonly data?: Readonly<Record<`data-${string}`, string>>;
  /** Un disque atténué : l'action est refusée, mais l'option reste atteignable (appui long de (+) à trois couches). */
  readonly dimmed?: boolean;
  /** Gestes de plus que la tape : appui long, menu contextuel, clavier. */
  readonly extra?: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type' | 'className' | 'onClick'>;
};

/** Une option discrète de la barre : un rond de verre, pressé (disque blanc, glyphe indigo) ou non. */
export function ModeOption({ label, glyph, onPress, pressed, hint, caption, data = {}, dimmed, extra }: OptionProps) {
  const base = pressed === true ? `bg-on-media text-[var(--ios-indigo-950)] ${SIDE_SHAPE}` : `glass-call ${SIDE}`;
  const disc = dimmed === true ? `${base} opacity-60` : base;
  return (
    <button
      type="button"
      aria-label={label}
      title={hint ?? label}
      {...(hint === undefined ? {} : { 'aria-description': hint })}
      {...(pressed === undefined ? {} : { 'aria-pressed': pressed })}
      {...extra}
      onClick={onPress}
      className={caption === undefined ? disc : 'flex min-h-11 touch-manipulation flex-col items-center gap-0.5 text-on-media'}
      {...data}
    >
      {caption === undefined ? (
        glyph
      ) : (
        <>
          <span className={disc}>{glyph}</span>
          <span aria-hidden className="text-mini font-semibold [text-shadow:0_1px_2px_var(--color-scrim)]">
            {caption}
          </span>
        </>
      )}
    </button>
  );
}
