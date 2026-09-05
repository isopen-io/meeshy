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

const monteLeModule = async (module: string | null): Promise<void> => {
  if (module === null) return;
  const importe = (await import(/* webpackIgnore: true */ module)) as {
    readonly monte?: () => unknown;
  };
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

  const navigue = async (url: string, geste: 'pousse' | 'retour'): Promise<void> => {
    // L'ÉCRAN QUITTÉ PORTE-T-IL UNE SURIMPRESSION ? L'échange ne remet que
    // `<main>` : le dialogue resterait ouvert par-dessus l'écran neuf, en
    // piège à focus. On rend la main au navigateur — avant même le `fetch`.
    if (porteUneSurimpression(document)) {
      window.location.assign(url);
      return;
    }
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

      const transitionne = (
        document as Document & { startViewTransition?: (rappel: () => void) => unknown }
      ).startViewTransition;
      if (typeof transitionne === 'function') {
        transitionne.call(document, applique);
      } else {
        applique();
      }

      await monteLeModule(echange.module);
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
