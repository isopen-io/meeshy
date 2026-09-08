import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { SCROLL_ACTIVITY_LINGER_MS } from '@meeshy/shared/utils/scroll-activity';

import * as sceneActivity from '@/lib/scene/activity';
import type { SceneActivityState, SceneEvent, SceneMode } from '@/lib/scene/activity';

import { electThreadFocus, focusLine } from './election';
import { SCENE_FLATTEN_DURATION_MS } from './metrics';

/**
 * LA SCÈNE DU FIL (#5648) — ÉLECTION d'une rangée au défilement soutenu,
 * PLUS la courbe continue qu'iOS a retirée (directive 2026-08-24,
 * `apps/ios/decisions.md:328`). Miroir de
 * `MessageListViewController.applyFocalPerspectiveToVisibleCells`
 * (:3283-3345) et de `flattenFocalScene` (:3236-3268), sur un hook hors
 * React — voir `src/lib/scene/activity.ts` pour la loi PURE que ce hook
 * consomme, et `Main/Focal/Core/FocalScrollPerspective.swift` pour la
 * référence complète.
 *
 * QUATRE RÈGLES gouvernent ce fichier :
 *
 * 1. **Une seule lecture de géométrie par image**, coalescée par
 *    `requestAnimationFrame` — même discipline que `lens/scene.ts`.
 * 2. **L'id élu traverse React UNE fois par changement d'élection**
 *    (`setElected`) ; TOUT le reste (activité, armement, révélé) vit dans
 *    des refs et ne re-rend rien. Deux attributs de données
 *    (`data-revealed`, `data-scene`) portent l'état hors React — le révélé
 *    est un sélecteur CSS descendant (`app.css`), jamais N mutations de
 *    style par rangée.
 * 3. **Plus AUCUNE écriture `style.opacity`/`style.transform`** : la
 *    courbe continue que ce hook remplaçait (`perspective.ts`, gelée,
 *    conservée comme point de rebranchement documenté) est retirée de la
 *    production.
 * 4. **`prefers-reduced-motion` n'est PAS lu ici** (contrairement à
 *    l'ancien `useThreadPerspective`) : l'élection se pose quoi qu'il
 *    arrive, seules les TRANSITIONS CSS tombent (`app.css:190-199`).
 */

export type ThreadSceneMode = SceneMode | 'bubbles' | 'summary';

export type ThreadScene = {
  /** L'identifiant de la rangée élue, ou `null` hors scène active. */
  readonly elected: string | null;
  /**
   * ANNONCE un défilement PROGRAMMÉ (`scrollToIndex`, l'épingle du bas) :
   * ni le révélé ni l'armement ne doivent réagir à ce mouvement — même
   * famille de désarmement que l'ancrage bas (D-15, `thread.tsx:252-258`).
   */
  readonly noteProgrammaticScroll: () => void;
};

/** Cadence des `tick` d'horloge — le tiers de la fenêtre de révélé partagée. */
const TICK_INTERVAL_MS = SCROLL_ACTIVITY_LINGER_MS / 3;

const DEFAULT_NOW = (): number => performance.now();

export function useThreadScene(
  frame: { current: HTMLElement | null },
  { mode, now = DEFAULT_NOW }: { readonly mode: ThreadSceneMode; readonly now?: () => number },
): ThreadScene {
  const [elected, setElected] = useState<string | null>(null);
  const dispatchRef = useRef<((event: SceneEvent) => void) | null>(null);

  useEffect(() => {
    const element = frame.current;
    // La scène du fil est INERTE en `summary` (#5695) : le Résumé Vivant
    // n'a pas de rangées `[data-row]` — même garde que `bubbles`.
    if (element === null || mode === 'bubbles' || mode === 'summary') return;

    // `mode` est narrowé à `SceneMode` ('focal' | 'script') après la garde
    // ci-dessus — capturé une fois pour toute la durée de vie de l'effet.
    const sceneMode: SceneMode = mode;

    let state: SceneActivityState = sceneActivity.initialState();
    let electedId: string | null = null;
    let sceneWasActive = false;
    let revealWasOn: boolean | null = null;
    let rafHandle = 0;
    let tickTimer: ReturnType<typeof setInterval> | null = null;
    let flattenTimer: ReturnType<typeof setTimeout> | null = null;

    const stopTickTimer = () => {
      if (tickTimer !== null) {
        clearInterval(tickTimer);
        tickTimer = null;
      }
    };

    const focusPass = () => {
      rafHandle = 0;
      const box = element.getBoundingClientRect();
      const focusY = focusLine({
        visibleTop: box.top,
        visibleBottom: box.bottom,
        offsetFromBottom: element.scrollHeight - element.clientHeight - element.scrollTop,
      });

      // UNE seule passe de LECTURE avant toute écriture (`lens/scene.ts:81-85`).
      const candidates: { readonly id: string; readonly midY: number }[] = [];
      for (const row of element.querySelectorAll<HTMLElement>('[data-row]')) {
        const id = row.dataset.row;
        if (id === undefined) continue;
        const r = row.getBoundingClientRect();
        candidates.push({ id, midY: r.top + r.height / 2 });
      }

      const nextElected = electThreadFocus({ candidates, focusY, current: electedId });
      if (nextElected !== electedId) {
        electedId = nextElected;
        setElected(nextElected);
      }
    };

    const scheduleFocusPass = () => {
      if (rafHandle === 0) rafHandle = requestAnimationFrame(focusPass);
    };

    const ensureTickTimer = (at: number) => {
      const needsTicks = sceneActivity.isRevealed(state, at) || sceneActivity.isSceneActive(state, at);
      if (!needsTicks) {
        stopTickTimer();
        return;
      }
      if (tickTimer !== null) return;
      tickTimer = setInterval(() => {
        state = sceneActivity.reduce(state, { type: 'tick', at: now() }, { mode: sceneMode });
        project();
      }, TICK_INTERVAL_MS);
    };

    /**
     * PROJECTION HORS REACT — posée sur le défileur après chaque
     * `dispatch`, jamais par rangée : `data-revealed` pilote le fondu du
     * révélé (`app.css`) et `data-scene` l'entrée/sortie de la scène.
     */
    const project = () => {
      const at = now();
      const revealed = sceneActivity.isRevealed(state, at);
      // Écrire l'attribut à CHAQUE événement de défilement, même inchangé,
      // invalide le style de toute la sous-arborescence à chaque image :
      // on n'écrit que sur un CHANGEMENT (correction de revue #5648).
      if (revealed !== revealWasOn) {
        revealWasOn = revealed;
        element.dataset.revealed = revealed ? 'true' : 'false';
      }

      const active = sceneActivity.isSceneActive(state, at);
      if (active !== sceneWasActive) {
        sceneWasActive = active;
        if (active) {
          // REPRISE pendant le fondu — miroir `beginFromCurrentState` :
          // annule l'aplatissement en attente, la carte revient depuis sa
          // valeur présentée (transition CSS, jamais un saut).
          if (flattenTimer !== null) {
            clearTimeout(flattenTimer);
            flattenTimer = null;
          }
          element.dataset.scene = 'active';
        } else {
          // Phase 1 : le fondu (`app.css`, `--scene-flatten-ms`) — la carte
          // reste montée le temps de la transition.
          element.dataset.scene = 'idle';
          flattenTimer = setTimeout(() => {
            flattenTimer = null;
            // Phase 2 (miroir `finish`, :3252-3256) : l'armement retombe,
            // la carte se démonte.
            state = sceneActivity.flatten(state);
            electedId = null;
            setElected(null);
            delete element.dataset.scene;
          }, SCENE_FLATTEN_DURATION_MS);
        }
      }

      ensureTickTimer(at);
    };

    /**
     * RESCHEDULE LA GÉOMÉTRIE — miroir `noteFocalScrollTick`, gardé
     * `readingMode == .focal && (isDragging || isDecelerating)` (:3211) :
     * « jamais sur un défilement programmé ». Volontairement HORS de
     * `project()` (correction de revue #5648, défaut majeur 5) : `project()`
     * tourne après CHAQUE dispatch, y compris un `scrolled` GARDÉ (aucune
     * intention ouverte, `reduce` rend le même état) et le `tick` d'horloge
     * périodique — et `isSceneActive` reste vraie plusieurs secondes après
     * la fin du geste. Programmer la passe depuis `project()` réélisait donc
     * sur N'IMPORTE QUEL relayout survenant PENDANT ce répit : cliquer un
     * drapeau de la bande de focus fait grandir la rangée (panneau
     * secondaire), le navigateur compense par un scroll-anchoring qui émet
     * un `scroll` NATIF sans intention ouverte — la carte sautait alors sur
     * la rangée voisine sous le doigt qui vient de cliquer. Ici, la passe
     * n'est reprogrammée QUE depuis le `scrolled` qui vient d'être COMPTÉ
     * (`state.intent` vrai APRÈS réduction : `reduce` l'aurait laissé faux
     * sur un événement gardé) — jamais depuis un `tick` ni un `scrolled`
     * sans intention, exactement le geste que `noteFocalScrollTick` autorise
     * seul.
     */
    const dispatch = (event: SceneEvent) => {
      state = sceneActivity.reduce(state, event, { mode: sceneMode });
      project();
      if (event.type === 'scrolled' && state.intent && sceneMode === 'focal') {
        scheduleFocusPass();
      }
    };
    dispatchRef.current = dispatch;

    const onIntent = () => dispatch({ type: 'intent', at: now() });
    const onScroll = () => dispatch({ type: 'scrolled', at: now(), y: element.scrollTop });

    element.addEventListener('wheel', onIntent, { passive: true });
    element.addEventListener('touchstart', onIntent, { passive: true });
    element.addEventListener('keydown', onIntent, { passive: true });
    element.addEventListener('scroll', onScroll, { passive: true });

    return () => {
      dispatchRef.current = null;
      element.removeEventListener('wheel', onIntent);
      element.removeEventListener('touchstart', onIntent);
      element.removeEventListener('keydown', onIntent);
      element.removeEventListener('scroll', onScroll);
      stopTickTimer();
      if (flattenTimer !== null) clearTimeout(flattenTimer);
      if (rafHandle !== 0) cancelAnimationFrame(rafHandle);
      // DÉMONTAGE / CHANGEMENT DE MODE : tout à plat, sec — aucune
      // transition, aucun attribut résiduel sur une rangée RECYCLÉE par le
      // virtualiseur (`resetFocalPerspectiveOnVisibleCells`, :3418-3420).
      delete element.dataset.revealed;
      delete element.dataset.scene;
      setElected(null);
    };
    // `now` n'entre pas dans les dépendances : le défaut
    // (`() => performance.now()`) change d'identité à chaque rendu sans
    // changer de comportement, et une injection de test passe une
    // référence stable — même dispositif que `jumpToMessage`/`pin` dans
    // `thread.tsx`, dont les commentaires expliquent le même choix.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frame, mode]);

  /**
   * IDENTITÉS STABLES (correction de revue #5648) — l'objet rendu et sa
   * fonction traversent React jusqu'à `FocalRow` par `jumpToMessage` :
   * recréés à chaque rendu, ils faisaient échouer le `memo` que ce lot pose
   * sur la rangée, et la promesse « DEUX rangées re-rendent par changement
   * d'élection » redevenait « toutes ». Le `dispatch` vit dans une ref :
   * cette fonction n'a AUCUNE dépendance.
   */
  const noteProgrammaticScroll = useCallback(() => {
    dispatchRef.current?.({ type: 'programmatic' });
  }, []);

  return useMemo(() => ({ elected, noteProgrammaticScroll }), [elected, noteProgrammaticScroll]);
}
