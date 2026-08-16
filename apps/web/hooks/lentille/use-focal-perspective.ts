/**
 * `useFocalPerspective` — WF-111 (perspective `.thread` + élection).
 *
 * Pendant fil de `useLentillePerspective` (WL-104) — amendement A3 du
 * workshop : « une forme, deux jeux de constantes ». RÉUTILISE LA MÊME
 * MÉCANIQUE rAF plutôt que de la dupliquer :
 *
 *   - `computeFocusTransform` (factorisé dans `use-lentille-perspective.ts`,
 *     documenté là-bas) — l'écriture `opacity`/`transform` par `focusCurve`,
 *     appelée avec le variant `'thread'`.
 *   - `FOCUS_BAND_OFFSET`/`FOCUS_BAND_HALF_HEIGHT` (`packages/shared/utils/
 *     focus-curve.ts`, GELÉS) — la bande de focus web fil est ANCRÉE de la
 *     MÊME façon que la liste (`containerRect.bottom - FOCUS_BAND_OFFSET`).
 *     RE-PREUVE (§0) : le contrat Focal §4.3 documente `bandLift 150,
 *     bandGap 8` pour iOS, mais la clôture V3 du plan d'exécution
 *     (`tasks/lentille-workshop-execution.md`, ligne V3) est EXPLICITE :
 *     « bande 140±45 : le miroir gelé fait foi, le 150/95 du contrat Focal
 *     §4.3 est un erratum ». `FOCUS_BAND_OFFSET`/`HALF_HEIGHT` (140/45) sont
 *     donc la valeur normative pour LES DEUX variantes — c'est justement ce
 *     que ce fichier consomme sans le redériver.
 *   - Web NON inversé (mission, point 4) : contrairement à iOS
 *     (`collectionView.transform = scaleY(-1)`, index 0 = bas visuel), le
 *     DOM du fil web est en ordre naturel (ancien en haut, récent en bas —
 *     RE-PREUVE `ConversationMessages.tsx:436-439`). « Ancrer près du bas du
 *     viewport » n'exige donc AUCUNE arithmétique de correction d'ancrage
 *     (§4.3 du contrat Focal, `ty = −(h/2)(1−s)`) : `getBoundingClientRect()`
 *     lit déjà des coordonnées ÉCRAN directement exploitables. C'est very
 *     exactement pourquoi la mécanique de `useLentillePerspective` — déjà
 *     écrite pour un DOM non inversé — se transpose sans changement
 *     d'algorithme, seulement un changement de variante de courbe.
 *
 * CE QUI N'EST PAS FACTORISÉ, et pourquoi (documenté, §4.9 du contrat) :
 *
 *   - Élection (`electFocusRow`) : la Lentille (liste) n'élit AUCUN rang
 *     (RE-PREUVE : `ReadingModeMenu.tsx` l'atteste, `useLentillePerspective`
 *     n'a pas de concept de `focusedId`). Le fil, lui, DOIT élire — c'est
 *     WF-111. Ajouter l'élection au hook liste aurait changé son
 *     comportement testé (WL-105) pour une fonctionnalité qu'il n'utilise
 *     jamais.
 *   - Reduced motion : la Lentille COUPE toute la boucle rAF quand
 *     `prefers-reduced-motion` est actif (aucune élection à maintenir). Le
 *     fil, lui, DOIT continuer d'élire — « reduced motion → pas de transform
 *     ... le focus toujours élu et toujours matérialisé par la carte — la
 *     surbrillance survit, l'animation non » (§4.9). Un seul rAF reste donc
 *     nécessaire ICI même sous reduced motion (il n'écrit simplement plus
 *     `opacity`/`transform`), alors que la Lentille n'en démarre aucun.
 *
 * TYPOGRAPHIE 15→16 « à l'arrêt seulement » (§4.6, écart #3) : ce hook
 * n'écrit PAS le grossissement lui-même (React re-render — pas un problème
 * de perf ici comme sur iOS, mais la RÈGLE produit est la MÊME : jamais
 * pendant le défilement). Il expose `focusedId`, une valeur COMMISE
 * seulement quand `isSettled` bascule à `true` — `isSettled` vient de
 * `useScrollActivity` (WL-104, MÊME loi 900 ms que la pilule, un seul
 * minuteur PARTAGÉ) : `visible === false` après le linger signifie « le
 * défilement s'est arrêté depuis 900 ms », le même signal qui masque la
 * pilule jour·heure. `FocalRow` ne re-rend donc PAS à 60 Hz : il ne reçoit
 * `isFocused` que sur les DEUX rangs dont l'élection change, au repos.
 */
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FOCUS_BAND_OFFSET,
  FOCUS_BAND_HALF_HEIGHT,
  electFocusRow,
  type FocusRowCandidate,
} from '@meeshy/shared/utils/focus-curve';
import { useReducedMotion } from '@/hooks/use-accessibility';
import { computeFocusTransform } from './use-lentille-perspective';

/**
 * Plafond d'opacité par défaut — aucun plafonnement (rangée confirmée).
 * Volontairement un littéral LOCAL à ce hook plutôt qu'un import depuis
 * `components/conversations/focal/focal-metrics.ts` (qui EXPOSE le VRAI
 * plafond optimiste, 0.7, §4.4) : ce hook ne connaît PAS la notion « rangée
 * optimiste », seulement « un plafond, ou son absence ». Faire dépendre
 * `hooks/lentille/` de `components/conversations/focal/` inverserait la
 * couche (un hook partagé ne dépend jamais d'une peau) pour économiser un
 * `1` — l'appelant (`FocalRow`, via `setAlphaCeiling`) est le SEUL endroit
 * qui connaît `FOCAL_OPTIMISTIC_ALPHA_CEILING`.
 */
const DEFAULT_ALPHA_CEILING = 1;

export interface UseFocalPerspectiveOptions {
  readonly containerRef: React.RefObject<HTMLElement | null>;
  /** Off si la peau parente n'a rien à animer (ex. fil vide). Défaut `true`. */
  readonly enabled?: boolean;
  /**
   * Signal « défilement arrêté depuis 900 ms » — typiquement `!visible` de
   * `useScrollActivity()` (la MÊME instance que celle qui pilote la pilule
   * jour·heure, WF-111). Défaut `true` (aucune animation en cours ⇒ commet
   * immédiatement, comportement sûr pour un fil monté sans pilule).
   */
  readonly isSettled?: boolean;
}

export interface UseFocalPerspectiveResult {
  /** Ref-setter à poser sur le WRAPPER interne du rang (jamais la racine). */
  readonly registerRow: (id: string) => (el: HTMLElement | null) => void;
  /**
   * Rang élu, COMMIS uniquement quand `isSettled` passe à `true` (jamais
   * pendant le défilement — §4.6, écart #3). `null` avant la première
   * élection.
   */
  readonly focusedId: string | null;
  /**
   * `alpha = min(ceiling, alphaPerspective)` (§4.4 : « le plafond vit dans
   * le descripteur fourni par WS-6/le pass, PAS dans la rangée » — deux
   * écrivains sur la même propriété `opacity` étant le bug n°1 documenté du
   * contrat). `FocalRow` appelle ceci depuis un effet réagissant à
   * `isOptimistic`, jamais pendant le rendu. Imperatif (pas de re-render) :
   * lu par `tick` à la frame suivante.
   */
  readonly setAlphaCeiling: (id: string, ceiling: number) => void;
}

const IDENTITY_OPACITY = '1';
const IDENTITY_TRANSFORM = 'none';

function resetToIdentity(el: HTMLElement): void {
  el.style.opacity = IDENTITY_OPACITY;
  el.style.transform = IDENTITY_TRANSFORM;
}

export function useFocalPerspective({
  containerRef,
  enabled = true,
  isSettled = true,
}: UseFocalPerspectiveOptions): UseFocalPerspectiveResult {
  const rowsRef = useRef(new Map<string, HTMLElement>());
  const reducedMotion = useReducedMotion();
  const reducedMotionRef = useRef(reducedMotion);
  reducedMotionRef.current = reducedMotion;

  const rowCallbacksRef = useRef(new Map<string, (el: HTMLElement | null) => void>());
  const liveFocusedIdRef = useRef<string | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const alphaCeilingsRef = useRef(new Map<string, number>());

  const isSettledRef = useRef(isSettled);
  isSettledRef.current = isSettled;

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
        alphaCeilingsRef.current.delete(id);
      }
    };
    rowCallbacksRef.current.set(id, callback);
    return callback;
  }, []);

  const setAlphaCeiling = useCallback((id: string, ceiling: number) => {
    alphaCeilingsRef.current.set(id, ceiling);
  }, []);

  // Commit IMMÉDIAT au FRONT MONTANT de `isSettled` (bascule scroll→arrêt) :
  // sans attendre la prochaine frame rAF, la dernière élection en vol se
  // publie dès que le signal d'arrêt (900 ms, `useScrollActivity`) arrive.
  // Complété par le commit continu DANS `tick` ci-dessous — nécessaire pour
  // le cas `isSettled` constamment `true` (rien à « re-déclencher ») : sans
  // lui, un fil monté sans pilule ne recevrait jamais son premier
  // `focusedId`, la ref n'étant peuplée qu'APRÈS la première frame, donc
  // après ce montage.
  useEffect(() => {
    if (isSettled) setFocusedId(liveFocusedIdRef.current);
  }, [isSettled]);

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

        if (!reducedMotionRef.current) {
          const { opacity, transform } = computeFocusTransform(midY, focusY, 'thread');
          const ceiling = alphaCeilingsRef.current.get(id) ?? DEFAULT_ALPHA_CEILING;
          // §4.4, mot pour mot : alpha = min(alphaCeiling, alphaPerspective).
          el.style.opacity = String(Math.min(ceiling, Number(opacity)));
          el.style.transform = transform;
        }
      });

      if (candidates.length > 0) {
        liveFocusedIdRef.current = electFocusRow({
          candidates,
          focusY,
          currentId: liveFocusedIdRef.current,
          hysteresis: FOCUS_BAND_HALF_HEIGHT,
        });
      }

      // Commit CONTINU tant que `isSettled` (typiquement : aucun défilement
      // en cours) — voir la note sur l'effet ci-dessus pour le cas mount.
      // `setFocusedId` avec la même valeur ne déclenche pas de re-render
      // (React bail-out sur état identique).
      if (isSettledRef.current) {
        setFocusedId(liveFocusedIdRef.current);
      }

      frameId = requestAnimationFrame(tick);
    };

    frameId = requestAnimationFrame(tick);

    return () => {
      cancelled = true;
      cancelAnimationFrame(frameId);
    };
    // `reducedMotion` n'entre PAS dans les dépendances : contrairement à
    // `useLentillePerspective`, ce hook garde la boucle vivante sous reduced
    // motion (l'élection doit continuer, §4.9) — seule l'ÉCRITURE
    // opacity/transform est court-circuitée, via la ref, à chaque frame.
  }, [containerRef, enabled]);

  return { registerRow, focusedId, setAlphaCeiling };
}
