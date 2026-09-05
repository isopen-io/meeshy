import { basculeUnePreference } from '@/lib/api/preferences';
import { COOKIE_DE_JETON, valeurDuCookie } from '@/lib/api/cookies';
import { estUneCleDePrefs, PREFS, type CleDePreference } from '@/lib/contenu/prefs-de-notif';

import { annule, bascule, reconcilie, type EtatDePrefs } from './prefs-etat';

/**
 * LE MODULE DE PARTICIPATION DE `/notifications/preferences` (§ 12.4, #4899)
 * — le douzième, et le plus proche de `feed.ts` : NI COMPOSEUR NI SOCKET.
 * Basculer un réglage est un ALLER SIMPLE, exactement comme aimer ou reposter
 * sur `/feed` — le même arbitrage, mesuré à la même conclusion
 * (`lib/realtime/feed-etat.ts`, doc-comment de tête) : `socket.io-client`
 * coûterait plus que ce module entier pour un écran de réglages, sur la 3G
 * rurale que la directive du porteur vise.
 *
 * TOUT CE QU'IL FAIT, LE DOCUMENT LE FAIT DÉJÀ SANS LUI, plus lentement :
 * chaque bascule est un `<form method="post">` que `app/connecte/prefs-
 * porte.ts` traite en Post/Redirect/Get. Ce module SUPPRIME le rechargement —
 * amélioration progressive, jamais une condition — et rend le geste
 * OPTIMISTE : peint AVANT le réseau, réconcilie sur ce que la passerelle a
 * ÉCRIT, défait sur refus (Instant App Principles, `CLAUDE.md`).
 *
 * LE SERVEUR GAGNE, TOUJOURS. La réponse du `PATCH` est une RELECTURE
 * (`lib/api/preferences.ts`, doc-comment de tête) : ce module ne peint jamais
 * la valeur qu'il a ENVOYÉE, il peint celle que `data.notification` a SERVIE
 * — un consentement manquant ou un autre appareil qui écrit entretemps
 * doivent gagner sur l'optimisme local.
 *
 * LE ROLLBACK EST UN ÉTAT, DONC VISIBLE. `annule` (`prefs-etat.ts`) restaure
 * la valeur d'avant ET signale l'échec — la région `.echec` est révélée, la
 * région `.avis` de succès est masquée : jamais les deux à la fois, jamais un
 * état affiché qui divergerait du serveur au rechargement suivant.
 */

type Contexte = {
  readonly main: HTMLElement;
  readonly passerelle: string;
  readonly jeton: string;
};

/**
 * LA CLÉ D'UNE RANGÉE — opposée à `estUneCleDePrefs` (`lib/contenu/prefs-de-
 * notif.ts`, site UNIQUE de la table), exactement comme la porte y oppose la
 * clé POSTÉE. L'affirmer par une assertion de type reviendrait à décider,
 * depuis le navigateur, qu'un attribut du document EST une clé du schéma —
 * c'est-à-dire à croire le DOM sur parole là où le chemin sans JavaScript,
 * lui, vérifie. Une rangée dont la clé n'appartient pas à la table ne part
 * donc pas : le geste est ignoré, et le document reste ce que le serveur a
 * servi.
 */
const cleDuFormulaire = (formulaire: HTMLFormElement): CleDePreference | null => {
  const valeur = formulaire.querySelector<HTMLInputElement>('input[name="cle"]')?.value;
  return valeur === undefined || !estUneCleDePrefs(valeur) ? null : valeur;
};

const champDeLaValeur = (formulaire: HTMLFormElement): HTMLInputElement | null =>
  formulaire.querySelector<HTMLInputElement>('input[name="valeur"]');

const boutonDuFormulaire = (formulaire: HTMLFormElement): HTMLButtonElement | null =>
  formulaire.querySelector<HTMLButtonElement>('button[role="switch"]');

const etatDuBouton = (bouton: HTMLButtonElement): boolean => bouton.getAttribute('aria-checked') === 'true';

/**
 * LA PEINTURE D'UNE RANGÉE — `aria-checked` gouverne la piste (feuille) ET le
 * mot annoncé.
 *
 * ET LE FORMULAIRE SUIT. Le champ caché `valeur` porte l'INVERSE de l'état
 * affiché : c'est LUI que le chemin sans JavaScript enverrait. Le laisser sur
 * la valeur calculée AU RENDU ferait diverger le contrôle de ce qu'il montre
 * dès la première bascule optimiste — une rangée peinte « Désactivé » qui,
 * soumise par le navigateur (module en échec, script coupé en cours de
 * session), redemanderait « Désactivé ». Les deux moitiés d'une même rangée
 * ne peuvent pas dire deux choses.
 */
const peinsLaRangee = (formulaire: HTMLFormElement, bouton: HTMLButtonElement, valeur: boolean): void => {
  bouton.setAttribute('aria-checked', valeur ? 'true' : 'false');
  const horsEcran = bouton.querySelector<HTMLElement>('.hors-ecran');
  if (horsEcran !== null) horsEcran.textContent = valeur ? PREFS.activee : PREFS.desactivee;
  const champ = champDeLaValeur(formulaire);
  if (champ !== null) champ.value = valeur ? 'false' : 'true';
};

const montreLaReussite = (ctx: Contexte, libelle: string): void => {
  const avis = ctx.main.querySelector<HTMLElement>('.avis');
  const echec = ctx.main.querySelector<HTMLElement>('.echec');
  if (echec !== null) echec.hidden = true;
  if (avis === null) return;
  avis.hidden = false;
  avis.textContent = PREFS.regle(libelle);
};

const montreLEchec = (ctx: Contexte): void => {
  const avis = ctx.main.querySelector<HTMLElement>('.avis');
  const echec = ctx.main.querySelector<HTMLElement>('.echec');
  if (avis !== null) avis.hidden = true;
  if (echec === null) return;
  echec.hidden = false;
  echec.textContent = PREFS.echec;
};

/**
 * LA VALEUR D'UNE CLÉ, LUE DANS UN ÉTAT PARTIEL — jamais un index nu :
 * `EtatDePrefs.reglages` est `Partial` (`prefs-etat.ts`, doc-comment de tête),
 * et ce module n'écrit une clé qu'en même temps qu'il la LIT ici, donc elle
 * est TOUJOURS présente en pratique ; `Boolean()` le dit sans une assertion
 * de type.
 */
const valeurDe = (etat: EtatDePrefs, cle: CleDePreference): boolean => Boolean(etat.reglages[cle]);

/**
 * BASCULE, OPTIMISTE, RÉCONCILIÉE SUR LE SERVEUR. `bascule`/`reconcilie`/
 * `annule` (`prefs-etat.ts`) opèrent sur un état PUR — un `EtatDePrefs` réduit
 * à la clé de CETTE rangée, jamais aux treize : les douze autres ne bougent
 * pas, ce `PATCH` en mode `merge` n'en touche aucune
 * (`lib/api/preferences.ts`). L'état PUR traverse les trois moments (avant →
 * optimiste → réconcilié/annulé) ; la peinture ne fait que LIRE ce que chaque
 * fonction a décidé, jamais recalculer.
 */
const surBascule = (ctx: Contexte, formulaire: HTMLFormElement, libelle: string): void => {
  const cle = cleDuFormulaire(formulaire);
  const bouton = boutonDuFormulaire(formulaire);
  if (cle === null || bouton === null) return;

  const avant = etatDuBouton(bouton);
  const { etat: etatOptimiste } = bascule({ reglages: { [cle]: avant } }, cle);

  peinsLaRangee(formulaire, bouton, valeurDe(etatOptimiste, cle));

  void basculeUnePreference({ jeton: ctx.jeton, cle, valeur: valeurDe(etatOptimiste, cle), base: ctx.passerelle })
    .then((issue) => {
      if (issue.genre === 'document') {
        const etatReconcilie = reconcilie(etatOptimiste, { [cle]: Boolean(issue.reglages[cle]) });
        peinsLaRangee(formulaire, bouton, valeurDe(etatReconcilie, cle));
        montreLaReussite(ctx, libelle);
        return;
      }
      const { etat: etatAnnule } = annule(etatOptimiste, cle, avant);
      peinsLaRangee(formulaire, bouton, valeurDe(etatAnnule, cle));
      montreLEchec(ctx);
    })
    .catch(() => {
      const { etat: etatAnnule } = annule(etatOptimiste, cle, avant);
      peinsLaRangee(formulaire, bouton, valeurDe(etatAnnule, cle));
      montreLEchec(ctx);
    });
};

const prendsLesGestes = (ctx: Contexte): void => {
  ctx.main.addEventListener('submit', (evenement) => {
    const formulaire = (evenement.target as HTMLElement | null)?.closest<HTMLFormElement>('form.bascule');
    if (formulaire === null || formulaire === undefined) return;
    evenement.preventDefault();

    const libelle = formulaire.closest('li')?.querySelector<HTMLElement>('.libelle')?.textContent ?? '';
    surBascule(ctx, formulaire, libelle);
  });
};

const configuration = (main: HTMLElement): { readonly passerelle: string } | null => {
  const { passerelle } = main.dataset;
  return passerelle === undefined ? null : { passerelle };
};

const demarre = (): void => {
  const main = document.querySelector<HTMLElement>('main[data-participation="prefs"]');
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
 * navigateur appelle pour monter l'écran neuf (même patron que `feed.ts`).
 */
export const monte = demarre;
