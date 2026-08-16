/**
 * `useLentillePerspective` — WL-104 (LWS-10 / LWS-0 §4.1).
 *
 * UN SEUL `requestAnimationFrame` par instance (sur le CONTENEUR, jamais un
 * par rang) : chaque frame mesure la position de chaque rang ENREGISTRÉ
 * (`registerRow`) par rapport à la bande de focus, et écrit `opacity` +
 * `transform` — SEULS — sur son wrapper interne. La courbe vient de
 * `focusCurve(_, 'list')` (`packages/shared/utils/focus-curve.ts`, loi
 * gelée) : jamais recopiée ici.
 *
 * `prefers-reduced-motion` ⇒ la boucle ne démarre jamais ; tout wrapper déjà
 * enregistré est remis à l'identité (opacity 1, transform none — « focus
 * card = fond seul », critère d'acceptation LWS-10).
 *
 * Invariant respecté : cette passe ne touche NI layout NI mesures — elle
 * LIT `getBoundingClientRect()` (déjà nécessaire pour connaître la
 * position réelle des rangs après défilement) mais n'écrit jamais une
 * hauteur, une police, ni aucune propriété qui invaliderait le layout
 * (`FOCUS_BAND_OFFSET`/`focusCurve` eux-mêmes ne référencent jamais `64`,
 * la hauteur du rang — §4.1).
 *
 * FACTORISATION WF-111 (documentée, périmètre volontairement minimal) :
 * `computeFocusTransform` ci-dessous extrait la SEULE part de ce fichier que
 * le pendant `.thread` (`use-focal-perspective.ts`) doit consommer À
 * L'IDENTIQUE — la conversion `distance → { opacity, transform }` par
 * `focusCurve`. Le reste de ce hook (l'effet, la boucle rAF, le repli
 * `prefers-reduced-motion`) reste PROPRE à la Lentille : le fil a besoin, en
 * plus, d'élire un rang (`electFocusRow`) ET de continuer de le faire quand
 * `prefers-reduced-motion` est actif (§4.9 du contrat Focal : « la
 * surbrillance survit, l'animation non ») — un comportement que ce hook
 * n'a jamais eu et qu'il n'y a pas lieu de lui donner (la Lentille n'élit
 * toujours aucun rang, re-prouvé : `ReadingModeMenu.tsx` l'atteste). Dupliquer
 * la dizaine de lignes d'effet aurait donc été plus sûr que de les fusionner
 * de force ; ce qui EST partagé (la loi) ne l'est plus deux fois.
 */
'use client';

import { useCallback, useEffect, useRef } from 'react';
import {
  FOCUS_BAND_OFFSET,
  focusCurve,
  type FocusCurveVariant,
} from '@meeshy/shared/utils/focus-curve';
import { useReducedMotion } from '@/hooks/use-accessibility';

export interface UseLentillePerspectiveOptions {
  readonly containerRef: React.RefObject<HTMLElement | null>;
  /** Off si la peau parente n'a rien à animer (ex. liste vide). Défaut `true`. */
  readonly enabled?: boolean;
}

/**
 * `distance → { opacity, transform }` par `focusCurve` — extrait pour être
 * RÉUTILISÉ tel quel par `useFocalPerspective` (WF-111). Pure, sans DOM :
 * les deux hooks restent seuls responsables de la MESURE (`getBoundingClientRect`)
 * et de l'ÉCRITURE (`el.style...`), cette fonction ne fait que le calcul.
 */
export function computeFocusTransform(
  midY: number,
  focusY: number,
  variant: FocusCurveVariant
): { readonly opacity: string; readonly transform: string } {
  const distance = focusY - midY;
  const { alpha, scale } = focusCurve(distance, variant);
  return { opacity: String(alpha), transform: `scale(${scale})` };
}

export interface UseLentillePerspectiveResult {
  /** Ref-setter à poser sur le WRAPPER interne du rang (jamais la racine — invariant « ne touche pas la géométrie »). */
  readonly registerRow: (id: string) => (el: HTMLElement | null) => void;
}

const IDENTITY_OPACITY = '1';
const IDENTITY_TRANSFORM = 'none';

function resetToIdentity(el: HTMLElement): void {
  el.style.opacity = IDENTITY_OPACITY;
  el.style.transform = IDENTITY_TRANSFORM;
}

export function useLentillePerspective({
  containerRef,
  enabled = true,
}: UseLentillePerspectiveOptions): UseLentillePerspectiveResult {
  const rowsRef = useRef(new Map<string, HTMLElement>());
  const reducedMotion = useReducedMotion();
  // Lu par les callbacks de ref (voir ci-dessous) SANS entrer dans leurs
  // dépendances : ceci garde `registerRow(id)` STABLE d'un rendu à l'autre
  // (même id ⇒ même référence de fonction), condition nécessaire pour que
  // `React.memo(LentilleRow)` ne re-rende pas 20 rangs à chaque frappe
  // typing d'un seul — un `useCallback` dépendant de `reducedMotion` aurait
  // recréé TOUTES les fonctions de ref au moindre changement de préférence.
  const reducedMotionRef = useRef(reducedMotion);
  reducedMotionRef.current = reducedMotion;

  const rowCallbacksRef = useRef(new Map<string, (el: HTMLElement | null) => void>());

  const registerRow = useCallback((id: string) => {
    const cached = rowCallbacksRef.current.get(id);
    if (cached) return cached;

    const callback = (el: HTMLElement | null) => {
      if (el) {
        rowsRef.current.set(id, el);
        if (reducedMotionRef.current) resetToIdentity(el);
      } else {
        rowsRef.current.delete(id);
        rowCallbacksRef.current.delete(id);
      }
    };
    rowCallbacksRef.current.set(id, callback);
    return callback;
  }, []);

  useEffect(() => {
    const container = containerRef.current;

    if (reducedMotion) {
      rowsRef.current.forEach(resetToIdentity);
      return;
    }

    if (!container || !enabled) return;

    let frameId: number;
    let cancelled = false;

    const tick = () => {
      if (cancelled) return;

      const containerRect = container.getBoundingClientRect();
      const focusY = containerRect.bottom - FOCUS_BAND_OFFSET;

      rowsRef.current.forEach((el) => {
        const rect = el.getBoundingClientRect();
        const midY = (rect.top + rect.bottom) / 2;
        const { opacity, transform } = computeFocusTransform(midY, focusY, 'list');
        el.style.opacity = opacity;
        el.style.transform = transform;
      });

      frameId = requestAnimationFrame(tick);
    };

    frameId = requestAnimationFrame(tick);

    return () => {
      cancelled = true;
      cancelAnimationFrame(frameId);
    };
  }, [containerRef, enabled, reducedMotion]);

  return { registerRow };
}
