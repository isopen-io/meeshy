import { useEffect } from 'react';

import { focusFrame, type FocusFrame, type FocusFrameMeasure } from '@/lib/reading-mode/focus-frame';
import { FOCUS_CHIP_INSET } from '@/lib/reading-mode/metrics';

/**
 * LE CADRE DE L'ÉLU (#8506) — pose la loupe sur la rangée élue de la scène du
 * Fil et écarte ses voisines ; retire tout quand l'élection part.
 *
 * Même discipline que la loupe qu'il remplace (`use-focal-loupe.ts`, qui ne
 * sert plus que le message déplié) : des écritures DISCRÈTES, une fois par
 * CHANGEMENT d'élection et à chaque redimensionnement RÉEL de la rangée
 * (`ResizeObserver`), jamais un calcul par image de défilement ; et AUCUNE
 * transition CSS sur ce `transform` (une transition active sur un transform
 * non identité faisait sauter le défileur virtualisé de plus d'un millier de
 * pixels — `use-focal-loupe.ts`).
 *
 * La mesure retire d'abord la loupe posée (sinon le gain se nourrirait de
 * lui-même), lit la rangée, son cadre (`.focus-card`) et l'ENCRE de son
 * contenu — les lignes de texte réellement peintes et les éléments feuilles
 * (images, vignettes), jamais la boîte d'un bloc qui s'étire sur toute la
 * colonne : c'est ce qui laisse un message court grossir de ×1,26 quand sa
 * rangée, elle, est pleine largeur.
 *
 * Les voisines lisent `--focus-push-up` / `--focus-push-down` posées sur la
 * LISTE (`thread-scene.css`, `translate` seul). Une seule rangée les possède
 * à la fois (`owners`) : quand l'élection glisse de A à B, l'ordre dans lequel
 * les deux effets tournent ne dépend pas de nous, et A ne doit pas effacer ce
 * que B vient de poser.
 */
const owners = new WeakMap<HTMLElement, HTMLElement>();

const NOT_INK =
  '.focal-meta, .focus-strip, .focus-stamp, [data-identity], [data-row-bottom-line], [data-focus-reserve]';

function inkRects(node: Node, into: DOMRect[]): void {
  if (node.nodeType === Node.TEXT_NODE) {
    if ((node.textContent ?? '').trim() === '') return;
    const range = document.createRange();
    range.selectNodeContents(node);
    into.push(...Array.from(range.getClientRects()));
    return;
  }
  if (!(node instanceof Element) || node.matches(NOT_INK)) return;
  const children = Array.from(node.childNodes);
  const isLeaf = !children.some(
    (child) => child instanceof Element || (child.nodeType === Node.TEXT_NODE && (child.textContent ?? '').trim() !== ''),
  );
  if (isLeaf) {
    into.push(node.getBoundingClientRect());
    return;
  }
  children.forEach((child) => inkRects(child, into));
}

const painted = (rect: DOMRect) => rect.width > 0 || rect.height > 0;

function measure(row: HTMLElement, card: HTMLElement, rtl: boolean): FocusFrameMeasure | null {
  const rowBox = row.getBoundingClientRect();
  const cardBox = card.getBoundingClientRect();
  if (cardBox.width <= 0 || cardBox.height <= 0) return null;
  const reach = (rect: DOMRect) => (rtl ? cardBox.right - rect.left : rect.right - cardBox.left);

  const ink: DOMRect[] = [];
  const content = row.querySelector('[data-row-content]');
  if (content !== null) inkRects(content, ink);
  const identity = row.querySelector('.focus-identity');
  if (identity !== null) ink.push(identity.getBoundingClientRect());

  const strip = row.querySelector('.focus-strip');
  const stamp = row.querySelector('.focus-stamp');
  const stampWidth = stamp === null ? 0 : stamp.getBoundingClientRect().width;
  const band = strip === null ? [] : [reach(strip.getBoundingClientRect()) + FOCUS_CHIP_INSET + stampWidth];

  const extent = Math.max(0, ...ink.filter(painted).map(reach), ...band);
  return {
    rowTop: rowBox.top,
    rowBottom: rowBox.bottom,
    cardTop: cardBox.top,
    cardBottom: cardBox.bottom,
    cardWidth: cardBox.width,
    contentExtent: extent,
  };
}

function flatten(row: HTMLElement): void {
  row.style.transform = '';
  row.style.transformOrigin = '';
  row.style.removeProperty('--loupe-s');
  row.style.removeProperty('--loupe-end-shift');
}

function release(list: HTMLElement | null, row: HTMLElement): void {
  if (list === null || owners.get(list) !== row) return;
  owners.delete(list);
  list.style.removeProperty('--focus-push-up');
  list.style.removeProperty('--focus-push-down');
}

function write(row: HTMLElement, list: HTMLElement | null, frame: FocusFrame, originX: number, rtl: boolean): void {
  if (frame.scale !== 1) {
    row.style.transform = `scale(${frame.scale})`;
    row.style.transformOrigin = `${originX}px ${frame.originY}px`;
    row.style.setProperty('--loupe-s', String(frame.scale));
    row.style.setProperty('--loupe-end-shift', `${rtl ? -frame.endShift : frame.endShift}px`);
  }
  if (list === null) return;
  owners.set(list, row);
  list.style.setProperty('--focus-push-up', `${frame.pushUp}px`);
  list.style.setProperty('--focus-push-down', `${frame.pushDown}px`);
}

export function useFocusFrame(row: { current: HTMLElement | null }, isFocused: boolean): void {
  useEffect(() => {
    const element = row.current;
    if (element === null) return;
    const list = element.closest('ol');

    if (!isFocused) {
      flatten(element);
      release(list, element);
      return;
    }

    const reducedMotion =
      typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

    const apply = () => {
      flatten(element);
      const card = element.querySelector<HTMLElement>('.focus-card');
      const rtl = typeof getComputedStyle === 'function' && getComputedStyle(element).direction === 'rtl';
      const measured = card === null ? null : measure(element, card, rtl);
      if (card === null || measured === null) {
        release(list, element);
        return;
      }
      const rowBox = element.getBoundingClientRect();
      const cardBox = card.getBoundingClientRect();
      const originX = rtl ? cardBox.right - rowBox.left : cardBox.left - rowBox.left;
      write(element, list, focusFrame({ ...measured, reducedMotion }), originX, rtl);
    };

    apply();

    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(apply) : null;
    observer?.observe(element);
    return () => {
      observer?.disconnect();
      flatten(element);
      release(list, element);
    };
  }, [row, isFocused]);
}
