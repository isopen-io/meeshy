/**
 * Le manifeste des routes SERVIES par la gateway — assemblé, jamais grepé.
 *
 * ## Ce que l'absence de ce fichier coûtait
 *
 * Trois catalogues clients (web, iOS, Android) décrivent chacun ce que le
 * serveur sert. Sans source qui fasse foi, ce sont trois OPINIONS, et le dépôt
 * dit ce que ça coûte : `apps/web/services/monitoring.service.ts` appelait
 * trois adresses `/health/*` qui n'existaient nulle part (#4219) et
 * `apps/web/hooks/use-group-modal.ts` postait vers `/groups`, absent lui aussi
 * (#4222). Deux fonctionnalités visibles à l'écran, jamais capables d'aboutir,
 * et aucune erreur — les deux appels étaient avalés par un `if (response.ok)`.
 *
 * Une table de routes tenue à la main aurait le même défaut que les trois
 * catalogues : elle serait une quatrième opinion. Celle-ci est produite par le
 * serveur ASSEMBLÉ — `registerAllRoutes`, la fonction même que la production
 * exécute — et lue par le hook `onRoute` de Fastify. Rien n'y entre qui ne soit
 * réellement monté ; rien n'en sort qui le soit.
 *
 * ## Pourquoi le générateur s'exécute SOUS Jest
 *
 * Assembler le graphe demande des doubles pour trois paquets ESM purs
 * (`@tus/server`, `@tus/file-store`, `@signalapp/libsignal-client`,
 * `thumbhash`, `isomorphic-dompurify`) et pour `ZmqSingleton`, qui ouvre un
 * VRAI socket à l'enregistrement. Le seul endroit du dépôt où ces doubles sont
 * déjà installés, éprouvés et maintenus est le harnais Jest du gateway.
 *
 * Ce fichier est donc le CERVEAU — assemblage, classement, rendu — et
 * `services/gateway/src/__tests__/route-manifest-ratchet.test.ts` n'est que la
 * salle des machines : il pose les doubles, appelle `construireManifeste()` et
 * ÉCRIT ou COMPARE. Ce partage n'est pas un pis-aller : il garantit que le
 * fichier commité et ce que le cliquet recalcule viennent du MÊME runtime.
 * Deux runtimes (tsx pour écrire, Jest pour vérifier) auraient dérivé, et un
 * cliquet qui compare deux mesures différentes rougit sur du bruit.
 *
 * Une commande, depuis la racine du dépôt :
 *
 *     npx tsx scripts/route-manifest.ts          # régénère docs/api/route-manifest.{json,md}
 *     npx tsx scripts/route-manifest.ts --check  # vérifie sans écrire (ce que fait la CI)
 *
 * ## Le niveau de sécurité — ce que le manifeste PROUVE, et ce qu'il avoue
 *
 * Le vocabulaire S0–S6 est celui de `docs/product/api-simplification/securite.md`
 * § 1. Chaque ligne porte le niveau ÉTABLI depuis le montage, avec sa preuve :
 *
 *  - **S6** — la route installe `requireSovereign()`. Constaté par IDENTITÉ :
 *    la fabrique de `middleware/authorize.ts` est enveloppée avant que les
 *    modules de routes ne l'appellent, et marque le garde qu'elle rend.
 *  - **S5 / S4** — la route installe `requirePermission('<perm>')` (ou une des
 *    constantes de `middleware/admin-permissions.middleware.ts`, reconnues par
 *    identité de référence). `canModerateContent` ⇒ S4, toute autre ⇒ S5.
 *  - **S2** — une requête RÉELLE sans aucun justificatif (`app.inject`, ni
 *    `Authorization`, ni `X-Session-Token`, ni cookie) reçoit 401 ou 403.
 *  - **S1 / S0** — cette même requête passe. S1 si la route déclare un
 *    `config.rateLimit` ; S0 sinon.
 *  - **inconnu** — la sonde n'a pas rendu de verdict (429, 5xx) : un plantage
 *    ne dit rien du niveau, et le deviner serait pire que l'avouer.
 *
 * **S3 (propriétaire / participant) n'apparaît sur AUCUNE ligne, et c'est un
 * constat, pas un oubli.** L'appartenance se vérifie DANS le handler, après le
 * pipeline de hooks : rien au montage ne peut la voir. Une ligne `S2` dit donc
 * « une identité est exigée » — elle ne dit PAS que la ressource d'autrui est
 * refusée. Le manifeste publie le PLANCHER PROUVÉ, jamais le plafond espéré.
 *
 * ## Les anomalies d'adressage — constatées, pas corrigées
 *
 * Le manifeste garde, par route, le préfixe donné à `server.register(...)` À
 * CÔTÉ du chemin final. C'est leur ÉCART qui rend visibles trois défauts que
 * ni la lecture d'un fichier ni un `grep` ne montrent, parce qu'aucun des deux
 * n'est faux isolément — c'est leur COMPOSITION qui l'est :
 *
 *  - un chemin hors `/api/v1` alors que rien ne le justifie ;
 *  - un préfixe de montage VIDE sous un chemin qui commence déjà par `/api/` —
 *    signature exacte d'un préfixe codé en dur DANS le module.
 *
 * Leur correction est un lot à part (#4277) : un manifeste qui corrige ce qu'il
 * mesure ne mesure plus rien.
 *
 * Source : issue #4276, inventaire ancré du 2026-08-29 — volet 2, étape 1.
 */

import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

// ---------------------------------------------------------------------------
// Emplacements
// ---------------------------------------------------------------------------

export const RACINE_DEPOT = path.resolve(__dirname, '..');
export const RACINE_GATEWAY = path.join(RACINE_DEPOT, 'services', 'gateway');
export const CHEMIN_MANIFESTE_JSON = path.join(RACINE_DEPOT, 'docs', 'api', 'route-manifest.json');
export const CHEMIN_MANIFESTE_MD = path.join(RACINE_DEPOT, 'docs', 'api', 'route-manifest.md');

export const COMMANDE_REGENERATION = 'npx tsx scripts/route-manifest.ts';

/** Le préfixe canonique. Toute route qui n'en relève pas doit se justifier. */
const PREFIXE_API = '/api/v1';

/**
 * Les seuls chemins admis HORS `/api/v1`, chacun avec sa raison. Ce n'est pas
 * une liste de tolérance : une entrée qui n'est plus servie fait rougir le
 * cliquet, exactement comme une route non déclarée.
 */
const RACINES_ADMISES: ReadonlyArray<{ readonly motif: RegExp; readonly pourquoi: string }> = [
  { motif: /^\/health$/, pourquoi: 'sonde de santé infra, appelée par l\'orchestrateur avant tout routage applicatif' },
  { motif: /^\/info$/, pourquoi: 'métadonnées statiques du service' },
  {
    motif: /^\/api\/attachments\/file\//,
    pourquoi:
      'montage LEGACY assumé (#4187) : des `fileUrl` de cette forme sont persistées en base ' +
      'depuis des années et voyagent dans des notifications déjà livrées — une URL en base ne ' +
      'se migre pas par un déploiement. Seule la lecture d\'octets y survit.',
  },
];

// ---------------------------------------------------------------------------
// Types du manifeste
// ---------------------------------------------------------------------------

/**
 * Le vocabulaire de `docs/product/api-simplification/securite.md` § 1.
 *
 * `S3` en est volontairement ABSENT : voir le doc-comment de tête — rien au
 * montage ne peut établir une appartenance vérifiée dans le handler. Le faire
 * figurer inviterait à croire qu'une ligne sans `S3` a été jugée non-S3.
 */
export type NiveauSecurite = 'S0' | 'S1' | 'S2' | 'S4' | 'S5' | 'S6' | 'inconnu';

/** L'ordre du document de sécurité, pas l'ordre alphabétique. */
export const VOCABULAIRE: readonly NiveauSecurite[] = ['S0', 'S1', 'S2', 'S4', 'S5', 'S6', 'inconnu'];

export interface RouteManifeste {
  readonly methode: string;
  readonly chemin: string;
  readonly prefixeMontage: string;
  readonly module: string;
  readonly niveau: NiveauSecurite;
  readonly garde: string;
  readonly preuve: string;
}

export interface Manifeste {
  readonly generePar: string;
  readonly commande: string;
  readonly prefixeApi: string;
  readonly comptes: {
    readonly routes: number;
    readonly modules: number;
    readonly parNiveau: Readonly<Record<string, number>>;
  };
  readonly anomalies: {
    readonly horsPrefixeApi: readonly string[];
    readonly prefixeCodeDansLeModule: readonly string[];
  };
  readonly routes: readonly RouteManifeste[];
}

// ---------------------------------------------------------------------------
// Marquage des gardes — constaté par IDENTITÉ, jamais par le nom d'une variable
// ---------------------------------------------------------------------------

/**
 * Symbole du registre GLOBAL (`Symbol.for`) et non local : le harnais Jest
 * charge ce fichier depuis une fabrique `jest.mock`, la sonde le charge depuis
 * l'import de tête. Deux instances de module poseraient deux symboles
 * différents, et le marquage deviendrait invisible au lecteur — un défaut
 * silencieux, qui rendrait toutes les routes d'administration « S2 ».
 */
const MARQUE_GARDE = Symbol.for('meeshy.route-manifest.garde');

export type MarqueGarde =
  | { readonly genre: 'authenticate' }
  | { readonly genre: 'permission'; readonly permission: string }
  | { readonly genre: 'souverain' }
  | { readonly genre: 'hierarchie'; readonly parametre: string };

type Garde = (...args: never[]) => unknown;

function marquer<T extends Garde>(garde: T, marque: MarqueGarde): T {
  Object.defineProperty(garde, MARQUE_GARDE, { value: marque, enumerable: false, configurable: true });
  return garde;
}

function marqueDe(valeur: unknown): MarqueGarde | undefined {
  if (typeof valeur !== 'function') return undefined;
  return (valeur as unknown as Record<symbol, MarqueGarde | undefined>)[MARQUE_GARDE];
}

interface ModuleAutorisation {
  requirePermission: (permission: string) => Garde;
  requireSovereign: () => Garde;
  requireHierarchy: (options?: { param?: string }) => Garde;
  [autre: string]: unknown;
}

/**
 * Enveloppe `middleware/authorize.ts` pour que CHAQUE garde qu'il fabrique
 * porte la permission qu'on lui a demandée.
 *
 * Pourquoi cette forme plutôt qu'une lecture des hooks : `requirePermission`
 * rend une flèche anonyme, dont ni le nom ni la fermeture ne sont lisibles de
 * l'extérieur. Les treize gardes locales de `routes/admin/` (`requireAdmin`,
 * `requireAgentAdmin`, `requireAnalyticsPermission`…) ne sont plus, depuis
 * #4153, que des ALIAS de cette fabrique : les marquer À LA SOURCE les attrape
 * TOUTES, y compris celles qui portent un autre nom. C'est exactement la leçon
 * du fichier `authorize.ts` — « la divergence ne se lit pas dans qui appelle
 * quoi, mais dans qui appelle la MATRICE ».
 */
export function envelopperAutorisation(reel: ModuleAutorisation): ModuleAutorisation {
  return {
    ...reel,
    requirePermission: (permission: string) =>
      marquer(reel.requirePermission(permission), { genre: 'permission', permission }),
    requireSovereign: () => marquer(reel.requireSovereign(), { genre: 'souverain' }),
    requireHierarchy: (options?: { param?: string }) =>
      marquer(reel.requireHierarchy(options), { genre: 'hierarchie', parametre: options?.param ?? 'userId' }),
  };
}

/**
 * `middleware/admin-permissions.middleware.ts` construit ses gardes DANS son
 * propre module, à son chargement : envelopper ses exports n'attraperait rien.
 * On les reconnaît donc par IDENTITÉ DE RÉFÉRENCE, ce qui ne peut pas se
 * tromper de garde — et la permission de chacune est recopiée ici depuis
 * l'appel `createAdminPermissionMiddleware('<perm>')` du module.
 *
 * Cette table est le SEUL endroit du manifeste écrit à la main. Elle ne peut
 * pas mentir en silence : un export de garde ABSENT de la table rend la route
 * `inconnu` (voir `niveauDepuisGardes`), jamais un niveau deviné.
 */
const PERMISSIONS_DES_GARDES_ADMIN: Readonly<Record<string, string>> = {
  requireAdminAccess: 'canAccessAdmin',
  requireUserViewPermission: 'canViewUsers',
  requireUserManagePermission: 'canUpdateUsers',
  requireCommunityManagePermission: 'canManageCommunities',
  requireConversationManagePermission: 'canManageConversations',
  requireAnalyticsPermission: 'canViewAnalytics',
  requireModerateContentPermission: 'canModerateContent',
  requireAuditLogPermission: 'canViewAuditLogs',
};

// ---------------------------------------------------------------------------
// Doubles de modules — partagés avec le harnais Jest, qui les pose lui-même
// ---------------------------------------------------------------------------

/**
 * `@tus/server` est publié en ESM pur. Ce double préserve le VRAI
 * `onUploadCreate`/`onIncomingRequest` de production — c'est là que vit la
 * garde d'authentification qu'on veut mesurer — et aiguille sur la MÉTHODE,
 * comme le vrai serveur : `onUploadCreate` n'est invoqué que par le POST.
 */
export function doubleTusServer(): { Server: unknown } {
  return {
    Server: class {
      private readonly opts: Record<string, ((...a: never[]) => Promise<unknown>) | undefined>;
      constructor(opts: Record<string, ((...a: never[]) => Promise<unknown>) | undefined>) {
        this.opts = opts ?? {};
      }
      async handle(req: Record<string, unknown>, res: Record<string, unknown>): Promise<void> {
        const entetes = (req?.headers ?? {}) as Record<string, string>;
        const api = { get: (k: string) => entetes[k.toLowerCase()] };
        const methode = String(req?.method ?? 'POST').toUpperCase();
        const id = String(req?.url ?? '').split('?')[0].split('/').filter(Boolean).pop() ?? '';
        const fin = res.end as (corps?: string) => void;
        try {
          if (methode === 'POST') {
            await this.opts.onUploadCreate?.({ headers: api } as never, { metadata: {}, size: 0 } as never);
            res.statusCode = 201;
          } else {
            await this.opts.onIncomingRequest?.({ headers: api } as never, id as never);
            res.statusCode = 204;
          }
          fin.call(res);
        } catch (err) {
          const e = err as { status_code?: number; body?: unknown };
          res.statusCode = e?.status_code ?? 500;
          fin.call(res, typeof e?.body === 'string' ? e.body : JSON.stringify(e ?? {}));
        }
      }
    },
  };
}

/**
 * Un upload EXISTANT appartenant à un TIERS : le seul état dans lequel
 * `onIncomingRequest` exerce réellement sa comparaison d'identité. Sans lui,
 * la garde revient sur `if (!ownerUserId) return` et ne mesure rien.
 */
export function doubleTusFileStore(): { FileStore: unknown } {
  return {
    FileStore: class {
      constructor(_opts: unknown) {}
      async getUpload(id: string): Promise<unknown> {
        return { id, offset: 0, size: 0, metadata: { userId: 'tus-upload-owner-user-id' } };
      }
    },
  };
}

/**
 * `routes/voice-profile.ts` et `routes/voice-analysis.ts` appellent
 * `ZMQSingleton.getInstance()` À L'ENREGISTREMENT et ouvrent un VRAI socket
 * vers 0.0.0.0:5555/5558, qui ne se referme jamais. Un vrai EventEmitter, pas
 * `{}` : `VoiceProfileService` appelle `.on(...)` sur la valeur résolue.
 */
export function doubleZmqSingleton(): { ZMQSingleton: { getInstance: () => Promise<unknown> } } {
  const { EventEmitter } = require('events') as { EventEmitter: new () => unknown };
  return { ZMQSingleton: { getInstance: async () => new EventEmitter() } };
}

// ---------------------------------------------------------------------------
// Stub Prisma « profond »
// ---------------------------------------------------------------------------

/**
 * Tout accès de propriété rend un nouveau proxy chaînable, tout appel une
 * Promise résolue à `[]`. Suffisant pour que la CONSTRUCTION de chaque module
 * de routes n'échoue pas ; aucune requête anonyme de la sonde n'en lit le
 * contenu.
 *
 * `then/catch/finally` ne sont jamais relayés (sinon `await` traite le proxy
 * comme un thenable) ; `getter/setter` non plus — `fastify.decorate` sonde ces
 * deux propriétés pour détecter un accesseur, et un proxy dont la cible est
 * une FONCTION répond « function » à tout, ce qui lui ferait perdre la
 * référence décorée.
 */
const PROPRIETES_EXCLUES = new Set(['then', 'catch', 'finally', 'getter', 'setter']);

function stubAppelable(): unknown {
  const fn = (): Promise<unknown[]> => Promise.resolve([]);
  return new Proxy(fn, {
    get(_cible, prop) {
      if (typeof prop === 'symbol') return undefined;
      if (PROPRIETES_EXCLUES.has(prop)) return undefined;
      return stubAppelable();
    },
    apply() {
      return Promise.resolve([]);
    },
  });
}

/** La RACINE enveloppe un objet, jamais une fonction — même piège `decorate`. */
function stubPrisma(): unknown {
  return new Proxy(
    {},
    {
      get(_cible, prop) {
        if (typeof prop === 'symbol') return undefined;
        if (PROPRIETES_EXCLUES.has(prop)) return undefined;
        return stubAppelable();
      },
    }
  );
}

// ---------------------------------------------------------------------------
// Assemblage
// ---------------------------------------------------------------------------

/**
 * Le strict nécessaire de la surface Fastify, décrit ici plutôt qu'importé :
 * ce fichier ne doit charger AUCUN module du gateway au chargement — son
 * `main()` tourne depuis la racine du dépôt, où `fastify` n'est pas résoluble.
 */
interface InstanceFastify {
  readonly prefix: string;
  decorate(nom: string, valeur: unknown): void;
  addHook(nom: 'onRoute', hook: (this: InstanceFastify, options: OptionsDeRoute) => void): void;
  ready(): Promise<void>;
  close(): Promise<void>;
  inject(options: {
    method: string;
    url: string;
    headers?: Record<string, string>;
    payload?: string;
  }): Promise<{ statusCode: number }>;
}

interface OptionsDeRoute {
  readonly method: string | readonly string[];
  readonly url: string;
  readonly prefix?: string;
  readonly config?: { readonly rateLimit?: unknown };
  readonly schema?: { readonly body?: unknown; readonly querystring?: unknown };
  readonly onRequest?: unknown;
  readonly preValidation?: unknown;
  readonly preHandler?: unknown;
}

interface RouteCollectee {
  readonly methode: string;
  readonly chemin: string;
  readonly prefixeMontage: string;
  readonly module: string;
  readonly marques: readonly MarqueGarde[];
  readonly gardesNonMarquees: readonly string[];
  readonly aUnLimiteur: boolean;
  readonly schemaCorps: unknown;
  readonly schemaQuery: unknown;
}

const MARQUEUR_SOURCE = `${path.sep}services${path.sep}gateway${path.sep}src${path.sep}`;

/**
 * Le fichier qui a DÉCLARÉ la route, lu dans la pile d'appel au moment où
 * Fastify émet `onRoute`. C'est la seule méthode qui reste exacte quand un
 * module en enregistre un autre : `routeOptions` ne porte aucune origine, et
 * un `printPlugins()` donne l'arbre des plugins, pas le site de déclaration.
 */
function moduleDeclarant(): string {
  const limite = Error.stackTraceLimit;
  Error.stackTraceLimit = 80;
  const pile = new Error().stack ?? '';
  Error.stackTraceLimit = limite;
  for (const ligne of pile.split('\n').slice(1)) {
    const trouve = ligne.match(/\(?([^()\s]+\.ts):\d+:\d+\)?/);
    if (!trouve) continue;
    const fichier = trouve[1];
    if (!fichier.includes(MARQUEUR_SOURCE)) continue;
    if (fichier.includes(`${path.sep}__tests__${path.sep}`)) continue;
    return path.relative(RACINE_DEPOT, fichier).split(path.sep).join('/');
  }
  return 'inconnu';
}

function listeDeGardes(valeur: unknown): readonly unknown[] {
  if (Array.isArray(valeur)) return valeur;
  if (typeof valeur === 'function') return [valeur];
  return [];
}

async function assembler(): Promise<{ app: InstanceFastify; routes: RouteCollectee[] }> {
  const Fastify = require(require.resolve('fastify', { paths: [RACINE_GATEWAY] })) as (
    o: unknown
  ) => InstanceFastify;

  const app = Fastify({
    logger: false,
    ajv: { customOptions: { strict: 'log', keywords: ['example'] } },
  });

  const prisma = stubPrisma();

  const { createUnifiedAuthMiddleware } = require(
    path.join(RACINE_GATEWAY, 'src', 'middleware', 'auth')
  ) as { createUnifiedAuthMiddleware: (p: unknown, o: unknown) => Garde };

  // EXACTEMENT le middleware de production (`server.ts` → `createAuthMiddleware()`).
  app.decorate(
    'authenticate',
    marquer(createUnifiedAuthMiddleware(prisma, { requireAuth: true, allowAnonymous: false }), {
      genre: 'authenticate',
    })
  );

  app.decorate('prisma', prisma);
  app.decorate('redis', undefined);
  app.decorate('mentionService', {});
  app.decorate('socketIOHandler', {});
  app.decorate('jobMappingCache', {});
  app.decorate('emailService', {});
  app.decorate('mutationLogService', {});
  app.decorate('callService', {});
  app.decorate('notificationService', {});
  app.decorate('socialEvents', {});
  app.decorate('presenceChecker', {
    isOnline: () => false,
    bulk: () => new Map<string, boolean>(),
    listOnlineAmong: () => [],
  });

  const gardesAdminParReference = new Map<unknown, string>();
  const moduleAdmin = require(
    path.join(RACINE_GATEWAY, 'src', 'middleware', 'admin-permissions.middleware')
  ) as Record<string, unknown>;
  for (const [nom, valeur] of Object.entries(moduleAdmin)) {
    if (typeof valeur === 'function' && nom.startsWith('require')) {
      gardesAdminParReference.set(valeur, nom);
    }
  }

  const routes: RouteCollectee[] = [];
  app.addHook('onRoute', function (this: InstanceFastify, options: OptionsDeRoute) {
    const methodes = Array.isArray(options.method) ? options.method : [options.method as string];
    const module = moduleDeclarant();
    const prefixeMontage = options.prefix ?? this.prefix ?? '';

    const marques: MarqueGarde[] = [];
    const nonMarquees: string[] = [];
    for (const cle of ['onRequest', 'preValidation', 'preHandler'] as const) {
      for (const garde of listeDeGardes(options[cle])) {
        const marque = marqueDe(garde);
        if (marque) {
          marques.push(marque);
          continue;
        }
        const nomAdmin = gardesAdminParReference.get(garde);
        if (nomAdmin) {
          const permission = PERMISSIONS_DES_GARDES_ADMIN[nomAdmin];
          if (permission) marques.push({ genre: 'permission', permission });
          else nonMarquees.push(nomAdmin);
        }
      }
    }

    for (const methode of methodes) {
      // HEAD et OPTIONS sont le miroir mécanique de GET, pas des routes.
      if (methode === 'HEAD' || methode === 'OPTIONS') continue;
      routes.push({
        methode,
        chemin: options.url,
        prefixeMontage,
        module,
        marques,
        gardesNonMarquees: nonMarquees,
        aUnLimiteur: options.config?.rateLimit !== undefined,
        schemaCorps: options.schema?.body,
        schemaQuery: options.schema?.querystring,
      });
    }
  });

  const { registerAllRoutes } = require(path.join(RACINE_GATEWAY, 'src', 'route-registration')) as {
    registerAllRoutes: (app: InstanceFastify, deps: unknown) => Promise<void>;
  };

  const { EventEmitter } = require('events') as { EventEmitter: new () => unknown };
  await registerAllRoutes(app, {
    prisma,
    translationService: {
      healthCheck: async () => true,
      // Non-null pour FORCER l'enregistrement de `registerVoiceRoutes` : sans
      // lui, tout `routes/voice/*` échapperait au manifeste. Un EventEmitter
      // réel, parce que les services d'audio y branchent `.on(...)`.
      getZmqClient: () => new EventEmitter(),
    },
    messagingService: {},
    mentionService: {},
    orphanMediaCleanup: {},
  });
  await app.ready();

  return { app, routes };
}

// ---------------------------------------------------------------------------
// La sonde anonyme — la seule preuve possible de « publique » ou « gardée »
// ---------------------------------------------------------------------------

function urlConcrete(patron: string): string {
  return patron
    .replace(/:[A-Za-z0-9_]+/g, '000000000000000000000000')
    .replace(/\*/g, 'dummy-wildcard-segment');
}

/**
 * Une valeur JSON minimale satisfaisant `type` + `required`. Sans elle, un
 * corps `{}` se fait rejeter en 400 par la validation de schéma — qui court
 * AVANT `preHandler` dans le cycle Fastify — et une route parfaitement gardée
 * passerait pour publique.
 */
function depuisSchema(schema: unknown, profondeur = 0): unknown {
  if (!schema || typeof schema !== 'object' || profondeur > 6) return {};
  const s = schema as Record<string, unknown>;
  if (s.const !== undefined) return s.const;
  if (Array.isArray(s.enum) && s.enum.length > 0) return s.enum[0];
  if (s.default !== undefined) return s.default;
  if (s.example !== undefined) return s.example;

  const type = Array.isArray(s.type) ? (s.type as string[]).find((t) => t !== 'null') : (s.type as string | undefined);

  if (type === 'object') {
    const obj: Record<string, unknown> = {};
    const requis = Array.isArray(s.required) ? (s.required as string[]) : [];
    const props = (s.properties ?? {}) as Record<string, unknown>;
    for (const cle of requis) obj[cle] = depuisSchema(props[cle] ?? {}, profondeur + 1);
    return obj;
  }
  if (type === 'array') {
    const min = typeof s.minItems === 'number' ? s.minItems : 0;
    return Array.from({ length: Math.max(min, 0) }, () => depuisSchema(s.items ?? {}, profondeur + 1));
  }
  if (type === 'string') {
    if (s.format === 'email') return 'anon-probe@example.com';
    if (s.format === 'date-time') return new Date(0).toISOString();
    if (typeof s.minLength === 'number') return 'x'.repeat(Math.max(s.minLength, 1));
    if (typeof s.pattern === 'string') return '000000000000000000000000';
    return 'anon-probe-value';
  }
  if (type === 'number' || type === 'integer') return typeof s.minimum === 'number' ? s.minimum : 1;
  if (type === 'boolean') return true;
  if (s.properties || s.required) return depuisSchema({ ...s, type: 'object' }, profondeur);
  return {};
}

function queryDepuisSchema(schema: unknown): string {
  const valeur = depuisSchema(schema);
  if (!valeur || typeof valeur !== 'object') return '';
  const params = new URLSearchParams();
  for (const [cle, v] of Object.entries(valeur as Record<string, unknown>)) {
    if (v === undefined) continue;
    params.set(cle, typeof v === 'string' ? v : JSON.stringify(v));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

const METHODES_A_CORPS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

async function sonderAnonyme(app: InstanceFastify, route: RouteCollectee): Promise<number> {
  const base = urlConcrete(route.chemin);
  const url = route.schemaQuery ? `${base}${queryDepuisSchema(route.schemaQuery)}` : base;
  const payload = METHODES_A_CORPS.has(route.methode)
    ? JSON.stringify(route.schemaCorps ? depuisSchema(route.schemaCorps) : {})
    : undefined;
  const reponse = await app.inject({
    method: route.methode,
    url,
    headers: { 'content-type': 'application/json' },
    ...(payload === undefined ? {} : { payload }),
  });
  return reponse.statusCode;
}

// ---------------------------------------------------------------------------
// Le niveau
// ---------------------------------------------------------------------------

function niveauDepuisGardes(route: RouteCollectee): { niveau: NiveauSecurite; garde: string } | undefined {
  if (route.gardesNonMarquees.length > 0) {
    return {
      niveau: 'inconnu',
      garde: route.gardesNonMarquees.join(' + '),
      // Une garde d'administration dont la permission n'est pas connue de la
      // table ne se devine pas : « admin, sans doute » est exactement le genre
      // de niveau qu'un manifeste ne doit jamais publier.
    };
  }
  const souverain = route.marques.find((m) => m.genre === 'souverain');
  if (souverain) return { niveau: 'S6', garde: 'requireSovereign()' };

  const permissions = route.marques.filter(
    (m): m is Extract<MarqueGarde, { genre: 'permission' }> => m.genre === 'permission'
  );
  if (permissions.length > 0) {
    const noms = permissions.map((p) => p.permission);
    const hierarchie = route.marques.find(
      (m): m is Extract<MarqueGarde, { genre: 'hierarchie' }> => m.genre === 'hierarchie'
    );
    const suffixe = hierarchie ? ` + requireHierarchy(:${hierarchie.parametre})` : '';
    const niveau: NiveauSecurite = noms.every((n) => n === 'canModerateContent') ? 'S4' : 'S5';
    return { niveau, garde: `requirePermission(${noms.join(', ')})${suffixe}` };
  }
  return undefined;
}

function classer(route: RouteCollectee, statutAnonyme: number): RouteManifeste {
  const parGarde = niveauDepuisGardes(route);
  const declareAuth = route.marques.some((m) => m.genre === 'authenticate');
  const preuveSonde = `anonyme→${statutAnonyme}`;

  if (parGarde) {
    return {
      methode: route.methode,
      chemin: route.chemin,
      prefixeMontage: route.prefixeMontage,
      module: route.module,
      niveau: parGarde.niveau,
      garde: parGarde.garde,
      preuve: `${parGarde.niveau === 'inconnu' ? 'garde hors matrice' : 'garde nommée'} · ${preuveSonde}`,
    };
  }

  const base = {
    methode: route.methode,
    chemin: route.chemin,
    prefixeMontage: route.prefixeMontage,
    module: route.module,
    garde: declareAuth ? 'fastify.authenticate' : '—',
  };

  if (statutAnonyme === 401 || statutAnonyme === 403) {
    return {
      ...base,
      niveau: 'S2',
      preuve: `${preuveSonde} · identité exigée ; l'appartenance, si elle existe, vit dans le handler (plancher prouvé)`,
    };
  }
  if (statutAnonyme === 429 || statutAnonyme >= 500) {
    return {
      ...base,
      niveau: 'inconnu',
      preuve: `${preuveSonde} · la sonde n'a pas atteint de verdict ; un plantage ne dit rien du niveau`,
    };
  }
  return {
    ...base,
    niveau: route.aUnLimiteur ? 'S1' : 'S0',
    preuve: route.aUnLimiteur
      ? `${preuveSonde} · aucune identité exigée, config.rateLimit déclaré sur la route`
      : `${preuveSonde} · aucune identité exigée, aucun limiteur déclaré sur la route`,
  };
}

// ---------------------------------------------------------------------------
// Les anomalies d'adressage
// ---------------------------------------------------------------------------

function anomalies(routes: readonly RouteManifeste[]): Manifeste['anomalies'] {
  const hors: string[] = [];
  const enDur: string[] = [];
  for (const r of routes) {
    const cle = `${r.methode} ${r.chemin}  ← ${r.module}`;
    if (!r.chemin.startsWith(PREFIXE_API) && !RACINES_ADMISES.some((a) => a.motif.test(r.chemin))) {
      hors.push(cle);
    }
    // Préfixe de montage VIDE sous un chemin déjà préfixé : le module écrit
    // lui-même son adresse, donc `route-registration.ts` ne la gouverne plus.
    if (r.prefixeMontage === '' && r.chemin.startsWith('/api/')) {
      enDur.push(cle);
    }
  }
  return { horsPrefixeApi: hors, prefixeCodeDansLeModule: enDur };
}

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

export async function construireManifeste(): Promise<Manifeste> {
  const { app, routes } = await assembler();
  try {
    const classees: RouteManifeste[] = [];
    for (const route of routes) {
      classees.push(classer(route, await sonderAnonyme(app, route)));
    }
    // Tri par CHEMIN puis MÉTHODE : l'ordre d'enregistrement est déterministe
    // mais un simple déplacement dans `route-registration.ts` remuerait tout le
    // fichier, et un diff illisible est un diff qu'on ne relit pas.
    classees.sort((a, b) => (a.chemin === b.chemin ? a.methode.localeCompare(b.methode) : a.chemin.localeCompare(b.chemin)));

    // Tous les niveaux, y compris ceux à ZÉRO. Un niveau absent de la table se
    // lirait « pas encore mesuré » ; un niveau à 0 dit « mesuré, et vide » —
    // c'est le cas de S6 aujourd'hui : `requireSovereign()` est exporté par
    // `middleware/authorize.ts` et n'est installé par AUCUNE route. Le fait
    // n'apparaît que si le compte est publié.
    const parNiveau: Record<string, number> = {};
    for (const niveau of VOCABULAIRE) parNiveau[niveau] = 0;
    for (const r of classees) parNiveau[r.niveau] += 1;
    const modules = new Set(classees.map((r) => r.module));

    return {
      generePar: 'scripts/route-manifest.ts',
      commande: COMMANDE_REGENERATION,
      prefixeApi: PREFIXE_API,
      comptes: {
        routes: classees.length,
        modules: modules.size,
        parNiveau,
      },
      anomalies: anomalies(classees),
      routes: classees,
    };
  } finally {
    await app.close();
  }
}

// ---------------------------------------------------------------------------
// Rendu
// ---------------------------------------------------------------------------

export function rendreJson(manifeste: Manifeste): string {
  return `${JSON.stringify(manifeste, null, 2)}\n`;
}

function cellule(texte: string): string {
  return texte.replace(/\|/g, '\\|');
}

export function rendreMarkdown(manifeste: Manifeste): string {
  const l: string[] = [];
  l.push('# Manifeste des routes servies par la gateway');
  l.push('');
  l.push('> **Fichier GÉNÉRÉ — ne pas éditer à la main.**');
  l.push('>');
  l.push(`> Régénérer : \`${manifeste.commande}\` · Source : \`${manifeste.generePar}\``);
  l.push('>');
  l.push('> La table vient du serveur **assemblé** (`registerAllRoutes`, la fonction que la');
  l.push('> production exécute), lue par le hook `onRoute` de Fastify. Aucune ligne n\'y est');
  l.push('> écrite à la main, aucune n\'y entre par `grep`. Un cliquet');
  l.push('> (`services/gateway/src/__tests__/route-manifest-ratchet.test.ts`) la recalcule à');
  l.push('> chaque exécution des tests : une route ajoutée, retirée ou déplacée sans');
  l.push('> régénérer ce fichier fait rougir la suite.');
  l.push('');
  l.push(`**${manifeste.comptes.routes} routes** déclarées par **${manifeste.comptes.modules} modules**.`);
  l.push('');

  l.push('## Les niveaux — ce que cette table prouve, et ce qu\'elle avoue');
  l.push('');
  l.push('Vocabulaire : [`docs/product/api-simplification/securite.md` § 1](../product/api-simplification/securite.md).');
  l.push('');
  l.push('| niveau | établi par | compte |');
  l.push('|---|---|---:|');
  const explications: Readonly<Record<string, string>> = {
    S0: 'la sonde anonyme passe, aucun limiteur déclaré sur la route',
    S1: 'la sonde anonyme passe, `config.rateLimit` déclaré sur la route',
    S2: 'la sonde anonyme reçoit 401/403 — **plancher** : l\'appartenance (S3) vit dans le handler',
    S4: '`requirePermission(canModerateContent)`, constaté par identité',
    S5: '`requirePermission(<autre>)` ou une garde de `admin-permissions.middleware`, par identité',
    S6: '`requireSovereign()`, constaté par identité',
    inconnu: 'la sonde n\'a pas rendu de verdict (429/5xx), ou une garde hors de la table centrale',
  };
  for (const [niveau, compte] of Object.entries(manifeste.comptes.parNiveau)) {
    l.push(`| **${niveau}** | ${explications[niveau] ?? '—'} | ${compte} |`);
  }
  l.push('');
  l.push('Un niveau à **0** est une mesure, pas une absence de mesure : il dit que le');
  l.push('vocabulaire prévoit ce rang et qu\'aucune route ne l\'installe.');
  l.push('');
  l.push('**`S3` n\'apparaît sur aucune ligne, et c\'est un constat, pas un oubli.**');
  l.push('L\'appartenance se vérifie DANS le handler, après le pipeline de hooks : rien au');
  l.push('montage ne peut la voir. Une ligne `S2` dit « une identité est exigée » — elle ne');
  l.push('dit pas que la ressource d\'autrui est refusée.');
  l.push('');

  l.push('## Anomalies d\'adressage — constatées, non corrigées (#4277)');
  l.push('');
  l.push('Ces deux listes sont CALCULÉES depuis l\'écart entre le préfixe donné à');
  l.push('`server.register(...)` et le chemin final. Ni la lecture d\'un fichier ni un `grep`');
  l.push('ne les montre : chacune des deux moitiés est correcte isolément, c\'est leur');
  l.push('composition qui ne l\'est pas.');
  l.push('');
  l.push(`### Hors \`${manifeste.prefixeApi}\` sans justification (${manifeste.anomalies.horsPrefixeApi.length})`);
  l.push('');
  if (manifeste.anomalies.horsPrefixeApi.length === 0) {
    l.push('_Aucune._');
  } else {
    for (const ligne of manifeste.anomalies.horsPrefixeApi) l.push(`- \`${ligne}\``);
  }
  l.push('');
  l.push('Les seuls chemins hors `/api/v1` que ce calcul ADMET, et pourquoi — toute autre');
  l.push('racine remonte dans la liste ci-dessus :');
  l.push('');
  for (const admise of RACINES_ADMISES) {
    l.push(`- \`${admise.motif.source}\` — ${admise.pourquoi}`);
  }
  l.push('');
  l.push(`### Préfixe codé en dur dans le module (${manifeste.anomalies.prefixeCodeDansLeModule.length})`);
  l.push('');
  l.push('Montage sans préfixe (`register(x)` ou `{ prefix: \'\' }`) et chemin qui commence');
  l.push('déjà par `/api/` : l\'adresse est écrite dans le module, donc `route-registration.ts`');
  l.push('ne la gouverne plus. Une refonte du versionnage d\'API les oublierait toutes.');
  l.push('');
  if (manifeste.anomalies.prefixeCodeDansLeModule.length === 0) {
    l.push('_Aucune._');
  } else {
    for (const ligne of manifeste.anomalies.prefixeCodeDansLeModule) l.push(`- \`${ligne}\``);
  }
  l.push('');

  l.push('## La table');
  l.push('');
  l.push('| méthode | chemin | niveau | garde | préfixe de montage | module |');
  l.push('|---|---|---|---|---|---|');
  for (const r of manifeste.routes) {
    l.push(
      `| \`${r.methode}\` | \`${cellule(r.chemin)}\` | ${r.niveau} | ${cellule(r.garde)} | \`${r.prefixeMontage || '(vide)'}\` | \`${cellule(r.module)}\` |`
    );
  }
  l.push('');
  return l.join('\n');
}

// ---------------------------------------------------------------------------
// CLI — un pilote, pas un second assembleur
// ---------------------------------------------------------------------------

function main(): void {
  const verifier = process.argv.slice(2).includes('--check');
  // Le binaire LOCAL d'abord : `npx` interroge le registre quand il ne trouve
  // rien, et un générateur qui télécharge silencieusement une autre version de
  // Jest ne mesure plus le même graphe.
  const jestLocal = path.join(RACINE_GATEWAY, 'node_modules', '.bin', 'jest');
  const binaire = fs.existsSync(jestLocal) ? jestLocal : 'npx';
  const arguments_ = ['--config=jest.config.json', '--runTestsByPath', 'src/__tests__/route-manifest-ratchet.test.ts'];
  const resultat = spawnSync(
    binaire,
    binaire === 'npx' ? ['jest', ...arguments_] : arguments_,
    {
      cwd: RACINE_GATEWAY,
      env: { ...process.env, MEESHY_ROUTE_MANIFEST: verifier ? 'check' : 'write' },
      stdio: 'inherit',
    }
  );
  if (!verifier && resultat.status === 0) {
    process.stdout.write(
      `\n✓ ${path.relative(RACINE_DEPOT, CHEMIN_MANIFESTE_JSON)} et ${path.relative(RACINE_DEPOT, CHEMIN_MANIFESTE_MD)} régénérés.\n`
    );
  }
  process.exit(resultat.status ?? 1);
}

export function ecrireManifeste(manifeste: Manifeste): void {
  fs.mkdirSync(path.dirname(CHEMIN_MANIFESTE_JSON), { recursive: true });
  fs.writeFileSync(CHEMIN_MANIFESTE_JSON, rendreJson(manifeste), 'utf8');
  fs.writeFileSync(CHEMIN_MANIFESTE_MD, rendreMarkdown(manifeste), 'utf8');
}

// `JEST_WORKER_ID` est le seul discriminant fiable : sous Jest, `require.main`
// n'est pas garanti différent de ce module, et une auto-exécution y relancerait
// Jest depuis l'intérieur de Jest.
if (require.main === module && !process.env.JEST_WORKER_ID) main();
