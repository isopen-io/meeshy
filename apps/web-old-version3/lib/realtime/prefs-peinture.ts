/**
 * LA PEINTURE D'UNE RANGÉE DE BASCULE — site UNIQUE, partagé par les treize
 * bascules (`lib/realtime/prefs.ts`) et la rangée push (`lib/realtime/
 * push-abonnement.ts`, restante FLUIDITÉ de #5391).
 *
 * `aria-checked` gouverne la piste (feuille) ET le mot annoncé
 * (`.hors-ecran`, un libellé DISTINCT par rangée — « Activé »/« Désactivé »
 * pour les treize bascules, « Abonné »/« Non abonné » pour le push : ni l'un
 * ni l'autre n'est en dur ici).
 *
 * ET LE FORMULAIRE SUIT. Le champ caché `valeur` porte l'INVERSE de l'état
 * affiché : c'est LUI que le chemin sans JavaScript enverrait. Le laisser sur
 * la valeur calculée AU RENDU ferait diverger le contrôle de ce qu'il montre
 * dès la première bascule optimiste — une rangée peinte « Désactivé » qui,
 * soumise par le navigateur (module en échec, script coupé en cours de
 * session), redemanderait « Désactivé ». Les deux moitiés d'une même rangée
 * ne peuvent pas dire deux choses.
 *
 * POURQUOI PAS EXPORTÉ DEPUIS `prefs.ts` : `prefs.ts` exécute `demarre()` à
 * l'IMPORT et importe déjà `push-abonnement.ts` — l'importer depuis
 * `push-abonnement.ts` ferait un cycle. Ce module n'importe rien, il PEINT
 * seulement des fentes déjà servies (la loi de `feuille-de-lien.ts`).
 */

const champDeLaValeur = (formulaire: HTMLFormElement): HTMLInputElement | null =>
  formulaire.querySelector<HTMLInputElement>('input[name="valeur"]');

export type ArgumentsDePeinture = {
  readonly formulaire: HTMLFormElement;
  readonly bouton: HTMLButtonElement;
  readonly valeur: boolean;
  readonly libelleActif: string;
  readonly libelleInactif: string;
};

export const peinsLaRangee = ({ formulaire, bouton, valeur, libelleActif, libelleInactif }: ArgumentsDePeinture): void => {
  bouton.setAttribute('aria-checked', valeur ? 'true' : 'false');
  const horsEcran = bouton.querySelector<HTMLElement>('.hors-ecran');
  if (horsEcran !== null) horsEcran.textContent = valeur ? libelleActif : libelleInactif;
  const champ = champDeLaValeur(formulaire);
  if (champ !== null) champ.value = valeur ? 'false' : 'true';
};
