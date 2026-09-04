import { CHAMPS_DU_COMPOSER, CHAMP_DU_FORMAT } from '@/lib/contenu/composer';

/**
 * LE MODULE DE `/composer` (#4966) — le NEUVIÈME, et le seul qui ne parle à
 * personne : ni socket, ni `fetch`, ni passerelle. Il tient un BROUILLON.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI IL FALLAIT UN MODULE, ET PAS UN RÉGLAGE DE CACHE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * #4966 demande qu'« un brouillon saisi survive à un rechargement et à un
 * retour ». Il ne survivait pas, et la cause était MESURÉE, pas supposée : le
 * document d'un écran connecté est servi `cache-control: no-store, private`
 * (`app/connecte/porte.ts` › `CACHE_PRIVE`), et `no-store` exclut un document
 * du bfcache de Chromium.
 *
 * Les deux moitiés de l'alternative étaient mauvaises. Retirer `no-store`
 * ferait resservir par le bouton « précédent » un document qui porte les
 * publications d'UNE personne, sur un appareil qui peut être partagé : on
 * paierait une fuite pour un confort. D'où ce module — et le brouillon vit
 * DEHORS du document, ce que le cache ne gouverne pas.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * `sessionStorage`, ET C'EST LA DÉCISION DE CE LOT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * **Pas `localStorage`.** Le brouillon est le texte NON PUBLIÉ de quelqu'un :
 * exactement ce que `no-store` refuse de laisser resservir par le bouton
 * précédent. L'écrire dans `localStorage` recréerait cette exposition, en pire
 * — sans borne de temps, et lisible par la personne SUIVANTE qui ouvre
 * `/composer` sur le même appareil. La v3 n'a pas encore de route de
 * déconnexion : rien ne viendrait l'effacer.
 *
 * `sessionStorage` est lié à l'ONGLET et meurt avec lui. Il couvre le critère
 * ENTIER de l'issue — un rechargement, un changement de format (`?format=` est
 * une NAVIGATION), un aller-retour par le bouton précédent — et ne couvre que
 * lui. Ce qu'il ne survit pas, c'est la fermeture de l'onglet, c'est-à-dire
 * précisément l'exposition qu'on ne veut pas accorder.
 *
 * **La complexité se paie dans le CODE, jamais chez l'utilisateur** (dimension
 * 12) : ici, le choix le plus sûr est aussi celui qui tient le critère. Quand
 * les deux coïncident, il n'y a pas d'arbitrage à faire.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TROIS RÈGLES DE RESTITUTION, ET LA PREMIÈRE EST LA MOINS ÉVIDENTE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  1. **LE SERVEUR A TOUJOURS RAISON.** Après un REFUS, la porte re-sert le
 *     texte tapé dans le document. Restaurer par-dessus écraserait la saisie
 *     par une version plus ANCIENNE d'elle-même. Le module ne restitue donc que
 *     dans un champ VIDE.
 *  2. **LE BROUILLON EST PAR FORMAT.** « post » et « humeur » sont deux
 *     compositions ; passer de l'une à l'autre ne doit pas déverser le texte de
 *     la première dans la seconde.
 *  3. **PUBLIER EFFACE.** Le geste réussi ferme le brouillon — et le refus
 *     aussi, parce que la porte re-sert alors la saisie elle-même (règle 1) :
 *     ce qui a été tapé n'est jamais perdu, il change seulement de porteur.
 */

const CLE = 'meeshy.v3.brouillon';

/** La clé d'un format — voir la règle 2. */
const cleDuFormat = (format: string): string => `${CLE}.${format}`;

/**
 * `sessionStorage` JETTE dans une fenêtre privée, sous une politique de site
 * bloquante, ou pendant une capture de vignette. Chaque accès est donc gardé :
 * un brouillon qu'on ne peut pas tenir n'est pas une raison de casser l'écran
 * qui marchait sans lui.
 */
const lis = (cle: string): string | null => {
  try {
    return sessionStorage.getItem(cle);
  } catch {
    return null;
  }
};

const ecris = (cle: string, valeur: string): void => {
  try {
    sessionStorage.setItem(cle, valeur);
  } catch {
    // Rien : le formulaire marche sans brouillon, c'est son socle.
  }
};

const efface = (cle: string): void => {
  try {
    sessionStorage.removeItem(cle);
  } catch {
    // Idem.
  }
};

const demarre = (): void => {
  const main = document.querySelector<HTMLElement>('main[data-participation="composer"]');
  if (main === null) return;

  const formulaire = main.querySelector<HTMLFormElement>('form');
  const texte = main.querySelector<HTMLTextAreaElement>(`textarea[name="${CHAMPS_DU_COMPOSER.texte}"]`);
  if (formulaire === null || texte === null) return;

  // Le format vient du champ que le document SERT, jamais de l'adresse : c'est
  // la même valeur, et celle-là est déjà validée contre le vocabulaire clos.
  const format = formulaire.querySelector<HTMLInputElement>(`input[name="${CHAMP_DU_FORMAT}"]`)?.value ?? '';
  if (format === '') return;
  const cle = cleDuFormat(format);

  // RÈGLE 1 — le champ servi VIDE seulement. Un refus a reposé la saisie ; elle
  // est plus fraîche que tout ce qu'on a gardé.
  if (texte.value === '') {
    const garde = lis(cle);
    if (garde !== null && garde !== '') {
      texte.value = garde;
      // Le curseur à la FIN : on revient pour continuer d'écrire, pas pour
      // relire depuis le début.
      texte.setSelectionRange(garde.length, garde.length);
    }
  }

  texte.addEventListener('input', () => {
    if (texte.value === '') {
      efface(cle);
      return;
    }
    ecris(cle, texte.value);
  });

  // RÈGLE 3 — le geste parti ferme le brouillon. `submit` court AVANT la
  // navigation, donc l'effacement est acquis quelle que soit l'issue.
  formulaire.addEventListener('submit', () => {
    efface(cle);
  });
};

demarre();
