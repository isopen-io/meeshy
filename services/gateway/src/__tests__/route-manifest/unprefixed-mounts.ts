/**
 * Témoin de #4367, critère 3 — tout module monté SANS préfixe Fastify
 * (`mountPrefix: ''`) porte une décision ÉCRITE, ou il rougit.
 *
 * ## La question, et pourquoi ce n'est pas celle du témoin voisin
 *
 * `no-routes-outside-api-v1.ts` balaie les CHEMINS : une adresse servie hors
 * de `/api/v1` s'y déclare ou tombe. Ce module-ci balaie les MONTAGES : un
 * module enregistré sans `{ prefix }` s'y déclare ou tombe. Les deux
 * propriétés ne s'impliquent PAS, et chacune est aveugle là où l'autre voit :
 *
 *  - `registerTusRoutes` et `socketIOAdminRoutes` sont invisibles au témoin
 *    par CHEMIN — leurs adresses sont sous `/api/v1`, servies conformes. Elles
 *    y arrivent pourtant parce que les deux modules écrivent `/api/v1` EN DUR
 *    dans chaque chemin : rien, structurellement, ne les y tient. Le jour où
 *    l'un ajoute une route en oubliant le littéral, elle naît à la racine, et
 *    le témoin par chemin la découvre APRÈS coup, une par une.
 *  - `attachmentLegacyFileRoutes` est invisible à CE témoin-ci — il est monté
 *    avec `{ prefix: '/api' }`, donc `mountPrefix` non vide — alors que ses
 *    adresses sont bien hors `/api/v1` et qu'il figure, à juste titre, dans
 *    la liste du témoin par chemin.
 *
 * D'où deux balayages, jamais un seul « amélioré » : la question du montage
 * est une question de STRUCTURE (qui décide de l'adresse), celle du chemin une
 * question de RÉSULTAT (quelle adresse est servie).
 *
 * ## La conséquence de PÉRIMÈTRE, et pourquoi elle est un champ REQUIS
 *
 * Un alias déprécié annonce son retrait à un CLIENT, par trois en-têtes
 * (`Deprecation` / `Sunset` / `Link`, #4274). Aucune règle de proxy, de WAF ou
 * de journalisation ne lit ces en-têtes : une telle règle s'ancre sur un
 * PRÉFIXE DE CHEMIN. Une adresse servie hors de `/api` est donc, jusqu'à son
 * `sunset` inclus, hors de toute règle ancrée sur `/api` — et le déprécier ne
 * change rien à ce fait, puisqu'un alias déprécié est servi jusqu'au bout.
 *
 * C'est pourquoi `perimeter: 'hors-api'` OBLIGE `perimeterConsequence` : la
 * décision d'assumer une adresse racine n'est complète que quand elle dit ce
 * que cette adresse ne reçoit pas. Une déclaration qui motive l'ADRESSE sans
 * dire son PÉRIMÈTRE est exactement le manque que #4367 a trouvé dans
 * `routes/index.ts` — dix lignes de commentaire justifiant l'alias, pas une
 * sur ce à quoi il échappe.
 *
 * ## Ce que ce module NE mesure PAS
 *
 * Il ne lit ni les en-têtes de dépréciation (un manifeste ne porte que des
 * chemins — c'est `voice-analysis-legacy-alias.test.ts` qui les mesure), ni
 * les règles d'infrastructure elles-mêmes (elles vivent hors du service). Il
 * mesure une seule chose : qu'aucun montage sans préfixe n'existe SANS une
 * décision écrite, et qu'une décision qui expose des adresses racine dise sa
 * conséquence de périmètre.
 */

/** Une ligne de `route-manifest.json`, réduite à ce que ce balayage lit. */
export type MountedRoute = {
  readonly method: string;
  readonly path: string;
  readonly module: string;
  readonly mountPrefix: string;
};

/**
 * `sous-api` : toutes les adresses du module commencent par `/api` — une règle
 * ancrée sur ce préfixe les voit. `hors-api` : au moins une n'y est pas, donc
 * échappe à toute règle ainsi ancrée.
 */
export type MountPerimeter = 'sous-api' | 'hors-api';

/** Ce que le balayage OBSERVE, par module. */
export type UnprefixedModule = {
  readonly module: string;
  readonly routeCount: number;
  readonly perimeter: MountPerimeter;
  /** Les adresses hors `/api`, nommées — vide quand `perimeter === 'sous-api'`. */
  readonly pathsOutsideApi: readonly string[];
};

/** Ce que le dépôt DÉCLARE, par module. */
export type UnprefixedMountDecision = {
  /** Le module tel que le manifeste le nomme (colonne `module`). */
  readonly module: string;
  /** Nombre de routes FIGÉ : un module déjà dispensé de préfixe ne grandit pas en silence. */
  readonly routeCount: number;
  readonly perimeter: MountPerimeter;
  /** Pourquoi ce montage n'a pas de `prefix` Fastify. */
  readonly reason: string;
  /** OÙ la décision est écrite — une décision qu'aucun fichier ne porte n'est pas une décision. */
  readonly decisionAt: string;
  /** REQUIS quand `perimeter === 'hors-api'` : ce que ces adresses ne reçoivent pas. */
  readonly perimeterConsequence?: string;
};

/**
 * `/api` exactement, ou `/api/…` — jamais `startsWith('/api')` seul, qui
 * rangerait `/apiary` sous le périmètre d'une règle qui ne le couvre pas.
 */
export function servedUnderApi(path: string): boolean {
  return path === '/api' || path.startsWith('/api/');
}

/**
 * Groupe par module les routes montées SANS préfixe, dans l'ordre alphabétique
 * du module — un ordre stable, pour que deux exécutions comparent la même
 * chose et qu'un diff de la liste figée se lise.
 */
export function unprefixedModules(routes: readonly MountedRoute[]): UnprefixedModule[] {
  const parModule = new Map<string, MountedRoute[]>();
  for (const route of routes) {
    if (route.mountPrefix !== '') continue;
    const deja = parModule.get(route.module);
    if (deja) deja.push(route);
    else parModule.set(route.module, [route]);
  }

  return [...parModule.entries()]
    .map(([module, lignes]) => {
      const pathsOutsideApi = [...new Set(lignes.filter((l) => !servedUnderApi(l.path)).map((l) => l.path))].sort();
      return {
        module,
        routeCount: lignes.length,
        perimeter: (pathsOutsideApi.length > 0 ? 'hors-api' : 'sous-api') as MountPerimeter,
        pathsOutsideApi,
      };
    })
    .sort((a, b) => a.module.localeCompare(b.module));
}

/** Les modules montés sans préfixe qu'AUCUNE décision ne couvre — une liste vide est le seul résultat acceptable. */
export function undeclaredUnprefixedModules(
  observed: readonly UnprefixedModule[],
  declared: readonly UnprefixedMountDecision[] = UNPREFIXED_MOUNT_DECISIONS
): UnprefixedModule[] {
  const connus = new Set(declared.map((d) => d.module));
  return observed.filter((o) => !connus.has(o.module));
}

/** Les décisions que le manifeste ne porte plus — une entrée périmée ment autant qu'une entrée manquante. */
export function staleUnprefixedDecisions(
  observed: readonly UnprefixedModule[],
  declared: readonly UnprefixedMountDecision[] = UNPREFIXED_MOUNT_DECISIONS
): UnprefixedMountDecision[] {
  const presents = new Set(observed.map((o) => o.module));
  return declared.filter((d) => !presents.has(d.module));
}

/** Écart entre décompte DÉCLARÉ et décompte OBSERVÉ — une route ajoutée à un module déjà dispensé de préfixe. */
export function miscountedUnprefixedModules(
  observed: readonly UnprefixedModule[],
  declared: readonly UnprefixedMountDecision[] = UNPREFIXED_MOUNT_DECISIONS
): { readonly module: string; readonly declared: number; readonly observed: number }[] {
  const parModule = new Map(observed.map((o) => [o.module, o]));
  return declared
    .filter((d) => parModule.has(d.module) && parModule.get(d.module).routeCount !== d.routeCount)
    .map((d) => ({ module: d.module, declared: d.routeCount, observed: parModule.get(d.module).routeCount }));
}

/**
 * Écart entre périmètre DÉCLARÉ et périmètre OBSERVÉ.
 *
 * Le cas qui compte est `sous-api` déclaré / `hors-api` observé : un module
 * réputé couvert par les règles ancrées sur `/api` vient de servir une adresse
 * qui ne l'est pas. L'écart inverse compte aussi — une décision qui annonce
 * une conséquence de périmètre qui n'existe plus égare autant.
 */
export function misdeclaredPerimeters(
  observed: readonly UnprefixedModule[],
  declared: readonly UnprefixedMountDecision[] = UNPREFIXED_MOUNT_DECISIONS
): {
  readonly module: string;
  readonly declared: MountPerimeter;
  readonly observed: MountPerimeter;
  readonly pathsOutsideApi: readonly string[];
}[] {
  const parModule = new Map(observed.map((o) => [o.module, o]));
  return declared
    .filter((d) => parModule.has(d.module) && parModule.get(d.module).perimeter !== d.perimeter)
    .map((d) => ({
      module: d.module,
      declared: d.perimeter,
      observed: parModule.get(d.module).perimeter,
      pathsOutsideApi: parModule.get(d.module).pathsOutsideApi,
    }));
}

/** Les décisions `hors-api` qui ne DISENT pas leur conséquence de périmètre — le critère 1 de #4367, rendu mécanique. */
export function decisionsMissingPerimeterConsequence(
  declared: readonly UnprefixedMountDecision[] = UNPREFIXED_MOUNT_DECISIONS
): UnprefixedMountDecision[] {
  return declared.filter(
    (d) => d.perimeter === 'hors-api' && (d.perimeterConsequence ?? '').trim() === ''
  );
}

/**
 * Les CINQ modules montés sans préfixe Fastify au 2026-08-30, soit 22 routes —
 * chacun avec la raison de son montage nu, l'endroit où cette raison est
 * ÉCRITE, et, pour les deux qui servent hors `/api`, ce à quoi ces adresses
 * échappent.
 *
 * Deux d'entre eux ne sont pas des alias : `registerTusRoutes` et
 * `userDeletionsRoutes` reçoivent une clé `basePath` PERSONNALISÉE et non la
 * clé `prefix` réservée de Fastify — leur passer un `prefix` additionnerait
 * les deux préfixages sur une URL que le module compose déjà absolue (et dont
 * TUS dérive le `Location` qu'il répond). Un troisième, `socketIOAdminRoutes`,
 * est monté par `setupSocketIO()` hors de `registerAllRoutes` (#4376).
 *
 * Les trois écrivent `/api` EN DUR dans chacun de leurs chemins : `sous-api`
 * décrit ce qu'ils SERVENT, jamais une garantie de structure. C'est justement
 * pourquoi le décompte est figé ici — une route ajoutée sans le littéral
 * naîtrait à la racine, et le témoin la nomme au lieu de la découvrir plus
 * tard.
 */
export const UNPREFIXED_MOUNT_DECISIONS: readonly UnprefixedMountDecision[] = [
  {
    // Le libellé est celui que `MODULE_ROOT_LABEL` (`route-manifest/collect.ts`)
    // pose sur toute route déclarée SANS passer par `server.register()`. Il
    // n'est pas importé — ce module reste sans dépendance d'exécution — mais il
    // ne peut pas dériver en silence : le renommer ferait de cette entrée une
    // décision périmée ET du nouveau libellé un module non déclaré, deux
    // rougeurs au lieu d'aucune.
    module: "registerAllRoutes (déclaration directe sur l'instance racine, hors server.register)",
    routeCount: 2,
    perimeter: 'hors-api',
    reason:
      "`/health` et `/info`, déclarés directement sur l'instance racine (src/route-registration.ts) : une sonde " +
      "de disponibilité et un point de diagnostic ne se versionnent pas par convention HTTP — un orchestrateur " +
      "ne connaît pas de version d'API.",
    decisionAt:
      "src/route-registration.ts (server.get('/health'), server.get('/info')) ; famille `permanent` de " +
      'src/__tests__/route-manifest/no-routes-outside-api-v1.ts.',
    perimeterConsequence:
      "Hors de toute règle ancrée sur `/api` — et c'est VOULU ici : `middleware/rate-limiter.ts` les exempte " +
      "nommément de son quota global (un 429 sur une sonde fait conclure « instance morte » et redémarrer le " +
      "conteneur). La contrepartie est assumée : ces deux adresses ne reçoivent jamais ce qu'une telle règle " +
      "apporterait, et leur charge reste donc fixe et sans donnée d'utilisateur.",
  },
  {
    module: 'registerTusRoutes',
    routeCount: 4,
    perimeter: 'sous-api',
    reason:
      "Reçoit `basePath`, jamais `prefix` : le module compose des chemins ABSOLUS et en dérive le `Location` " +
      "qu'il répond au client — un `prefix` Fastify additionnerait les deux préfixages. `/api/v1` vient de " +
      "l'appelant (`route-registration.ts`, `${API_PREFIX}/uploads`) et de son défaut `apiPath('/uploads')`.",
    decisionAt:
      'src/routes/uploads/tus-handler.ts (`TusRoutesOptions`, `DEFAULT_UPLOADS_PATH`) et le commentaire du ' +
      'montage dans src/route-registration.ts.',
  },
  {
    module: 'socketIOAdminRoutes',
    routeCount: 4,
    perimeter: 'sous-api',
    reason:
      "Monté par `setupSocketIO()` avant `setupRoutes()`, donc hors de `registerAllRoutes` (#4376). Ses quatre " +
      "chemins portent `/api` en dur : `apiPath(...)` pour les deux adresses canoniques, `'/api' + …` pour les " +
      'deux alias non versionnés.',
    decisionAt:
      'src/socketio/socketio-admin-routes.ts (doc-comment du module) ; les deux alias sont déclarés dans la ' +
      'famille `deprecated-alias` de src/__tests__/route-manifest/no-routes-outside-api-v1.ts.',
  },
  {
    module: 'userDeletionsRoutes',
    routeCount: 7,
    perimeter: 'sous-api',
    reason:
      "Reçoit `basePath: '/api'`, jamais `prefix` — même raison que TUS. Reste sous `/api` non versionné parce " +
      "que `DELETE …/conversations/:id/delete-for-me` collisionnerait, sous `/api/v1`, avec " +
      '`routes/conversations/delete-for-me.ts` déjà monté : trancher laquelle des deux survit est une décision ' +
      "produit, pas un rangement d'adresse.",
    decisionAt:
      'src/routes/user-deletions.ts (`UserDeletionsRoutesOptions`) et le commentaire du montage dans ' +
      'src/route-registration.ts ; sept entrées `known-gap` dans ' +
      'src/__tests__/route-manifest/no-routes-outside-api-v1.ts.',
  },
  {
    module: 'voiceAnalysisLegacyAliasRoutes',
    routeCount: 5,
    perimeter: 'hors-api',
    reason:
      "`prefix: ''` EXPLICITE dans `ROUTE_TABLE_BEFORE_VOICE_PLUGIN` : l'alias RACINE déprécié de #4277 " +
      "critère 1. Le module ne réécrit rien — il pose les trois en-têtes de dépréciation puis délègue à " +
      '`voiceAnalysisRoutes`.',
    decisionAt:
      "src/routes/index.ts, entrée `voice-analysis-legacy-alias` (§ « La conséquence de PÉRIMÈTRE ») et " +
      'src/routes/voice-analysis.ts, doc-comment de `voiceAnalysisLegacyAliasRoutes`.',
    perimeterConsequence:
      "Servies hors de `/api`, donc hors de toute règle ancrée sur ce préfixe — proxy, WAF, journal — jusqu'au " +
      "retrait du 2027-02-25 INCLUS : un alias déprécié est servi jusqu'à son `sunset`, et les en-têtes " +
      "`Deprecation`/`Sunset`/`Link` s'adressent à un client, jamais à une règle de chemin. Mesuré au " +
      '2026-08-30 : aucune règle du chemin de PRODUCTION ne les manque (prod et staging routent par HÔTE, ' +
      '`Host(gate[.staging].meeshy.me)` → gateway:3000, tous chemins). La conséquence porte donc sur toute ' +
      "règle FUTURE ainsi ancrée, et déjà sur DEUX règles vivantes : le routeur LAN de développement " +
      "`gateway-ip` (`docker-compose.local.yml`, `PathPrefix('/api')`), sous lequel elles tombent chez le " +
      "frontal ; et `ROUTES_SURVEILLEES` (#4275), dont les 57 entrées commencent toutes par `/api/v1/` — le " +
      'compteur qui gouverne le retrait ne MATÉRIALISE donc pas ces cinq adresses.',
  },
];
