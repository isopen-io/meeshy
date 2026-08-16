/**
 * Résolveur pur du drapeau `lentille_list` — WL-100 (LWS-10).
 *
 * Unique décideur du web pour la Lentille (contrat LWS-10, workshop §5 V4) :
 * précédence `?lentille=` (searchParam) > cookie `meeshy_lentille` > env
 * `NEXT_PUBLIC_LENTILLE_DEFAULT` > OFF par défaut.
 *
 *   ?lentille=1 → actif pour ce navigateur + pose le cookie meeshy_lentille=1
 *   ?lentille=0 → efface le cookie
 *   cookie      → persiste entre les visites
 *   env         → NEXT_PUBLIC_LENTILLE_DEFAULT, le jour de l'activation générale
 *   défaut      → OFF
 *
 * PUR par construction : ni `document`, ni `window`, ni `process.env` lus ici
 * — seulement des chaînes déjà extraites, passées en argument. La pose ou
 * l'effacement du cookie est un EFFET (leçon d'architecture du contrat) :
 * cette fonction ne fait que le DÉCRIRE (`cookieEffect`) ; c'est le hook
 * appelant (`use-feature-flags.ts`) qui l'applique, dans un `useEffect`,
 * jamais pendant un rendu.
 *
 * GARDE DE CONTRAT (vérifiée en CI, `__tests__/lentille/lentille-flag-single-
 * occurrence.test.ts`) : hors de ce fichier, de `use-feature-flags.ts` et des
 * fichiers de test, le nom du drapeau (`LENTILLE_FLAG_NAME`, la chaîne
 * `'lentille_list'`) n'apparaît qu'UNE fois — au point de mux
 * (`ConversationList.tsx`, WL-101). Une seconde occurrence signifierait que
 * la décision a fui hors de son point de branchement.
 */

/** Le nom du drapeau au sens du contrat — la clé exposée par `useFeatureFlags`. */
export const LENTILLE_FLAG_NAME = 'lentille_list' as const;

/** Nom du cookie qui persiste le choix entre deux visites. */
export const LENTILLE_COOKIE_NAME = 'meeshy_lentille' as const;

/** Nom du paramètre de requête qui modifie le rendu (`/conversations?lentille=1`). */
export const LENTILLE_SEARCH_PARAM = 'lentille' as const;

/**
 * Nom de la variable d'environnement de bascule générale. Documentaire
 * seulement : l'ACCÈS réel à `process.env.NEXT_PUBLIC_LENTILLE_DEFAULT` doit
 * rester un membre littéral dans `use-feature-flags.ts` (Next.js remplace
 * `process.env.NEXT_PUBLIC_*` par une constante à la COMPILATION webpack —
 * un accès dynamique `process.env[nom]` ne serait JAMAIS remplacé et lirait
 * `undefined` dans le bundle navigateur).
 */
export const LENTILLE_ENV_VAR_NAME = 'NEXT_PUBLIC_LENTILLE_DEFAULT' as const;

export type LentilleCookieEffect = 'set' | 'clear' | 'none';

export interface ResolveLentilleFlagInput {
  /** Valeur brute de `?lentille=` — `null`/`undefined` si le paramètre est absent. */
  searchParam: string | null | undefined;
  /** Valeur brute du cookie `meeshy_lentille` — `undefined` si absent. */
  cookie: string | null | undefined;
  /** Valeur brute de `NEXT_PUBLIC_LENTILLE_DEFAULT`. */
  env: string | null | undefined;
}

export interface ResolveLentilleFlagResult {
  /** Le drapeau est-il actif pour ce rendu ? */
  active: boolean;
  /** L'effet cookie à appliquer — décrit ici, jamais exécuté ici. */
  cookieEffect: LentilleCookieEffect;
}

/**
 * Résout le drapeau Lentille. Cinq branches, dans l'ordre de précédence
 * exact du contrat — chacune retourne immédiatement, aucune ne retombe sur
 * la suivante :
 *   1. `searchParam === '1'` → actif, pose le cookie
 *   2. `searchParam === '0'` → inactif, efface le cookie
 *   3. `cookie === '1'`      → actif, aucun effet (déjà posé)
 *   4. `env === 'true'`      → actif, aucun effet
 *   5. défaut                → inactif, aucun effet (OFF)
 */
export function resolveLentilleFlag({
  searchParam,
  cookie,
  env,
}: ResolveLentilleFlagInput): ResolveLentilleFlagResult {
  if (searchParam === '1') {
    return { active: true, cookieEffect: 'set' };
  }

  if (searchParam === '0') {
    return { active: false, cookieEffect: 'clear' };
  }

  if (cookie === '1') {
    return { active: true, cookieEffect: 'none' };
  }

  if (env === 'true') {
    return { active: true, cookieEffect: 'none' };
  }

  return { active: false, cookieEffect: 'none' };
}

/**
 * Lit une valeur de cookie dans la chaîne brute `document.cookie`. Pure —
 * prend la chaîne en entrée (déjà lue par l'appelant), ne touche jamais
 * `document` elle-même. Même idiome que `hooks/use-landing-auth.ts`.
 */
export function parseCookieValue(rawCookieString: string, name: string): string | undefined {
  const prefixed = `; ${rawCookieString}`;
  const parts = prefixed.split(`; ${name}=`);
  if (parts.length < 2) return undefined;
  return parts[1].split(';')[0] || undefined;
}
