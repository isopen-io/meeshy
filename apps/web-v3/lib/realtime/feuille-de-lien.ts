import { NOUVEAU_LIEN } from '@/lib/contenu/liens';

/**
 * LA FEUILLE « NOUVEAU LIEN DE PARTAGE », POSTÉE PAR `fetch` — UN SEUL SITE
 * pour les DEUX hôtes qui la servent (#5034) : `/links` (`lib/realtime/
 * liens.ts`, région `#carnet`) et le fil (`lib/realtime/participate.ts`,
 * région `#lien-cree`). Ce module ne fait rien que la porte, servie sans
 * JavaScript, ne fasse déjà : le même POST navigue et recharge. Il SUPPRIME le
 * rechargement — la position, le reste de l'écran et son état ne se repayent
 * plus, et sur le fil aucun socket n'est jamais fermé pour cela.
 *
 * TROIS RÉPONSES, TROIS GESTES (le patron documenté en détail dans
 * `liens.ts`, non recopié ici) :
 *   • le document du SUCCÈS (`?cree=<identifiant>`) — la RÉGION s'échange,
 *     la feuille et son voile se retirent, `<main>` perd `inert`, l'adresse
 *     suit (`replaceState`), le focus revient au CONTRÔLE qui l'avait ouverte ;
 *   • le document de la FEUILLE (refus motifs) — la feuille servie REMPLACE
 *     la nôtre, le motif s'annonce (`role="alert"`), les champs REPOSÉS sont
 *     ceux du SERVEUR ;
 *   • rien de lisible (passerelle injoignable) — la feuille reste INTACTE,
 *     sa voix (`.avis-feuille`, servie muette) le dit.
 *
 * CE QUI DIFFÈRE D'UN HÔTE À L'AUTRE, ET RIEN DE PLUS, EST PARAMÉTRÉ : la
 * RÉGION dont les ENFANTS s'échangent (`#carnet` porte le CARNET ENTIER sur
 * `/links` ; `#lien-cree` ne porte que l'AVIS sur le fil — dans les deux cas,
 * une région SERVIE MUETTE que ce module REMPLIT, jamais composée ici), et
 * l'OUVREUR à refocaliser. Le dialogue N'EST JAMAIS fermé par `close()` — la
 * porte le RETIRE du DOM — sinon l'écouteur de `plein-ecran.ts`, qui suit
 * `data-retour` sur l'événement `close`, naviguerait une seconde fois vers la
 * même adresse que celle que ce module vient déjà de poser.
 */

/**
 * LE CHAMP À REPRENDRE APRÈS UN REFUS — jamais un `<input type="hidden">`
 * (§ 12.10.5, #5034) : le fil verrouille sa conversation par un tel champ,
 * et le marqueur de la feuille (`CHAMP_DU_NOUVEAU_LIEN`, posé AVANT lui dans
 * le formulaire) en est un aussi. Un champ caché n'est pas focalisable — le
 * sélecteur d'origine, `input, select, textarea`, retombait donc SILENCIEUSEMENT
 * sur `<body>` dès que le premier `input` du formulaire était cette conversation
 * verrouillée, MESURÉ dans `__tests__/feuille-de-lien.test.ts`.
 */
const CHAMP_A_REPRENDRE = 'input:not([type="hidden"]), select, textarea';

/**
 * LE CORPS D'UN FORMULAIRE, POSTÉ COMME LE NAVIGATEUR LE POSTERAIT — le SITE
 * UNIQUE des trois gestes qui postent un formulaire de lien : la création
 * (ici), et la FERMETURE d'un lien (`lib/realtime/liens.ts`, propre à
 * `/links`), qui l'IMPORTE plutôt que d'en garder une copie. Il s'écrivait
 * `new FormData(f) as unknown as Record<string, string>` : une double
 * assertion qui MENT au compilateur (une `FormData` porte aussi des `File`)
 * là où une boucle dit la vérité et ne coûte rien.
 */
export const corpsDuFormulaire = (formulaire: HTMLFormElement): URLSearchParams => {
  const paires = new URLSearchParams();
  new FormData(formulaire).forEach((valeur, nom) => {
    if (typeof valeur === 'string') paires.append(nom, valeur);
  });
  return paires;
};

const feuille = (): HTMLDialogElement | null => document.querySelector<HTMLDialogElement>('dialog.nouveau-lien');

const disLaFeuille = (formulaire: HTMLFormElement, phrase: string): void => {
  const region = formulaire.querySelector<HTMLElement>('.avis-feuille');
  if (region === null) return;
  region.textContent = phrase;
  region.hidden = false;
};

export type CibleDeLaFeuilleDeLien = {
  /** La région dont les ENFANTS s'échangent au succès — `#carnet` (/links) ou `#lien-cree` (le fil). */
  readonly region: string;
  /** Le contrôle qui reprend le focus une fois la feuille retirée — celui d'où elle s'était ouverte. */
  readonly ouvreur: string;
};

const poseLaRegion = (recu: Document, cible: CibleDeLaFeuilleDeLien, adresse: string): boolean => {
  const region = document.querySelector<HTMLElement>(cible.region);
  const fraiche = recu.querySelector(cible.region);
  if (region === null || fraiche === null) return false;

  // LES ATTRIBUTS DE LA RÉGION S'ÉCHANGENT AUSSI, PAS SEULEMENT SES ENFANTS —
  // sur `#carnet` (`/links`) ils ne varient jamais et cette ligne ne change
  // rien ; sur `#lien-cree` (le fil), c'est la région ELLE-MÊME qui porte
  // `hidden` (muette avant un succès, révélée après) : ne recopier que les
  // enfants aurait laissé l'avis fraîchement rempli caché derrière l'attribut
  // que le rendu MUET avait posé sur le nœud d'origine.
  Array.from(region.attributes).forEach((attribut) => region.removeAttribute(attribut.name));
  Array.from(fraiche.attributes).forEach((attribut) => region.setAttribute(attribut.name, attribut.value));
  region.replaceChildren(...fraiche.children);
  // LA FEUILLE, C'EST DEUX NŒUDS — le `<dialog>` ET le `<a class="voile">`
  // qui le précède : la retirer les retire TOUS LES DEUX, sur les deux hôtes.
  feuille()?.remove();
  document.querySelector('a.voile')?.remove();
  document.querySelector<HTMLElement>('main')?.removeAttribute('inert');
  history.replaceState(null, '', adresse);
  // Le focus revient au contrôle d'où la feuille s'était ouverte — jamais sur <body>.
  document.querySelector<HTMLElement>(cible.ouvreur)?.focus();
  return true;
};

const poseLaFeuilleRefusee = (recu: Document): boolean => {
  const fraiche = recu.querySelector('dialog.nouveau-lien');
  const courante = feuille();
  if (fraiche === null || courante === null) return false;

  courante.replaceWith(fraiche.cloneNode(true));
  const posee = feuille();
  // Le motif est un `role="alert"` : il s'annonce tout seul. Le clavier, lui,
  // reprend au premier champ — là où la correction commence.
  posee?.querySelector<HTMLElement>(CHAMP_A_REPRENDRE)?.focus();
  return true;
};

/**
 * SOUMET LA FEUILLE — `fetch` vers l'adresse COURANTE (celle que le
 * formulaire poste sans JavaScript : `action` explicite sur le fil, adresse
 * courante implicite sur `/links`), lit les trois réponses, agit.
 */
export const soumetsLaFeuille = async (formulaire: HTMLFormElement, cible: CibleDeLaFeuilleDeLien): Promise<void> => {
  const bouton = formulaire.querySelector<HTMLButtonElement>('button[type="submit"]');
  const libelle = bouton?.textContent ?? '';
  if (bouton !== null) {
    bouton.disabled = true;
    bouton.textContent = NOUVEAU_LIEN.enCours;
  }
  const rends = (): void => {
    if (bouton !== null) {
      bouton.disabled = false;
      bouton.textContent = libelle;
    }
  };

  const action = formulaire.getAttribute('action');
  const cheminDeLaPorte = action !== null && action !== '' ? action : window.location.pathname + window.location.search;

  const reponse = await fetch(cheminDeLaPorte, {
    method: 'POST',
    body: corpsDuFormulaire(formulaire),
    headers: { accept: 'text/html' },
    redirect: 'follow',
  }).catch(() => null);
  const corps = reponse === null ? null : await reponse.text().catch(() => null);
  if (corps === null) {
    rends();
    disLaFeuille(formulaire, NOUVEAU_LIEN.echec);
    return;
  }

  const recu = new DOMParser().parseFromString(corps, 'text/html');
  const adresse = reponse === null ? window.location.pathname : new URL(reponse.url).pathname + new URL(reponse.url).search;

  if (recu.querySelector('dialog.nouveau-lien') !== null) {
    if (!poseLaFeuilleRefusee(recu)) rends();
    return;
  }
  if (poseLaRegion(recu, cible, adresse)) return;

  // Ni région ni feuille reconnue : une panne servie. La feuille reste, sa voix le dit.
  rends();
  disLaFeuille(formulaire, NOUVEAU_LIEN.echec);
};

/**
 * L'ÉCOUTE DE LA FEUILLE — armée par l'hôte qui la sert, RENDUE avec sa
 * poignée de détachement, et JAMAIS DEUX FOIS À LA FOIS.
 *
 * LE SLOT UNIQUE CI-DESSOUS EST LA RÈGLE, pas une précaution. La feuille vit
 * HORS de `<main>` : l'écoute se pose donc au `document`, qui SURVIT à une
 * navigation DOUCE (§ 12.11 étage 3 — le navigateur de zone échange `<main>`
 * et rappelle `monte()` du module d'arrivée). Sans ce slot, deux traversées
 * d'écran laissaient DEUX écoutes sur le même document, et une seule
 * soumission postait DEUX fois : `POST /api/v1/links` n'est pas idempotent —
 * le lecteur repartait avec DEUX liens de partage pour un seul geste, dont un
 * qu'aucun écran ne lui a jamais montré. Le défaut traversait aussi les
 * écrans : l'écoute de `/links` (région `#carnet`) restait armée sur le fil,
 * où elle ne trouvait pas sa région et rendait « échec » par-dessus la
 * création que l'écoute du fil venait de réussir.
 *
 * ARMER DÉTACHE DONC LA PRÉCÉDENTE : un seul écran est vivant à la fois, donc
 * une seule écoute — c'est vrai de `/links` comme du fil, et c'est ce qui
 * dispense `liens.ts` (qui n'observe aucun cycle de vie) d'une poignée qu'il
 * n'aurait nulle part où appeler. Le fil, lui, la rend à `destruction`
 * (`participate.ts`), sans attendre l'arrivée de l'écran suivant.
 */
let detacheLEcouteEnCours: (() => void) | null = null;

export const armeLaFeuilleDeLien = (cible: CibleDeLaFeuilleDeLien): (() => void) => {
  detacheLEcouteEnCours?.();

  const surSoumission = (evenement: Event): void => {
    const origine = evenement.target as HTMLElement | null;
    const formulaire = origine?.closest<HTMLFormElement>('dialog.nouveau-lien form');
    if (formulaire === null || formulaire === undefined) return;
    evenement.preventDefault();
    void soumetsLaFeuille(formulaire, cible);
  };

  document.addEventListener('submit', surSoumission);

  const detache = (): void => {
    document.removeEventListener('submit', surSoumission);
    if (detacheLEcouteEnCours === detache) detacheLEcouteEnCours = null;
  };
  detacheLEcouteEnCours = detache;
  return detache;
};
