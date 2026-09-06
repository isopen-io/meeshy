import { armeLaDeconnexion } from './deconnexion';
import { decideLInterception, extraitLEchange, porteUneSurimpression } from './navigateur-decision';

/**
 * LE NAVIGATEUR DE ZONE — le 9ᵉ module de participation (#5106, directive
 * porteur 2026-09-04 : « une navigation moderne, TOUT en maintenant des pages
 * légères »).
 *
 * Le patron Turbo SANS framework : intercepter les `<a>` INTERNES à la zone,
 * `fetch` le document cible — le serveur reste l'UNIQUE compositeur, Prisme
 * compris —, échanger `<main>`, la feuille et le titre, `pushState`,
 * envelopper l'échange d'une View Transition same-document. Pas un octet de
 * composition côté client : ce module déplace des documents, il n'en fabrique
 * pas (§ 12.10.6 : aucun framework hydraté).
 *
 * CE QUE CHAQUE GESTE TIENT :
 *  - la FRONTIÈRE : `decideLInterception` (jumeau runtime du lint
 *    `zone/lien-sortant-en-navigation-client`) — un lien hors de la liste
 *    navigable, une autre origine, un geste d'ouverture : navigation RÉELLE ;
 *  - le CYCLE DE VIE : `meeshy:zone-depart` part AVANT le swap — l'écran
 *    quittant reçoit `destruction` par `lifecycle.ts` (qui se nettoie
 *    lui-même : aucun listener ne survit à la traversée), sa socket ferme ;
 *  - le RÉ-ARMEMENT : le `<main>` neuf nomme son module (`data-module`) ; un
 *    ES module déjà évalué ne se ré-exécute pas — c'est son export `monte()`
 *    qui est appelé ;
 *  - SCROLL et FOCUS : `scrollRestoration = 'manual'`, la position de chaque
 *    entrée d'historique est gardée et restaurée au retour ; le `<main>` neuf
 *    prend le focus ; la région de statut SERVIE (`#annonce-de-zone`,
 *    `role="status"`) annonce l'écran au lecteur d'écran ;
 *  - le REPLI : tout échec — fetch, document sans `<main>`, import — retombe
 *    sur `window.location.assign(url)` : jamais un écran à moitié composé.
 *
 * La liste navigable vient du document (`#zone-navigation`, composée depuis
 * `V3_NAVIGABLE` — même motif que les portées du travailleur : l'image est
 * unique, le périmètre appartient au déploiement). Sans elle, ce module ne
 * s'active pas.
 */

type CadreServi = {
  readonly navigable: readonly string[];
};

type EtatDEntree = {
  readonly defilement: number;
};

const litLeCadre = (): CadreServi | null => {
  const porteur = document.getElementById('zone-navigation');
  if (porteur === null) return null;
  try {
    const brut: unknown = JSON.parse(porteur.textContent ?? '');
    const navigable = (brut as { navigable?: unknown }).navigable;
    if (!Array.isArray(navigable) || navigable.some((entree) => typeof entree !== 'string')) return null;
    return { navigable: navigable as readonly string[] };
  } catch {
    return null;
  }
};

const annonce = (titre: string): void => {
  const region = document.getElementById('annonce-de-zone');
  if (region !== null) region.textContent = titre;
};

const monteLeModule = async (module: string | null, estActuelle: () => boolean): Promise<void> => {
  if (module === null) return;
  const importe = (await import(/* webpackIgnore: true */ module)) as {
    readonly monte?: () => unknown;
  };
  // LA PORTE SE REVÉRIFIE ICI, APRÈS l'`import()` — pas seulement chez
  // l'appelant, avant de le lancer. Un `import()` de PREMIÈRE traversée part
  // sur le réseau (`/rt/<nom>`, doc-comment de `navigue`) et peut mettre
  // plusieurs frames à revenir : une navigation plus récente peut naître
  // PENDANT cette attente, une fois la vérification de l'appelant déjà
  // franchie. Ne revérifier qu'AVANT l'appel laisserait ce module monter
  // quand même — exactement la fuite que ce fichier existe pour fermer.
  if (!estActuelle()) return;
  if (typeof importe.monte === 'function') importe.monte();
};

const echangeLeDocument = (echange: NonNullable<ReturnType<typeof extraitLEchange>>): void => {
  const actuel = document.querySelector('main');
  if (actuel === null) return;
  const gabarit = document.createElement('template');
  gabarit.innerHTML = echange.mainHtml;
  const neuf = gabarit.content.querySelector('main');
  if (neuf === null) return;
  actuel.replaceWith(neuf);
  document.title = echange.titre;
  const feuille = document.head.querySelector('style');
  if (feuille !== null && echange.feuille !== '') feuille.textContent = echange.feuille;
};

const demarre = (): void => {
  const cadre = litLeCadre();
  if (cadre === null || cadre.navigable.length === 0) return;

  history.scrollRestoration = 'manual';
  let enVol: AbortController | null = null;
  // LE JETON DE GÉNÉRATION — `enVol?.abort()` n'annule que le `fetch` et la
  // lecture du corps ; passé `extraitLEchange`, une navigation n'est plus
  // annulable par l'AbortController (aucune attente réseau n'y reste), alors
  // qu'au moins une frame (`updateCallbackDone`) et un `import()` dynamique
  // (`monteLeModule`) restent à courir. Un second clic pendant cette fenêtre
  // laissait DEUX navigations aller au bout : chacune émettait
  // `meeshy:zone-depart`, échangeait `<main>` et montait son module — deux
  // `observeCycleDeVie`, deux sockets vivants. `generation` ferme cette
  // fenêtre : la navigation périmée se tait aux DEUX points qui ne dépendent
  // plus du `fetch` — avant `meeshy:zone-depart` (elle n'aura touché ni
  // destruction ni DOM) et avant `monteLeModule` (elle ne montera pas son
  // module par-dessus l'écran qu'une navigation plus récente vient de poser).
  let generation = 0;

  const navigue = async (url: string, geste: 'pousse' | 'retour'): Promise<void> => {
    // L'ÉCRAN QUITTÉ PORTE-T-IL UNE SURIMPRESSION ? L'échange ne remet que
    // `<main>` : le dialogue resterait ouvert par-dessus l'écran neuf, en
    // piège à focus. On rend la main au navigateur — avant même le `fetch`.
    if (porteUneSurimpression(document)) {
      window.location.assign(url);
      return;
    }
    const mienne = ++generation;
    enVol?.abort();
    const controleur = new AbortController();
    enVol = controleur;
    try {
      const reponse = await fetch(url, {
        headers: { accept: 'text/html' },
        signal: controleur.signal,
      });
      // L'ORIGINE de la réponse finale, comparée STRICTEMENT — jamais un
      // préfixe de chaîne, que `https://hote.evil` sait imiter. Une
      // redirection qui sort de l'origine redevient une navigation réelle.
      if (!reponse.ok || new URL(reponse.url).origin !== window.location.origin) {
        window.location.assign(url);
        return;
      }
      const echange = extraitLEchange(await reponse.text());
      if (echange === null) {
        window.location.assign(url);
        return;
      }
      // PÉRIMÉE ? Une navigation plus récente est partie pendant que celle-ci
      // attendait le réseau — elle n'a encore rien touché : elle se tait ICI,
      // avant `meeshy:zone-depart`, sans détruire l'écran courant ni toucher
      // au DOM. Jamais un `window.location.assign` : la navigation gagnante
      // reste seule maîtresse de l'adresse et du document.
      if (mienne !== generation) return;

      // L'écran quittant se détruit AVANT que son DOM parte — socket fermée,
      // écouteurs retirés (lifecycle.ts, le point d'écoute unique).
      window.dispatchEvent(new Event('meeshy:zone-depart'));

      const applique = (): void => {
        echangeLeDocument(echange);
        if (geste === 'pousse') {
          history.pushState({ meeshyZone: true }, '', reponse.url);
          window.scrollTo(0, 0);
        }
        const principal = document.querySelector('main');
        if (principal instanceof HTMLElement) {
          principal.setAttribute('tabindex', '-1');
          principal.focus({ preventScroll: true });
        }
        annonce(echange.titre);
      };

      // `updateCallbackDone` EST ATTENDUE — jamais l'objet transition jeté.
      //
      // `startViewTransition(applique)` n'appelle JAMAIS `applique()`
      // synchroniquement : l'algorithme de la View Transition API capture
      // l'ancien état puis met le rappel en file pour la prochaine étape
      // « update the rendering » — au mieux une FRAME plus tard. Ce qui a
      // longtemps masqué le défaut, c'est la ligne d'après : `monteLeModule`
      // attend un `import()` DYNAMIQUE. À la PREMIÈRE traversée vers un écran,
      // le module part sur le réseau (`/rt/<nom>`) et met des frames à
      // revenir — le rappel a largement eu le temps de courir. Dès que le
      // module est DANS la carte des modules (tout retour vers un écran déjà
      // visité — `/chats`, chargé au premier pixel, l'est dès le premier
      // retour), la promesse d'import se règle en une MICROTÂCHE, donc AVANT
      // toute occasion de rendu : `monte()` s'exécutait contre l'ANCIEN
      // `<main>`, `document.querySelector('main[data-participation=…]')` de
      // son `demarre()` rendait `null`, et l'écran ARRIVANT ne montait JAMAIS
      // — aucun socket, aucun écouteur, sans qu'aucune erreur ne le signale.
      // Mesuré (#5163 § 12.11.3 point 4) : sur `/chats → fil → /chats`, le fil
      // montait UNE fois puis plus aucun écran ne remontait, tandis que le DOM
      // continuait de basculer normalement — la panne n'était visible que sur
      // ce que le module APPORTE (socket, temps réel), jamais sur la
      // navigation elle-même. C'est le témoin de fuite qui l'a trouvée.
      //
      // Le REPLI tient aux deux bouts : sans `startViewTransition`, `applique()`
      // court tout de suite ; avec une implémentation qui ne rendrait pas
      // `updateCallbackDone`, le `TypeError` retombe dans le `catch` de
      // `navigue` et l'adresse part en navigation RÉELLE — jamais un écran à
      // moitié composé.
      //
      // LES TROIS PROMESSES (#5440) — `ViewTransition` porte `ready`,
      // `updateCallbackDone` ET `finished`. Quand une SECONDE navigation
      // appelle `startViewTransition()` sur le MÊME document avant que la
      // PREMIÈRE n'ait atteint son état final, le navigateur ABANDONNE la
      // précédente : `ready` et `finished` REJETTENT avec `InvalidStateError`,
      // pendant qu'`updateCallbackDone` (déjà réglée, `applique()` ayant déjà
      // tourné) ne bouge plus. Ne jamais laisser `ready` ni `finished` sans
      // gestionnaire — leur rejet resterait un « Uncaught (in promise) » que
      // rien n'attrape, exactement la fenêtre que le jeton de génération
      // documente déjà un cran plus haut (`v3-navigateur-course.spec.ts`,
      // #5392). Seule `updateCallbackDone` gate la suite (le swap doit être
      // fait avant la seconde porte de péremption ci-dessous) ; `ready` et
      // `finished` n'ont qu'à ne pas rejeter dans le vide.
      const transitionne = (
        document as Document & { startViewTransition?: (rappel: () => void) => ViewTransition }
      ).startViewTransition;
      if (typeof transitionne === 'function') {
        const transition = transitionne.call(document, applique);
        transition.ready.catch(() => undefined);
        transition.finished.catch(() => undefined);
        await transition.updateCallbackDone.catch(() => undefined);
      } else {
        applique();
      }

      // PÉRIMÉE, DEUXIÈME PORTE : le DOM a déjà basculé au-dessus (le
      // dispatch de `meeshy:zone-depart` a franchi la première porte avant
      // qu'une navigation plus récente ne démarre) — annuler l'échange
      // reviendrait sur un `<main>` déjà remplacé. Ce qui reste à retenir
      // est le SEUL geste qui ferait fuir un socket : monter le module d'un
      // écran que la navigation gagnante a déjà remplacé. La vérification ICI
      // évite un `import()` inutile pour une navigation déjà périmée ;
      // `monteLeModule` la reprend une seconde fois APRÈS l'import, pour la
      // navigation qui devient périmée PENDANT qu'il est en vol.
      if (mienne !== generation) return;
      await monteLeModule(echange.module, () => mienne === generation);
    } catch (erreur) {
      if ((erreur as { name?: string }).name === 'AbortError') return;
      window.location.assign(url);
    }
  };

  document.addEventListener('click', (evenement) => {
    if (evenement.defaultPrevented) return;
    const cible = evenement.target;
    if (!(cible instanceof Element)) return;
    const lien = cible.closest('a[href]');
    if (!(lien instanceof HTMLAnchorElement)) return;
    const decision = decideLInterception(
      {
        href: lien.href,
        target: lien.target,
        telechargement: lien.hasAttribute('download'),
        bouton: evenement.button,
        modificateur: evenement.metaKey || evenement.ctrlKey || evenement.shiftKey || evenement.altKey,
      },
      { origine: window.location.origin, navigable: cadre.navigable },
    );
    if (decision === 'reelle') return;
    evenement.preventDefault();
    // L'entrée QUITTÉE prend le marqueur de zone AVANT le départ : c'est lui
    // qui autorise le retour arrière à la rejouer en douceur — sans lui,
    // revenir changerait l'adresse en laissant l'écran d'avant à l'écran.
    const entree: EtatDEntree = { defilement: window.scrollY };
    history.replaceState({ ...history.state, meeshyZone: true, ...entree }, '');
    void navigue(lien.href, 'pousse');
  });

  window.addEventListener('popstate', (evenement) => {
    // Seules NOS entrées se rejouent en douceur — une entrée étrangère (un
    // ancrage, un état posé par un module) garde le comportement natif.
    if ((evenement.state as { meeshyZone?: boolean } | null)?.meeshyZone !== true) return;
    void navigue(window.location.href, 'retour').then(() => {
      const defilement = (evenement.state as EtatDEntree | null)?.defilement;
      if (typeof defilement === 'number') window.scrollTo(0, defilement);
    });
  });

  // La sentinelle du témoin e2e : un rechargement REMET ce marqueur à zéro —
  // sa survie prouve la navigation douce.
  (window as Window & { __zoneNavigateur?: number }).__zoneNavigateur =
    ((window as Window & { __zoneNavigateur?: number }).__zoneNavigateur ?? 0) + 1;
};

// LA SORTIE (#5095) — armée ICI parce que ce module est le SEUL que le
// TABLEAU DE BORD expédie (`app/connecte/vue.ts:342`, `blocDuNavigateur()`),
// et que le tableau de bord sert le formulaire de l'espace membre au même
// titre que `/chats`. `liste.ts` l'arme aussi ; `armeLaDeconnexion` est
// idempotente, les deux ensemble ne posent qu'un écouteur. Hors de `demarre`,
// et avant lui : la sortie ne dépend d'aucun périmètre navigable.
armeLaDeconnexion();

demarre();

/**
 * REMONTAGE (#5106) : le navigateur lui-même n'est JAMAIS remonté — il vit la
 * vie du document, pas celle d'un écran. L'export existe pour l'uniformité de
 * la convention, et il est volontairement INERTE au second appel : les
 * écouteurs délégués (click, popstate) survivent au swap puisque `document`
 * et `window` restent.
 */
export const monte = (): void => {};
