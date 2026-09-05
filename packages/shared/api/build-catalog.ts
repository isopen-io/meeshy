/**
 * Dérivation MÉCANIQUE du catalogue `API_ENDPOINTS` depuis les routes du
 * manifeste gateway (#4276). Aucune ligne de ce fichier ne connaît un chemin
 * PARTICULIER — c'est ce qui garantit le critère 2 de #4280 : « un chemin qui
 * n'existe pas côté serveur ne doit pas POUVOIR entrer dans le catalogue ».
 * Le catalogue tapé à la main, lui, ne connaît que ce qu'on lui a écrit.
 *
 * ## Pourquoi le préfixe complet (`/api/v1`, ou son absence) vit DANS la valeur
 *
 * Le manifeste n'est pas uniformément préfixé : au 2026-08-29 il porte 419
 * chemins uniques, dont 7 sans AUCUN préfixe `/api` (`/health`, `/info`,
 * `/voice/analysis`, `/attachments/:id/analysis`…) et 7 sous `/api/xxx` SANS
 * version (`userDeletionsRoutes` : `/api/conversations/...`,
 * `/api/messages/...`, `/api/user/deleted-conversations`). Un catalogue qui
 * ne stockerait que le SUFFIXE et laisserait la couche de transport préfixer
 * `/api/v1` à l'exécution serait donc FAUX sur ces 14 routes. Chaque entrée
 * porte le chemin COMPLET tel que le manifeste le déclare (colonne `path`,
 * « préfixe compris » — sa propre légende) ; `buildApiUrl()` (apps/web) sait
 * déjà passer inchangé un chemin commençant par `/api/v`, donc cette forme
 * est un DROP-IN pour les 11 appelants actuels de `API_ENDPOINTS` (#4280
 * critère 1c) sans leur imposer de changer de forme dans ce lot.
 *
 * ## Pourquoi UN catalogue par CHEMIN, jamais par (méthode, chemin)
 *
 * Le titre de #4280 dit « chemins d'API », pas « endpoints ». Deux verbes sur
 * la même adresse (`GET`/`POST /conversations`) décrivent la MÊME ressource ;
 * dupliquer l'entrée par verbe reproduirait la double déclaration que ce lot
 * corrige par ailleurs dans `apps/web/lib/config.ts` (`LIST`/`CREATE`
 * pointant toutes deux sur `/communities`). La table `API_PATH_METHODS`
 * (dérivée elle aussi, jamais tapée) garde la fidélité verbe-par-verbe pour
 * qui en a besoin — c'est elle que le cliquet interroge pour détecter un
 * verbe RETIRÉ sur un chemin qui, lui, survit.
 *
 * ## Pourquoi AUCUN `securityLevel` n'apparaît ici
 *
 * Le manifeste le porte `'inconnu'` avec des candidats, par REFUS DÉLIBÉRÉ de
 * deviner (#4276 : la matrice associe un RÔLE à des permissions, jamais un
 * CHEMIN à un niveau). Un catalogue qui en dériverait une valeur la
 * propagerait, inventée, aux catalogues iOS/Android qui dériveront du nôtre
 * (#4281/#4282). Ce fichier ne lit donc JAMAIS `securityLevel` ni
 * `securityLevelCandidates` sur une route en entrée.
 *
 * ## Règle de nommage (namespace.clé), entièrement mécanique
 *
 *   - `/api/v1/<segment>/...`      → namespace = <segment>            (v1, cas nominal)
 *   - `/api/<segment>/...` (pas de version) → namespace = `apiLegacy<Segment>`
 *     — JAMAIS fusionné avec son homonyme v1 : `/api/conversations/...`
 *     (userDeletionsRoutes) et `/api/v1/conversations/...` sont deux familles
 *     de routes disjointes qui ne doivent pas partager un objet JS.
 *   - `/<segment>/...` (aucun `/api`) → namespace = <segment>          (health, voice/analysis…)
 *
 * Puis, pour les segments RESTANTS après le namespace :
 *   - aucun segment restant           → clé `root`
 *   - segment littéral (`check-identifier`) → PascalCase, tirets/underscores retirés
 *   - segment `:param`                → `By` + PascalCase(param), et `param`
 *     devient un paramètre de la fonction générée, DANS L'ORDRE d'apparition
 *   - segment `*` (routes TUS)        → `ByWildcard`, paramètre `wildcard`
 *
 * Les clés de chaque namespace sont ensuite triées alphabétiquement, et les
 * namespaces aussi : la sortie ne dépend JAMAIS de l'ordre des routes en
 * entrée (témoin : « la sortie est déterministe »). Une collision entre deux
 * chemins DIFFÉRENTS qui dériveraient la même adresse fait lever une erreur
 * explicite au lieu d'écraser une entrée en silence — mesuré sur les 419
 * chemins réels du manifeste au 2026-08-29 : zéro collision.
 */

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/** Le sous-ensemble du manifeste dont cette dérivation a besoin — jamais `securityLevel`. */
export interface ManifestRouteInput {
  readonly method: string;
  readonly path: string;
}

export interface BuiltApiEndpointsCatalog {
  /** Le fichier `.ts` complet, tel qu'écrit par le générateur dans `api/endpoints.ts`. */
  readonly source: string;
  /**
   * Les entrées DÉRIVÉES — une par adresse unique, triées par chemin brut.
   *
   * Exposées pour que les projections d'AUTRES langages (#4281 Android,
   * #4282 iOS) portent les MÊMES noms que la projection TypeScript. Sans
   * elles, chaque surface re-dériverait le nommage depuis le manifeste :
   * une seconde règle, juste le jour où on l'écrit, divergente au premier
   * changement de segment — exactement ce que le milestone « un chemin d'API
   * s'écrit à un seul endroit » existe pour empêcher.
   *
   * Ce qui est exposé est la STRUCTURE, jamais le rendu : chaque langage
   * décide de sa syntaxe, aucun ne décide des noms.
   */
  readonly entries: readonly CatalogEntry[];
  /** Les chemins UNIQUES (dédupliqués par verbe), triés — ce que `API_PATH_TEMPLATES` porte. */
  readonly pathTemplates: readonly string[];
  /** Les verbes observés par chemin, triés dans l'ordre GET/POST/PUT/PATCH/DELETE. */
  readonly pathMethods: ReadonlyMap<string, readonly HttpMethod[]>;
}

const KNOWN_METHODS: readonly HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

function isHttpMethod(value: string): value is HttpMethod {
  return (KNOWN_METHODS as readonly string[]).includes(value);
}

/** Le préfixe versionné, tel que le gateway le monte (`API_PREFIX` côté serveur). */
const API_V1_PREFIX = '/api/v1';

function splitPathSegments(path: string): readonly string[] {
  return path.split('/').filter((segment) => segment.length > 0);
}

/**
 * Segmente en alternant lettres/chiffres et ignore tout séparateur
 * (`-`, `_`, `.`) — c'est ce qui distingue un chiffre en tête de mot
 * (`2fa` → `2`, `Fa`) d'un simple préfixe numérique à garder collé.
 */
function tokenize(raw: string): readonly string[] {
  return raw.match(/[A-Za-z]+|[0-9]+/g) ?? [];
}

function toPascalCase(raw: string): string {
  const pascal = tokenize(raw)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join('');
  return /^[0-9]/.test(pascal) ? `N${pascal}` : pascal;
}

function toCamelCase(raw: string): string {
  const pascal = toPascalCase(raw);
  return pascal.length === 0 ? pascal : pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

function lowerFirst(pascal: string): string {
  return pascal.length === 0 ? pascal : pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

interface NamespaceSplit {
  readonly namespace: string;
  readonly rest: readonly string[];
}

function deriveNamespace(segments: readonly string[], rawPath: string, allPaths: ReadonlySet<string>): NamespaceSplit {
  const [first, second, ...tail] = segments;

  if (first === 'api' && second === 'v1') {
    const [namespaceSegment, ...rest] = tail;
    return { namespace: toCamelCase(namespaceSegment ?? 'root'), rest };
  }

  if (first === 'api') {
    // `/api/<segment>/...` sans version — userDeletionsRoutes, entre autres.
    // Namespace délibérément DISTINCT de son homonyme v1 (voir doc de tête).
    return { namespace: `apiLegacy${toPascalCase(second ?? 'root')}`, rest: second === undefined ? [] : tail };
  }

  const rest = second === undefined ? [] : [second, ...tail];

  // Un chemin SANS `/api` dont l'homonyme existe sous `/api/v1` est un ALIAS de
  // compatibilité (`/voice/analysis`, `/attachments/:id/analysis`), et non une
  // route d'infrastructure comme `/health` ou `/info`. Les deux dérivaient le
  // MÊME nom de catalogue — la collision que le garde-fou plus bas a levée dès
  // que le gateway a monté ces alias.
  //
  // La distinction se lit dans le manifeste lui-même — la présence du chemin
  // v1 — et non dans le nom du module qui les monte : un `Legacy` dans un nom
  // de fonction est une convention, et une convention se perd au premier
  // renommage. Le préfixe suit la forme déjà retenue pour `/api/<x>` sans
  // version, parce que c'est le même problème : deux adresses distinctes qui
  // ne peuvent pas partager une adresse de catalogue.
  if (allPaths.has(`${API_V1_PREFIX}${rawPath}`)) {
    return { namespace: `rootLegacy${toPascalCase(first ?? 'root')}`, rest };
  }

  // Aucun `/api` du tout et aucun homonyme versionné (`/health`, `/info`) :
  // le premier segment EST le namespace.
  return { namespace: toCamelCase(first ?? 'root'), rest };
}

interface KeySplit {
  readonly key: string;
  readonly paramNames: readonly string[];
}

function deriveKeyAndParams(restSegments: readonly string[]): KeySplit {
  if (restSegments.length === 0) {
    return { key: 'root', paramNames: [] };
  }

  const paramNames: string[] = [];
  const pieces = restSegments.map((segment) => {
    if (segment === '*') {
      paramNames.push('wildcard');
      return 'ByWildcard';
    }
    if (segment.startsWith(':')) {
      const paramName = segment.slice(1);
      paramNames.push(paramName);
      return `By${toPascalCase(paramName)}`;
    }
    return toPascalCase(segment);
  });

  const [firstPiece, ...restPieces] = pieces;
  if (firstPiece === undefined) {
    // Inatteignable : `pieces` a la même longueur que `restSegments`, dont le
    // garde ci-dessus exclut déjà la longueur 0. `noUncheckedIndexedAccess`
    // ne peut pas le déduire d'une déstructuration — on le rend explicite
    // plutôt que d'ignorer la garde par une assertion `!`.
    throw new Error('Dérivation de clé impossible sur un segment de chemin vide.');
  }
  return { key: `${lowerFirst(firstPiece)}${restPieces.join('')}`, paramNames };
}

export interface CatalogEntry {
  readonly namespace: string;
  readonly key: string;
  readonly rawPath: string;
  readonly paramNames: readonly string[];
  readonly methods: readonly HttpMethod[];
}

/** Le corps du template littéral d'une fonction paramétrée, dérivé du chemin BRUT du manifeste. */
function buildTemplateBody(rawPath: string): string {
  return splitPathSegments(rawPath)
    .map((segment) => {
      if (segment === '*') return '${wildcard}';
      if (segment.startsWith(':')) return `\${${segment.slice(1)}}`;
      return segment;
    })
    .join('/');
}

function renderEntryValue(entry: CatalogEntry): string {
  if (entry.paramNames.length === 0) {
    return `'${entry.rawPath}'`;
  }
  const params = entry.paramNames.map((name) => `${name}: string`).join(', ');
  return `(${params}) => \`/${buildTemplateBody(entry.rawPath)}\``;
}

const FILE_HEADER = [
  '/**',
  " * Catalogue des chemins d'API Meeshy — GÉNÉRÉ, ne pas éditer à la main.",
  ' *',
  ' * Source : services/gateway/route-manifest.json (#4276), lui-même produit',
  ' * mécaniquement depuis le serveur Fastify assemblé (jamais lu à la main).',
  ' * Régénérer après tout changement de route :',
  ' *',
  ' *   cd packages/shared && npm run api-endpoints:generate',
  ' *',
  ' * Le cliquet packages/shared/api/__tests__/endpoints-manifest-ratchet.test.ts',
  ' * compare ce fichier à une régénération fraîche du manifeste et rougit à la',
  ' * moindre divergence — route retirée, ajoutée, ou verbe changé.',
  ' *',
  ' * API_ENDPOINTS est organisé par ADRESSE (une entrée par chemin unique, pas',
  ' * par verbe) : GET et POST sur la même URL partagent une seule entrée, le',
  " * verbe se choisissant au site d'appel — voir build-catalog.ts pour la règle",
  ' * complète de dérivation namespace/clé, et #4280 pour le contexte du lot.',
  ' *',
  " * Aucun securityLevel n'apparaît ici : le manifeste le porte 'inconnu' par",
  ' * refus délibéré de deviner (#4276) — un catalogue qui en dériverait une',
  ' * valeur la propagerait, inventée, aux catalogues iOS/Android qui dériveront',
  ' * de celui-ci (#4281/#4282).',
  ' */',
  '',
  '',
].join('\n');

function renderSource(
  entries: readonly CatalogEntry[],
  pathTemplates: readonly string[],
  pathMethods: ReadonlyMap<string, readonly HttpMethod[]>
): string {
  const byNamespace = new Map<string, CatalogEntry[]>();
  for (const entry of entries) {
    const list = byNamespace.get(entry.namespace) ?? [];
    list.push(entry);
    byNamespace.set(entry.namespace, list);
  }

  const namespaces = [...byNamespace.keys()].sort();
  const namespaceBlocks = namespaces.map((namespace) => {
    const namespaceEntries = [...(byNamespace.get(namespace) ?? [])].sort((a, b) =>
      a.key.localeCompare(b.key)
    );
    const lines = namespaceEntries.map((entry) => `    ${entry.key}: ${renderEntryValue(entry)},`);
    return `  ${namespace}: {\n${lines.join('\n')}\n  },`;
  });

  const templateLines = pathTemplates.map((path) => `  '${path}',`).join('\n');
  const methodLines = pathTemplates
    .map((path) => {
      const methods = pathMethods.get(path) ?? [];
      return `  '${path}': [${methods.map((method) => `'${method}'`).join(', ')}],`;
    })
    .join('\n');

  return (
    FILE_HEADER +
    [
      "export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';",
      '',
      'export const API_ENDPOINTS = {',
      namespaceBlocks.join('\n'),
      '} as const;',
      '',
      '/** Les 419 (au 2026-08-29) chemins uniques du manifeste — dédupliqués par verbe. */',
      'export const API_PATH_TEMPLATES = [',
      templateLines,
      '] as const;',
      '',
      '/** Tout chemin réellement servi par la passerelle, dérivé du manifeste — jamais élargi à la main. */',
      'export type ApiPath = (typeof API_PATH_TEMPLATES)[number];',
      '',
      '/** Les verbes HTTP acceptés par chemin — `Record` total : un chemin sans entrée ne compile pas. */',
      'export const API_PATH_METHODS: Readonly<Record<ApiPath, readonly HttpMethod[]>> = {',
      methodLines,
      '};',
      '',
    ].join('\n')
  );
}

/**
 * Transforme une liste de routes (method, path) — typiquement
 * `route-manifest.json.routes` — en catalogue `API_ENDPOINTS` généré.
 *
 * Pure : aucun accès fichier, aucun état global. C'est ce qui permet au
 * script CLI (`scripts/generate-api-endpoints.ts`) et au cliquet
 * (`api/__tests__/endpoints-manifest-ratchet.test.ts`) d'appeler EXACTEMENT
 * la même fonction — un cliquet qui réimplémenterait sa propre dérivation ne
 * pourrait jamais prouver qu'il compare la bonne règle (cf. la garde du
 * gateway `route-manifest-ratchet.test.ts`, § « Tests — un témoin qui ne
 * peut pas tomber n'est pas un témoin »).
 */
export function buildApiEndpointsCatalog(routes: readonly ManifestRouteInput[]): BuiltApiEndpointsCatalog {
  const methodsByPath = new Map<string, Set<HttpMethod>>();

  for (const route of routes) {
    if (!isHttpMethod(route.method)) {
      throw new Error(
        `Méthode HTTP inconnue dans le manifeste : ${route.method} ${route.path} — ` +
          `KNOWN_METHODS ne la liste pas, revoir build-catalog.ts si le gateway en sert une nouvelle.`
      );
    }
    const methods = methodsByPath.get(route.path) ?? new Set<HttpMethod>();
    methods.add(route.method);
    methodsByPath.set(route.path, methods);
  }

  const pathTemplates = [...methodsByPath.keys()].sort();
  const pathMethods = new Map<string, readonly HttpMethod[]>(
    pathTemplates.map((path) => {
      const observed = methodsByPath.get(path) ?? new Set<HttpMethod>();
      return [path, KNOWN_METHODS.filter((method) => observed.has(method))];
    })
  );

  const tousLesChemins = new Set(pathTemplates);
  const entries: CatalogEntry[] = pathTemplates.map((rawPath) => {
    const segments = splitPathSegments(rawPath);
    const { namespace, rest } = deriveNamespace(segments, rawPath, tousLesChemins);
    const { key, paramNames } = deriveKeyAndParams(rest);
    return { namespace, key, rawPath, paramNames, methods: pathMethods.get(rawPath) ?? [] };
  });

  // Garde-fou : deux chemins DIFFÉRENTS qui dériveraient la même adresse de
  // catalogue écraseraient silencieusement l'un l'autre dans l'objet littéral
  // généré. Zéro occurrence mesurée sur les 419 chemins réels — mais le jour
  // où le gateway ajoute une route qui en provoque une, mieux vaut une
  // régénération qui LÈVE qu'un catalogue qui perd une route sans le dire.
  const seenSlots = new Map<string, string>();
  for (const entry of entries) {
    const slot = `${entry.namespace}.${entry.key}`;
    const existingPath = seenSlots.get(slot);
    if (existingPath !== undefined && existingPath !== entry.rawPath) {
      throw new Error(
        `Collision de nommage dans le catalogue généré : ${slot} désignerait à la fois ` +
          `${existingPath} et ${entry.rawPath}. Revoir la règle de dérivation (build-catalog.ts) ` +
          `— aucune route ne doit disparaître silencieusement du catalogue.`
      );
    }
    seenSlots.set(slot, entry.rawPath);
  }

  return { source: renderSource(entries, pathTemplates, pathMethods), entries, pathTemplates, pathMethods };
}
