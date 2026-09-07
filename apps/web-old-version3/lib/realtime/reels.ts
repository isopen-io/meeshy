import {
  doitAutoJouer,
  estLaTeteDeLaFile,
  ETAT_INITIAL_DE_LA_MOLETTE,
  peutReculer,
  verdictDeLaMolette,
  verdictDuClavier,
  verdictDuToucher,
  type EtatDeLaMolette,
  type Verdict,
} from './reels-decision';
import { observeCycleDeVie, unSeulMontageParEcran } from './lifecycle';

/**
 * LE MODULE DE LECTURE DE `/feed/reels` (§ 12.4, #5388) — le treizième module
 * de participation, et le plus étroit de tous après `plein.js` : JOUER,
 * DÉCIDER, RELÂCHER. Rien d'autre.
 *
 * **CE MODULE NE FAIT PAS DE NAVIGATION — IL EN ACTIVE UNE QUI EXISTE DÉJÀ.**
 * Un geste vertical (molette, toucher, flèche) ne fabrique aucun document : il
 * CLIQUE le lien `a.tap.suivante` que le serveur a déjà composé
 * (`reels-porte.ts`), ou déclenche `history.back()`. C'est le navigateur de
 * zone (#5106, `navigateur.ts`) — quand il est armé — qui fait le reste :
 * fetch, échange de `<main>`, `pushState`, View Transition, RE-ARMEMENT de ce
 * module même (son export `monte`). Sans lui, le lien navigue RÉELLEMENT :
 * amélioration progressive, jamais une condition.
 *
 * Trois raisons à ce choix, dans l'ordre (voir le rapport de #5388) :
 *  1. « une seule `<video>` décodée » reste vrai PAR CONSTRUCTION — une page,
 *     un réel (`reels-porte.ts`, doc-comment) — tant qu'aucun module n'empile
 *     de tranches dans le DOM ;
 *  2. empiler des `<main id="main-content">` clonés dupliquerait des ids
 *     (`main-content`, `champ-reponse`) — une violation d'accessibilité
 *     immédiate, et ce module fabriquerait le balisage qu'aucun des modules
 *     voisins ne fabrique (loi « NE CRÉE AUCUN NŒUD », `feed.ts`) ;
 *  3. l'échange, le `pushState`, le focus, l'annonce et le ré-armement
 *     existent DÉJÀ dans `navigateur.ts` — les réécrire ici serait la jumelle
 *     d'un mécanisme à site unique.
 *
 * **LE CYCLE DE VIE PASSE PAR `lifecycle.ts`, SITE UNIQUE.** `masquage` met la
 * vidéo en pause (un onglet caché ne décode pas) ; `destruction` (navigation
 * réelle OU douce, `meeshy:zone-depart`) relâche le décodeur avant que le DOM
 * ne parte — `pause()`, retrait de `src`, `load()` — et désabonne tous les
 * écouteurs de geste que ce module a posés.
 *
 * **LES ÉCOUTEURS DE GESTE VIVENT SUR `document`, PAS SUR `main`.** Un tap
 * clavier arrive sans qu'aucun élément n'ait le focus lors du premier chargement
 * (page servie sans script de mise au point) ; un écouteur posé sur `main` ne
 * les verrait jamais dans ce cas. Posés sur `document`, ils sortent donc du
 * nettoyage automatique qu'offre le remplacement de `main` par le navigateur
 * de zone — ce module les retire donc EXPLICITEMENT à la `destruction`.
 *
 * **`avances` EST UNE PILE QUI SURVIT AUX NAVIGATIONS DOUCES.** C'est une
 * variable de MODULE, pas de fonction : le navigateur de zone réimporte le
 * même module ES (jamais réévalué) et appelle seulement `monte()` — l'état
 * survit donc à la traversée, exactement ce que la garde `peutReculer` exige.
 * Elle se DÉPILE au retour et se remet à zéro À LA TÊTE DE LA FILE
 * (`estLaTeteDeLaFile`) : un compte qui ne ferait que monter serait un
 * loquet, et une flèche haut de trop sortirait le lecteur de la file vers
 * l'écran d'où il venait — un geste de lecture ne quitte pas la lecture.
 *
 * **UN SEUL MONTAGE PAR ÉCRAN**, par `unSeulMontageParEcran` (`lifecycle.ts`,
 * le site unique) et jamais par un drapeau recopié ici. À la PREMIÈRE
 * traversée douce vers `/feed/reels`, le navigateur de zone `import()` ce
 * module — son auto-démarrage court — PUIS appelle `monte()` sur le même
 * `<main>` : sans cette garde, une seule flèche faisait DEUX pas de file,
 * l'autolecture partait deux fois et deux `observeCycleDeVie` vivaient côte à
 * côte (mesuré : `__tests__/reels-module.test.ts`).
 */

const prefersReducedMotion = (): boolean =>
  typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** `navigator.connection` n'est standardisé nulle part encore — absence = pas d'économie déclarée. */
const economiseLesDonnees = (): boolean =>
  (navigator as Navigator & { readonly connection?: { readonly saveData?: boolean } }).connection?.saveData === true;

const estUneCibleDeSaisie = (cible: EventTarget | null): boolean =>
  cible instanceof HTMLTextAreaElement ||
  cible instanceof HTMLInputElement ||
  (cible instanceof HTMLElement && cible.isContentEditable);

/** Le compte de pas « suivant » réussis dans cette session de document — voir le doc-comment de tête. */
let avances = 0;

const demarre = (): void => {
  const main = document.querySelector<HTMLElement>('main[data-participation="reels"]');
  if (main === null) return;
  if (!unSeulMontageParEcran(main)) return;

  if (estLaTeteDeLaFile(window.location.search)) avances = 0;

  const video = main.querySelector<HTMLVideoElement>('video');

  const autoJoue = (): boolean =>
    video !== null &&
    doitAutoJouer({
      reduiteMotion: prefersReducedMotion(),
      saveData: economiseLesDonnees(),
      videoPresente: true,
      ongletVisible: document.visibilityState === 'visible',
    });

  const joue = (): void => {
    if (video === null) return;
    // Le son se rend par les `controls` natifs déjà servis (`media-html.ts`) —
    // l'autolecture ne se demande jamais autrement que MUETTE.
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    // Une source qui échoue (404, format refusé) ne doit rien jeter d'inobservé.
    video.play().catch(() => {});
  };

  if (autoJoue()) joue();

  let etatMolette: EtatDeLaMolette = ETAT_INITIAL_DE_LA_MOLETTE;
  let debutToucher: { readonly x: number; readonly y: number } | null = null;

  const agis = (verdict: Verdict): void => {
    if (verdict === 'suivant') {
      const lien = main.querySelector<HTMLAnchorElement>('a.tap.suivante');
      // AU BOUT DE LA FILE, CE LIEN N'EXISTE PAS — le geste est inerte, comme
      // le tap lui-même (charte règle 7) : jamais une erreur pour un défilement
      // qui n'a nulle part où aller.
      if (lien === null) return;
      lien.click();
      return;
    }
    if (verdict !== 'precedent' || !peutReculer(avances)) return;
    // LA PILE SE DÉPILE — sinon le geste continuerait de reculer une fois la
    // file remontée, et sortirait le lecteur vers l'écran d'où il venait.
    avances -= 1;
    history.back();
  };

  const surMolette = (evenement: WheelEvent): void => {
    const { verdict, etat } = verdictDeLaMolette(etatMolette, evenement.deltaY, Date.now());
    etatMolette = etat;
    agis(verdict);
  };

  const surToucherDebut = (evenement: TouchEvent): void => {
    const point = evenement.touches[0];
    debutToucher = point === undefined ? null : { x: point.clientX, y: point.clientY };
  };

  const surToucherFin = (evenement: TouchEvent): void => {
    const depart = debutToucher;
    debutToucher = null;
    if (depart === null) return;
    const point = evenement.changedTouches[0];
    if (point === undefined) return;
    agis(verdictDuToucher(point.clientX - depart.x, point.clientY - depart.y));
  };

  const surClavier = (evenement: KeyboardEvent): void => {
    agis(verdictDuClavier(evenement.key, estUneCibleDeSaisie(evenement.target)));
  };

  // L'AVANCE SE COMPTE AU LIEN, JAMAIS AU GESTE. Le tap « Réel suivant »
  // (`a.tap.suivante`, la moitié droite de la scène) avance la file
  // exactement comme une flèche — et le geste le CLIQUE, si bien qu'un seul
  // site compte les deux. Comptée dans `agis`, la pile ignorait le doigt : un
  // lecteur qui avait tapé trois fois voyait sa flèche haut refuser de
  // revenir, un contrôle inerte là où il a un sens (charte règle 7).
  main.addEventListener('click', (evenement) => {
    const cible = evenement.target;
    if (cible instanceof Element && cible.closest('a.tap.suivante') !== null) avances += 1;
  });

  document.addEventListener('wheel', surMolette, { passive: true });
  document.addEventListener('touchstart', surToucherDebut, { passive: true });
  document.addEventListener('touchend', surToucherFin, { passive: true });
  document.addEventListener('keydown', surClavier);

  observeCycleDeVie({
    cleDuJeton: 'meeshy-reels',
    sur: (transition) => {
      if (transition.type === 'masquage') {
        video?.pause();
        return;
      }
      // LE RETOUR DE L'ONGLET REPREND LA LECTURE — sans quoi le masquage
      // laisse un réel MORT derrière lui : le lecteur revient sur une image
      // fixe, et rien à l'écran ne dit qu'il faut la relancer. La reprise
      // repasse par les MÊMES trois refus que le premier départ (mouvement
      // réduit, économie de données, absence de vidéo) : ce qui n'a jamais
      // joué ne se met pas à jouer au retour.
      if (transition.type === 'reprise') {
        if (autoJoue()) joue();
        return;
      }
      if (transition.type !== 'destruction') return;
      // LE DÉCODEUR EST RENDU AVANT QUE LE `<main>` NE PARTE — c'est le critère
      // de la matrice : « pas de rétention au changement d'écran ».
      video?.pause();
      if (video !== null) {
        video.removeAttribute('src');
        video.load();
      }
      document.removeEventListener('wheel', surMolette);
      document.removeEventListener('touchstart', surToucherDebut);
      document.removeEventListener('touchend', surToucherFin);
      document.removeEventListener('keydown', surClavier);
    },
  });
};

demarre();

/**
 * REMONTAGE PAR LE NAVIGATEUR DE ZONE (#5106) — voir `feed.ts` pour la
 * convention : sans navigateur (amélioration progressive), l'auto-démarrage
 * ci-dessus suffit.
 */
export const monte = demarre;
