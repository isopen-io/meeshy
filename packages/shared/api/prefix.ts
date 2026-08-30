/**
 * Le préfixe d'API — CONSTRUIT, jamais écrit.
 *
 * ## Ce que le littéral coûtait
 *
 * Le dépôt portait `/api/v1` en dur à ≈2200 endroits, et trois d'entre eux
 * l'écrivaient dans la BASE : `MessageAttachment.fileUrl` (198 documents sur
 * staging), `thumbnailUrl` (107) et `User.avatar` — ce dernier avec l'hôte en
 * prime (`https://gate.staging.meeshy.me/api/v1/…`). Une donnée qui porte
 * l'adresse par laquelle on la sert fige un choix de RUNTIME dans un attribut
 * de fichier : passer à `v2` casse les 305, et un dump staging → production
 * sert des URL staging.
 *
 * `API_PREFIX` existait déjà — mais dans `route-registration.ts`, en local,
 * dérivé d'une constante. Aucun autre site ne pouvait l'importer, donc chacun
 * recomposait son littéral. Changer la version aurait obligé à retrouver tous
 * les sites, ce que rien ne garantissait.
 *
 * ## La version vient de la CONFIGURATION
 *
 * `MEESHY_API_VERSION` la fixe ; `v1` est le défaut, pas une vérité. Le
 * déploiement peut en outre porter le préfixe autrement — `api.domain.tld/v2/`,
 * `api-v2.domain.tld` — auquel cas `MEESHY_API_BASE_PATH` remplace le chemin
 * entier, y compris le segment `/api`.
 *
 * ## Ce que ce module ne fait PAS
 *
 * Il ne compose aucune URL ABSOLUE. L'hôte est une décision de déploiement qui
 * n'a rien à faire dans une donnée ni dans un catalogue : ce qui voyage est un
 * chemin, et c'est le client qui sait à quel hôte il parle.
 */

/** La version d'API servie. Configurable ; `v1` par défaut. */
export function apiVersion(env: Readonly<Record<string, string | undefined>> = process.env): string {
  const declaree = env['MEESHY_API_VERSION']?.trim();
  return declaree && declaree.length > 0 ? declaree : 'v1';
}

/**
 * Le chemin de base de l'API, sans barre oblique finale.
 *
 * `MEESHY_API_BASE_PATH` prime quand le déploiement n'utilise pas la forme
 * `/api/<version>` — un préfixe vide (`''`) est une valeur LÉGITIME : l'API
 * servie à la racine d'un sous-domaine dédié.
 */
export function apiBasePath(env: Readonly<Record<string, string | undefined>> = process.env): string {
  const impose = env['MEESHY_API_BASE_PATH'];
  if (impose !== undefined) return impose.replace(/\/+$/, '');
  return `/api/${apiVersion(env)}`;
}

/**
 * Compose un chemin d'API depuis un chemin RELATIF au préfixe.
 *
 * `apiPath('/conversations')` → `/api/v1/conversations`. Le chemin relatif est
 * ce qui doit voyager et se stocker ; le préfixe se pose au dernier moment.
 */
export function apiPath(
  relatif: string,
  env: Readonly<Record<string, string | undefined>> = process.env
): string {
  const base = apiBasePath(env);
  const suffixe = relatif.startsWith('/') ? relatif : `/${relatif}`;
  return `${base}${suffixe}`;
}

/**
 * Retire le préfixe d'un chemin qui le porte, et rend le chemin RELATIF.
 *
 * Rend `null` quand le chemin ne porte pas le préfixe attendu — un appelant qui
 * doit distinguer « déjà relatif » de « préfixé par une AUTRE version » ne peut
 * pas se contenter d'un repli silencieux : c'est exactement l'ambiguïté qui a
 * laissé 305 documents porter `/api/v1` sans que personne ne le voie.
 */
export function stripApiPrefix(
  chemin: string,
  env: Readonly<Record<string, string | undefined>> = process.env
): string | null {
  const base = apiBasePath(env);
  if (base.length === 0) return chemin;
  return chemin.startsWith(`${base}/`) ? chemin.slice(base.length) : null;
}
