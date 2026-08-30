/**
 * Le COLLECTEUR — la table des routes du gateway se lit depuis le serveur
 * ASSEMBLÉ, jamais par lecture du code source (#4276).
 *
 * ## Pourquoi ce module existe
 *
 * `src/__tests__/security/route-auth-coverage.test.ts` montait déjà, pour ses
 * propres besoins, une VRAIE instance Fastify avec le VRAI graphe de routes
 * (`registerAllRoutes`) — un montage jetable, construit et détruit dans ce
 * seul test. #4276 en avait besoin ailleurs : un SCRIPT qui régénère un
 * artefact commité (`route-manifest.json`) et un CLIQUET qui le compare à une
 * régénération fraîche. Réimplémenter le montage une seconde fois pour ces
 * deux nouveaux usages aurait recréé exactement la classe de défaut que ce
 * dépôt referme sans relâche — deux montages jetables divergent tôt ou tard
 * (le montage QUI FAIT FOI n'est plus celui qui tourne réellement). Ce module
 * EXTRAIT donc le montage en un point unique ; `route-auth-coverage.test.ts`,
 * `scripts/generate-route-manifest.ts` et le cliquet
 * `route-manifest-ratchet.test.ts` le CONSOMMENT tous les trois.
 *
 * `buildAssembledApp()` est le montage lui-même (identique, au caractère
 * près, à celui qu'il remplace) : un stub Prisma profond, les décorations
 * minimales dont chaque module de routes a besoin pour se CONSTRUIRE sans
 * planter, un `getZmqClient` non nul pour forcer l'enregistrement de
 * `registerVoiceRoutes` (sans quoi tout `routes/voice/*` échapperait au
 * balayage), et un hook `onRoute` qui draine la table réelle.
 *
 * Il monte DEUX surfaces, pas une (#4376) : `registerAllRoutes` et
 * `socketIOAdminRoutes`. La seconde est montée par `setupSocketIO()` en
 * production, hors de `registerAllRoutes`, et son absence ici rendait quatre
 * routes servies invisibles à tout le monde. Le hook `onRoute` voit tout ce
 * qui est monté ; il ne peut rien contre ce qui ne l'est pas — d'où le témoin
 * `src/__tests__/route-manifest/root-mounted-surfaces.test.ts`, qui lit dans
 * `server.ts` la liste des surfaces reçues par l'instance racine et exige que
 * chacune de celles qui déclarent des routes d'API soit reproduite ici.
 *
 * `buildRouteManifest()` est la couche AU-DESSUS : elle appelle
 * `buildAssembledApp()`, projette chaque route collectée vers la forme de
 * l'ARTEFACT (méthode, chemin, module d'origine, niveau de sécurité), TRIE le
 * résultat de façon déterministe, puis ferme le serveur. C'est cette fonction
 * que le script et le cliquet appellent — jamais `buildAssembledApp()`
 * directement, réservée au test d'authentification qui a besoin de l'`app`
 * VIVANTE pour y injecter des requêtes.
 *
 * ## Le module d'origine — une valeur AU MIEUX, sa limite nommée (critère 1)
 *
 * Le hook `onRoute` de Fastify ne porte PAS le nom du module qui a déclaré la
 * route. Deux techniques auraient pu le donner : réimporter chaque module de
 * routes ici pour construire une carte `fonction → nom` (rejetée : c'est une
 * SECONDE énumération des imports de `route-registration.ts`, condamnée à
 * dériver le jour où ce fichier change sans que celui-ci ne bouge) ; ou
 * ENVELOPPER l'enregistrement — retenue. `server.register` est monkey-patché
 * AVANT d'appeler `registerAllRoutes` : chaque appel prend pour étiquette le
 * nom (`.name`) de la fonction de plugin passée, désambiguïsé par un suffixe
 * `~N` quand deux modules partagent un nom (mesuré : `translationRoutes` est
 * déclaré identiquement dans `routes/translation.ts` ET
 * `routes/translation-non-blocking.ts`).
 *
 * Vérifié empiriquement (le comportement n'est PAS documenté par Fastify) :
 * `await server.register(plugin, opts)` ne résout qu'une fois CE plugin — et
 * tous les sous-plugins qu'il enregistre en cascade — entièrement chargés,
 * `onRoute` compris ; deux appels successifs ne s'entrelacent jamais. Il
 * suffit donc de retenir l'étiquette courante dans une fermeture, de
 * l'appliquer à chaque route captée par `onRoute` pendant la fenêtre
 * d'attente, et de la restaurer une fois l'appel résolu. Fastify propage cette
 * substitution aux sous-plugins par sa propre chaîne prototypale (un plugin
 * imbriqué appelle `.register` via le PROTOTYPE, qui résout vers la version
 * monkey-patchée) : un `server.register(pluginParent)` dont le corps enregistre
 * lui-même deux sous-modules NOMMÉS attribue à chacun sa PROPRE étiquette, pas
 * celle du parent — mesuré sur le bloc anonyme de traduction de
 * `route-registration.ts` (lignes 184-198), dont les trois sous-modules
 * (`translationRoutes`, `translationRoutes~2`, `translationJobsRoutes`)
 * ressortent bien distincts.
 *
 * LIMITE, nommée plutôt que cachée : cette technique ne voit que ce qui passe
 * par `server.register(...)`. `route-registration.ts` appelle
 * `registerVoiceRoutes(server, ...)` en fonction DIRECTE (pas de `.register`)
 * — ses onze routes retombent donc sur l'étiquette générique
 * `MODULE_ROOT_LABEL` ci-dessous, au lieu de nommer `routes/voice/index.ts`.
 * C'est la SEULE famille dans ce cas au 2026-08-29 (vérifié : c'est aussi la
 * seule route enregistrée par appel direct plutôt que par `.register` dans
 * tout `route-registration.ts`) ; son signal structurel reste entier via
 * `mountPrefix` (vide, alors que ses chemins portent `/api/v1/voice` en dur —
 * exactement le défaut #2 que le critère 4 demande de constater).
 *
 * ## Le niveau de sécurité — dérivé au mieux, jamais deviné (critère 3)
 *
 * `docs/product/api-simplification/README.md` § 4 donne la matrice S0–S6, mais
 * aucune table centrale n'associe un CHEMIN à un NIVEAU : la décision vit dans
 * les préHandlers que chaque route attache (`middleware/authorize.ts`). Trois
 * signaux SONT mécaniquement observables depuis le serveur assemblé, et eux
 * seuls :
 *
 *  1. la présence de `fastify.authenticate` (par référence, ou par
 *     l'enrobage indirect `(req, rep) => fastify.authenticate(req, rep)`
 *     mesuré dans 7 fichiers — détecté par inspection de la SOURCE de la
 *     fonction, `Function.prototype.toString()`, jamais par grep du dépôt) ;
 *  2. la présence d'une fermeture produite par `requirePermission(...)` /
 *     `requireHierarchy(...)` / `requireSovereign()` — chacune contient un
 *     appel INTERNE distinct et stable (`permissionsService.hasPermission(`,
 *     `permissionsService.canManageUser(`, `UserRoleEnum.BIGBOSS`) que
 *     `.toString()` révèle sans jamais révéler l'ARGUMENT qui a été fermé
 *     (le nom de la permission exacte reste invisible : c'est une variable
 *     capturée, pas du texte source). Le marqueur est pris dans le CODE,
 *     jamais dans le MESSAGE de refus qu'il envoie — une leçon du terrain,
 *     pas une prudence gratuite : la première version matchait sur le texte
 *     français (« Hiérarchie insuffisante ») et rougissait entre deux
 *     régénérations d'une MÊME route inchangée, selon le lanceur — esbuild
 *     (`tsx`, le script) échappe les caractères non-ASCII de
 *     `Function.prototype.toString()` (« é » devient `\xE9`), quand le
 *     compilateur TypeScript de ts-jest (le cliquet) les préserve tels
 *     quels. Voir les constantes `*_MARKER` plus bas ;
 *  3. le préfixe `/admin` du chemin.
 *
 * Ces trois signaux tranchent S0/S1 (aucune authentification) de « authentifié
 * d'une manière ou d'une autre », et `requireSovereign()` tranche S6 sans
 * ambiguïté (elle n'admet que BIGBOSS, par construction — aucune route ne
 * l'utilise au 2026-08-29, la détection reste prête). Ils ne peuvent PAS
 * trancher S0 de S1 (le limiteur de débit global vit dans `server.ts`, hors du
 * graphe que `registerAllRoutes` construit), ni S2 de S3 (l'appartenance peut
 * être vérifiée DANS le corps du handler), ni S4 de S5 (le nom de la
 * permission est une variable fermée, invisible). Dans ces trois cas,
 * `securityLevel` vaut `'inconnu'` — JAMAIS une valeur choisie au hasard entre
 * les candidats — et `securityLevelCandidates` porte ce qui a été
 * mécaniquement établi. Un champ qui MENT est pire qu'un champ absent.
 *
 * LIMITE, nommée : ces trois gardes sont celles de `middleware/authorize.ts`,
 * la loi UNIQUE d'administration (#4153). `routes/admin/users-write.ts` en
 * porte une AUTRE, parallèle et non couverte —
 * `middleware/admin-user-auth.middleware.ts` (`requireUserModifyAccess`,
 * `requireUserViewAccess`, `requireUserDeleteAccess`), qui vérifie elle aussi
 * une permission nommée (`canUpdateUsers`, etc.) mais par un appel et un
 * message DISTINCTS (anglais, sans passer par `permissionsService.
 * hasPermission(` au même endroit textuel). Les routes qui n'utilisent QUE
 * cette seconde famille ressortent donc `authenticated-only` (S2/S3) alors
 * qu'elles sont RÉELLEMENT permission-gated (S4/S5) — une SOUS-estimation,
 * jamais une survente. Étendre la détection à cette famille, et à toute autre
 * qui existerait ailleurs dans les 50+ fichiers de `routes/`, est un suivi
 * (#4276 § restant) : le catalogue exhaustif des gardes locales n'est pas ce
 * que ce lot promettait de livrer.
 */

import Fastify, { type FastifyInstance } from 'fastify';
import { EventEmitter } from 'events';
import { registerAllRoutes, type RouteRegistrationDeps } from '../route-registration';
import { createUnifiedAuthMiddleware } from '../middleware/auth';
import { socketIOAdminRoutes } from '../socketio/socketio-admin-routes';

// ---------------------------------------------------------------------------
// Stub Prisma "profond" — IDENTIQUE à celui que portait
// `route-auth-coverage.test.ts` avant #4276. Tout accès de propriété renvoie
// un nouveau proxy chainable, tout appel renvoie une Promise résolue à `[]`.
// Suffisant pour que le code de CONSTRUCTION de chaque module de routes (ex.
// `new XxxService(prisma)`, ou du chargement de clés au démarrage) ne plante
// pas au chargement — ni le test d'authentification ni ce collecteur n'ont
// besoin d'un résultat Prisma réellement signifiant.
// ---------------------------------------------------------------------------
// Propriétés à ne JAMAIS relayer vers un proxy imbriqué : `then/catch/finally`
// évitent qu'un `await` traite le proxy comme un thenable ; `getter/setter`
// évitent un piège Fastify — `fastify.decorate(name, value)` sonde
// `value.getter`/`value.setter` (typeof === 'function' ?) pour détecter le
// pattern d'accesseur `{getter, setter}`. Un proxy racine dont TARGET est une
// fonction (nécessaire pour que `prisma.model.findMany(...)` reste appelable)
// a `typeof proxy === 'function'` pour CHAQUE propriété relayée, y compris
// `.getter` — Fastify croit alors définir un accesseur et n'expose plus la
// valeur telle quelle (perte de référence, `.serverEncryptionKey` redevient
// `undefined` une fois traversé `fastify.decorate`). Vérifié empiriquement :
// sans cette exclusion, `fastify.prisma !== prismaStub` à l'intérieur d'un
// plugin enregistré.
const STUB_EXCLUDED_PROPS = new Set(['then', 'catch', 'finally', 'getter', 'setter']);

function makeCallableStub(): any {
  // `[]` plutôt que `undefined` : plusieurs chemins d'enregistrement (ex.
  // `EncryptionService.ServerKeyVault.initialize()`) font `for (const x of
  // await prisma.model.findMany(...))` — un stub générique doit rester
  // itérable pour ne pas faire planter la CONSTRUCTION des routes.
  const fn: any = (..._args: unknown[]) => Promise.resolve([]);
  return new Proxy(fn, {
    get(_target, prop) {
      if (typeof prop === 'symbol') return undefined;
      if (STUB_EXCLUDED_PROPS.has(prop as string)) return undefined;
      return makeCallableStub();
    },
    apply() {
      return Promise.resolve([]);
    },
  });
}

/**
 * Racine du stub Prisma. Doit envelopper un OBJET, pas une fonction : la même
 * sonde Fastify décrite ci-dessus traite `typeof decoratedValue === 'function'`
 * comme un signal de rebind spécial pour les décorateurs-méthodes — un stub
 * racine appelable perdrait sa référence dès `app.decorate('prisma', ...)`.
 * Seuls les niveaux enfants (`prisma.model.method(...)`) doivent être
 * appelables ; eux ne passent jamais par `fastify.decorate`.
 */
function makeDeepStub(): any {
  return new Proxy({}, {
    get(_target, prop) {
      if (typeof prop === 'symbol') return undefined;
      if (STUB_EXCLUDED_PROPS.has(prop as string)) return undefined;
      return makeCallableStub();
    },
  });
}

/**
 * Une route captée depuis le serveur assemblé. `onRequest`/`preHandler`
 * portent les références RÉELLES posées par le module de routes — elles ne
 * servent qu'à `deriveSecurityLevel` ci-dessous (inspection mécanique, jamais
 * de ré-exécution) ; `bodySchema`/`querystringSchema` restent au service du
 * test d'authentification, qui synthétise des requêtes assez valides pour
 * franchir la validation Fastify avant d'atteindre la garde qu'il vérifie.
 */
export interface CollectedRoute {
  method: string;
  url: string;
  /** Préfixe RÉEL de l'encapsulation Fastify (`routeOptions.prefix`) au moment de la déclaration — voir la note sur `mountPrefix` dans `buildRouteManifest`. */
  prefix: string;
  /** Meilleur effort — voir la note de module en tête de fichier. */
  module: string;
  onRequest?: unknown;
  /**
   * La CINQUIÈME forme de garde — 186 déclarations dans `routes/`, et le
   * collecteur ne lisait pas cette phase du tout (#4318). `preValidation:
   * [fastify.authenticate]` est aussi gardante qu'`onRequest`, et
   * `routes/posts/core.ts`, `routes/calls.ts`, `routes/auth/*` l'emploient.
   */
  preValidation?: unknown;
  preHandler?: unknown;
  bodySchema?: any;
  querystringSchema?: any;
  /**
   * Vraie quand la route hérite d'une garde d'authentification posée par un
   * hook d'INSTANCE (`fastify.addHook('preHandler', authMiddleware)`) plutôt
   * que par ses propres `onRequest`/`preHandler`. Renseignée APRÈS
   * `app.ready()` — voir `instrumentEncapsulatedAuthHooks`.
   */
  instanceAuthGuard?: boolean;
}

/** Étiquette portée par une route déclarée SANS passer par `server.register(...)` — voir la note de module en tête de fichier. */
const MODULE_ROOT_LABEL = "registerAllRoutes (déclaration directe sur l'instance racine, hors server.register)";

/**
 * Monkey-patche `app.register` pour attribuer, à chaque route captée par
 * `onRoute` pendant la vie de CE fichier, le nom du plugin en cours
 * d'enregistrement — voir la note de module en tête de fichier pour la preuve
 * empirique de la technique. Rend un getter à appeler DEPUIS le hook
 * `onRoute` (jamais mémoïsé : la valeur change à chaque appel de plugin).
 */
function instrumentRegistrationForModuleLabels(app: FastifyInstance): () => string {
  let currentLabel = MODULE_ROOT_LABEL;
  const occurrencesByName = new Map<string, number>();

  // Fastify type `register` avec une signature fortement générique/surchargée
  // que la réaffectation ci-dessous ne peut pas satisfaire structurellement —
  // ce module n'a besoin que du comportement RUNTIME (intercepter l'appel,
  // laisser l'original faire tout le travail), jamais de reconstruire ce type.
  const original = app.register.bind(app) as (plugin: unknown, opts?: unknown) => FastifyInstance;

  (app as unknown as { register: (plugin: unknown, opts?: unknown) => Promise<FastifyInstance> }).register =
    async function instrumentedRegister(plugin: unknown, opts?: unknown) {
      const rawName = typeof plugin === 'function' && plugin.name ? plugin.name : 'anonyme';
      const occurrence = (occurrencesByName.get(rawName) ?? 0) + 1;
      occurrencesByName.set(rawName, occurrence);
      const label = occurrence === 1 ? rawName : `${rawName}~${occurrence}`;

      const previousLabel = currentLabel;
      currentLabel = label;
      try {
        // Attendre ICI — et non renvoyer directement le thenable de Fastify —
        // est ce qui garantit que toute route déclarée par ce plugin (et ses
        // sous-plugins imbriqués) a déjà traversé `onRoute` avant qu'on ne
        // restaure `currentLabel` pour l'appel suivant.
        await original(plugin, opts);
        return app;
      } finally {
        currentLabel = previousLabel;
      }
    };

  return () => currentLabel;
}

/**
 * La QUATRIÈME forme d'authentification — celle qu'aucun marqueur de source ne
 * pouvait attraper (#4318).
 *
 * Les trois premières vivent sur la route : `fastify.authenticate` par
 * référence, son enrobage, et `createUnifiedAuthMiddleware(...)` reconnue par
 * son appel interne. Toutes trois se lisent dans `routeOptions.onRequest` /
 * `routeOptions.preHandler`, que le hook `onRoute` expose.
 *
 * La quatrième ne s'y trouve PAS : c'est un hook d'INSTANCE, posé une fois
 * pour tout un contexte d'encapsulation —
 *
 * ```ts
 * fastify.addHook('preHandler', authMiddleware);   // routes/me/preferences/index.ts
 * ```
 *
 * — et Fastify ne le recopie sur aucune route. Le collecteur ne voyait donc
 * rien, et le manifeste classait ces routes « public par construction ». La
 * mesure sur staging (#4318, 2026-08-29) : dix routes ainsi annoncées, tirées
 * au hasard, rendaient 401 sans jeton. **Une table qui annonce public sur une
 * route gardée est pire qu'une table absente** — elle est crédible.
 *
 * ## Ce qu'on instrumente, et pourquoi c'est le même geste qu'au-dessus
 *
 * `instrumentRegistrationForModuleLabels` patche `register` pour savoir QUEL
 * plugin déclare une route. Ici on patche `addHook` sur chaque contexte
 * encapsulé pour savoir si CE contexte porte une garde — le même motif, un
 * cran plus profond, comme la piste de l'issue l'annonçait.
 *
 * Le hook `onRegister` est déclenché par Fastify à la création de chaque
 * nouveau contexte, AVANT que la fonction du plugin ne s'exécute : le patch
 * est donc en place quand le plugin appelle `addHook`, quel que soit l'ordre
 * de ses déclarations. Et l'`onRoute` posé sur ce même contexte ne capte que
 * les routes qui y sont déclarées ET celles de ses descendants — exactement la
 * portée d'un hook d'instance, jamais plus large : une route SŒUR, déclarée
 * dans le contexte parent, n'exécute pas ce hook et n'est pas marquée.
 *
 * L'association ne peut se résoudre qu'après `app.ready()` : un contexte peut
 * poser sa garde APRÈS avoir déclaré ses routes, et un marquage fait au vol
 * raterait ce cas-là sans que rien ne le dise.
 */
function instrumentEncapsulatedAuthHooks(
  app: FastifyInstance,
  authenticateRef: unknown
): () => ReadonlySet<string> {
  interface ContexteEncapsule {
    porteUneGarde: boolean;
    readonly clesDeRoute: Set<string>;
  }

  const contextes: ContexteEncapsule[] = [];

  const PHASES_DE_GARDE = new Set(['onRequest', 'preValidation', 'preHandler']);

  app.addHook('onRegister', (instance: FastifyInstance) => {
    const contexte: ContexteEncapsule = { porteUneGarde: false, clesDeRoute: new Set() };
    contextes.push(contexte);

    // Fastify type `addHook` par une surcharge par nom de phase que la
    // réaffectation ci-dessous ne peut pas satisfaire structurellement — ce
    // module n'a besoin que du comportement RUNTIME.
    const original = instance.addHook.bind(instance) as (name: string, fn: unknown) => FastifyInstance;

    (instance as unknown as { addHook: (name: string, fn: unknown) => FastifyInstance }).addHook =
      function instrumentedAddHook(name: string, fn: unknown) {
        if (PHASES_DE_GARDE.has(name) && hookLooksLikeAuth(fn, authenticateRef)) {
          contexte.porteUneGarde = true;
        }
        return original(name, fn);
      };

    original('onRoute', (routeOptions: any) => {
      const methods = Array.isArray(routeOptions.method) ? routeOptions.method : [routeOptions.method];
      for (const method of methods) {
        contexte.clesDeRoute.add(`${method} ${routeOptions.url}`);
      }
    });
  });

  return () => {
    const gardees = new Set<string>();
    for (const contexte of contextes) {
      if (!contexte.porteUneGarde) continue;
      for (const cle of contexte.clesDeRoute) gardees.add(cle);
    }
    return gardees;
  };
}

/**
 * Monte le serveur Fastify ASSEMBLÉ — le VRAI graphe de routes
 * (`registerAllRoutes`), sur un stub Prisma et des décorations minimales — et
 * rend la table complète des routes captées par `onRoute`, HEAD/OPTIONS
 * auto-générés exclus (miroir mécanique de GET, jamais une route distincte).
 *
 * Rend l'`app` encore OUVERTE : `route-auth-coverage.test.ts` en a besoin
 * pour y injecter des requêtes après coup, et ferme lui-même dans son
 * `afterAll`. `buildRouteManifest()` ci-dessous appelle cette fonction et
 * ferme l'app à sa place — un appelant qui n'a besoin QUE de la table doit
 * appeler `buildRouteManifest()`, jamais celle-ci directement.
 */
export async function buildAssembledApp(): Promise<{ app: FastifyInstance; routes: CollectedRoute[] }> {
  const app = Fastify({
    logger: false,
    ajv: {
      customOptions: {
        strict: 'log' as const,
        keywords: ['example'],
      },
    },
  });

  const currentModuleLabel = instrumentRegistrationForModuleLabels(app);

  const prismaStub = makeDeepStub();

  // `fastify.authenticate` = EXACT même middleware que la production
  // (`createUnifiedAuthMiddleware(prisma, {requireAuth:true,
  // allowAnonymous:false})`, voir `server.ts` `createAuthMiddleware()`).
  // On utilise la VRAIE fonction, pas un mock — pour un appelant sans
  // `Authorization` ni `X-Session-Token`, `createAuthContext()` retourne
  // `createUnauthenticatedContext()` sans jamais toucher Prisma, donc le
  // stub ci-dessus n'est pas sollicité sur ce chemin. C'est aussi la RÉFÉRENCE
  // que `deriveSecurityLevel` compare aux hooks de chaque route.
  const authenticate = createUnifiedAuthMiddleware(prismaStub, {
    requireAuth: true,
    allowAnonymous: false,
  });
  app.decorate('authenticate', authenticate);

  // Doit précéder tout `register` : le hook `onRegister` ne voit que les
  // contextes créés APRÈS sa pose.
  const routesGardeesParInstance = instrumentEncapsulatedAuthHooks(app, authenticate);

  app.decorate('prisma', prismaStub);
  app.decorate('redis', undefined);
  app.decorate('mentionService', {} as any);
  app.decorate('socketIOHandler', {} as any);
  app.decorate('jobMappingCache', {} as any);
  app.decorate('emailService', {} as any);
  app.decorate('mutationLogService', {} as any);
  app.decorate('callService', {} as any);
  app.decorate('notificationService', {} as any);
  app.decorate('socialEvents', {} as any);
  app.decorate('presenceChecker', {
    isOnline: () => false,
    bulk: () => new Map(),
    listOnlineAmong: () => [],
  } as any);

  const routes: CollectedRoute[] = [];
  app.addHook('onRoute', (routeOptions) => {
    const methods = Array.isArray(routeOptions.method) ? routeOptions.method : [routeOptions.method];
    const schema = (routeOptions as any).schema;
    for (const method of methods) {
      if (method === 'HEAD' || method === 'OPTIONS') continue; // miroir mécanique de GET, pas une route distincte à garder
      routes.push({
        method,
        url: routeOptions.url,
        prefix: (routeOptions as any).prefix ?? '',
        module: currentModuleLabel(),
        onRequest: (routeOptions as any).onRequest,
        preValidation: (routeOptions as any).preValidation,
        preHandler: (routeOptions as any).preHandler,
        bodySchema: schema?.body,
        querystringSchema: schema?.querystring,
      });
    }
  });

  const deps: RouteRegistrationDeps = {
    prisma: prismaStub,
    translationService: {
      healthCheck: async () => true,
      // Valeur non-null pour forcer l'enregistrement de
      // `registerVoiceRoutes` (voir `route-registration.ts` : "if
      // (zmqClient) { ... }") — sans ça, tout `routes/voice/*` ne serait
      // jamais enregistré et échapperait totalement au balayage.
      // `AudioTranslateService`/`AttachmentTranslateService` appellent
      // `zmqClient.on(...)` à la construction (écoute d'évènements) : un vrai
      // EventEmitter, pas un objet nu, pour que ces constructions ne plantent
      // pas au chargement des routes.
      getZmqClient: () => new EventEmitter() as any,
    } as any,
    messagingService: {} as any,
    mentionService: {} as any,
    orphanMediaCleanup: {} as any,
  };

  // `registerAllRoutes` n'est PAS le seul graphe que la production monte sur
  // l'instance racine — c'est le défaut #4376, et il était structurel.
  // `MeeshyServer.start()` appelle `setupSocketIO()` AVANT `setupRoutes()`, et
  // c'est `setupSocketIO()` qui monte les deux gestes d'administration
  // Socket.IO (statistiques, déconnexion forcée) sous leur adresse canonique
  // ET leur alias déprécié — quatre routes, servies en production, absentes de
  // tous les manifestes régénérés jusqu'ici. Le hook `onRoute` ci-dessus est
  // exhaustif par construction ; ce qui ne l'était pas, c'est le MONTAGE.
  //
  // Le plugin monté ici est le MÊME objet que celui du serveur de production
  // (`socketio/socketio-admin-routes.ts`), jamais une copie de ses
  // déclarations : deux montages jetables divergent tôt ou tard, et c'est
  // exactement la classe de défaut que ce module existe pour fermer.
  // `getManager` rend `null` — aucun handler n'est appelé ici, seule la table
  // est lue — et l'ORDRE reproduit celui de `start()` : avant
  // `registerAllRoutes`.
  //
  // Le témoin qui garde la correspondance entre ce montage et celui de la
  // production est `src/__tests__/route-manifest/root-mounted-surfaces.test.ts`
  // : il extrait de `server.ts` tout ce qui reçoit l'instance racine, et exige
  // que chaque surface qui déclare des routes d'API soit reproduite ici.
  await app.register(socketIOAdminRoutes, { getManager: () => null });

  await registerAllRoutes(app, deps);
  await app.ready();

  // APRÈS `ready()` seulement — voir le doc de `instrumentEncapsulatedAuthHooks`.
  const gardees = routesGardeesParInstance();
  for (const route of routes) {
    if (gardees.has(`${route.method} ${route.url}`)) route.instanceAuthGuard = true;
  }

  return { app, routes };
}

// ---------------------------------------------------------------------------
// Niveau de sécurité — voir la note de module en tête de fichier.
// ---------------------------------------------------------------------------

/** Les sept niveaux de `docs/product/api-simplification/README.md` § 4. */
export type SecurityTier = 'S0' | 'S1' | 'S2' | 'S3' | 'S4' | 'S5' | 'S6';

/** `'inconnu'` uniquement quand aucun singleton de `SecurityTier` ne peut être affirmé — jamais une valeur devinée. */
export type SecurityLevel = SecurityTier | 'inconnu';

function asHookList(hook: unknown): unknown[] {
  if (Array.isArray(hook)) return hook;
  if (hook) return [hook];
  return [];
}

/** `Function.prototype.toString()` — la source COMPILÉE de la fermeture, jamais les variables qu'elle a capturées. */
function hookSource(fn: unknown): string {
  if (typeof fn !== 'function') return '';
  try {
    return fn.toString();
  } catch {
    return '';
  }
}

/**
 * Vrai si l'un des hooks (`onRequest` ou `preHandler`) EST `fastify.authenticate`
 * (référence stricte — la forme de 178 des 185 sites mesurés), ou l'ENROBE
 * (`(req, rep) => fastify.authenticate(req, rep)`, la forme des 7 sites
 * restants — `routes/affiliate.ts`, `routes/users/devices.ts`,
 * `routes/voice/analysis.ts`, `routes/voice/translation.ts`,
 * `routes/translation-non-blocking.ts`, `routes/attachments/download.ts`,
 * `routes/translation.ts`) : la source compilée de l'enrobage contient
 * toujours l'appel littéral `.authenticate(`, que `.toString()` révèle sans
 * ambiguïté plausible.
 *
 * Le résidu — une authentification vérifiée entièrement À L'INTÉRIEUR d'un
 * handler, sans jamais apparaître comme hook — était annoncé ici comme
 * « n'a été observé sur AUCUN site du dépôt ». **C'était une quantification
 * universelle jamais mesurée**, et elle était fausse : les quatre routes de
 * `routes/uploads/tus-handler.ts` sont exactement ce cas. Elles sont désormais
 * DÉCLARÉES dans `GARDES_HORS_HOOK` ci-dessous, avec leur raison — jamais
 * devinées. C'est la leçon de #4318 : un doc-comment qui affirme plus que ce
 * que son code mesure survit à toutes les relectures, parce qu'il rend le site
 * crédible.
 */
function hookLooksLikeAuth(fn: unknown, authenticateRef: unknown): boolean {
  return (
    fn === authenticateRef ||
    hookSource(fn).includes('.authenticate(') ||
    hookSource(fn).includes(UNIFIED_AUTH_CALL_MARKER)
  );
}

/**
 * Les TROIS phases où une garde peut vivre. Le collecteur n'en lisait que deux
 * — `preValidation` manquait, et c'est la forme de 186 déclarations de
 * `routes/` (#4318). Une phase oubliée ne rend pas un résultat approximatif :
 * elle rend « aucune garde », donc « public ».
 */
function routeHooks(route: CollectedRoute): unknown[] {
  return [
    ...asHookList(route.onRequest),
    ...asHookList(route.preValidation),
    ...asHookList(route.preHandler),
  ];
}

function hasAuthenticateHook(route: CollectedRoute, authenticateRef: unknown): boolean {
  if (route.instanceAuthGuard === true) return true;
  if (GARDES_HORS_HOOK.has(`${route.method} ${route.url}`)) return true;
  return routeHooks(route).some((fn) => hookLooksLikeAuth(fn, authenticateRef));
}

/**
 * La TROISIÈME forme d'authentification du dépôt — celle qui manquait.
 *
 * `createUnifiedAuthMiddleware(prisma, …)` (`middleware/auth.ts`) rend une
 * fonction `unifiedAuth` qui n'est NI `fastify.authenticate` par référence, NI
 * une fonction dont la source contient `.authenticate(`. Elle échappait donc aux
 * deux détections précédentes, et **trente-deux modules l'emploient**.
 *
 * Le coût de cet angle mort n'était pas cosmétique : le manifeste classait
 * 304 routes sur 524 en `no-standard-auth-hook`, c'est-à-dire « public par
 * construction, donc S0 ou S1 ». Mesuré sur staging le 2026-08-29, dix de ces
 * routes tirées au hasard : SEPT rendent 401 sans jeton, trois rendent 400,
 * AUCUNE n'est publique. Une table qui annonce « public » sur une route gardée
 * est pire qu'une table absente — le critère 3 de #4276 veut qu'elle serve aux
 * gardes de contrat client, et un lecteur s'y fierait.
 *
 * Le marqueur est un appel INTERNE (comme les trois marqueurs de permission
 * ci-dessous), jamais un nom de fonction : un nom se renomme, l'appel que la
 * fermeture exécute beaucoup moins. Et il est purement ASCII, pour la raison
 * donnée au § des marqueurs de permission — `Function.prototype.toString()`
 * échappe les caractères non-ASCII sous `tsx` et les préserve sous `ts-jest`,
 * ce qui ferait rougir le cliquet entre deux régénérations d'une MÊME route.
 */
/**
 * Les gardes qu'AUCUNE inspection de hook ne peut voir — déclarées, avec leur
 * raison, jamais devinées (#4318).
 *
 * `routes/uploads/tus-handler.ts` monte le protocole TUS par `fastify.route`
 * et confie l'authentification à `onIncomingRequest`, un point d'extension du
 * serveur `@tus/server` — pas un hook Fastify. La garde y lève
 * `{ status_code: 401, body: 'Authentication required' }` (l. 236, 249, 255).
 * Elle est réelle et testée ; elle est simplement INVISIBLE à
 * `routeOptions.onRequest / preValidation / preHandler`, les trois seules
 * phases que le collecteur peut lire.
 *
 * Cet inventaire est le pendant de `ALLOWED_OUTSIDE_API_V1` et de
 * `UNPREFIXED_MOUNT_DECISIONS` : **on n'interdit pas la forme, on exige la
 * décision écrite.** Une entrée ici est une affirmation vérifiable — si la
 * garde disparaît du handler, le témoin
 * `route-auth-coverage.test.ts` § « rejette tout appelant totalement anonyme »
 * rougit, puisqu'il interroge le serveur et ne lit pas cette table.
 */
const GARDES_HORS_HOOK: ReadonlySet<string> = new Set([
  'POST /api/v1/uploads',
  'POST /api/v1/uploads/*',
  'PATCH /api/v1/uploads/*',
  'DELETE /api/v1/uploads/*',
  // `routes/auth/refresh` vérifie la SIGNATURE du jeton reçu dans le corps
  // avant toute autre chose et répond 401 sans elle (`573581e27`). Aucun
  // en-tête n'est exigé — d'où l'absence de hook — mais l'appelant doit
  // prouver quelque chose, donc la route n'est pas « publique par
  // construction ».
  'POST /api/v1/auth/refresh',
]);

const UNIFIED_AUTH_CALL_MARKER = 'authMiddleware.createAuthContext(';

/** Vrai si un hook contient l'appel INTERNE distinctif d'une des trois gardes nommées de `middleware/authorize.ts`. */
function hasHookMarker(route: CollectedRoute, marker: string): boolean {
  return routeHooks(route).some((fn) => hookSource(fn).includes(marker));
}

/**
 * Marqueurs de détection des trois gardes de `middleware/authorize.ts` —
 * PUREMENT ASCII et pris dans le CODE (un appel de méthode, une constante),
 * jamais dans le MESSAGE de refus qu'elles envoient. Voir le § « Le niveau de
 * sécurité » en tête de fichier pour la leçon qui a produit ce choix : un
 * marqueur accentué (« Hiérarchie insuffisante ») rougissait le cliquet entre
 * deux régénérations d'une MÊME route inchangée selon que le lanceur était
 * `tsx` (esbuild, qui échappe les caractères non-ASCII de
 * `Function.prototype.toString()`) ou `ts-jest` (qui les préserve). Un appel
 * interne est en prime plus STABLE qu'un texte destiné à un humain : ce
 * dernier se reformule, la logique qu'il accompagne beaucoup moins.
 */
const PERMISSION_CALL_MARKER = 'permissionsService.hasPermission(';
const HIERARCHY_CALL_MARKER = 'permissionsService.canManageUser(';
const SOVEREIGN_CONST_MARKER = 'UserRoleEnum.BIGBOSS';

const ADMIN_PREFIX_RE = /^\/api\/v1\/admin(\/|$)|^\/admin(\/|$)/;

/**
 * Les quatre motifs que `deriveSecurityLevel` peut mécaniquement distinguer.
 * Le TEXTE de chacun vit UNE SEULE FOIS, dans `SECURITY_BASIS_LEGEND` /
 * `NOTICE.securityBasisLegend` — jamais recopié sur les centaines de lignes de
 * l'artefact : à quelques mots près, la même explication vaut pour toutes les
 * routes qui partagent une clé, et la dupliquer aurait près que doublé la
 * taille du fichier commité pour zéro information supplémentaire.
 */
export type SecurityBasisKey = 'no-standard-auth-hook' | 'sovereign' | 'permission-gated' | 'authenticated-only';

interface SecurityDerivation {
  readonly level: SecurityLevel;
  readonly candidates: readonly SecurityTier[];
  readonly basisKey: SecurityBasisKey;
}

/** Dérive le niveau de sécurité d'UNE route depuis ce que le serveur assemblé donne à voir. Voir la note de module en tête de fichier. */
function deriveSecurityLevel(route: CollectedRoute, authenticateRef: unknown): SecurityDerivation {
  if (!hasAuthenticateHook(route, authenticateRef)) {
    return { level: 'inconnu', candidates: ['S0', 'S1'], basisKey: 'no-standard-auth-hook' };
  }
  if (hasHookMarker(route, SOVEREIGN_CONST_MARKER)) {
    return { level: 'S6', candidates: ['S6'], basisKey: 'sovereign' };
  }
  if (hasHookMarker(route, PERMISSION_CALL_MARKER)) {
    return { level: 'inconnu', candidates: ['S4', 'S5'], basisKey: 'permission-gated' };
  }
  return { level: 'inconnu', candidates: ['S2', 'S3'], basisKey: 'authenticated-only' };
}

/** Une ligne de l'artefact `route-manifest.json` — voir `RouteManifestArtifact.notice` pour le sens de chaque colonne. */
export interface ManifestRoute {
  readonly method: string;
  readonly path: string;
  readonly module: string;
  readonly mountPrefix: string;
  readonly securityLevel: SecurityLevel;
  readonly securityLevelCandidates: readonly SecurityTier[];
  readonly securityBasisKey: SecurityBasisKey;
  /**
   * `requireHierarchy(...)` détecté (middleware/authorize.ts) — une garde de
   * RANG (« peut-on agir SUR CETTE cible ? »), ORTHOGONALE au niveau S0-S6
   * (« quelle permission faut-il ? ») : une route peut être `permission-gated`
   * ET `hierarchyGated` à la fois, les deux répondent à des questions
   * différentes.
   */
  readonly hierarchyGated: boolean;
  /** Le chemin porte un préfixe /admin — indice supplémentaire (docs/product/api-simplification/README.md § 3 range /admin dans le périmètre S4-S6), jamais une preuve à lui seul. */
  readonly adminPrefixed: boolean;
}

export interface RouteManifestArtifact {
  readonly notice: {
    readonly source: string;
    readonly regenerate: string;
    readonly columns: Readonly<Record<keyof ManifestRoute, string>>;
    readonly securityBasisLegend: Readonly<Record<SecurityBasisKey, string>>;
  };
  readonly routeCount: number;
  readonly routes: readonly ManifestRoute[];
}

const SECURITY_BASIS_LEGEND: Readonly<Record<SecurityBasisKey, string>> = {
  'no-standard-auth-hook':
    "Aucune garde d'authentification standard détectée (ni référence directe à fastify.authenticate dans " +
    "onRequest/preHandler, ni enrobage connu qui l'appelle) — public par construction, donc S0 ou S1. Les " +
    'deux ne se distinguent pas depuis le serveur assemblé : le limiteur de débit global ' +
    '(registerGlobalRateLimiter, middleware/rate-limiter.ts) est monté par server.ts, hors du graphe que ' +
    'registerAllRoutes — et donc ce collecteur — construit.',
  sovereign:
    'requireSovereign() détecté (middleware/authorize.ts) — sans ambiguïté possible : cette garde ' +
    "n'admet que BIGBOSS, par définition (aucune route ne l'utilise au 2026-08-29 ; la détection reste " +
    'structurelle et vaudra dès la première adoption).',
  'permission-gated':
    'Authentifié + requirePermission(...) détecté (middleware/authorize.ts), donc S4 ou S5. Les deux ne se ' +
    'distinguent pas mécaniquement : le NOM de la permission exigée est une variable capturée dans la ' +
    "fermeture, invisible depuis le serveur assemblé (voir Function.prototype.toString() en tête de fichier).",
  'authenticated-only':
    'Authentifié (onRequest/preHandler référence fastify.authenticate) sans requirePermission/' +
    'requireHierarchy/requireSovereign détecté, donc S2 ou S3. Les deux ne se distinguent pas mécaniquement : ' +
    "l'appartenance à la ressource (S3) peut être vérifiée à l'intérieur du corps du handler, invisible " +
    'depuis le serveur assemblé.',
};

/**
 * Le NOTICE de l'artefact — STATIQUE (aucune donnée dynamique, aucun
 * horodatage) pour rester déterministe d'une régénération à l'autre : le
 * cliquet compare l'artefact ENTIER, notice comprise, et un champ qui change
 * tout seul le ferait rougir sans qu'aucune route n'ait bougé.
 */
const NOTICE: RouteManifestArtifact['notice'] = {
  source:
    "Produite mécaniquement depuis le serveur Fastify ASSEMBLÉ (registerAllRoutes), jamais par lecture du " +
    'code source. Voir services/gateway/src/route-manifest/collect.ts (issue #4276).',
  regenerate: 'cd services/gateway && npm run route-manifest:generate',
  columns: {
    method: 'Méthode HTTP. HEAD et OPTIONS auto-générés par Fastify sont omis (miroir mécanique de GET, pas une route distincte).',
    path: 'Chemin COMPLET tel que servi, préfixe compris.',
    module:
      'Meilleur effort : nom de la fonction de plugin passée à server.register() (suffixe ~N quand deux ' +
      "modules partagent un nom), ou « " + MODULE_ROOT_LABEL + " » pour une route déclarée SANS passer par " +
      'server.register() — au 2026-08-29, seul routes/voice/index.ts (appelé en fonction directe) est dans ce cas.',
    mountPrefix:
      "Préfixe RÉEL de l'encapsulation Fastify au moment de la déclaration (routeOptions.prefix). Vide ('') " +
      "signale une route qui n'a reçu AUCUN préfixe via {prefix:...} à l'enregistrement — qu'elle atterrisse " +
      "hors de /api/v1 par défaut (voiceAnalysisRoutes, userDeletionsRoutes) ou qu'elle y atterrisse quand " +
      'même parce que le module code le préfixe EN DUR dans ses chemins (routes/uploads/tus-handler.ts, ' +
      'routes/voice/index.ts).',
    securityLevel:
      "Un des sept niveaux S0-S6 de docs/product/api-simplification/README.md § 4, ou 'inconnu' quand la " +
      'distinction exacte ne se dérive pas mécaniquement du serveur assemblé.',
    securityLevelCandidates:
      "Les niveaux compatibles avec ce qui A été observé, même quand securityLevel vaut 'inconnu' — jamais " +
      'une valeur devinée.',
    securityBasisKey:
      "Clé vers securityBasisLegend ci-dessous — ce qui a été mécaniquement détecté, et pourquoi ça ne " +
      'suffit pas, le cas échéant, à trancher un niveau unique.',
    hierarchyGated:
      'requireHierarchy(...) détecté (middleware/authorize.ts) — garde de RANG (« peut-on agir SUR CETTE ' +
      'cible ? »), orthogonale au niveau S0-S6.',
    adminPrefixed:
      'Le chemin porte un préfixe /admin — indice supplémentaire (§ 3 de la même spec range /admin dans le ' +
      'périmètre S4-S6), jamais une preuve à lui seul.',
  },
  securityBasisLegend: SECURITY_BASIS_LEGEND,
};

/**
 * Construit l'artefact `route-manifest.json` complet : monte le serveur
 * assemblé, projette chaque route captée, TRIE par (méthode, chemin) pour que
 * le résultat soit DÉTERMINISTE — sans ce tri, le cliquet rougirait au hasard
 * de l'ordre d'enregistrement plutôt qu'à un changement réel — puis ferme
 * l'app. C'est la fonction que `scripts/generate-route-manifest.ts` et
 * `route-manifest-ratchet.test.ts` appellent ; `route-auth-coverage.test.ts`
 * appelle `buildAssembledApp()` directement, lui, pour garder l'app ouverte.
 */
export async function buildRouteManifest(): Promise<RouteManifestArtifact> {
  const { app, routes } = await buildAssembledApp();
  const authenticateRef = (app as unknown as { authenticate?: unknown }).authenticate;

  const manifestRoutes: ManifestRoute[] = routes
    .map((route) => {
      const derivation = deriveSecurityLevel(route, authenticateRef);
      return {
        method: route.method,
        path: route.url,
        module: route.module,
        mountPrefix: route.prefix,
        securityLevel: derivation.level,
        securityLevelCandidates: derivation.candidates,
        securityBasisKey: derivation.basisKey,
        hierarchyGated: hasHookMarker(route, HIERARCHY_CALL_MARKER),
        adminPrefixed: ADMIN_PREFIX_RE.test(route.url),
      };
    })
    .sort((a, b) => (a.method === b.method ? a.path.localeCompare(b.path) : a.method.localeCompare(b.method)));

  await app.close().catch(() => {
    // Best-effort : ce collecteur ne sert jamais de trafic réel, une fermeture
    // qui échoue (un handle déjà relâché, par exemple) ne doit pas faire
    // échouer une génération d'artefact par ailleurs réussie.
  });

  return {
    notice: NOTICE,
    routeCount: manifestRoutes.length,
    routes: manifestRoutes,
  };
}
