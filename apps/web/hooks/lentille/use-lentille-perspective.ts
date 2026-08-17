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
 * `prefers-reduced-motion` ⇒ AUCUNE écriture `opacity`/`transform` ; tout
 * wrapper enregistré est remis (et maintenu) à l'identité (opacity 1,
 * transform none — « focus card = fond seul », critère d'acceptation
 * LWS-10). WL-108 : la BOUCLE, elle, survit — « Reduce motion ⇒ toutes les
 * opacités à 1, focus card = fond seul, ÉLECTION CONSERVÉE » (LWS-8). Avant
 * WL-108, la liste n'élisait rien : couper la boucle entière était alors une
 * implémentation suffisante du même critère, et ce n'est plus vrai. Même
 * arbitrage, mot pour mot, que `useFocalPerspective` (§4.9 : « la
 * surbrillance survit, l'animation non »).
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
 *
 * MISE À JOUR WL-108 — ce qui a changé dans le paragraphe ci-dessus. La
 * phrase « la Lentille n'élit toujours aucun rang » était exacte à la date de
 * WF-111 et ne l'est plus : WL-108 comble le trou de parité avec iOS
 * (I-070/I-071) et la liste élit, elle aussi. Les deux hooks partagent donc
 * désormais `computeFocusTransform` ET `electFocusRow` — mais restent
 * séparés pour la raison qui, elle, n'a PAS changé : leurs politiques de
 * PUBLICATION divergent. Le fil ne COMMET son élu qu'à l'arrêt du défilement
 * (`isSettled`, §4.6 écart #3 : la typographie 15→16 ne bouge jamais sous le
 * pouce) ; la liste ne grossit RIEN (§4.3, « la maquette de la liste ne
 * grossit rien — le scan reste net ») et publie donc EN CONTINU, au fil du
 * défilement, exactement comme `LentilleFocusElectionHost` côté iOS. Deux
 * politiques opposées, chacune juste chez elle : les fusionner rendrait
 * l'une des deux fausse.
 *
 * L'élu ne vit PAS dans un `useState` de ce hook (ni, a fortiori, du point de
 * montage) mais dans `LentilleFocusElection` — voir la docstring de
 * `lentille-focus-election.ts` pour l'arbitrage (porté d'iOS : ne pas
 * re-rendre vingt rangs par rang franchi).
 */
'use client';

import { useCallback, useEffect, useRef } from 'react';
import {
  FOCUS_BAND_OFFSET,
  FOCUS_BAND_HALF_HEIGHT,
  electFocusRow,
  focusCurve,
  type FocusCurveVariant,
  type FocusRowCandidate,
} from '@meeshy/shared/utils/focus-curve';
import { useReducedMotion } from '@/hooks/use-accessibility';
import { LentilleFocusElection } from './lentille-focus-election';

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
  /**
   * Magasin de l'élu (WL-108) — RÉFÉRENCE STABLE pour la durée de vie du
   * hook : la passer en prop ne provoque jamais de re-rendu. Les rangs s'y
   * abonnent un par un via `useIsFocusedRow`.
   */
  readonly election: LentilleFocusElection;
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
  // Instanciation PARESSEUSE : `useRef(new LentilleFocusElection())` en
  // construirait une par rendu pour n'en garder qu'une — un déchet par frappe
  // typing, sur un objet qui porte des abonnés.
  const electionRef = useRef<LentilleFocusElection | null>(null);
  if (electionRef.current === null) electionRef.current = new LentilleFocusElection();
  const election = electionRef.current;
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

  // Remise à l'identité au BASCULEMENT de la préférence : un utilisateur qui
  // active « réduire le mouvement » alors que des wrappers portent déjà une
  // opacité/échelle doit les voir revenir à l'identité, pas se figer là où la
  // dernière frame les avait laissés.
  useEffect(() => {
    if (reducedMotion) rowsRef.current.forEach(resetToIdentity);
  }, [reducedMotion]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !enabled) return;

    let frameId: number;
    let cancelled = false;

    const tick = () => {
      if (cancelled) return;

      const containerRect = container.getBoundingClientRect();
      const focusY = containerRect.bottom - FOCUS_BAND_OFFSET;
      const candidates: FocusRowCandidate[] = [];

      rowsRef.current.forEach((el, id) => {
        const rect = el.getBoundingClientRect();
        const midY = (rect.top + rect.bottom) / 2;
        candidates.push({ id, midY });

        // Reduce motion ⇒ la perspective est COUPÉE (aucune écriture), mais
        // la mesure ci-dessus reste faite : c'est elle qui alimente
        // l'élection, qui doit survivre (LWS-8).
        if (!reducedMotionRef.current) {
          const { opacity, transform } = computeFocusTransform(midY, focusY, 'list');
          el.style.opacity = opacity;
          el.style.transform = transform;
        }
      });

      // La LOI décide, ce hook transmet — même partage des rôles que
      // `LentilleFocusElectionHost` côté iOS. AUCUNE garde
      // `candidates.length > 0` ici (contrairement au pendant fil) : liste
      // vidée ⇒ `electFocusRow` rend `null` ⇒ `adopt(null)` retire la carte,
      // plutôt que de la laisser sur un rang qui n'existe plus.
      election.adopt(
        electFocusRow({
          candidates,
          focusY,
          currentId: election.getElectedId(),
          hysteresis: FOCUS_BAND_HALF_HEIGHT,
        })
      );

      frameId = requestAnimationFrame(tick);
    };

    frameId = requestAnimationFrame(tick);

    return () => {
      cancelled = true;
      cancelAnimationFrame(frameId);
    };
    // `reducedMotion` n'entre PAS dans les dépendances (WL-108) : la boucle
    // reste vivante sous reduced motion pour continuer d'élire ; seule
    // l'ÉCRITURE opacity/transform est court-circuitée, via la ref, à chaque
    // frame. Relancer l'effet au basculement ne ferait que perdre la frame en
    // vol pour un comportement identique.
  }, [containerRef, enabled, election]);

  return { registerRow, election };
}
