import { useEffect, useRef, type KeyboardEvent, type PointerEvent, type ReactNode, type RefObject } from 'react';

import { currentInterfaceLanguage, type InterfaceLanguage } from '@/lib/interface-language';
import {
  effectiveWidth,
  shareOf,
  splitBounds,
  widthAfterDrag,
  widthAfterKey,
  writeSplitWidth,
  type SplitBounds,
} from '@/lib/view/split-width';

export { SPLIT_WIDTH_STORAGE_KEY } from '@/lib/view/split-width';

/**
 * LE SÉPARATEUR ENTRE LA LISTE ET LE FIL (#10101) — il se saisit à la souris
 * et au doigt (pointer events, capture : le geste suit le pointeur hors du
 * filet), se règle au clavier (flèches, Maj + flèche, Origine, Fin) et
 * revient à la largeur par défaut au double-clic.
 *
 * PENDANT LE GLISSER, REACT NE REND RIEN. La largeur suit le pointeur par la
 * variable `--split-list-w` posée sur le cadre, et l'annonce du séparateur
 * (`aria-valuenow`, `aria-valuetext`) par ses attributs : le navigateur
 * repeint la colonne, aucune liste ni aucun fil ne se re-rend. La largeur
 * n'est VALIDÉE qu'au relâchement — l'état du cadre, puis la préférence de
 * l'appareil, une seule fois.
 *
 * Les libellés vivent dans une table synchrone de ce chunk (discipline de
 * `split-empty-pane.tsx`) : le séparateur n'existe qu'à partir de 1024 px, et
 * ses phrases n'ont rien à faire dans le catalogue que chaque téléphone
 * télécharge au démarrage.
 */
type HandleLabels = { readonly label: string; readonly hint: string };

const LABELS: Readonly<Record<InterfaceLanguage, HandleLabels>> = {
  fr: { label: 'Largeur de la liste des conversations', hint: 'Glisser pour ajuster la liste — double-clic : largeur d’origine' },
  en: { label: 'Conversation list width', hint: 'Drag to resize the list — double-click: default width' },
  es: { label: 'Ancho de la lista de conversaciones', hint: 'Arrastra para ajustar la lista — doble clic: ancho original' },
  pt: { label: 'Largura da lista de conversas', hint: 'Arraste para ajustar a lista — clique duplo: largura original' },
  de: { label: 'Breite der Unterhaltungsliste', hint: 'Ziehen, um die Liste anzupassen — Doppelklick: Standardbreite' },
  it: { label: 'Larghezza dell’elenco delle conversazioni', hint: 'Trascina per regolare l’elenco — doppio clic: larghezza originale' },
  ar: { label: 'عرض قائمة المحادثات', hint: 'اسحب لضبط القائمة — نقرتان: العرض الأصلي' },
};

export function splitHandleLabel(language: InterfaceLanguage): string {
  return LABELS[language].label;
}

/** L'identifiant de la colonne de la liste, que le séparateur pilote. */
export const SPLIT_LIST_ID = 'split-list';

const remOf = (): number => {
  const size = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
  return Number.isFinite(size) && size > 0 ? size : 16;
};

/** Le cadre est la fenêtre entière ; hors navigateur réel (largeur nulle), la fenêtre en tient lieu. */
const frameWidthOf = (frame: HTMLElement | null): number =>
  frame !== null && frame.clientWidth > 0 ? frame.clientWidth : window.innerWidth;

const isRtl = (element: Element): boolean =>
  getComputedStyle(element).direction === 'rtl' || element.closest('[dir="rtl"]') !== null;

/* Un formateur par langue, construit une fois : l'annonce suit le pointeur à
   chaque image du glisser, et construire un `Intl.NumberFormat` n'est pas
   gratuit. */
const percentFormats = new Map<InterfaceLanguage, Intl.NumberFormat>();
const percent = (language: InterfaceLanguage, share: number): string => {
  const known = percentFormats.get(language);
  const format = known ?? new Intl.NumberFormat(language, { style: 'percent', maximumFractionDigits: 0 });
  if (known === undefined) percentFormats.set(language, format);
  return format.format(share / 100);
};

/** Un attribut ne s'écrit que s'il change : rien ne s'invalide pour rien pendant le glisser. */
const announce = (element: HTMLElement, name: string, value: string): void => {
  if (element.getAttribute(name) !== value) element.setAttribute(name, value);
};

type Drag = {
  readonly pointerId: number;
  readonly startX: number;
  /** La largeur posée à l'appui — `null` : celle par défaut, rendue telle quelle si le geste revient à son départ. */
  readonly initial: number | null;
  readonly startWidth: number;
  readonly bounds: SplitBounds;
  readonly rtl: boolean;
  readonly width: number;
};

export function SplitHandle({
  frameRef,
  preferred,
  onCommit,
}: {
  readonly frameRef: RefObject<HTMLDivElement | null>;
  /** La préférence validée (px), ou `null` : la largeur par défaut. */
  readonly preferred: number | null;
  readonly onCommit: (width: number | null) => void;
}): ReactNode {
  const language = currentInterfaceLanguage();
  const handleRef = useRef<HTMLDivElement | null>(null);
  const drag = useRef<Drag | null>(null);
  /* La dernière largeur POSÉE (px ou défaut) — lue par chaque geste, jamais
     une valeur figée dans la fermeture d'un rendu passé. */
  const shown = useRef<number | null>(preferred);

  const boundsNow = (): SplitBounds => splitBounds({ frame: frameWidthOf(frameRef.current), rem: remOf() });

  /** Pose une largeur SANS React : la variable du cadre et l'annonce du séparateur. */
  const show = (width: number | null, bounds: SplitBounds): void => {
    shown.current = width;
    const frame = frameRef.current;
    if (width === null) frame?.style.removeProperty('--split-list-w');
    else frame?.style.setProperty('--split-list-w', `${width}px`);
    const handle = handleRef.current;
    if (handle === null) return;
    const share = shareOf(effectiveWidth(width, bounds), bounds.frame);
    announce(handle, 'aria-valuemin', String(shareOf(bounds.min, bounds.frame)));
    announce(handle, 'aria-valuemax', String(shareOf(bounds.max, bounds.frame)));
    announce(handle, 'aria-valuenow', String(share));
    announce(handle, 'aria-valuetext', percent(currentInterfaceLanguage(), share));
  };

  /** Valide une largeur : l'état du cadre, puis la préférence de l'appareil. */
  const commit = (width: number | null, bounds: SplitBounds): void => {
    show(width, bounds);
    writeSplitWidth(width);
    onCommit(width);
  };

  /* Une fenêtre qui change de taille change les bornes : l'annonce suit, sans
     rendu — la colonne, elle, est déjà bornée par la feuille. */
  useEffect(() => {
    const frame = frameRef.current;
    if (frame === null || typeof ResizeObserver !== 'function') return undefined;
    const observer = new ResizeObserver(() => {
      if (drag.current === null) show(shown.current, boundsNow());
    });
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  const end = (event: PointerEvent<HTMLDivElement>): void => {
    const current = drag.current;
    if (current === null || event.pointerId !== current.pointerId) return;
    drag.current = null;
    event.currentTarget.removeAttribute('data-dragging');
    if (event.currentTarget.hasPointerCapture?.(event.pointerId) === true) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    /* Un appui sans déplacement (le premier temps d'un double-clic), ou un
       geste revenu à son départ, ne crée aucune préférence : la largeur posée
       avant l'appui revient telle quelle — la largeur par défaut reste la
       largeur par défaut. */
    if (current.width === current.startWidth) show(current.initial, current.bounds);
    else commit(current.width, current.bounds);
  };

  const bounds = boundsNow();
  const share = shareOf(effectiveWidth(preferred, bounds), bounds.frame);

  return (
    <div
      ref={handleRef}
      data-split-handle=""
      role="separator"
      tabIndex={0}
      aria-orientation="vertical"
      aria-controls={SPLIT_LIST_ID}
      aria-label={LABELS[language].label}
      aria-valuemin={shareOf(bounds.min, bounds.frame)}
      aria-valuemax={shareOf(bounds.max, bounds.frame)}
      aria-valuenow={share}
      aria-valuetext={percent(language, share)}
      title={LABELS[language].hint}
      onPointerDown={(event) => {
        if (event.button !== 0 || drag.current !== null) return;
        event.preventDefault();
        const now = boundsNow();
        const startWidth = effectiveWidth(shown.current, now);
        drag.current = {
          pointerId: event.pointerId,
          startX: event.clientX,
          initial: shown.current,
          startWidth,
          bounds: now,
          rtl: isRtl(event.currentTarget),
          width: startWidth,
        };
        event.currentTarget.setPointerCapture?.(event.pointerId);
        event.currentTarget.setAttribute('data-dragging', '');
      }}
      onPointerMove={(event) => {
        const current = drag.current;
        if (current === null || event.pointerId !== current.pointerId) return;
        const width = widthAfterDrag({ startWidth: current.startWidth, dx: event.clientX - current.startX, bounds: current.bounds, rtl: current.rtl });
        if (width === current.width) return;
        drag.current = { ...current, width };
        show(width, current.bounds);
      }}
      onPointerUp={end}
      onPointerCancel={end}
      onLostPointerCapture={end}
      onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
        const now = boundsNow();
        const width = widthAfterKey({
          key: event.key,
          shift: event.shiftKey,
          width: effectiveWidth(shown.current, now),
          bounds: now,
          rtl: isRtl(event.currentTarget),
          rem: remOf(),
        });
        if (width === null) return;
        event.preventDefault();
        commit(width, now);
      }}
      onDoubleClick={() => commit(null, boundsNow())}
    />
  );
}
