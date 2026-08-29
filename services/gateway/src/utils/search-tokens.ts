/**
 * Les jetons de recherche d'un compte — la règle, en un seul endroit.
 *
 * ## Pourquoi une colonne, et pas une recherche sur les colonnes de nom
 *
 * `GET /users/search` faisait un `contains` NON ancré, insensible à la casse,
 * sur cinq colonnes dont aucune n'est indexée (`username` et `email` le sont de
 * fait parce qu'ils sont `@unique` ; `firstName`, `lastName`, `displayName` et
 * `phoneNumber` ne l'étaient pas). Chaque frappe balayait donc la collection
 * entière. C'est le défaut le plus coûteux du module, et le moins visible :
 * rien ne le signale à part la latence.
 *
 * Un tableau de jetons repliés, indexé en MULTIKEY, transforme la recherche en
 * une regex ANCRÉE (`^jean`) servie par parcours d'index.
 *
 * ## Le compromis, assumé et écrit
 *
 * On perd la sous-chaîne au MILIEU d'un mot : `ean` ne trouve plus `jean`. On
 * garde le préfixe de CHAQUE mot — `jean`, `dupont` et `jd` trouvent tous
 * « Jean Dupont », ce qui couvre l'usage réel d'un champ de recherche de
 * contacts. Si la sous-chaîne médiane devait être rétablie, l'alternative est
 * Atlas Search (index `autocomplete`) : elle change d'INFRASTRUCTURE, pas
 * seulement de schéma, et mérite sa propre décision.
 */

/**
 * Ce sont les PRÉFIXES qu'on indexe, pas les mots.
 *
 * Prisma n'exprime aucune regex sur une liste scalaire — ses opérateurs de
 * tableau sont `has`, `hasEvery`, `hasSome`, `isEmpty`. Chercher « jea… » par
 * regex imposerait donc `findRaw`, c'est-à-dire un filtre écrit à la main, hors
 * du typage, dans une requête que rien ne relit.
 *
 * En stockant les préfixes, la recherche devient une **égalité exacte** sur un
 * élément du tableau — `searchTokens: { has: 'jea' }` — servie par le même
 * index multikey, sans regex du tout. Le coût est en TAILLE d'index, payé une
 * fois à l'écriture ; le bénéfice est une requête typée que le compilateur
 * vérifie.
 *
 * C'est la complexité payée dans le CODE plutôt que chez l'utilisateur.
 */

/** En deçà, un préfixe rendrait la moitié de l'annuaire. */
const PREFIXE_MIN = 2;
/** Au-delà, le préfixe ne discrimine plus rien de plus. */
const PREFIXE_MAX = 12;
/** Plafond de jetons par compte, pour qu'un nom absurde ne gonfle pas l'index. */
const JETONS_MAX = 96;

/**
 * Replie une chaîne : minuscules, sans diacritiques, sans ponctuation.
 *
 * `Jean-Éric O'Connor` → `jean eric o connor`. La décomposition NFD suivie du
 * retrait des marques combinantes est ce qui fait que « é » et « e » se
 * rencontrent — sans elle, chercher « eric » ne trouverait pas « Éric ».
 */
export function replier(valeur: string): string {
  return valeur
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Les jetons d'un compte, à écrire dans `User.searchTokens`.
 *
 * Chaque MOT de chaque champ devient un jeton, plus les initiales concaténées
 * (`jd` pour « Jean Dupont ») — c'est ainsi qu'on retrouve quelqu'un dont on ne
 * se rappelle que les initiales, un usage réel des carnets d'adresses.
 */
export function searchTokensFor(compte: {
  username?: string | null;
  displayName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}): string[] {
  const mots = new Set<string>();

  for (const brut of [compte.username, compte.displayName, compte.firstName, compte.lastName]) {
    if (!brut) continue;
    for (const mot of replier(brut).split(' ')) {
      if (mot) mots.add(mot);
    }
  }

  const initiales = [compte.firstName, compte.lastName]
    .map((v) => (v ? replier(v).charAt(0) : ''))
    .join('');
  if (initiales.length >= PREFIXE_MIN) mots.add(initiales);

  const jetons = new Set<string>();
  for (const mot of mots) {
    for (let n = PREFIXE_MIN; n <= Math.min(mot.length, PREFIXE_MAX); n++) {
      jetons.add(mot.slice(0, n));
    }
  }

  return [...jetons].sort().slice(0, JETONS_MAX);
}

/**
 * Le jeton à chercher pour une saisie donnée — ou `null` si elle ne contient
 * rien de cherchable.
 *
 * La saisie est repliée de la même façon que les jetons stockés, et tronquée à
 * la même longueur : au-delà de `PREFIXE_MAX`, aucun jeton n'existe, et une
 * recherche plus longue ne trouverait plus rien alors qu'elle est PLUS précise.
 * C'est le piège classique de ce genre d'index — tronquer la REQUÊTE est ce qui
 * l'évite.
 */
export function jetonRecherche(saisie: string): string | null {
  const replie = replier(saisie).split(' ')[0] ?? '';
  if (replie.length < PREFIXE_MIN) return null;
  return replie.slice(0, PREFIXE_MAX);
}
