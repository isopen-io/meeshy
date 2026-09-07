import { FERMETURE } from '@/lib/contenu/liens';

import { armeLaFeuilleDeLien, corpsDuFormulaire } from './feuille-de-lien';

/**
 * LE MODULE DE PARTICIPATION DE `/links` (issue #5090, fermeture #4933) — le
 * septième, taillé comme celui de `/search` : il ne compose RIEN et n'appelle
 * AUCUNE passerelle. Les DEUX formulaires de l'écran sont INTERCEPTÉS, postés
 * par `fetch` au MÊME document, et la réponse — le Post/Redirect/Get suivi
 * jusqu'au bout — EST le document frais.
 *
 * LA CRÉATION, TROIS RÉPONSES, TROIS GESTES :
 *   • le document du CARNET (création faite) — la région s'échange, la feuille
 *     se retire, l'adresse suit (`replaceState`), le focus revient au contrôle
 *     d'où la feuille s'était ouverte ;
 *   • le document de la FEUILLE (refus motivé) — la feuille servie REMPLACE la
 *     nôtre : motif dit (`role="alert"`) et champs REPOSÉS par le serveur,
 *     c'est lui qui tient la saisie, pas une copie locale ;
 *   • rien de lisible (passerelle injoignable, panne) — la feuille reste
 *     INTACTE, sa voix (`.avis-feuille`, servie muette) le dit, le bouton
 *     redevient soumettable.
 *
 * LA FERMETURE, OPTIMISTE (#4933, § 12.10.4 : « chaque geste a un effet
 * IMMÉDIAT ») : la ligne passe `.ferme` AVANT la réponse — un clone posé de
 * côté PORTE le rétablissement, jamais une reconstruction depuis la mémoire.
 * Trois issues, comme la création :
 *   • succès (redirection suivie jusqu'au bout) — le CARNET FRAIS remplace le
 *     nôtre, comme la création ;
 *   • refus motivé (403/404, PAS de redirection) — le clone est RÉTABLI, et
 *     l'alerte SERVIE (`#carnet .avis.alerte`) prend la place de toute alerte
 *     précédente ;
 *   • panne (réseau coupé, réponse illisible) — le clone est RÉTABLI, une
 *     alerte LOCALE le dit (`FERMETURE.echec`) : aucun document n'est arrivé
 *     pour en fournir une.
 *
 * TOUT CE QUE LE MODULE FAIT, LE DOCUMENT LE FAIT DÉJÀ SANS LUI, plus
 * lentement : le même POST navigue et recharge. Le module SUPPRIME le
 * rechargement — la position, les feuilles et le reste de l'écran ne se
 * repayent plus.
 *
 * LE MENU D'UNE LIGNE CONVERGE VERS UN SEUL OUVERT (revue de #4933) : SANS ce
 * module, `<details>` natif est le contrat — plusieurs peuvent rester ouverts,
 * et c'est très bien, le clavier et la souris s'en accommodent. AVEC lui, la
 * directive 4 veut une surface PILOTÉE par le script une fois le premier pixel
 * passé, donc trois écoutes de PLUS tiennent la convergence : `toggle` (en
 * CAPTURE — il ne bulle pas sur tous les moteurs) referme les AUTRES dès
 * qu'un menu s'ouvre ; `click` referme tout menu que le clic ne CONTIENT pas
 * (le seul cas que `toggle` ne couvre pas : cliquer ailleurs sans en ouvrir un
 * second) ; `keydown` sur Échap referme celui qui porte le FOCUS et le lui
 * rend sur son sommaire — jamais sur `<body>`.
 */

/**
 * LA SOUMISSION DE LA FEUILLE DE CRÉATION — `soumetsLaFeuille`
 * (`./feuille-de-lien`, #5034), paramétrée par la région propre à CET hôte
 * (`#carnet`, la liste ENTIÈRE) et le contrôle à refocaliser (« Nouveau
 * lien », l'ouvreur de l'en-tête). Le SECOND hôte, le fil, paramètre le MÊME
 * site avec SA région (`#lien-cree`) et SON ouvreur (`a.partager`) —
 * `lib/realtime/participate.ts`.
 */
const CIBLE_DU_CARNET = { region: '#carnet', ouvreur: 'a[href="/links?nouveau"]' } as const;

/**
 * LA RÉGION DU CARNET, ÉCHANGÉE APRÈS UNE FERMETURE RÉUSSIE — même geste que
 * `soumetsLaFeuille` fait pour la création, gardé ICI parce que fermer un lien
 * reste PROPRE à `/links` (le fil ne ferme aucun lien depuis son fil).
 */
const poseLeCarnet = (recu: Document, adresse: string): boolean => {
  const carnet = document.querySelector<HTMLElement>('#carnet');
  const frais = recu.querySelector('#carnet');
  if (carnet === null || frais === null) return false;

  carnet.replaceChildren(...frais.children);
  document.querySelector('dialog.nouveau-lien')?.remove();
  document.querySelector('a.voile')?.remove();
  const main = document.querySelector<HTMLElement>('main');
  main?.removeAttribute('inert');
  history.replaceState(null, '', adresse);
  main?.querySelector<HTMLElement>('a[href="/links?nouveau"]')?.focus();
  return true;
};

/** Un `<span class="lien">` (lien sans conversation) n'est pas focusable de nature : il le devient pour ce geste. */
const prendsLeFocus = (noeud: HTMLElement): void => {
  if (noeud.tabIndex < 0 && noeud.tagName !== 'A') noeud.tabIndex = -1;
  noeud.focus();
};

/**
 * MARQUER UNE LIGNE FERMÉE, SANS ATTENDRE LA PASSERELLE — l'application
 * OPTIMISTE (§ 12.4). Le menu n'a plus d'effet sur une ligne fermée (règle
 * 11), donc il DISPARAÎT avec elle ; la pastille « Fermé » est DÉVOILÉE, pas
 * composée : le serveur la sert muette sur toute ligne active
 * (`liens-vue.ts` › `dedans`), et l'état optimiste est ALORS l'état confirmé,
 * au pixel près.
 *
 * LE FOCUS SUIT LA LIGNE. Le `<details>` qu'on retire PORTAIT le bouton que le
 * lecteur vient d'actionner : sans ce déplacement, le focus retombe sur
 * `<body>` et la tabulation suivante repart du haut du document — sur le
 * chemin NOMINAL, pas seulement au refus.
 */
const marqueFerme = (li: HTMLLIElement): void => {
  li.classList.add('ferme');
  const cible = li.querySelector<HTMLElement>('.lien');
  cible?.classList.add('ferme');
  const etat = li.querySelector<HTMLElement>('.etat');
  if (etat !== null) etat.hidden = false;
  li.querySelector('details.actions')?.remove();
  prendsLeFocus(cible ?? li);
};

/**
 * LA VOIX DU CARNET — la région `role="alert"` SERVIE par le document
 * (`#carnet > .avis.alerte`, muette au repos), jamais un nœud que ce module
 * compose : une région d'alerte insérée avec son texte n'est pas annoncée de
 * façon fiable, et la composer ici ferait un SECOND site de balisage pour un
 * message que le serveur écrit déjà.
 */
const disLeCarnet = (texte: string): void => {
  const alerte = document.querySelector<HTMLElement>('#carnet > .avis.alerte');
  if (alerte === null) return;
  const motif = alerte.querySelector<HTMLElement>('.motif') ?? alerte;
  motif.textContent = texte;
  alerte.hidden = false;
  // Un succès PRÉCÉDENT ne tient plus : un seul message à la fois.
  document.querySelector<HTMLElement>('#carnet > .avis[role="status"]')?.remove();
};

/** Le motif SERVI par le document reçu, pris tel quel — jamais recomposé. */
const motifServi = (recu: Document): string | null => {
  const texte = recu.querySelector<HTMLElement>('#carnet > .avis.alerte .motif')?.textContent ?? '';
  return texte.trim() === '' ? null : texte;
};

const fermer = async (formulaire: HTMLFormElement): Promise<void> => {
  const li = formulaire.closest<HTMLLIElement>('li.ligne-lien');
  if (li === null) return;
  // Le CLONE porte le rétablissement — jamais une reconstruction depuis la
  // mémoire, qui divergerait du DOM réel au premier changement de structure.
  const original = li.cloneNode(true) as HTMLLIElement;
  const retablis = (texte: string): void => {
    li.replaceWith(original);
    disLeCarnet(texte);
    // Le focus vivait dans le nœud qu'on vient de remplacer : il revient au
    // sommaire du menu rétabli, là où le geste reprend.
    original.querySelector<HTMLElement>('details.actions>summary')?.focus();
  };
  // LE CORPS SE LIT AVANT L'OPTIMISME : `marqueFerme` retire le `<details>` qui
  // porte ce formulaire, et lire ses champs après l'en avoir détaché n'est vrai
  // que par accident.
  const charge = corpsDuFormulaire(formulaire);
  marqueFerme(li);

  const reponse = await fetch(window.location.pathname + window.location.search, {
    method: 'POST',
    body: charge,
    headers: { accept: 'text/html' },
    redirect: 'follow',
  }).catch(() => null);
  const corps = reponse === null ? null : await reponse.text().catch(() => null);

  if (reponse === null || corps === null) {
    retablis(FERMETURE.echec);
    return;
  }

  const recu = new DOMParser().parseFromString(corps, 'text/html');

  if (!reponse.ok) {
    retablis(motifServi(recu) ?? FERMETURE.echec);
    return;
  }

  const adresse = new URL(reponse.url).pathname + new URL(reponse.url).search;
  if (!poseLeCarnet(recu, adresse)) retablis(FERMETURE.echec);
};

/** Tous les menus de ligne actuellement OUVERTS — jamais recomptés, toujours relus. */
const menusOuverts = (): readonly HTMLDetailsElement[] =>
  Array.from(document.querySelectorAll<HTMLDetailsElement>('#carnet details.actions[open]'));

/**
 * REFERME LES AUTRES MENUS QU'UN, sans jamais toucher `sauf` — appelé aux DEUX
 * occasions qui doivent faire converger l'écran vers UN SEUL menu ouvert : un
 * clic hors de tout menu (`sauf === null`), et l'ouverture d'un second menu
 * (`sauf` = celui qu'on vient d'ouvrir).
 */
const refermeLesAutresMenus = (sauf: HTMLDetailsElement | null): void => {
  menusOuverts().forEach((details) => {
    if (details !== sauf) details.open = false;
  });
};

const demarre = (): void => {
  const main = document.querySelector<HTMLElement>('main[data-participation="liens"]');
  if (main === null) return;

  // LA CRÉATION est armée par le SITE PARTAGÉ (`feuille-de-lien.ts`), qui
  // tient l'écoute UNIQUE des deux hôtes : l'armer ici DÉTACHE celle que le
  // fil aurait laissée derrière lui après une navigation douce, et réciproquement.
  armeLaFeuilleDeLien(CIBLE_DU_CARNET);

  // LA FERMETURE reste PROPRE à cet écran (`/links` seul ferme un lien depuis
  // sa liste) : son formulaire vit DANS `#carnet`, pas dans une feuille.
  document.addEventListener('submit', (evenement) => {
    const cible = evenement.target as HTMLElement | null;
    const fermeture = cible?.closest<HTMLFormElement>('li.ligne-lien form');
    if (fermeture === null || fermeture === undefined) return;
    evenement.preventDefault();
    void fermer(fermeture);
  });

  /**
   * UNE SURFACE PILOTÉE PAR LE SCRIPT NE LAISSE PAS DEUX MENUS OUVERTS À LA
   * FOIS (§ 12.10.4) — `<details>` natif n'en sait rien tout seul, une fois le
   * module chargé c'est à LUI de le tenir. Écouté en CAPTURE : `toggle` ne
   * bulle pas sur tous les moteurs, la capture le voit quand même, au même
   * titre que sa cible.
   */
  document.addEventListener(
    'toggle',
    (evenement) => {
      const cible = evenement.target;
      if (!(cible instanceof HTMLDetailsElement)) return;
      if (cible.closest('#carnet') === null || !cible.matches('details.actions')) return;
      if (cible.open) refermeLesAutresMenus(cible);
    },
    true,
  );

  // LE CLIC EXTÉRIEUR REFERME — le seul cas que l'ouverture d'un second menu
  // ne couvre pas : cliquer AILLEURS, sans jamais toucher un autre sommaire.
  // Un clic sur le sommaire du menu qu'on ferme reste intact : il est CONTENU
  // dans son propre `<details>`, donc jamais visé ici — le geste natif du
  // navigateur le bascule seul, sans double bascule de notre part.
  document.addEventListener('click', (evenement) => {
    const cible = evenement.target;
    if (!(cible instanceof Node)) return;
    menusOuverts().forEach((details) => {
      if (!details.contains(cible)) details.open = false;
    });
  });

  // ÉCHAP REFERME LE MENU QUI PORTE LE FOCUS, ET LUI REND LE FOCUS SUR SON
  // SOMMAIRE — sans quoi la tabulation suivante repartirait de `<body>`.
  document.addEventListener('keydown', (evenement) => {
    if (evenement.key !== 'Escape') return;
    const focus = document.activeElement;
    const details = focus instanceof Element ? focus.closest<HTMLDetailsElement>('#carnet details.actions[open]') : null;
    if (details === null) return;
    evenement.preventDefault();
    details.open = false;
    details.querySelector<HTMLElement>(':scope > summary')?.focus();
  });
};

demarre();

/**
 * REMONTAGE PAR LE NAVIGATEUR DE ZONE (#5106) : un ES module réimporté ne se
 * ré-exécute pas — après une navigation douce, c'est cet export que le
 * navigateur appelle pour monter l'écran neuf. L'auto-démarrage ci-dessus
 * reste : sans navigateur (amélioration progressive), l'import du chargeur
 * suffit, comme avant.
 */
export const monte = demarre;
