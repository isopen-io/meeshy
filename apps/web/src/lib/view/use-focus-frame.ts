import { useEffect } from 'react';

import { focusFrame, type FocusFrame, type FocusFrameMeasure } from '@/lib/reading-mode/focus-frame';

/**
 * LE CADRE DE L'ÉLU (#8506, #8536) — pose la loupe sur le CONTENU de la rangée
 * élue de la scène du Fil, allonge son cadre et écarte ses voisines ; retire
 * tout quand l'élection part.
 *
 * #8536 (directive porteur 2026-09-28) : « Seul le contenu grandit : la date,
 * le bouton de changement de langue, l'auteur et son avatar doivent rester à
 * la taille originale. » La loupe ne se pose donc plus sur la RANGÉE : ce hook
 * n'écrit que trois variables sur elle (`--loupe-s`, `--loupe-grow`,
 * `--loupe-air`), que `thread-scene.css` lit pour grossir `[data-loupe]` (le
 * contenu seul), descendre la bande basse et le tampon, et allonger le verre.
 * La rangée elle-même ne porte jamais de `transform`.
 *
 * Même discipline que la loupe du message déplié (`use-focal-loupe.ts`) : des
 * écritures DISCRÈTES, une fois par CHANGEMENT d'élection et à chaque
 * redimensionnement RÉEL de la rangée (`ResizeObserver`), jamais un calcul
 * par image de défilement ; et AUCUNE transition CSS sur le `transform` du
 * contenu (une transition active sur un transform non identité faisait
 * sauter le défileur virtualisé de plus d'un millier de pixels).
 *
 * La mesure retire d'abord les variables posées (sinon le gain se nourrirait
 * de lui-même), lit la rangée, son cadre (`.focus-card`), le bloc de contenu
 * (`[data-loupe]`) et son ENCRE — les lignes de texte réellement peintes et
 * les éléments feuilles (images, vignettes), jamais la boîte d'un bloc qui
 * s'étire sur toute la colonne : c'est ce qui laisse un message court grossir
 * de ×1,26 quand sa colonne, elle, est pleine largeur.
 *
 * Les voisines lisent `--focus-push-up` / `--focus-push-down` posées sur la
 * LISTE (`thread-scene.css`, `translate` seul). Une seule rangée les possède
 * à la fois (`owners`) : quand l'élection glisse de A à B, l'ordre dans lequel
 * les deux effets tournent ne dépend pas de nous, et A ne doit pas effacer ce
 * que B vient de poser.
 */
const owners = new WeakMap<HTMLElement, HTMLElement>();

const NOT_INK = '[data-protected-rest]';

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

function measure(row: HTMLElement, card: HTMLElement, loupe: HTMLElement, rtl: boolean): FocusFrameMeasure | null {
  const rowBox = row.getBoundingClientRect();
  const cardBox = card.getBoundingClientRect();
  const loupeBox = loupe.getBoundingClientRect();
  if (cardBox.width <= 0 || cardBox.height <= 0 || loupeBox.height <= 0) return null;
  const reach = (rect: DOMRect) => (rtl ? loupeBox.right - rect.left : rect.right - loupeBox.left);

  const ink: DOMRect[] = [];
  inkRects(loupe, ink);
  return {
    rowTop: rowBox.top,
    rowBottom: rowBox.bottom,
    cardTop: cardBox.top,
    cardBottom: cardBox.bottom,
    contentRoom: rtl ? loupeBox.right - cardBox.left : cardBox.right - loupeBox.left,
    contentWidth: Math.max(0, ...ink.filter(painted).map(reach)),
    contentHeight: loupeBox.height,
  };
}

const LOUPE_VARS = ['--loupe-s', '--loupe-grow', '--loupe-air'] as const;

function flatten(row: HTMLElement): void {
  LOUPE_VARS.forEach((name) => row.style.removeProperty(name));
}

function release(list: HTMLElement | null, row: HTMLElement): void {
  if (list === null || owners.get(list) !== row) return;
  owners.delete(list);
  list.style.removeProperty('--focus-push-up');
  list.style.removeProperty('--focus-push-down');
}

function write(row: HTMLElement, list: HTMLElement | null, frame: FocusFrame): void {
  row.style.setProperty('--loupe-s', String(frame.scale));
  row.style.setProperty('--loupe-grow', `${frame.grow}px`);
  row.style.setProperty('--loupe-air', `${frame.air}px`);
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
      const loupe = element.querySelector<HTMLElement>('[data-loupe]');
      const rtl = typeof getComputedStyle === 'function' && getComputedStyle(element).direction === 'rtl';
      const measured = card === null || loupe === null ? null : measure(element, card, loupe, rtl);
      if (measured === null) {
        release(list, element);
        return;
      }
      write(element, list, focusFrame({ ...measured, reducedMotion }));
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
