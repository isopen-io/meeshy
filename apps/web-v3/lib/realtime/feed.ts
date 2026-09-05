import { COOKIE_DE_JETON, valeurDuCookie } from '@/lib/api/cookies';
import { aime, reposte } from '@/lib/api/publication';
import { FIL_SOCIAL } from '@/lib/contenu/social';

import { aposteRepost, basculeAime, doitRafraichirLeFil, type EtatDAime } from './feed-etat';
import { observeCycleDeVie } from './lifecycle';

/**
 * LE MODULE DE PARTICIPATION DE `/feed` (§ 12.4, #5031) — le plus léger des
 * trois : ni composeur, ni socket, ni synchronisation. Aimer et reposter sont
 * des allers simples, et le rail de stories n'écoute rien — il arrive donc
 * APRÈS le premier pixel, par `await import()` sur `main[data-module]`
 * (`app/connecte/chargeur.ts`), sur `main[data-participation="feed"]`.
 *
 * PAS DE SOCKET, ET LA QUESTION 13 DU § 11 EST TRANCHÉE AUTREMENT. Ce module
 * n'écoute rien d'entrant EN CONTINU : un like d'un tiers, une publication
 * neuve d'un ami, un second onglet du même lecteur ne le rafraîchissent pas au
 * fil de l'eau. La passerelle diffuse pourtant `post:liked` / `post:created` /
 * `post:updated` sur la feed room que TOUT socket authentifié rejoint à l'auth
 * (`AuthHandler`, `SocialEventsHandler`) — mais `socket.io-client` coûte
 * 12 849 o gzip (`budgets-mesures.json`), plus que ce module entier, pour une
 * connexion PERMANENTE sur l'écran que la directive du porteur destine à la
 * 3G rurale (§ 12.6).
 *
 * **IL SE RAFRAÎCHIT AU RETOUR**, ce qui couvre le cas dominant sans une seule
 * dépendance de plus : on quitte l'onglet, on revient dix minutes après, et le
 * fil n'est pas celui de tout à l'heure. La RÈGLE — deux conditions, dont
 * « le lecteur n'a pas défilé », qui est la plus importante — vit dans
 * `feed-etat.ts` avec ses raisons ; ce module l'APPLIQUE.
 *
 * La troisième voie, `GET /sync`, n'en était pas une : ses collections sont
 * `conversations`, `messages`, `reactions`, `participants`
 * (`services/gateway/src/routes/sync/budget.ts`), jamais les publications. Le
 * document `/feed` lui-même EST la réponse fraîche — le serveur reste
 * l'unique compositeur, Prisme compris, comme pour `/post/:id` (#5091).
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

/**
 * LE RAFRAÎCHISSEMENT — le document `/feed` REDEMANDÉ, et ses publications
 * échangées d'un bloc.
 *
 * ON N'ÉCHANGE QUE `#publications` ET LE LIEN « plus », jamais le `<main>`
 * entier, et pour une raison de plateforme : le corps porte
 * `#journal-des-gestes`, une région `aria-live`. Une région `aria-live`
 * REMPLACÉE n'est plus surveillée par le lecteur d'écran — le navigateur ne
 * suit que celles qui existaient quand il a construit l'arbre. La remplacer
 * rendrait muettes toutes les confirmations de geste suivantes.
 *
 * Le RAIL DE STORIES n'est pas échangé non plus : il vit AVANT la liste, et le
 * remplacer déplacerait la tête du fil sous le regard au moment précis où on
 * revient. Une story qui manque une minute de plus se voit moins qu'un saut.
 *
 * L'ADRESSE REDEMANDÉE EST CELLE QU'ON LIT (`location.href`) — sur une page de
 * curseur, on rafraîchit CETTE page, pas la tête d'un fil qu'on ne regarde pas.
 */
const rafraichis = async (ctx: Contexte): Promise<void> => {
  const reponse = await fetch(window.location.href, {
    headers: { accept: 'text/html' },
    redirect: 'follow',
  }).catch(() => null);
  if (reponse === null || !reponse.ok) return;

  const corps = await reponse.text().catch(() => null);
  if (corps === null) return;

  const frais = new DOMParser().parseFromString(corps, 'text/html');
  const listeFraiche = frais.querySelector<HTMLElement>('#publications');
  const listeCourante = ctx.main.querySelector<HTMLElement>('#publications');
  if (listeFraiche === null || listeCourante === null) return;

  listeCourante.replaceChildren(...Array.from(listeFraiche.children));

  // Le lien « plus » porte le curseur de la page SUIVANTE : périmé, il
  // mènerait à une tranche qui ne suit plus rien.
  const plusCourant = ctx.main.querySelector<HTMLAnchorElement>('a.plus');
  const plusFrais = frais.querySelector<HTMLAnchorElement>('a.plus');
  if (plusCourant !== null && plusFrais === null) plusCourant.remove();
  if (plusCourant !== null && plusFrais !== null) plusCourant.href = plusFrais.getAttribute('href') ?? plusCourant.href;
};

/**
 * L'ABSENCE, MESURÉE ICI ET NULLE PART AILLEURS. Le cycle de vie DIT les
 * transitions (`lib/realtime/lifecycle.ts`, site unique) ; c'est à l'appelant
 * de dater la sienne — la même couture que `deconnecteDepuis` chez les deux
 * modules à socket.
 */
const suisLAbsence = (ctx: Contexte): void => {
  let absentDepuis: number | null = null;

  // `cleDuJeton` NE DÉSIGNE AUCUN JETON ICI : `/feed` est un écran de membre,
  // il n'y a pas de lien invité, donc rien à filtrer. Le champ sert au module
  // de cycle de vie à dériver le canal entre onglets ; une valeur PROPRE à cet
  // écran est ce qui empêche `/feed` d'entendre le canal d'un autre — même
  // convention que `/notifications` (`meeshy-notifs`).
  observeCycleDeVie({
    cleDuJeton: 'meeshy-feed',
    sur: (transition) => {
      if (transition.type === 'masquage' || transition.type === 'perte-du-reseau') {
        if (absentDepuis === null) absentDepuis = Date.now();
        return;
      }
      if (transition.type !== 'reprise') return;
      const rafraichir = doitRafraichirLeFil({
        absentDepuis,
        maintenant: Date.now(),
        defilement: window.scrollY,
      });
      absentDepuis = null;
      if (rafraichir) void rafraichis(ctx);
    },
  });
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

  const ctx = { main, passerelle: config.passerelle, jeton };
  prendsLesGestes(ctx);
  suisLAbsence(ctx);
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
