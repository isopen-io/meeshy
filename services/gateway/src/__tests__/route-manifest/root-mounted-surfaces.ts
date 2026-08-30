/**
 * Témoin de #4376, critère 2 — le manifeste (#4276) décrit la table de
 * l'instance RÉELLE, pas celle d'un sous-graphe.
 *
 * ## Le défaut que ce module ferme
 *
 * `route-manifest/collect.ts` monte `registerAllRoutes` et draine la table par
 * un hook `onRoute`. Le hook est exhaustif — il voit TOUT ce qui se déclare sur
 * l'instance qu'il garde. Ce qui ne l'est pas, c'est le MONTAGE : `server.ts`
 * pose des routes sur son instance racine par DEUX chemins, et le collecteur
 * n'en reproduisait qu'un.
 *
 * `MeeshyServer.start()` appelle `setupSocketIO()` (qui délègue à
 * `MeeshySocketIOHandler.setupSocketIO(this.server)`) AVANT `setupRoutes()`
 * (qui délègue à `registerAllRoutes(this.server, …)`). Les deux gestes
 * d'administration Socket.IO — statistiques et déconnexion forcée, canoniques
 * et alias dépréciés, soit QUATRE routes — étaient donc servis en production et
 * absents du manifeste, du catalogue client qui en dérive, et de tout audit qui
 * s'y appuie. Aucun cliquet ne pouvait le voir : le cliquet du manifeste
 * (`security/route-manifest-ratchet.test.ts`) compare l'artefact commité à une
 * régénération FRAÎCHE, et les deux sortent du même montage incomplet — deux
 * mesures d'accord, toutes deux aveugles au même endroit.
 *
 * ## Ce que ce module mesure, et pourquoi c'est cette question-là
 *
 * La question à poser n'est donc pas « le hook voit-il tout ce qui est
 * monté ? » (oui, par construction) mais **« le collecteur monte-t-il tout ce
 * que la production monte ? »**. C'est une propriété de `server.ts`, et elle se
 * lit là où elle est écrite : `rootMountedSurfaces()` extrait, de la SOURCE de
 * `server.ts`, tout ce qui REÇOIT l'instance Fastify racine — que ce soit par
 * `this.server.register(X, …)` ou par un appel `f(this.server, …)`.
 *
 * `ROOT_MOUNTED_SURFACES` fige cette liste avec, pour chaque entrée, ce qu'elle
 * fait de l'instance qu'on lui remet. Trois natures, et une seule oblige le
 * collecteur :
 *
 *  - `declares-api-routes` : déclare des routes de l'API Meeshy. Le collecteur
 *    DOIT la monter ; `witnessPath` nomme un chemin que sa table doit porter.
 *  - `outside-manifest`    : déclare des routes qui ne sont PAS de l'API
 *    Meeshy (UI de documentation d'une dépendance). Hors périmètre, avec sa
 *    raison écrite.
 *  - `no-routes`           : ne déclare aucune route (hook, décoration,
 *    parseur, en-têtes). Rien à reproduire.
 *
 * Une surface AJOUTÉE à `server.ts` fait tomber le témoin de la liste figée
 * AVANT que quiconque ait à se demander si elle déclare des routes : c'est
 * l'ordre qui compte, parce que la question ne se pose pas toute seule — elle
 * ne s'est pas posée pour Socket.IO.
 *
 * ## Ce que ce module NE mesure PAS
 *
 * Il ne lit pas les MODULES montés : une route ajoutée à l'intérieur d'un
 * module déjà monté est vue par le hook `onRoute`, donc par le manifeste, donc
 * par son cliquet. La classe de défaut ouverte ici est strictement celle du
 * point de MONTAGE — la seule que le hook ne peut pas voir.
 */

/** Ce qui reçoit l'instance Fastify racine dans `server.ts`. */
export type RootMountedSurface = {
  /** Le nom du destinataire, tel qu'écrit — `swaggerUi`, `registerAllRoutes`, `this.socketIOHandler.setupSocketIO`. */
  readonly callee: string;
  /** `register` : passé en plugin à `this.server.register(...)`. `call` : reçoit `this.server` en argument. */
  readonly via: 'register' | 'call';
};

export type RootSurfaceKind = 'declares-api-routes' | 'outside-manifest' | 'no-routes';

export type DeclaredRootSurface = RootMountedSurface & {
  readonly kind: RootSurfaceKind;
  readonly reason: string;
  /**
   * `declares-api-routes` UNIQUEMENT — un chemin que la table du collecteur
   * doit porter. Choisi parmi les plus stables de la surface : ce n'est pas un
   * inventaire de ses routes, c'est la preuve qu'elle est montée du tout.
   */
  readonly witnessPath?: string;
};

/**
 * Retire commentaires de ligne et de bloc SANS toucher aux chaînes.
 *
 * Un `replace` par expression régulière ne suffit pas ici, et l'échec serait
 * SILENCIEUX dans le mauvais sens : un `//` vivant dans un littéral (`'https://…'`)
 * ferait avaler à la règle de ligne tout ce qui SUIT sur la même ligne — donc,
 * potentiellement, un appel réel. Un faux positif force à regarder ; un faux
 * NÉGATIF rend au témoin la cécité qu'il est censé fermer.
 */
export function stripCommentsPreservingStrings(source: string): string {
  let out = '';
  let index = 0;
  let quote: string | null = null;
  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];
    if (quote !== null) {
      out += char;
      if (char === '\\') {
        out += next ?? '';
        index += 2;
        continue;
      }
      if (char === quote) quote = null;
      index += 1;
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      out += char;
      index += 1;
      continue;
    }
    if (char === '/' && next === '/') {
      while (index < source.length && source[index] !== '\n') index += 1;
      continue;
    }
    if (char === '/' && next === '*') {
      index += 2;
      while (index < source.length && !(source[index] === '*' && source[index + 1] === '/')) index += 1;
      index += 2;
      continue;
    }
    out += char;
    index += 1;
  }
  return out;
}

/**
 * Un identifiant JavaScript n'est PAS `[A-Za-z_$][\w$]*`.
 *
 * `\w` est ASCII par construction : dans un dépôt qui écrit ses identifiants en
 * français (`aliasNonVersionne`, `enTetesDeDepreciation`, `dateDeRetrait`), la
 * première surface nommée avec un accent serait capturée TRONQUÉE — mesuré en
 * prouvant le rouge de ce module : `registerSurfaceMontéeHorsRegisterAllRoutes`
 * ressortait `eHorsRegisterAllRoutes`. Le témoin tombait quand même (un nom
 * inconnu n'est dans aucune liste figée, donc l'échec est fail-closed dans les
 * deux sens), mais il NOMMAIT autre chose que ce qui s'était passé — et un
 * balayage qui envoie chercher au mauvais endroit se fait désarmer.
 *
 * D'où les classes Unicode et le drapeau `u` : c'est la définition du langage,
 * pas celle de l'alphabet dans lequel ce fichier-ci se trouve écrit.
 */
const IDENT = '[\\p{L}_$][\\p{L}\\p{N}_$]*';
const REGISTER_RE = new RegExp(`this\\.server\\.register\\(\\s*(${IDENT})`, 'gu');
const RECEIVES_INSTANCE_RE = new RegExp(
  `(?:^|[^\\p{L}\\p{N}_$.])((?:this\\.${IDENT}\\.)?${IDENT})\\s*\\(\\s*this\\.server\\b`,
  'gu'
);

/**
 * Rend, dans l'ordre d'apparition, tout ce qui reçoit l'instance racine.
 *
 * Les deux formes sont cherchées séparément parce qu'elles ne se ressemblent
 * pas : `this.server.register(X)` remet l'instance à `X` SANS la nommer en
 * argument, et `f(this.server)` la nomme. Chercher une seule des deux mesure la
 * popularité d'un idiome, jamais la propriété visée.
 */
export function rootMountedSurfaces(serverSource: string): RootMountedSurface[] {
  const source = stripCommentsPreservingStrings(serverSource);
  const found: RootMountedSurface[] = [];
  const seen = new Set<string>();

  const collect = (regex: RegExp, via: RootMountedSurface['via']): void => {
    regex.lastIndex = 0;
    let match = regex.exec(source);
    while (match !== null) {
      const callee = match[1];
      const key = `${via} ${callee}`;
      if (!seen.has(key)) {
        seen.add(key);
        found.push({ callee, via });
      }
      match = regex.exec(source);
    }
  };

  collect(REGISTER_RE, 'register');
  collect(RECEIVES_INSTANCE_RE, 'call');
  return found;
}

/**
 * Les treize surfaces qui reçoivent l'instance racine dans `server.ts`, au
 * 2026-08-30 — chacune avec ce qu'elle FAIT de cette instance.
 *
 * Deux seulement déclarent des routes de l'API Meeshy, et c'est le fait
 * central : `registerAllRoutes` — que le collecteur montait déjà — et
 * `setupSocketIO`, qu'il ignorait (#4376).
 */
export const ROOT_MOUNTED_SURFACES: readonly DeclaredRootSurface[] = [
  {
    callee: 'requestIdPlugin',
    via: 'register',
    kind: 'no-routes',
    reason: "Pose le hook d'identifiant de requête (middleware/request-id.ts) — aucun verbe HTTP déclaré.",
  },
  {
    callee: 'sensible',
    via: 'register',
    kind: 'no-routes',
    reason: '@fastify/sensible — décorateurs d\'erreurs HTTP et utilitaires, aucune route.',
  },
  {
    callee: 'multipart',
    via: 'register',
    kind: 'no-routes',
    reason: '@fastify/multipart — parseur de contenu, aucune route.',
  },
  {
    callee: 'helmet',
    via: 'register',
    kind: 'no-routes',
    reason: "@fastify/helmet — en-têtes de sécurité posés par hook, aucune route.",
  },
  {
    callee: 'cors',
    via: 'register',
    kind: 'no-routes',
    reason: '@fastify/cors — négociation CORS par hook ; la réponse OPTIONS est un miroir, jamais une route déclarée.',
  },
  {
    callee: 'swagger',
    via: 'register',
    kind: 'no-routes',
    reason: "@fastify/swagger — expose fastify.swagger() et collecte les schémas ; ne déclare aucune route (c'est swaggerUi qui en sert).",
  },
  {
    callee: 'swaggerUi',
    via: 'register',
    kind: 'outside-manifest',
    reason:
      "@fastify/swagger-ui sert son interface sous /docs (page, /docs/json, /docs/yaml, actifs statiques). " +
      "Ce sont des routes de DÉPENDANCE, pas de l'API Meeshy : les faire entrer au manifeste y mêlerait la " +
      "surface d'un vendor à celle dont les catalogues clients dérivent. Constaté et NOMMÉ ici plutôt que " +
      'laissé invisible — c\'est exactement la forme du défaut #4376, à une décision de périmètre près.',
  },
  {
    callee: 'jwt',
    via: 'register',
    kind: 'no-routes',
    reason: '@fastify/jwt — décore fastify.jwt et request.jwtVerify, aucune route.',
  },
  {
    callee: 'registerGlobalRateLimiter',
    via: 'call',
    kind: 'no-routes',
    reason: 'middleware/rate-limiter.ts — hook onRequest de limitation par IP, aucune route (vérifié : aucun verbe HTTP dans le module).',
  },
  {
    callee: 'registerClientMutationIdHook',
    via: 'call',
    kind: 'no-routes',
    reason: "middleware/clientMutationId.ts — hook d'idempotence, aucune route.",
  },
  {
    callee: 'registerRouteUsageHook',
    via: 'call',
    kind: 'no-routes',
    reason: "plugins/route-usage.plugin.ts — hook onResponse du compteur d'accès (#4275), aucune route.",
  },
  {
    callee: 'this.socketIOHandler.setupSocketIO',
    via: 'call',
    kind: 'declares-api-routes',
    reason:
      "socketio/MeeshySocketIOHandler.ts monte socketIOAdminRoutes : les deux gestes d'administration " +
      "Socket.IO (statistiques, déconnexion forcée), chacun sous son adresse canonique et son alias " +
      'déprécié — quatre routes. Montée par start() AVANT setupRoutes(), donc hors de registerAllRoutes : ' +
      "c'est le défaut de VISIBILITÉ de #4376.",
    witnessPath: '/api/v1/socketio/stats',
  },
  {
    callee: 'registerAllRoutes',
    via: 'call',
    kind: 'declares-api-routes',
    reason: "route-registration.ts — l'essentiel de l'API REST, déjà montée par le collecteur depuis #4276.",
    witnessPath: '/health',
  },
];

/** Les chemins que la table du collecteur doit porter pour que chaque surface déclarante soit prouvée MONTÉE. */
export function witnessPathsOfDeclaringSurfaces(
  surfaces: readonly DeclaredRootSurface[] = ROOT_MOUNTED_SURFACES
): { readonly callee: string; readonly witnessPath: string }[] {
  return surfaces
    .filter((surface) => surface.kind === 'declares-api-routes')
    .map((surface) => ({ callee: surface.callee, witnessPath: surface.witnessPath ?? '' }));
}

/** Les surfaces PRÉSENTES dans la source et absentes de la liste figée — une liste vide est le seul résultat acceptable. */
export function undeclaredRootSurfaces(
  observed: readonly RootMountedSurface[],
  declared: readonly DeclaredRootSurface[] = ROOT_MOUNTED_SURFACES
): RootMountedSurface[] {
  const known = new Set(declared.map((surface) => `${surface.via} ${surface.callee}`));
  return observed.filter((surface) => !known.has(`${surface.via} ${surface.callee}`));
}

/** Les surfaces DÉCLARÉES que la source ne porte plus — une entrée périmée ment autant qu'une entrée manquante. */
export function staleRootSurfaces(
  observed: readonly RootMountedSurface[],
  declared: readonly DeclaredRootSurface[] = ROOT_MOUNTED_SURFACES
): DeclaredRootSurface[] {
  const present = new Set(observed.map((surface) => `${surface.via} ${surface.callee}`));
  return declared.filter((surface) => !present.has(`${surface.via} ${surface.callee}`));
}
