/**
 * QUELLES origines de navigateur la passerelle sert — la règle, une seule fois.
 *
 * ## Pourquoi ce fichier existe (#4480)
 *
 * La règle vivait en DEUX littéraux inline, jumeaux de façade et divergents de
 * fond : `server.ts` (CORS HTTP, Fastify) et `socketio/MeeshySocketIOManager.ts`
 * (Socket.IO). Trois écarts mesurés entre les deux :
 *
 * | | porte HTTP | porte Socket.IO |
 * |---|---|---|
 * | détection du dév | `NODE_ENV \|\| 'development'` — **absente ⇒ OUVERTE** | `NODE_ENV === 'development'` — absente ⇒ allowlist |
 * | liste par défaut | 12 entrées (dont `localhost:3100`, staging `:8443`) | 4 entrées de production |
 * | entrées de la liste | pas de `trim()` | `trim()` |
 *
 * Le premier écart est un défaut de sécurité à lui seul : une passerelle lancée
 * sans `NODE_ENV` acceptait **toute** origine en HTTP tout en appliquant
 * l'allowlist en WebSocket. Un opérateur qui lit une des deux implémentations
 * n'apprend rien de l'autre.
 *
 * ## Ce que la convergence choisit, et pourquoi
 *
 * À chaque écart, la valeur retenue est la **plus restrictive** — c'est la seule
 * direction dans laquelle on peut se tromper sans ouvrir une porte :
 *
 * 1. le court-circuit de dév exige le mot EXACT `development` : toute autre
 *    valeur, l'absence comprise, fait décider l'allowlist ;
 * 2. la liste par défaut est l'INTERSECTION des deux (les quatre hôtes de
 *    production). `localhost:3100` et les entrées `staging:8443` de l'ancienne
 *    liste HTTP ne disparaissent pas pour autant : les six listes de dév et
 *    `docker-compose.staging.yml` posent `CORS_ORIGINS` explicitement, et
 *    l'entrée `staging.meeshy.me:8443` ne correspondait déjà plus au domaine
 *    servi. Une origine `localhost` dans un DÉFAUT de production est exactement
 *    la dérive permissive que cette garde existe pour arrêter ;
 * 3. `trim()` est repris de la porte Socket.IO — il ne relâche pas la règle, il
 *    rend simplement lisible une liste écrite avec des espaces.
 *
 * ## Une liste DÉCLARÉE mais vide refuse tout
 *
 * `CORS_ORIGINS=` (le cas nominal d'un `docker-compose.prod.yml` dont la
 * variable d'hôte n'est pas posée) ne retombe PAS sur les origines par défaut :
 * la liste est vide et toute origine est refusée. C'est déjà le comportement
 * d'aujourd'hui — `''.split(',')` rend `['']`, qui ne correspond à rien — mais
 * il tenait à une coïncidence de JavaScript plutôt qu'à une décision. Le repli
 * sur `ALLOWED_ORIGINS` puis sur les défauts ne joue donc que quand la variable
 * est réellement ABSENTE.
 *
 * ## Ce que ce module ne décide pas
 *
 * Une requête SANS en-tête `Origin` (curl, application mobile, appel
 * serveur-à-serveur) reste servie : ce n'est pas une requête de navigateur, et
 * CORS ne la protège de rien. Inchangé des deux côtés.
 *
 * ## Et ce qui ne l'applique PAS (#4538)
 *
 * L'inventaire de #4480 était complet pour les LECTEURS de `CORS_ORIGINS` — et
 * il a laissé deux portes dehors, parce qu'elles ne lisent aucune de ces
 * variables et n'apparaissent dans aucun balayage qui les cherche
 * (`routes/attachments/download.ts`, `routes/uploads/tus-handler.ts`). La
 * seconde a rejoint la règle depuis (#5298) ; ce qui reste hors règle est
 * DÉCLARÉ, en donnée, en bas de ce fichier (`PORTES_HORS_REGLE`), et confronté
 * au code par `__tests__/cors-origin-emitter-sweep.test.ts` : ce cliquet
 * balaie ce qui SORT (les en-têtes posés) et non ce qui est lu, seul angle qui
 * voit une porte n'employant aucun des noms qu'on cherche.
 */

/** La source d'environnement, injectable — c'est ce qui rend la règle testable. */
export type CorsEnvironment = Readonly<Record<string, string | undefined>>;

/** Ce que l'appelant fait d'une origine refusée (journal). La règle, elle, ne journalise pas. */
export type RejectedOriginObserver = (origin: string) => void;

export type CorsOriginOptions = Readonly<{
  env?: CorsEnvironment;
  onRejected?: RejectedOriginObserver;
}>;

/** Le message porté par le refus, identique aux deux portes depuis toujours. */
export const CORS_REJECTION_MESSAGE = 'Not allowed by CORS';

/** Le seul `NODE_ENV` qui court-circuite l'allowlist. Comparé au mot près. */
export const DEVELOPMENT_NODE_ENV = 'development';

/**
 * Les origines servies quand NI `CORS_ORIGINS` NI `ALLOWED_ORIGINS` n'existent.
 *
 * Aucun environnement mesuré ne s'y appuie (les six listes de dév, `local`,
 * `staging` et `prod` posent toutes l'une des deux variables) : c'est le repli
 * d'une exécution non provisionnée, et il n'a donc aucune raison d'être large.
 */
export const DEFAULT_ALLOWED_ORIGINS: readonly string[] = Object.freeze([
  'https://meeshy.me',
  'https://www.meeshy.me',
  'https://gate.meeshy.me',
  'https://ml.meeshy.me',
]);

/**
 * Le court-circuit de développement — `true` fait servir TOUTE origine.
 *
 * L'égalité est stricte et sans normalisation : `'Development'`, `' development '`
 * ou l'absence de la variable rendent `false`. Se tromper vers « ce n'est pas du
 * développement » ne coûte qu'une origine à déclarer ; l'inverse ouvre la porte.
 */
export function everyOriginIsAllowed(env: CorsEnvironment = process.env): boolean {
  return env.NODE_ENV === DEVELOPMENT_NODE_ENV;
}

function parseDeclaredOrigins(declared: string): readonly string[] {
  const entries = declared
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  return Object.freeze([...new Set(entries)]);
}

/**
 * La liste effective, dans l'ordre de précédence historique des deux portes :
 * `CORS_ORIGINS`, puis `ALLOWED_ORIGINS`, puis les défauts.
 *
 * Le repli ne joue que sur une variable ABSENTE : une liste déclarée vide est
 * une décision de l'opérateur, pas un oubli.
 */
export function resolveAllowedOrigins(env: CorsEnvironment = process.env): readonly string[] {
  const declared = env.CORS_ORIGINS ?? env.ALLOWED_ORIGINS;
  if (declared === undefined) return DEFAULT_ALLOWED_ORIGINS;
  return parseDeclaredOrigins(declared);
}

/** LE verdict. Les deux portes ci-dessous n'en sont que la mise en forme. */
export function originIsAllowed(
  origin: string | undefined,
  env: CorsEnvironment = process.env
): boolean {
  if (everyOriginIsAllowed(env)) return true;
  if (!origin) return true;
  return resolveAllowedOrigins(env).includes(origin);
}

function rejectionFor(origin: string, onRejected?: RejectedOriginObserver): Error {
  onRejected?.(origin);
  return new Error(CORS_REJECTION_MESSAGE);
}

/**
 * La porte HTTP : `origin` de `@fastify/cors`.
 *
 * Son rappel EXIGE une seconde valeur (`ValueOrArray<string | boolean | RegExp>`),
 * là où celui du paquet `cors` que porte Socket.IO l'accepte optionnelle. C'est
 * la seule raison pour laquelle deux adaptateurs cohabitent ici : ils ne portent
 * aucune règle — `originIsAllowed` la porte, une fois, pour les deux.
 */
export function fastifyCorsOrigin(
  options: CorsOriginOptions = {}
): true | ((origin: string | undefined, callback: (err: Error | null, allow: boolean) => void) => void) {
  const env = options.env ?? process.env;
  if (everyOriginIsAllowed(env)) return true;

  return (origin, callback) => {
    if (originIsAllowed(origin, env)) return callback(null, true);
    return callback(rejectionFor(origin ?? '', options.onRejected), false);
  };
}

/** La porte WebSocket : `cors.origin` de Socket.IO (paquet `cors`). */
export function socketIoCorsOrigin(
  options: CorsOriginOptions = {}
): true | ((origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => void) {
  const env = options.env ?? process.env;
  if (everyOriginIsAllowed(env)) return true;

  return (origin, callback) => {
    if (originIsAllowed(origin, env)) return callback(null, true);
    return callback(rejectionFor(origin ?? '', options.onRejected));
  };
}

// MARK: - Ce qui n'obéit PAS à la règle ci-dessus, déclaré (#4538)

/**
 * Le chemin de CE module, relatif à `src/`. Donnée plutôt que littéral chez le
 * cliquet : le balayage doit s'exempter de lui-même — la règle NOMME forcément
 * l'en-tête qu'elle gouverne — et il ne peut le faire qu'en sachant où elle vit.
 */
export const MODULE_DE_LA_REGLE = 'config/cors-origins.ts';

/**
 * Les noms par lesquels une porte INVOQUE la règle. Une porte qui importe ce
 * module et cite l'un d'eux est gouvernée — c'est MESURÉ à la source, jamais
 * inscrit dans une table qu'on oublierait de tenir. Ajouter une porte qui
 * respecte la règle ne demande donc de toucher à rien ici ; seule une porte qui
 * s'en échappe doit se déclarer.
 */
export const RESOLVEURS_DE_LA_REGLE: readonly string[] = Object.freeze([
  'fastifyCorsOrigin',
  'socketIoCorsOrigin',
  'originIsAllowed',
]);

type PorteCommune = {
  /** Chemin relatif à `src/`, jamais un numéro de ligne — une clé de ligne périme au premier commit. */
  readonly fichier: string;
  /** L'en-tête réellement posé, comparé à ce que le balayage trouve au site. */
  readonly entete: 'Access-Control-Allow-Origin';
  /** La valeur servie, comparée elle aussi. C'est ce qui fait rougir un passage discret sous la règle. */
  readonly valeur: string;
  /** La raison MESURÉE — jamais « historique », jamais « voir plus haut ». */
  readonly pourquoi: string;
};

/** La source NOMME l'en-tête et le pose elle-même. */
type PorteLitterale = PorteCommune & { readonly forme: 'litterale' };

/** La source ne nomme rien : elle CONSTRUIT un composant qui pose l'en-tête à sa place. */
type PorteDeleguee = PorteCommune & { readonly forme: 'deleguee'; readonly composant: string };

export type PorteHorsRegle = PorteLitterale | PorteDeleguee;

/**
 * Les portes qui décident d'une origine SANS passer par la règle ci-dessus.
 *
 * Une divergence DÉCLARÉE, sur le modèle de `SEUILS_REPORT` : en donnée, avec sa
 * raison, confrontée au code par `__tests__/cors-origin-emitter-sweep.test.ts`.
 * Un commentaire ne suffisait pas — rien ne l'aurait confronté au jour où
 * quelqu'un resserre les origines sans savoir que cette porte ne suit pas.
 *
 * `routes/uploads/tus-handler.ts` en faisait partie jusqu'à #5298, qui l'a fait
 * rejoindre la règle (`allowedOrigins: (origin) => originIsAllowed(origin)`) —
 * seule `routes/attachments/download.ts` reste hors règle. L'inertie qui rend
 * l'arbitrage tenable ici : `'*'` et `Access-Control-Allow-Credentials: true`
 * s'excluent PAR SPÉCIFICATION, et cette porte ne pose pas le second — aucun
 * cookie ni en-tête d'autorisation ne voyage dessus, l'autorisation y est
 * portée par le handler (`resolveAttachmentReadVerdict`), jamais par
 * l'origine. Ce n'est pas une fuite ; c'est une surface de décision qui
 * n'obéit pas à la règle unique, et c'est exactement ce qu'il fallait rendre
 * visible.
 */
export const PORTES_HORS_REGLE: readonly PorteHorsRegle[] = Object.freeze([
  {
    fichier: 'routes/attachments/download.ts',
    forme: 'litterale',
    entete: 'Access-Control-Allow-Origin',
    valeur: '*',
    pourquoi:
      "Les médias sont EMBARQUÉS par le web depuis meeshy.me sur gate.meeshy.me : l'en-tête accompagne " +
      "le `Cross-Origin-Resource-Policy: cross-origin` posé au même endroit, sans quoi Helmet laisse " +
      "`same-origin` et Chrome bloque la ressource (ERR_BLOCKED_BY_RESPONSE.NotSameOrigin, avatars cassés " +
      "au rechargement). Inerte pour une requête créditée — pas d'`…-Credentials` — et l'accès aux octets " +
      "est jugé par `resolveAttachmentReadVerdict` (participation à la conversation + cycle de vie du " +
      "message porteur), jamais par l'origine.",
  },
  // `routes/uploads/tus-handler.ts` a rejoint la règle (#5298) : `new Server({…})`
  // passe désormais `allowedOrigins: (origin) => originIsAllowed(origin)`. Les
  // appelants réels mesurés — le web (navigateur, sert un `Origin`) et les
  // clients natifs iOS/Android (aucun `Origin`, donc inertes à cette option) —
  // ne dépendaient d'aucun `'*'` pour continuer de fonctionner. Aucune trace
  // ne doit rester ici : la règle 1 ter de `cors-origin-emitter-sweep.test.ts`
  // rougirait sur une déclaration devenue fausse.
]);
