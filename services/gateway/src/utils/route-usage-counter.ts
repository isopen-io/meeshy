import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

/**
 * Compteur d'usage des routes — combien de fois chaque (méthode, GABARIT de
 * route, version de client) a été appelé, sur une fenêtre glissante bornée en
 * mémoire (#4275).
 *
 * ## Pourquoi ce fichier existe
 *
 * Quatre issues (#4178, #4181, #4182, #4184) posent « compteur à zéro sur deux
 * versions publiées » comme CRITÈRE DE RETRAIT d'une route, et interdisent
 * explicitement de le prouver par revue de code : un inventaire des clients ne
 * dit rien des VERSIONS DÉJÀ INSTALLÉES, dont la queue est longue — #4250
 * existe précisément parce qu'un inventaire à trois clients avait été pris
 * pour une preuve. Sans ce fichier, leur critère était inatteignable par
 * construction, quel que soit l'effort mis dans ces quatre lots.
 *
 * ## Le piège qui sépare un compteur d'une fuite de données personnelles
 *
 * La clé d'agrégat est (méthode, GABARIT, version) — JAMAIS l'URL concrète.
 * `request.routeOptions.url` (Fastify 5) rend le gabarit tel que déclaré par
 * la route (`/api/v1/users/:id`), et JAMAIS l'adresse effectivement demandée
 * (`/api/v1/users/68f2a17c9e0b4d2f1a3c5e77`). Compter l'URL concrète ferait
 * entrer un IDENTIFIANT D'UTILISATEUR dans la clé d'agrégat au premier hit
 * d'une route paramétrée — le compteur deviendrait un journal nominatif,
 * exactement ce que le critère 1 de #4275 interdit (« l'identité de
 * l'appelant n'est pas nécessaire, et ne doit pas être collectée »).
 * `record()` ne lit et ne dérive JAMAIS `request.url` ou `request.params` —
 * seul `request.routeOptions.url` (le gabarit) entre dans la clé.
 *
 * ## Cardinalité — pourquoi un balayage adverse ne peut pas faire exploser la
 * mémoire du gateway
 *
 * Trois dimensions, trois bornes indépendantes :
 * - MÉTHODE : l'ensemble fini des verbes HTTP que Node sait dispatcher.
 * - ROUTE : `request.routeOptions.url` vaut `undefined` quand AUCUNE route ne
 *   matche (`request.is404`) — c'est le seul cas où une URL arbitraire
 *   pourrait vouloir une entrée par adresse. Elle est repliée sur LA MÊME
 *   clé sentinelle `<no-route>` (`sanitizeRoute`) : un balayage sur un
 *   million d'adresses inconnues produit UNE entrée, jamais un million.
 * - VERSION : un en-tête `X-App-Version` absent, trop long, ou qui ne
 *   ressemble pas à une version (regex bornée, longueur plafonnée AVANT même
 *   de lancer le motif) se replie sur `unknown` (`sanitizeVersion`).
 *
 * Reste un angle que ni le gabarit ni le format ne ferment : un appelant qui
 * envoie un `X-App-Version` DIFFÉRENT à chaque requête tout en restant dans
 * le format accepté (`"1.2.3"`, `"1.2.4"`, … jusqu'à
 * `"99999.99999.99999.99999"`) peut vouloir gonfler la cardinalité sans
 * toucher au gabarit de route. C'est pour CE cas précis — la route étant déjà
 * bornée structurellement — que `maxKeysPerBucket` existe : un plafond DUR
 * par seau de rotation (voir plus bas), qui replie tout excédent sur une clé
 * `<overflow>` unique. Aucune combinaison d'en-têtes ne peut donc faire
 * grandir un seau au-delà de `maxKeysPerBucket + 1` entrées, quelle que soit
 * la dimension attaquée — c'est la garantie DEMANDÉE par le critère 1, pas
 * seulement une conséquence heureuse du gabarit.
 *
 * ## Fenêtre glissante — durée, granularité, et pourquoi
 *
 * `DEFAULT_WINDOW_MS` = 14 jours, `DEFAULT_BUCKET_MS` = 6 heures (56 seaux en
 * régime permanent). Deux choix distincts, deux raisons distinctes :
 *
 * - 14 jours parce qu'une fenêtre plus courte ne voit pas justement le cas
 *   que ce compteur existe pour voir : un utilisateur au rythme HEBDOMADAIRE
 *   (ouverture une fois par semaine — le cas d'un lien de profil partagé,
 *   cf. #4250) apparaît au moins deux fois dans une fenêtre de 14 jours quel
 *   que soit le moment où l'instantané est lu, jamais dans une fenêtre de 24h
 *   ou même 72h. Pas plus long : voir la limite de durabilité ci-dessous.
 * - 6 heures de granularité parce qu'une décision de RETRAIT DE ROUTE n'a
 *   besoin d'aucune résolution fine — « appelée il y a 3h ou il y a 9h »
 *   revient au même verdict — et une granularité plus grossière réduit le
 *   nombre de seaux à balayer sans réduire la fenêtre utile.
 *
 * `maxKeysPerBucket` = 4000 : borne empirique — le gateway déclare environ
 * 400 couples (méthode, route) au total (mesuré par grep sur
 * `routes/**`), et un parc de clients vivants porte rarement plus d'une
 * dizaine de versions concurrentes (release courante + quelques précédentes +
 * bêtas) — 400×10 = 4000 est donc la densité LÉGITIME attendue au pic, pas
 * une estimation d'attaque. Mémoire pire cas : 56 seaux × 4001 entrées ×
 * ~150 octets/entrée (clé courte + overhead de `Map`) ≈ 33 Mo — un plafond
 * dur qui exige un ABUS SOUTENU sur la fenêtre entière pour être atteint, très
 * au-dessus de la charge réelle mesurée en régime permanent (~400 clés par
 * seau × 56 seaux × 150 octets ≈ 3,4 Mo).
 *
 * ## Non-persistance — la limite qu'aucun réglage de fenêtre ne referme
 *
 * Cet agrégat vit EN MÉMOIRE du processus Node et disparaît à chaque
 * redémarrage/redéploiement du gateway. Ce n'est pas un détail d'implémentation
 * secondaire : un compteur à zéro peut vouloir dire « personne n'appelle plus
 * cette route » OU « le gateway a redémarré il y a moins de `windowMs` » — les
 * deux sont indiscernables depuis la seule lecture du compte. `coverageMs()`
 * rend cette limite OBSERVABLE plutôt que silencieuse : elle dit combien de
 * temps de trafic l'instantané reflète RÉELLEMENT, et un lecteur qui l'ignore
 * peut prendre un jeune redémarrage pour une preuve de route morte. Pousser la
 * fenêtre à 30 ou 60 jours ne referme pas cette limite — elle rendrait la
 * configuration malhonnête vis-à-vis d'un agrégat qui ne survit de toute façon
 * qu'entre deux redéploiements. Fermer ce point demande une persistance
 * (Redis, `prom-client` scrapé) : hors de portée de ce lot, voir le critère 5.
 */

/** Le corps d'une ligne du compte, tel que rendu par `snapshot()`. */
export type RouteUsageEntry = {
  readonly method: string;
  readonly route: string;
  readonly clientVersion: string;
  readonly count: number;
};

/**
 * L'entrée d'un hit, DÉCOUPLÉE de Fastify à dessein : `RouteUsageCounter` se
 * teste sans construire de fausse `FastifyRequest`, exactement comme
 * `BoundedTtlCache` ignore tout de ses appelants. `registerRouteUsageCounterHook`
 * (plus bas) est le seul point qui traduit une vraie requête vers cette forme.
 */
export type RouteUsageRecordInput = {
  readonly method: string;
  /** `request.routeOptions.url` — `undefined` sur une adresse inconnue (404). JAMAIS `request.url`. */
  readonly route: string | undefined;
  /** En-tête brut `x-app-version`, avant tout nettoyage. */
  readonly versionHeader: string | undefined;
  /** Horloge injectable pour les tests ; `Date.now()` par défaut. */
  readonly now?: number;
};

export type RouteUsageCounterOptions = {
  readonly windowMs?: number;
  readonly bucketMs?: number;
  readonly maxKeysPerBucket?: number;
};

const NO_ROUTE = '<no-route>';
const UNKNOWN_VERSION = 'unknown';
const OVERFLOW_KEY = '<overflow>';

// Séparateur non imprimable : aucune méthode HTTP ni aucun gabarit de route
// Fastify ne le contient, donc pas d'ambiguïté entre `GET /a` + `b` et
// `GET /a/b`. La clé n'est de toute façon jamais redécomposée ailleurs qu'ici
// (`splitAggregateKey`) — elle sert uniquement de clé de `Map`.
const KEY_SEP = '';

// Bornée AVANT même de lancer le motif : un en-tête de plusieurs Ko ne doit
// pas coûter un `RegExp.test` proportionnel à sa taille pour finir rejeté.
const MAX_VERSION_HEADER_LENGTH = 32;
// `x.y[.z[.w]]`, chaque segment 1 à 5 chiffres — couvre tout ce que
// `compareAppVersions` (`utils/appVersion.ts`) sait comparer, sans exiger un
// format sémantique strict : ce n'est qu'une étiquette d'agrégat, jamais
// comparée ni triée numériquement ici.
const VERSION_PATTERN = /^\d{1,5}(\.\d{1,5}){0,3}$/;

const DEFAULT_WINDOW_MS = 14 * 24 * 60 * 60 * 1000; // 14 jours
const DEFAULT_BUCKET_MS = 6 * 60 * 60 * 1000; // 6 heures — 56 seaux en régime permanent
const DEFAULT_MAX_KEYS_PER_BUCKET = 4000;

function sanitizeVersion(header: string | undefined): string {
  if (!header) return UNKNOWN_VERSION;
  if (header.length > MAX_VERSION_HEADER_LENGTH) return UNKNOWN_VERSION;
  return VERSION_PATTERN.test(header) ? header : UNKNOWN_VERSION;
}

function sanitizeRoute(route: string | undefined): string {
  return route && route.length > 0 ? route : NO_ROUTE;
}

function aggregateKey(method: string, route: string, version: string): string {
  return `${method}${KEY_SEP}${route}${KEY_SEP}${version}`;
}

function splitAggregateKey(key: string): { method: string; route: string; clientVersion: string } {
  const [method, route, clientVersion] = key.split(KEY_SEP);
  return { method, route, clientVersion };
}

/**
 * L'agrégat en mémoire — une `Map` de seaux de rotation, chaque seau une
 * `Map` de compte par clé. Pourquoi PAS `BoundedTtlCache`
 * (`utils/bounded-cache.ts`, à réutiliser en priorité par convention du
 * dépôt) : son TTL est ancré sur l'écriture — `set()` reporte `expiresAt` à
 * `maintenant + ttlMs` à CHAQUE appel, y compris une mise à jour d'une clé
 * déjà présente. Une clé comptée régulièrement ne serait alors JAMAIS purgée
 * (chaque hit repousse son expiration), ce qui donnerait un total CUMULÉ
 * depuis toujours pour toute route encore vivante — pas « le compte sur les
 * 14 derniers jours » que la fenêtre glissante promet. Un seau de rotation
 * doit expirer à une heure ANCRÉE SUR SON PROPRE DÉBUT, indépendamment du
 * nombre de fois où il a été écrit — `BoundedTtlCache` ne peut pas exprimer
 * ça sans détourner son contrat. La discipline « plafond dur + repli
 * déterministe sur dépassement » qu'elle incarne est en revanche reprise
 * telle quelle au niveau de CHAQUE seau via `maxKeysPerBucket`.
 */
export class RouteUsageCounter {
  private readonly windowMs: number;
  private readonly bucketMs: number;
  private readonly maxKeysPerBucket: number;
  private readonly buckets = new Map<number, Map<string, number>>();
  private sweepTimer: ReturnType<typeof setInterval> | null = null;

  constructor(options: RouteUsageCounterOptions = {}) {
    this.windowMs = options.windowMs ?? DEFAULT_WINDOW_MS;
    this.bucketMs = options.bucketMs ?? DEFAULT_BUCKET_MS;
    this.maxKeysPerBucket = options.maxKeysPerBucket ?? DEFAULT_MAX_KEYS_PER_BUCKET;
  }

  get windowMsValue(): number {
    return this.windowMs;
  }

  get bucketMsValue(): number {
    return this.bucketMs;
  }

  /** Nombre de seaux actuellement en mémoire (vivants ou pas encore balayés). */
  get bucketCount(): number {
    return this.buckets.size;
  }

  private oldestLiveBucketIndex(now: number): number {
    return Math.floor((now - this.windowMs) / this.bucketMs);
  }

  /**
   * Enregistre un hit. Chemin chaud : aucune écriture réseau, aucune
   * sérialisation — deux lectures de `Map`, une sanitation bornée, une
   * écriture de `Map`. Le seul coût variable est le balayage de purge
   * (`pruneExpiredBuckets`), et il ne s'exécute QUE quand un seau encore
   * jamais vu apparaît — au plus une fois toutes les `bucketMs`, jamais à
   * chaque requête (voir le critère 3, mesuré dans le banc du test).
   */
  record(input: RouteUsageRecordInput): void {
    const now = input.now ?? Date.now();
    const bucketIndex = Math.floor(now / this.bucketMs);

    let bucket = this.buckets.get(bucketIndex);
    if (!bucket) {
      this.pruneExpiredBuckets(now);
      bucket = new Map<string, number>();
      this.buckets.set(bucketIndex, bucket);
    }

    const route = sanitizeRoute(input.route);
    const version = sanitizeVersion(input.versionHeader);
    const key = aggregateKey(input.method, route, version);

    if (!bucket.has(key) && bucket.size >= this.maxKeysPerBucket) {
      // Plafond atteint PAR DES CLÉS DISTINCTES DÉJÀ ADMISES : une clé déjà
      // suivie continue de s'incrémenter normalement (branche au-dessus),
      // seule une clé JAMAIS vue dans ce seau est repliée ici. Le compte d'un
      // couple (méthode, route, version) déjà légitime n'est donc jamais
      // sous-compté par la présence d'un excédent adverse.
      bucket.set(OVERFLOW_KEY, (bucket.get(OVERFLOW_KEY) ?? 0) + 1);
      return;
    }
    bucket.set(key, (bucket.get(key) ?? 0) + 1);
  }

  /**
   * Le compte agrégé sur la fenêtre glissante, à l'instant `now`. Pure
   * lecture — ne mute jamais `buckets` (la purge est le rôle de
   * `pruneExpiredBuckets`, appelée depuis `record()` et depuis la sonde
   * périodique, jamais depuis une lecture admin).
   */
  snapshot(now: number = Date.now()): RouteUsageEntry[] {
    const cutoff = this.oldestLiveBucketIndex(now);
    const totals = new Map<string, number>();
    for (const [bucketIndex, bucket] of this.buckets) {
      if (bucketIndex < cutoff) continue;
      for (const [key, count] of bucket) {
        totals.set(key, (totals.get(key) ?? 0) + count);
      }
    }

    const entries: RouteUsageEntry[] = [];
    for (const [key, count] of totals) {
      if (key === OVERFLOW_KEY) {
        entries.push({ method: OVERFLOW_KEY, route: OVERFLOW_KEY, clientVersion: OVERFLOW_KEY, count });
        continue;
      }
      const { method, route, clientVersion } = splitAggregateKey(key);
      entries.push({ method, route, clientVersion, count });
    }

    // Tri croissant par compte d'abord : c'est la question que ce compteur
    // existe pour répondre (« qui est proche de zéro ? »), donc les
    // candidats au retrait remontent en tête sans post-traitement côté
    // lecteur. Puis un ordre stable (route/méthode/version) pour que deux
    // lectures successives sans changement rendent le même JSON.
    entries.sort((a, b) =>
      a.count - b.count ||
      a.route.localeCompare(b.route) ||
      a.method.localeCompare(b.method) ||
      a.clientVersion.localeCompare(b.clientVersion)
    );
    return entries;
  }

  /**
   * Combien de millisecondes de trafic RÉEL cet instantané reflète — au plus
   * `windowMs`, moins si le processus n'a pas encore vécu une fenêtre
   * entière. C'est la réponse OBSERVABLE à la limite de non-persistance
   * décrite en tête de fichier : un lecteur qui compare `coverageMs()` à
   * `windowMsValue` avant de conclure « route morte » ne peut pas confondre
   * un vrai zéro avec un gateway jeune.
   */
  coverageMs(now: number = Date.now()): number {
    const cutoff = this.oldestLiveBucketIndex(now);
    let oldest: number | null = null;
    for (const bucketIndex of this.buckets.keys()) {
      if (bucketIndex < cutoff) continue;
      if (oldest === null || bucketIndex < oldest) oldest = bucketIndex;
    }
    if (oldest === null) return 0;
    return Math.min(this.windowMs, now - oldest * this.bucketMs);
  }

  /** Vide tout seau dont la fenêtre est entièrement écoulée. Coût O(seaux vivants), une constante (≈56), jamais O(trafic). */
  pruneExpiredBuckets(now: number = Date.now()): void {
    const cutoff = this.oldestLiveBucketIndex(now);
    for (const bucketIndex of this.buckets.keys()) {
      if (bucketIndex < cutoff) this.buckets.delete(bucketIndex);
    }
  }

  /**
   * Démarre le vidage périodique (« agrégat en mémoire vidé périodiquement »,
   * critère 3). Cadencé sur `bucketMs` : un seau ne peut devenir périmé plus
   * vite que la largeur d'un seau, sonder plus souvent n'achèterait rien.
   * `.unref()` — idiome du dépôt (`StatusHandler.ts`, `CallEventsHandler.ts`)
   * — pour qu'un timer de housekeeping ne retienne jamais le process en vie
   * ni ne bloque la fermeture propre des tests.
   */
  startSweep(): void {
    if (this.sweepTimer) return;
    this.sweepTimer = setInterval(() => this.pruneExpiredBuckets(), this.bucketMs);
    if (typeof this.sweepTimer.unref === 'function') this.sweepTimer.unref();
  }

  stopSweep(): void {
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = null;
    }
  }

  /** Réservé aux tests — un compteur de production ne se vide jamais de force. */
  clear(): void {
    this.buckets.clear();
  }
}

/**
 * Le singleton par défaut. Comme `circuitBreakerManager`
 * (`utils/circuitBreaker.ts`, lu directement par `routes/health/index.ts`
 * sans injection) : le hook `onResponse` ci-dessous ÉCRIT dedans, la route
 * d'administration (`routes/admin/route-usage.ts`, hors territoire de ce
 * fichier) LIT depuis le même import — aucun câblage supplémentaire requis
 * une fois les deux montés dans le même process.
 */
export const routeUsageCounter = new RouteUsageCounter();

function readVersionHeader(request: FastifyRequest): string | undefined {
  const raw = request.headers['x-app-version'];
  // Un en-tête répété (tableau) n'est jamais envoyé par un client légitime —
  // c'est du bruit ou une tentative de contournement, réduit au même repli
  // `unknown` que toute valeur non conforme (`sanitizeVersion`).
  return typeof raw === 'string' ? raw : undefined;
}

/**
 * Le PLUGIN autonome — un `onResponse` (le point du cycle de vie Fastify où
 * la route a déjà été résolue ET où la réponse est déjà partie, donc jamais
 * sur le chemin critique de la latence perçue) qui compte, et un `onClose`
 * qui arrête le vidage périodique quand l'app se ferme. Autonome au sens où
 * il ne dépend d'aucun autre plugin déjà enregistré : `app.addHook` est la
 * SEULE capacité Fastify qu'il utilise, comme `registerClientMutationIdHook`
 * / `registerGlobalRateLimiter`
 * (`middleware/clientMutationId.ts`, `middleware/rate-limiter.ts`) — le
 * dépôt n'emploie nulle part le wrapper `fastify-plugin` (absent du
 * `package.json`) pour ce genre de hook global, donc cette fonction ne
 * l'introduit pas non plus.
 *
 * Non montée par ce lot (#4275, territoire strict) : voir
 * `edits_hors_territoire` dans le rapport de la session — le câblage réel
 * dans `server.ts` est un édit déclaré, pas appliqué ici.
 */
export function registerRouteUsageCounterHook(
  app: FastifyInstance,
  counter: RouteUsageCounter = routeUsageCounter
): void {
  counter.startSweep();

  app.addHook('onResponse', (request: FastifyRequest, _reply: FastifyReply, done: () => void) => {
    // Une instrumentation ne doit JAMAIS transformer une requête réussie en
    // échec : `record()` est déjà infaillible par construction (pas d'I/O,
    // pas d'exception attendue), mais le try/catch protège quand même contre
    // une régression future qui y ajouterait une opération qui peut lever —
    // le même réflexe défensif que les écouteurs Socket.IO du dépôt
    // (§ Async EventEmitter Hazard, CLAUDE.md).
    try {
      counter.record({
        method: request.method,
        route: request.routeOptions.url,
        versionHeader: readVersionHeader(request),
      });
    } catch {
      // Best-effort, jamais bloquant — un compteur cassé ne doit jamais
      // faire échouer la requête qu'il essayait de compter.
    }
    done();
  });

  app.addHook('onClose', (_instance: FastifyInstance, done: () => void) => {
    counter.stopSweep();
    done();
  });
}
