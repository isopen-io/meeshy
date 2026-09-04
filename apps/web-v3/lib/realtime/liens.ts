import { NOUVEAU_LIEN } from '@/lib/contenu/liens';

/**
 * LE MODULE DE PARTICIPATION DE `/links` (issue #5090) — le septième, taillé
 * comme celui de `/search` : il ne compose RIEN et n'appelle AUCUNE
 * passerelle. La feuille « nouveau lien » est INTERCEPTÉE, postée par `fetch`
 * au MÊME document, et la réponse — le Post/Redirect/Get suivi jusqu'au bout —
 * EST le document frais : sa région `#carnet` (l'avis « créé » et la liste, le
 * lien neuf dedans, adresse CANONIQUE comprise — #5077) remplace la nôtre.
 *
 * TROIS RÉPONSES, TROIS GESTES :
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
 * TOUT CE QU'IL FAIT, LE DOCUMENT LE FAIT DÉJÀ SANS LUI, plus lentement : le
 * même POST navigue et recharge. Le module SUPPRIME le rechargement — la
 * position, les feuilles et le reste de l'écran ne se repayent plus.
 */

const CHAMP_À_REPRENDRE = 'input, select, textarea';

const feuille = (): HTMLDialogElement | null => document.querySelector<HTMLDialogElement>('dialog.nouveau-lien');

const disLaFeuille = (formulaire: HTMLFormElement, phrase: string): void => {
  const region = formulaire.querySelector<HTMLElement>('.avis-feuille');
  if (region === null) return;
  region.textContent = phrase;
  region.hidden = false;
};

const poseLeCarnet = (recu: Document, adresse: string): boolean => {
  const carnet = document.querySelector<HTMLElement>('#carnet');
  const frais = recu.querySelector('#carnet');
  if (carnet === null || frais === null) return false;

  carnet.replaceChildren(...frais.children);
  feuille()?.remove();
  const main = document.querySelector<HTMLElement>('main');
  main?.removeAttribute('inert');
  history.replaceState(null, '', adresse);
  // Le focus revient au contrôle d'où la feuille s'était ouverte — jamais sur <body>.
  main?.querySelector<HTMLElement>('a[href="/links?nouveau"]')?.focus();
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
  posee?.querySelector<HTMLElement>(CHAMP_À_REPRENDRE)?.focus();
  return true;
};

const soumets = async (formulaire: HTMLFormElement): Promise<void> => {
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

  const reponse = await fetch(window.location.pathname + window.location.search, {
    method: 'POST',
    body: new URLSearchParams(new FormData(formulaire) as unknown as Record<string, string>),
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
  if (poseLeCarnet(recu, adresse)) return;

  // Ni carnet ni feuille : une panne servie. La feuille reste, sa voix le dit.
  rends();
  disLaFeuille(formulaire, NOUVEAU_LIEN.echec);
};

const demarre = (): void => {
  const main = document.querySelector<HTMLElement>('main[data-participation="liens"]');
  if (main === null) return;

  // La feuille vit HORS de `main` (qui est `inert` sous elle) : l'écoute se
  // pose au document, et ne retient que le formulaire de la feuille.
  document.addEventListener('submit', (evenement) => {
    const formulaire = (evenement.target as HTMLElement | null)?.closest<HTMLFormElement>('dialog.nouveau-lien form');
    if (formulaire === null || formulaire === undefined) return;
    evenement.preventDefault();
    void soumets(formulaire);
  });
};

demarre();
