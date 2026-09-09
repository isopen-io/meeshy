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

const PRODUCTION_ORIGIN = 'https://gate.meeshy.me';
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
 * `staging.meeshy.me`, la console ne montrant que `/api/v1/auth/login … 405`.
 *
 * Le doc-comment d'origine assumait « servi par la même origine que la
 * passerelle en déploiement » — hypothèse jamais réalisée : ni `nginx.conf`,
 * ni le `Dockerfile`, ni le workflow ne l'ont câblée. Une hypothèse d'infra
 * qu'aucune infra ne tient est un défaut, pas un défaut de configuration.
 *
 * Une coque, elle, n'a jamais de proxy : `capacitor://localhost/api/v1` ne
 * mène nulle part, d'où le rejet d'une surcharge relative dans cette branche.
 */
function resolveBase(env: ApiEnv, { shell }: { readonly shell: boolean }): string {
  const override = env.VITE_API_BASE;
  if (override !== undefined && ABSOLUTE_ORIGIN_PATTERN.test(override.trim())) {
    return normalizeOrigin(override);
  }
  if (!shell) {
    if (override !== undefined) return normalizeOrigin(override);
    return env.DEV === true ? '' : PRODUCTION_ORIGIN;
  }
  return PRODUCTION_ORIGIN;
}

export function resolveApiConfig(env: ApiEnv, options: { readonly shell: boolean }): ApiConfig {
  return {
    base: resolveBase(env, options),
    source: resolveSource(env),
    readingModesEnabled: resolveReadingModes(env),
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
export const apiConfig: ApiConfig = resolveApiConfig(import.meta.env, { shell: __SHELL__ });
