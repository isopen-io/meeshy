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
 * document web PEUT — proxé en dev (`vite.config.ts` § `server.proxy`),
 * servi par la même origine que la passerelle en déploiement. `base: ''`
 * n'est donc PAS une erreur de config : c'est le défaut du web nu.
 */

/** Le CHOIX de source de données — jamais lu ailleurs qu'ici et par les
 * consommateurs de `apiConfig.source`. */
export type DataSource = 'fixtures' | 'gateway';

export type ApiConfig = {
  readonly base: string;
  readonly source: DataSource;
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
  readonly VITE_API_BASE?: string;
  readonly VITE_DATA_SOURCE?: string;
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
 * La base — FAIL-CLOSED en coque : une surcharge relative n'y mène nulle
 * part (miroir `MeeshyConfig.swift:6`, où le défaut est toujours une origine
 * absolue), et une erreur de configuration doit rendre un défaut qui
 * FONCTIONNE plutôt qu'une base cassée.
 */
function resolveBase(env: ApiEnv, { shell }: { readonly shell: boolean }): string {
  const override = env.VITE_API_BASE;
  if (!shell) {
    return override === undefined ? '' : normalizeOrigin(override);
  }
  if (override !== undefined && ABSOLUTE_ORIGIN_PATTERN.test(override.trim())) {
    return normalizeOrigin(override);
  }
  return PRODUCTION_ORIGIN;
}

export function resolveApiConfig(env: ApiEnv, options: { readonly shell: boolean }): ApiConfig {
  return { base: resolveBase(env, options), source: resolveSource(env) };
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
