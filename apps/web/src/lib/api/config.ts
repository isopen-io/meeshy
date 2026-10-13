/**
 * LA BASE D'API — UNE SEULE SOURCE (#5605, D-1/D-4 étendus à l'infra).
 *
 * Miroir de `MeeshyConfig.swift` (`packages/MeeshySDK/…/Configuration/`) :
 * un défaut qui marche TOUJOURS — la PRODUCTION, jamais le staging — et une
 * surcharge explicite. iOS choisit l'environnement à l'exécution
 * (`UserDefaults`, un écran de réglage) ; le web n'a pas cet écran, donc la
 * surcharge vient de l'ENVIRONNEMENT DE CONSTRUCTION (`import.meta.env`,
 * `VITE_API_BASE` / `VITE_DATA_SOURCE`) — une décision figée au déploiement,
 * jamais relue à l'exécution.
 *
 * DEPUIS #10208, L'ORIGINE SE DÉCLARE AU DÉMARRAGE DU CONTENEUR, PAS AU BUILD.
 * Une origine figée au build interdisait de promouvoir en production l'image
 * recettée sur le staging (#9325), et d'installer Meeshy sur site sans le
 * reconstruire. L'entrypoint de l'image (`docker/runtime-config.sh`) écrit
 * `/config.js` depuis `MEESHY_API_URL` / `MEESHY_WEB_URL`, chargé avant le
 * bundle ; sans déclaration, l'origine se DÉRIVE de l'hôte qui sert la page.
 * Ordre, du plus explicite au plus implicite : exécution → build → proxy de
 * dev → hôte de la page → production.
 *
 * `resolveApiConfig` est PURE et prend l'environnement en paramètre : c'est
 * ce qui la rend testable sans construire (motif `cors-origins.ts:70`,
 * `resolveAllowedOrigins(env)`). `apiConfig`, plus bas, est l'UNIQUE
 * évaluation contre le vrai `import.meta.env` — tout consommateur importe
 * cette constante, personne ne relit `import.meta.env` ailleurs : c'est la
 * ligne que les 40+ écrans à venir copieront, elle doit être juste
 * maintenant (directive porteur 2026-09-07 soir, § 7).
 *
 * LE CAS QUE iOS N'A PAS : la base RELATIVE. Une coque native ne peut pas
 * résoudre `/api/v1` (`capacitor://localhost/api/v1` ne mène nulle part), un
 * document web PEUT — mais SEULEMENT derrière un proxy. En dev,
 * `vite.config.ts` (§ `server.proxy`) en fournit un ; en déploiement, AUCUN
 * (`nginx.conf` n'a pas de `location /api`). `base: ''` est donc le défaut du
 * web nu EN DÉVELOPPEMENT, et une base cassée partout ailleurs — c'est ce qui
 * a coupé la connexion sur `staging.meeshy.me` le 2026-09-09 (#5872).
 */

import { PRODUCTION_ORIGIN } from './production-origin';

/** Le CHOIX de source de données — jamais lu ailleurs qu'ici et par les
 * consommateurs de `apiConfig.source`. */
export type DataSource = 'fixtures' | 'gateway';

export type ApiConfig = {
  readonly base: string;
  readonly source: DataSource;
  /**
   * LES MODES DE LECTURE DU FIL — paramètre de CONSTRUCTION, jamais un toggle
   * utilisateur ni un programme bêta (la v3.1 n'a ni l'un ni l'autre, D-20).
   * Miroir de `MEESHY_FLAG_READING_MODES` (`LentilleFeatureFlag.swift:82-90`) :
   * `true` par défaut (D-7, le fil s'ouvre en Focal ; D-20), figé au
   * déploiement par `VITE_READING_MODES`. Il ne gouverne QUE le fil : la liste
   * Lentille (D-9) n'a aucun paramètre, elle est la seule peau. Consommé comme `isFlagEnabled` par
   * `resolveOrchestratorDecision` (`packages/shared/utils/reading-modes.ts`) —
   * drapeau éteint ⇒ `bubbles`/`flag-disabled`, JAMAIS clampé, prioritaire
   * sur tout choix collant.
   */
  readonly readingModesEnabled: boolean;
  /**
   * L'origine PUBLIQUE du site, quand le déploiement la déclare
   * (`MEESHY_WEB_URL`) — celle des liens partagés. `null` : elle se déduit de
   * la passerelle ou de la page (`publicWebOrigin`).
   */
  readonly webOrigin: string | null;
};

/**
 * Ce que l'entrypoint du conteneur pose dans `window.__MEESHY_RUNTIME__`
 * (`public/config.js`, réécrit au démarrage). Donnée NON FIABLE par principe :
 * chaque champ est relu et validé ici, jamais cru sur sa forme.
 */
export type RuntimeConfig = {
  readonly apiUrl?: unknown;
  readonly webUrl?: unknown;
};

/** L'hôte qui sert la page — `window.location`, réduit à ce que la dérivation lit. */
export type PageLocation = {
  readonly protocol: string;
  readonly hostname: string;
  readonly port: string;
};

export type ResolveOptions = {
  readonly shell: boolean;
  readonly runtime?: RuntimeConfig | undefined;
  readonly page?: PageLocation | undefined;
};

/**
 * La forme réduite de `ImportMetaEnv` que cette règle lit — jamais le type
 * complet de Vite : ça la rendrait dépendante d'un contexte de construction
 * pour être appelée depuis un témoin.
 */
export type ApiEnv = {
  // L'index signature évite le piège du « weak type » TypeScript : sans elle,
  // `ImportMetaEnv` (`vite/client`, elle-même `Record<string, any>` étendu de
  // `BASE_URL`/`MODE`/`DEV`/`PROD`/`SSR`) n'a « aucune propriété en commun »
  // avec un type qui ne déclarerait QUE des champs optionnels — TS2559, alors
  // que la forme réelle EST compatible via l'index signature de la source.
  readonly [key: string]: unknown;
  /** `import.meta.env.DEV` — posé par Vite. SEUL mode où `/api/v1` est proxé. */
  readonly DEV?: boolean;
  readonly VITE_API_BASE?: string;
  readonly VITE_DATA_SOURCE?: string;
  readonly VITE_READING_MODES?: string;
};

export { PRODUCTION_ORIGIN };
const API_PREFIX_PATTERN = /\/api\/v1\/?$/;
const ABSOLUTE_ORIGIN_PATTERN = /^https?:\/\//i;

/**
 * Normalise une origine déclarée : barre finale retirée, `/api/v1`
 * SURNUMÉRAIRE retiré (les ports existants portent déjà le préfixe dans
 * leur `path`, `transport.ts` § doc-comment — une seule écriture du préfixe
 * dans le dépôt).
 */
function normalizeOrigin(raw: string): string {
  return raw.trim().replace(API_PREFIX_PATTERN, '').replace(/\/+$/, '');
}

function resolveSource(env: ApiEnv): DataSource {
  return env.VITE_DATA_SOURCE === 'gateway' ? 'gateway' : 'fixtures';
}

/**
 * `'off'` DÉSACTIVE, tout le reste (absent, `'on'`, ou une valeur qui n'aurait
 * pas dû franchir la garde de construction) ACTIVE — la garde de
 * `vite.config.ts` (§ `VITE_READING_MODES`) fait déjà échouer la
 * construction sur une valeur ni `'on'` ni `'off'` ni absente ; cette
 * fonction n'a donc qu'UN comparateur à tenir, jamais une re-validation.
 */
function resolveReadingModes(env: ApiEnv): boolean {
  return env.VITE_READING_MODES !== 'off';
}

/**
 * **Une chaîne VIDE n'est pas une origine déclarée — elle est une ABSENCE.**
 *
 * Un `ARG VITE_API_BASE=""` non renseigné au `docker build` pose la variable à
 * la chaîne vide, et Vite l'expose telle quelle : sans cette normalisation,
 * `override !== undefined` serait vrai et la base retomberait à `''`, soit
 * exactement le défaut que #5872 corrige — réintroduit par le mécanisme censé
 * le corriger. Le même raisonnement vaut pour une valeur blanche.
 */
function declaredOverride(env: ApiEnv): string | undefined {
  const brut = env.VITE_API_BASE?.trim();
  return brut === undefined || brut === '' ? undefined : brut;
}

/**
 * La base — FAIL-CLOSED PARTOUT : une erreur de configuration doit rendre un
 * défaut qui FONCTIONNE plutôt qu'une base cassée (miroir
 * `MeeshyConfig.swift:6`, où le défaut est toujours une origine absolue).
 *
 * **La base relative n'est valide que là où un proxy la rend valide (#5872).**
 * En DEV, `vite.config.ts` (§ `server.proxy`) relaie `/api/v1` vers la
 * passerelle : `''` y désigne bien l'API, et c'est le seul endroit. En
 * PRODUCTION il n'y a aucun proxy — `nginx.conf` n'a pas de `location /api` —
 * donc `''` désigne le serveur de FICHIERS STATIQUES, qui répond **405** à un
 * POST. Mesuré le 2026-09-09 : plus personne ne pouvait se connecter depuis
 * `staging.meeshy.me`, la console ne montrant que `auth.login … 405`.
 *
 * Le doc-comment d'origine assumait « servi par la même origine que la
 * passerelle en déploiement » — hypothèse jamais réalisée : ni `nginx.conf`,
 * ni le `Dockerfile`, ni le workflow ne l'ont câblée. Une hypothèse d'infra
 * qu'aucune infra ne tient est un défaut, pas un défaut de configuration.
 *
 * Une coque, elle, n'a jamais de proxy : `capacitor://localhost/api/v1` ne
 * mène nulle part, d'où le rejet d'une surcharge relative dans cette branche.
 */
function resolveBase(env: ApiEnv, { shell, runtime, page }: ResolveOptions): string {
  const declared = shell ? undefined : runtimeOrigin(runtime?.apiUrl);
  if (declared !== undefined) return declared;
  const override = declaredOverride(env);
  if (override !== undefined && ABSOLUTE_ORIGIN_PATTERN.test(override)) {
    return normalizeOrigin(override);
  }
  if (!shell) {
    if (override !== undefined) return normalizeOrigin(override);
    if (env.DEV === true) return '';
    return page === undefined ? PRODUCTION_ORIGIN : (gatewayOfPage(page) ?? PRODUCTION_ORIGIN);
  }
  return PRODUCTION_ORIGIN;
}

/**
 * Une origine déclarée au démarrage — la MÊME grammaire que l'entrypoint
 * (`docker/runtime-config.sh`, `is_origin`) : `http(s)://hôte[:port][/chemin]`,
 * sans identifiants, requête ni guillemet. Une valeur malformée est ignorée,
 * jamais réparée : l'entrypoint refuse déjà de démarrer sur elle, ce filtre ne
 * sert que le cas où `config.js` aurait été écrit à la main.
 */
const DECLARED_ORIGIN_PATTERN = /^https?:\/\/([a-z0-9]([a-z0-9.-]*[a-z0-9])?|\[[0-9a-f:.]+\])(:\d{1,5})?(\/[\w.~/-]*)?$/i;

function runtimeOrigin(raw: unknown): string | undefined {
  const value = typeof raw === 'string' ? raw.trim() : '';
  return DECLARED_ORIGIN_PATTERN.test(value) ? normalizeOrigin(value) : undefined;
}

const IPV4_PATTERN = /^\d{1,3}(\.\d{1,3}){3}$/;
/** Le port par défaut de la passerelle (`services/gateway`, `PORT=3000`). */
const GATEWAY_DEFAULT_PORT = '3000';

/**
 * LA PASSERELLE DÉDUITE DE L'HÔTE DE LA PAGE — la convention de tous les
 * déploiements Meeshy : le site sur `H`, la passerelle sur `gate.H`
 * (`meeshy.me` → `gate.meeshy.me`, `staging.meeshy.me` →
 * `gate.staging.meeshy.me`, `chat.acme.fr:8443` → `gate.chat.acme.fr:8443`).
 * `www.` désigne le même site. Une IP, `localhost` ou un nom sans point n'a
 * pas de sous-domaine : la passerelle y est attendue sur le même hôte, à son
 * port par défaut. Un déploiement qui ne suit pas la convention déclare
 * `MEESHY_API_URL` — c'est la règle, la dérivation n'est que le défaut.
 */
function gatewayOfPage({ protocol, hostname, port }: PageLocation): string | null {
  if (protocol !== 'http:' && protocol !== 'https:') return null;
  const host = hostname.toLowerCase().replace(/^www\./, '');
  if (host === '') return null;
  const bare = host === 'localhost' || IPV4_PATTERN.test(host) || host.startsWith('[') || !host.includes('.');
  if (bare) return `${protocol}//${hostname}:${GATEWAY_DEFAULT_PORT}`;
  return `${protocol}//gate.${host}${port === '' ? '' : `:${port}`}`;
}

export function resolveApiConfig(env: ApiEnv, options: ResolveOptions): ApiConfig {
  return {
    base: resolveBase(env, options),
    source: resolveSource(env),
    readingModesEnabled: resolveReadingModes(env),
    webOrigin: options.shell ? null : (runtimeOrigin(options.runtime?.webUrl) ?? null),
  };
}


/**
 * `__SHELL__` — littéral de construction posé par `vite.config.ts` (même
 * mécanique que `__BENCH__`) : `true` sous `MEESHY_TARGET=capacitor`, `false`
 * sinon.
 *
 * Cette ligne s'évalue au niveau MODULE, donc à l'IMPORT — y compris quand un
 * témoin n'importe que `resolveApiConfig` : en JavaScript, importer un export
 * exécute tout le module. Sous `bun test`, où aucun remplacement de
 * construction n'a lieu, la constante est fournie par `bunfig.toml`
 * (`[define]`), avec la valeur du build NORMAL. Ne pas compter sur un import
 * « partiel » pour l'éviter : il n'existe pas.
 */
export const apiConfig: ApiConfig = resolveApiConfig(import.meta.env, {
  shell: __SHELL__,
  runtime: (globalThis as { __MEESHY_RUNTIME__?: RuntimeConfig }).__MEESHY_RUNTIME__,
  page: typeof window === 'undefined' ? undefined : window.location,
});
