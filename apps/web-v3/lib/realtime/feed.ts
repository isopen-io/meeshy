import { COOKIE_DE_JETON, valeurDuCookie } from '@/lib/api/cookies';
import { aime, reposte } from '@/lib/api/publication';
import { FIL_SOCIAL } from '@/lib/contenu/social';

import { aposteRepost, basculeAime, type EtatDAime } from './feed-etat';

/**
 * LE MODULE DE PARTICIPATION DE `/feed` (§ 12.4, #5031) — le plus léger des
 * trois : ni composeur, ni socket, ni synchronisation. Aimer et reposter sont
 * des allers simples, et le rail de stories n'écoute rien — il arrive donc
 * APRÈS le premier pixel, par `await import()` sur `main[data-module]`
 * (`app/connecte/chargeur.ts`), sur `main[data-participation="feed"]`.
 *
 * ASYMÉTRIE ASSUMÉE, ET ÉCRITE (conception § 11, question 13) : ce module
 * n'écoute RIEN d'ENTRANT — un like d'un tiers, une publication neuve d'un
 * ami, un second onglet du même lecteur ne rafraîchissent rien ici. La
 * passerelle diffuse pourtant `post:liked`/`post:created`/`post:updated` sur
 * la feed room que TOUT socket authentifié rejoint déjà à l'auth
 * (`AuthHandler`, `SocialEventsHandler`) — mais importer `socket.io-client`
 * coûterait ici 26 549 o gzip (`budgets-mesures.json` › `participate`) pour
 * un module qui en pèse 7 584 aujourd'hui, sur l'écran que la directive du
 * porteur destine à la 3G rurale (§ 12.6). Ce n'est PAS un oubli : c'est une
 * décision de poids, non tranchée par une issue — voir § 11 question 13
 * avant d'y toucher.
 *
 * TOUT CE QU'IL FAIT, LE DOCUMENT LE FAIT DÉJÀ SANS LUI, plus lentement : les
 * deux gestes sont des `<form method="post">` que `app/connecte/social-
 * porte.ts` applique et qui rechargent la page. Le module SUPPRIME le
 * rechargement — amélioration progressive, jamais une condition — et rend le
 * geste OPTIMISTE : peint AVANT le réseau, défait sur refus (Instant App
 * Principles, `CLAUDE.md`).
 *
 * IL NE CRÉE AUCUN NŒUD (même loi que `liste-peinture.ts`) : l'état
 * « Reposté » est servi CACHÉ à côté du bouton, et ce module ne fait que
 * révéler la fente — jamais fabriquer le balisage qu'il n'a pas les moyens de
 * composer (pas de sprite sur le disque, ici).
 */

type Contexte = {
  readonly main: HTMLElement;
  readonly passerelle: string;
  readonly jeton: string;
};

const configuration = (main: HTMLElement): { readonly passerelle: string } | null => {
  const { passerelle } = main.dataset;
  return passerelle === undefined ? null : { passerelle };
};

const dit = (ctx: Contexte, phrase: string): void => {
  const region = ctx.main.querySelector<HTMLElement>('#journal-des-gestes');
  if (region !== null) region.textContent = phrase;
};

const lireEtatAime = (bouton: HTMLButtonElement): EtatDAime => ({
  actif: bouton.getAttribute('aria-pressed') === 'true',
  compte: Number.parseInt(bouton.querySelector('.valeur')?.textContent ?? '', 10) || 0,
});

const peinsAime = (bouton: HTMLButtonElement, etat: EtatDAime): void => {
  bouton.setAttribute('aria-pressed', etat.actif ? 'true' : 'false');
  const valeur = bouton.querySelector('.valeur');
  if (valeur !== null) valeur.textContent = String(etat.compte);
  const libelle = bouton.querySelector('.hors-ecran');
  if (libelle !== null) libelle.textContent = etat.actif ? FIL_SOCIAL.aimeRetire : FIL_SOCIAL.aime;
};

/**
 * AIMER, OPTIMISTE — peint d'abord, envoyé ensuite, défait sur refus. Le
 * corps posté par le formulaire (`aime` / `retirer-aime`) DIT le geste voulu ;
 * ce module lit l'état COURANT dans le bouton lui-même — le document est la
 * seule source de vérité au moment où le geste part.
 */
const surAime = (ctx: Contexte, formulaire: HTMLFormElement): void => {
  const bouton = formulaire.querySelector<HTMLButtonElement>('button');
  const postId = (formulaire.elements.namedItem('post') as HTMLInputElement | null)?.value ?? '';
  if (bouton === null || postId === '') return;

  const avant = lireEtatAime(bouton);
  const apres = basculeAime(avant);
  peinsAime(bouton, apres);
  dit(ctx, apres.actif ? FIL_SOCIAL.aime : FIL_SOCIAL.aimeRetire);

  void aime({ id: postId, jeton: ctx.jeton, pose: apres.actif, base: ctx.passerelle })
    .then((issue) => {
      if (issue.genre === 'fait') return;
      peinsAime(bouton, avant);
      dit(ctx, FIL_SOCIAL.echec);
    })
    .catch(() => {
      peinsAime(bouton, avant);
      dit(ctx, FIL_SOCIAL.echec);
    });
};

/**
 * REPOSTER, OPTIMISTE ET À SENS UNIQUE — la fente « Reposté » est révélée
 * tout de suite, le formulaire cède la place ; un refus les rend l'un à
 * l'autre leur état de départ (voir `feed-etat.ts` › `aposteRepost`, jamais
 * appelée deux fois sur le même post puisque le formulaire disparaît).
 */
const surRepost = (ctx: Contexte, formulaire: HTMLFormElement): void => {
  const postId = (formulaire.elements.namedItem('post') as HTMLInputElement | null)?.value ?? '';
  const etat = formulaire.closest<HTMLElement>('article[data-post]')?.querySelector<HTMLElement>('.geste-reposte');
  if (postId === '' || etat === null || etat === undefined) return;

  const compteActuel = Number.parseInt(formulaire.querySelector('.valeur')?.textContent ?? '', 10) || 0;
  const apres = aposteRepost({ compte: compteActuel });
  formulaire.hidden = true;
  etat.hidden = false;
  const valeur = etat.querySelector('.valeur');
  if (valeur !== null) valeur.textContent = String(apres.compte);
  dit(ctx, FIL_SOCIAL.reposte);

  const defais = (): void => {
    formulaire.hidden = false;
    etat.hidden = true;
    dit(ctx, FIL_SOCIAL.echec);
  };

  void reposte({ id: postId, jeton: ctx.jeton, base: ctx.passerelle })
    .then((issue) => {
      if (issue.genre !== 'fait') defais();
    })
    .catch(defais);
};

const prendsLesGestes = (ctx: Contexte): void => {
  ctx.main.addEventListener('submit', (evenement) => {
    const formulaire = (evenement.target as HTMLElement | null)?.closest<HTMLFormElement>('form');
    if (formulaire === null || formulaire === undefined) return;
    if (formulaire.classList.contains('geste-aime')) {
      evenement.preventDefault();
      surAime(ctx, formulaire);
      return;
    }
    if (formulaire.classList.contains('geste-reposter')) {
      evenement.preventDefault();
      surRepost(ctx, formulaire);
    }
  });
};

const demarre = (): void => {
  const main = document.querySelector<HTMLElement>('main[data-participation="feed"]');
  if (main === null) return;
  const config = configuration(main);
  if (config === null) return;
  const jeton = valeurDuCookie(document.cookie, COOKIE_DE_JETON);
  if (jeton === null) return;

  prendsLesGestes({ main, passerelle: config.passerelle, jeton });
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
