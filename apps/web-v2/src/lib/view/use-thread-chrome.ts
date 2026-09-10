import { useCallback, useEffect, useRef } from 'react';

import type { ConversationReadingMode } from '@meeshy/shared/types/reading-modes';

import * as sceneActivity from '@/lib/scene/activity';
import type { SceneActivityState, SceneEvent } from '@/lib/scene/activity';

import { chromeHiding, type ChromeHiding } from './thread-chrome';

/**
 * LE HOOK DU CHROME DU FIL (#5774, travail 3/3) — projette `chromeHiding()`
 * sur DEUX attributs de données, HORS REACT (même discipline que
 * `reading-mode/scene.ts::project` pour `data-revealed`/`data-scene`) :
 * `data-chrome-header` (`'entire'` | `'actions'`, absent sinon) et
 * `data-chrome-composer` (`'hidden'`, absent sinon), posés sur `host`. Le
 * composant qui monte ce hook ne re-rend JAMAIS à cause de lui — aucun
 * `useState`, seulement des refs et des mutations DOM directes, exactement
 * le motif que `sceneStyleVars`/`app.css` documentent pour la même raison
 * (métrique 3, zéro re-rendu inutile).
 *
 * `subscribeGesture` est INJECTÉ : un test passe un bouchon qui capture le
 * `listener` (T8) ; `thread.tsx` passe `createScrollerGestureSubscriber`
 * (plus bas), qui réemploie la loi PARTAGÉE `scene/activity.ts` — jamais une
 * seconde écoute du scroll écrite depuis zéro.
 *
 * `ready` — MÊME CONTRAT que `useThreadScene` (`reading-mode/scene.ts`,
 * doc-comment « L'HÔTE DÉCLARE QUE SON CADRE EXISTE ») : `host.current` et
 * `scroller.current` (capturé par `subscribeGesture`) valent `null` tant que
 * l'écran rend un état TRANSITOIRE (`ThreadSkeleton`) au lieu de son arbre
 * final — sans ce signal, l'effet d'abonnement ne se rejoue JAMAIS après
 * l'arrivée du contenu (ses dépendances ne portent que `subscribeGesture`,
 * de RÉFÉRENCE STABLE) et le chrome reste DÉFINITIVEMENT inerte — mesuré :
 * `subscribeGesture` capture `element = null` sur le rendu squelette, rend
 * l'unsubscribe no-op `() => {}`, et plus AUCUN geste n'atteint jamais
 * `createScrollerGestureSubscriber` (vérifié au navigateur, capture
 * `.cache/web-v3-workflow/rendus/thread-chrome-hidden-v2.*.png`, revue de
 * ce lot).
 */

export type GestureListener = (held: boolean) => void;
export type GestureSubscriber = (listener: GestureListener) => () => void;

export type UseThreadChromeInput = {
  readonly mode: ConversationReadingMode;
  readonly searchOpen: boolean;
  readonly composerEngaged: boolean;
  readonly subscribeGesture: GestureSubscriber;
  readonly ready: boolean;
};

/**
 * `applyChromeInert` — CORRECTION revue #5774, défaut majeur 7 : le CSS
 * (`thread-scene.css`) ne posait que `opacity: 0` + `pointer-events: none`
 * sur le chrome escamoté — `pointer-events` n'arrête ni le clavier ni un
 * lecteur d'écran. Un utilisateur au clavier (l'escamotage s'arme aussi sur
 * `keydown`, une intention INDIRECTE, `scene/activity.ts`) tabulait donc
 * dans un en-tête/composeur INVISIBLE — mesuré : cinq focusables dans
 * l'en-tête à `opacity: 0`, et un composeur où l'on pouvait TAPER un
 * message sans le voir.
 *
 * `inert` retire un sous-arbre de l'arbre d'accessibilité ET de l'ordre de
 * tabulation EN MÊME TEMPS qu'il bloque le clic (`pointer-events` déjà en
 * CSS) — LA MÊME double porte que `EdgeHiddenChrome.swift` compose côté iOS
 * (`.opacity(0)` sort la vue de l'arbre SwiftUI, `.allowsHitTesting(false)`
 * bloque le geste). Posé par attribut (`toggleAttribute`), jamais par la
 * propriété IDL : l'attribut est ce que `[inert]` (CSS) et les tests
 * (`matches('[inert]')`) lisent, et il reste correct même dans un
 * environnement de test qui n'implémente pas le COMPORTEMENT de `inert`
 * (happy-dom) — seule sa PRÉSENCE est vérifiable, ce qui suffit : le
 * comportement est celui du moteur de rendu réel (Safari/Chrome), pas de ce
 * hook.
 *
 * Corollaire gratuit : `inert` empêche aussi `.focus()` PROGRAMMATIQUE
 * d'atteindre un descendant — le second symptôme mesuré (`PageUp` arme
 * l'escamotage puis `Tab` atterrit dans l'en-tête invisible) disparaît SANS
 * qu'il faille arbitrer le geste clavier séparément : un sous-arbre inerte
 * n'a plus aucun focusable à atteindre.
 *
 * Cible chaque pièce du chrome par sa classe LIVRÉE (`.thread-header`,
 * `.thread-header-actions`, `.thread-composer-chrome`,
 * `.thread-scroll-to-bottom`) — les MÊMES sélecteurs que `thread-scene.css`
 * — jamais une seconde énumération de nœuds qui pourrait diverger du CSS.
 */
function applyChromeInert(host: HTMLElement, hiding: ChromeHiding): void {
  const header = host.querySelector<HTMLElement>('.thread-header');
  const headerActions = host.querySelector<HTMLElement>('.thread-header-actions');
  const composer = host.querySelector<HTMLElement>('.thread-composer-chrome');
  const scrollButton = host.querySelector<HTMLElement>('.thread-scroll-to-bottom');

  header?.toggleAttribute('inert', hiding.header === 'entire');
  // Quand l'en-tête ENTIER est déjà inerte, la grappe d'actions l'est par
  // HÉRITAGE (un sous-arbre d'un nœud inerte l'est tout entier) : ne PAS lui
  // poser l'attribut évite une double comptabilité à retirer plus tard.
  headerActions?.toggleAttribute('inert', hiding.header === 'actions');
  composer?.toggleAttribute('inert', hiding.composer);
  scrollButton?.toggleAttribute('inert', hiding.composer);
}

export function useThreadChrome(host: { current: HTMLElement | null }, input: UseThreadChromeInput): void {
  const { mode, searchOpen, composerEngaged, subscribeGesture, ready } = input;
  const heldRef = useRef(false);

  const project = useCallback(
    (held: boolean) => {
      const element = host.current;
      if (element === null) return;
      const hiding = chromeHiding({ mode, gesture: held, searchOpen, composerEngaged });
      if (hiding.header === 'none') delete element.dataset.chromeHeader;
      else element.dataset.chromeHeader = hiding.header;
      if (hiding.composer) element.dataset.chromeComposer = 'hidden';
      else delete element.dataset.chromeComposer;
      applyChromeInert(element, hiding);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [host, mode, searchOpen, composerEngaged],
  );

  /**
   * `projectRef` — CORRECTION revue #5774 (défauts 3 et 4) : `subscribeGesture`
   * garde une identité STABLE (production : `useMemo([])` sur `scroller`),
   * donc l'effet d'abonnement ci-dessous ne se rejoue JAMAIS après le
   * premier `ready`. Le `listener` qu'il passe à `subscribeGesture` NE DOIT
   * DONC PAS fermer directement sur `project` — cette valeur serait celle
   * de LA PREMIÈRE fois où `ready` est devenu vrai, gelée pour toute la vie
   * de l'abonnement. Deux symptômes MESURÉS de cette même fermeture
   * périmée : (a) un fil atteint par le Résumé Vivant (`mode` vaut déjà
   * `'summary'` au moment où `ready` bascule) n'escamote plus JAMAIS son
   * chrome après « Reprendre le fil », `chromeHiding` continuant de lire
   * `mode: 'summary'` à chaque geste ultérieur (défaut 3 — ce n'est PAS un
   * remontage de `<main>`, qui reste le MÊME nœud tout du long : mesuré par
   * override de `addEventListener`, un seul `elId`) ; (b) basculer de
   * Focal à Bulles PENDANT la session applique encore la règle FOCALE au
   * tirage suivant (défaut 4). `heldRef`/`project(heldRef.current)`
   * (ci-dessous) corrige déjà l'état AU REPOS sur un changement de mode —
   * cette ref corrige le PROCHAIN ÉVÉNEMENT DE GESTE, qui passe par le
   * `listener` capturé une seule fois par `subscribeGesture`.
   */
  const projectRef = useRef(project);
  useEffect(() => {
    projectRef.current = project;
  }, [project]);

  // ABONNEMENT — une fois par identité de `subscribeGesture` (stable côté
  // production, `useCallback([])` côté test), RE-DÉCLENCHÉ par `ready` — le
  // commit où l'hôte rend enfin son cadre réel, exactement comme
  // `useThreadScene`. Inerte tant que `ready` est faux (`subscribeGesture`
  // n'est PAS appelé : pas d'abonnement mort à nettoyer). Le `listener`
  // passe TOUJOURS par `projectRef.current` — jamais `project` en direct —
  // pour rester valide quel que soit le nombre de rendus survenus depuis
  // que cet effet a tourné.
  useEffect(() => {
    if (!ready) return;
    const unsubscribe = subscribeGesture((held) => {
      heldRef.current = held;
      projectRef.current(held);
    });
    return () => {
      unsubscribe();
      const element = host.current;
      if (element !== null) {
        delete element.dataset.chromeHeader;
        delete element.dataset.chromeComposer;
        applyChromeInert(element, { header: 'none', composer: false });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subscribeGesture, ready]);

  // RE-PROJECTION IMMÉDIATE — `mode`/`searchOpen`/`composerEngaged` peuvent
  // changer PENDANT un geste tenu (ouvrir la recherche en pleine
  // escamotade, par exemple) : la dernière valeur connue du geste
  // (`heldRef`) est reprojetée sans attendre le prochain événement.
  useEffect(() => {
    project(heldRef.current);
  }, [project]);
}

// ---------------------------------------------------------------------------
// LE SOUSCRIPTEUR DE PRODUCTION — réemploie `scene/activity.ts`, jamais une
// seconde loi de défilement.
// ---------------------------------------------------------------------------

const DEFAULT_NOW = (): number => performance.now();

/**
 * LA LEVÉE D'UN GESTE INDIRECT (revue #5774, défaut majeur 8) — `wheel`
 * (souris/trackpad) et `keydown` n'ont, contrairement au doigt, aucun
 * événement de LEVÉE : `isGestureHeld` (`scene/activity.ts`) les fait donc
 * retomber sur la fenêtre de révélé PARTAGÉE (`SCROLL_ACTIVITY_LINGER_MS`,
 * 900 ms) — un dispositif juste pour ce qu'il gouverne à l'origine (l'heure
 * et les coches), mais beaucoup trop long pour LE CHROME : le composeur
 * restait `pointer-events: none` (et, depuis la correction du défaut 7,
 * `inert`) pendant ~900 ms après le DERNIER cran de molette, sur le SEUL
 * périphérique de bureau (le geste doigt, lui, a `release` : mesuré, il
 * revient en ~250 ms via `EDGE_EASE_OUT` seul).
 *
 * `INDIRECT_RELEASE_MS` est une CONSTANTE PROPRE À CE FICHIER, jamais une
 * réduction de `SCROLL_ACTIVITY_LINGER_MS` : cette dernière reste
 * RÉSERVÉE à ce qu'elle gouverne ailleurs (le révélé, `reading-mode/scene.ts`,
 * une instance de réducteur SÉPARÉE) — la réduire ici l'aurait réduite
 * PARTOUT. `isGestureHeld` (la loi PARTAGÉE) reste donc intacte pour
 * l'origine `'touch'` (`state.held`, un FAIT binaire, inchangé) ; seule
 * l'origine `'indirect'` est recalculée LOCALEMENT, à cette instance de
 * réducteur, qui est déjà INDÉPENDANTE de celle du révélé (doc-comment de
 * `createScrollerGestureSubscriber`) — aucune seconde loi de défilement
 * n'est ajoutée, seul le SEUIL de retombée du chrome change, pour CE
 * consommateur, sans toucher qui que ce soit d'autre.
 */
const INDIRECT_RELEASE_MS = 200;
/** Cadence de re-vérification de la levée indirecte — sous le seuil ci-dessus, pour une détection sans à-coup perceptible. */
const INDIRECT_TICK_MS = 60;

/**
 * `createScrollerGestureSubscriber` — attache directement au défileur du
 * fil (`scroller`, le MÊME élément que `useThreadScene`) les écouteurs qui
 * nourrissent `sceneActivity.reduce` : `touchstart`/`touchend`/`touchcancel`
 * pour le DOIGT (`grab`/`release`), `wheel`/`keydown` pour un geste
 * INDIRECT (`intent`, origine `'indirect'`), `scroll` pour compter la
 * session. Une instance de réducteur INDÉPENDANTE de celle de
 * `reading-mode/scene.ts` (qui reste inerte en `bubbles`/`summary`) — le
 * chrome, lui, doit réagir dans TOUS les modes (§1.5 de la spécification
 * #5774) : deux CONSOMMATEURS de la même loi, jamais deux lois.
 */
export function createScrollerGestureSubscriber(
  scroller: { current: HTMLElement | null },
  { now = DEFAULT_NOW }: { readonly now?: () => number } = {},
): GestureSubscriber {
  return (listener) => {
    const element = scroller.current;
    if (element === null) return () => {};

    let state: SceneActivityState = sceneActivity.initialState();
    let heldWasOn = false;
    let tickTimer: ReturnType<typeof setInterval> | null = null;
    /**
     * Horodatage du DERNIER événement indirect (`wheel`/`keydown`/`scroll`
     * pendant une origine indirecte) — défaut 8. `null` hors geste indirect.
     * `held` pour cette origine devient : « un événement indirect a eu lieu
     * il y a moins de `INDIRECT_RELEASE_MS` », jamais la fenêtre de révélé.
     */
    let lastIndirectActivityAt: number | null = null;

    const stopTickTimer = () => {
      if (tickTimer !== null) {
        clearInterval(tickTimer);
        tickTimer = null;
      }
    };

    const heldForIndirect = (at: number): boolean =>
      lastIndirectActivityAt !== null && at - lastIndirectActivityAt < INDIRECT_RELEASE_MS;

    const project = () => {
      const at = now();
      // `state.held` (le FAIT du doigt) reste la loi PARTAGÉE inchangée ;
      // l'origine indirecte lit désormais SA propre fenêtre, courte —
      // défaut 8 : le composeur restait injoignable ~900 ms après le
      // dernier cran de molette, la fenêtre de révélé n'ayant rien à voir
      // avec « le composeur doit-il redevenir cliquable ? ».
      const held = state.origin === 'touch' ? sceneActivity.isGestureHeld(state, at) : heldForIndirect(at);
      if (held !== heldWasOn) {
        heldWasOn = held;
        listener(held);
      }
      // Deux horloges à surveiller pendant un geste indirect : la fenêtre de
      // révélé PARTAGÉE (heure, coches — inchangée) ET la levée COURTE du
      // chrome ci-dessus — le tick tourne tant que L'UNE des deux est
      // encore ouverte, à la cadence la plus fine des deux (`INDIRECT_TICK_MS`,
      // sous le seuil de la levée courte) pour ne manquer aucune des deux
      // transitions.
      const needsTicks =
        state.origin === 'indirect' && (state.intent || sceneActivity.isRevealed(state, at) || heldForIndirect(at));
      if (!needsTicks) {
        stopTickTimer();
        return;
      }
      if (tickTimer !== null) return;
      tickTimer = setInterval(() => {
        state = sceneActivity.reduce(state, { type: 'tick', at: now() }, { mode: 'bubbles' });
        project();
      }, INDIRECT_TICK_MS);
    };

    const dispatch = (event: SceneEvent) => {
      state = sceneActivity.reduce(state, event, { mode: 'bubbles' });
      project();
    };

    const onGrab = () => dispatch({ type: 'grab', at: now() });
    const onRelease = () => dispatch({ type: 'release', at: now() });
    const onIndirectIntent = () => {
      lastIndirectActivityAt = now();
      dispatch({ type: 'intent', at: now(), origin: 'indirect' });
    };
    const onScroll = () => {
      if (state.origin === 'indirect') lastIndirectActivityAt = now();
      dispatch({ type: 'scrolled', at: now(), y: element.scrollTop });
    };

    element.addEventListener('touchstart', onGrab, { passive: true });
    element.addEventListener('touchend', onRelease, { passive: true });
    element.addEventListener('touchcancel', onRelease, { passive: true });
    element.addEventListener('wheel', onIndirectIntent, { passive: true });
    element.addEventListener('keydown', onIndirectIntent, { passive: true });
    element.addEventListener('scroll', onScroll, { passive: true });

    return () => {
      element.removeEventListener('touchstart', onGrab);
      element.removeEventListener('touchend', onRelease);
      element.removeEventListener('touchcancel', onRelease);
      element.removeEventListener('wheel', onIndirectIntent);
      element.removeEventListener('keydown', onIndirectIntent);
      element.removeEventListener('scroll', onScroll);
      stopTickTimer();
    };
  };
}
