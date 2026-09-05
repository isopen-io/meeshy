import { PARAMETRE_DE_RECHERCHE, SILENCE_DE_SAISIE_MS } from '@/lib/contenu/recherche';

/**
 * LE MODULE DE PARTICIPATION DE `/search` (issue #4897) — le sixième, et le
 * seul qui n'appelle AUCUNE passerelle : il redemande CE document au serveur
 * (`/search?q=…`, même origine) et échange sa région `#resultats` contre celle
 * du document reçu.
 *
 * C'EST CE QUI LE DISPENSE DE TOUT COMPOSER. Les groupes, le Prisme, les
 * gardes de présence (« aucune pastille hors amitié acceptée » — l'écran ne
 * demande même pas la présence, `lib/api/recherche.ts`) sont l'affaire du
 * SERVEUR, une seule fois : le module pose ce que la porte a composé, il
 * n'invente pas une seconde composition qui divergerait à son premier
 * correctif.
 *
 * « AU PLUS UNE REQUÊTE EN VOL PAR SAISIE » (le critère de #4897, mot à mot) :
 * la saisie est DÉBOUNCÉE (`SILENCE_DE_SAISIE_MS`) et chaque départ ANNULE le
 * vol précédent (`AbortController`) — taper vite ne coûte qu'un aller-retour,
 * et une réponse lente ne peut pas écraser une réponse plus fraîche.
 *
 * TOUT CE QU'IL FAIT, LE DOCUMENT LE FAIT DÉJÀ SANS LUI, plus lentement : le
 * formulaire `method="get"` navigue et recharge. Le module SUPPRIME le
 * rechargement — et `history.replaceState` garde l'adresse PARTAGEABLE, ce qui
 * est la raison d'être du GET.
 */

type Contexte = {
  readonly main: HTMLElement;
  readonly champ: HTMLInputElement;
  readonly resultats: HTMLElement;
  minuterie: ReturnType<typeof setTimeout> | null;
  enVol: AbortController | null;
};

const adresseDe = (requete: string): string => {
  const url = new URL(window.location.href);
  if (requete === '') url.searchParams.delete(PARAMETRE_DE_RECHERCHE);
  else url.searchParams.set(PARAMETRE_DE_RECHERCHE, requete);
  return url.pathname + url.search;
};

/**
 * LA RECHERCHE, SANS NAVIGATION — le document est redemandé, sa région posée,
 * l'adresse alignée. Un échec laisse l'écran tel quel : le prochain silence de
 * saisie redemandera, et le formulaire reste soumettable à l'ancienne.
 */
const cherche = async (ctx: Contexte): Promise<void> => {
  ctx.enVol?.abort();
  const vol = new AbortController();
  ctx.enVol = vol;
  const adresse = adresseDe(ctx.champ.value.trim());

  const document_ = await fetch(adresse, {
    headers: { accept: 'text/html' },
    signal: vol.signal,
  })
    .then((reponse) => (reponse.ok ? reponse.text() : null))
    .catch(() => null);
  if (vol.signal.aborted || document_ === null) return;

  const recu = new DOMParser().parseFromString(document_, 'text/html');
  const region = recu.querySelector('#resultats');
  if (region === null) return;

  ctx.resultats.replaceChildren(...region.children);
  history.replaceState(null, '', adresse);
};

const prendsLaSaisie = (ctx: Contexte): void => {
  ctx.champ.addEventListener('input', () => {
    if (ctx.minuterie !== null) clearTimeout(ctx.minuterie);
    ctx.minuterie = setTimeout(() => {
      ctx.minuterie = null;
      void cherche(ctx);
    }, SILENCE_DE_SAISIE_MS);
  });

  // ENTRÉE cherche TOUT DE SUITE — le silence de saisie est une patience, pas
  // une porte. Le formulaire reste le chemin sans JavaScript.
  ctx.main.querySelector('form.chercher')?.addEventListener('submit', (evenement) => {
    evenement.preventDefault();
    if (ctx.minuterie !== null) {
      clearTimeout(ctx.minuterie);
      ctx.minuterie = null;
    }
    void cherche(ctx);
  });
};

const demarre = (): void => {
  const main = document.querySelector<HTMLElement>('main[data-participation="recherche"]');
  if (main === null) return;
  const champ = main.querySelector<HTMLInputElement>('input[type="search"]');
  const resultats = main.querySelector<HTMLElement>('#resultats');
  if (champ === null || resultats === null) return;

  prendsLaSaisie({ main, champ, resultats, minuterie: null, enVol: null });
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
