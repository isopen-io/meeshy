import { generateShortToken } from '../services/TrackingLinkService';

/**
 * Identifiants PUBLICS opaques — la loi, écrite une fois.
 *
 * Un identifiant public est une valeur qui vit dans une URL qu'on lit au
 * téléphone, qu'on dicte, qu'on colle dans un SMS — et qui, très souvent, EST
 * la capacité : qui la devine entre. Trois propriétés le définissent, et elles
 * ont chacune été enfreintes séparément dans ce dépôt :
 *
 * 1. **Court.** `mshy_<ObjectId 24>.<yymmddhhmm>_<8 base36>` faisait 49
 *    caractères, `aff_<Date.now()>_<13 base36>` en fait 31 — pour une valeur
 *    qui n'a besoin de porter aucune information.
 * 2. **Opaque.** Un ObjectId Mongo encode sa date de création dans ses quatre
 *    premiers octets, et un `Date.now()` la donne en clair. Un identifiant
 *    public qui dit quand il est né dit quelque chose de son porteur.
 * 3. **Imprévisible.** `Math.random()` est un PRNG prédictible. Sur une valeur
 *    qui ouvre une porte, c'est une serrure dont on publie le plan.
 *
 * `generateShortToken` est la source unique de tokens courts du service
 * (`TrackingLinkService`, `PostService`) : CSPRNG `crypto.randomInt`, dont
 * l'échantillonnage par rejet garde l'alphabet de 62 uniforme.
 *
 * **Pourquoi cette loi vit ici et pas dans chaque appelant.** Elle en a deux —
 * le lien de partage et le jeton d'affiliation — et c'est exactement le nombre
 * à partir duquel une règle recopiée commence à diverger. Le dépôt vient d'en
 * payer le prix sur `generateInitialLinkId`, qui existait en DEUX exemplaires
 * mot pour mot : `sharing.ts` importait la copie, `creation.ts` l'original.
 */

/**
 * 8 caractères base62 = 62^8 ≈ 2,2 × 10^14 valeurs. À un million
 * d'identifiants, la probabilité qu'une collision existe quelque part est de
 * l'ordre de 0,2 % — et elle est rattrapée par la vérification d'unicité. Ce
 * n'est donc pas un pari sur l'absence de collision : c'est le dimensionnement
 * qui rend la vérification presque toujours satisfaite du premier coup.
 */
export const PUBLIC_ID_LENGTH = 8;

/**
 * Longueurs tentées SUCCESSIVEMENT. L'escalade remplace une boucle infinie :
 * si l'espace de 8 caractères se révélait saturé — ce qui n'arrivera pas, mais
 * un code qui en dépend est un code qui peut boucler — on n'insiste pas sur la
 * même longueur, on agrandit l'espace. 12 puis 16 caractères le portent à 10^21
 * puis 10^28.
 */
const PUBLIC_ID_ESCALATION: readonly number[] = [PUBLIC_ID_LENGTH, 12, 16];

/** Tentatives par longueur avant d'escalader. */
const PUBLIC_ID_ATTEMPTS_PER_LENGTH = 4;

/** Nombre total de tirages avant abandon — borne dure, jamais un `while (true)`. */
export const PUBLIC_ID_MAX_ATTEMPTS = PUBLIC_ID_ESCALATION.length * PUBLIC_ID_ATTEMPTS_PER_LENGTH;

/**
 * Un identifiant public : préfixe de famille + tirage CSPRNG. Le préfixe est
 * conservé — il distingue à l'œil un identifiant Meeshy d'une valeur
 * quelconque, et certains résolveurs s'en servent pour NE PAS traiter la valeur
 * comme un ObjectId.
 */
export function generatePublicIdentifier(prefix: string, length: number = PUBLIC_ID_LENGTH): string {
  return `${prefix}${generateShortToken(length)}`;
}

/**
 * Un identifiant public garanti LIBRE, sous la définition de « libre » que
 * fournit l'appelant.
 *
 * `isTaken` est un paramètre et non une requête en dur, parce que la bonne
 * question n'est pas toujours « cette valeur existe-t-elle dans SA colonne ? ».
 * Pour un lien de partage elle est « existe-t-elle dans l'UNE des deux colonnes
 * publiques ? » — la résolution acceptant `linkId` OU `identifier`, une valeur
 * unique dans sa colonne mais présente dans l'autre résoudrait le MAUVAIS lien.
 *
 * L'index unique de la colonne (schema Prisma) reste le garde-fou final :
 * cette fonction rend la collision improbable, l'index la rend impossible.
 */
export async function generateUniquePublicIdentifier(options: {
  prefix: string;
  isTaken: (candidate: string) => Promise<boolean>;
  /** Nommé dans le message d'erreur — pour qu'un échec dise CE qui a échoué. */
  label: string;
}): Promise<string> {
  const { prefix, isTaken, label } = options;

  for (const length of PUBLIC_ID_ESCALATION) {
    for (let attempt = 0; attempt < PUBLIC_ID_ATTEMPTS_PER_LENGTH; attempt += 1) {
      const candidate = generatePublicIdentifier(prefix, length);
      if (!(await isTaken(candidate))) return candidate;
    }
  }

  // Inatteignable en pratique (il faudrait douze collisions d'affilée, dont
  // quatre sur 62^16). Lever plutôt que boucler : un appelant qui reçoit une
  // erreur la voit, une boucle qui tourne ne se voit pas.
  throw new Error(`Impossible de générer un identifiant unique (${label})`);
}
