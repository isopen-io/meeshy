/**
 * La garde de démarrage PARTAGÉE pour un secret critique (#3623).
 *
 * Extraite du modèle `TURNCredentialService` (constructeur, § garde de
 * sécurité) : en production/staging, un secret ABSENT, égal au défaut public
 * COMMITTÉ, ou trop court fait REFUSER le démarrage plutôt que d'armer
 * silencieusement une valeur devinable. En dev/test, la valeur par défaut est
 * tolérée avec un avertissement — jamais une erreur, pour ne pas bloquer un
 * environnement local ou un conteneur CI qui n'a jamais eu besoin d'en définir
 * un.
 *
 * `JWT_SECRET` portait SEPT exemplaires divergents du même repli faible avant
 * ce lot — six sur `'meeshy-secret-key-dev'`, un (`InitService.ts`) sur
 * `'default-jwt-secret'`. Cette DEUXIÈME valeur n'était pas seulement une
 * dette de duplication : un déploiement dev/test sans `JWT_SECRET` signait les
 * jetons `AuthService` (construit par `InitService`) avec un secret différent
 * de celui que `login.ts`/`AuthHandler`/`MagicLinkService` utilisent pour les
 * valider — une divergence purement accidentelle, invisible tant que
 * `JWT_SECRET` est défini (le cas de production), et qui n'était jamais
 * exercée en dev par hasard plutôt que par garde.
 */
import { logger } from './logger';

const isProductionOrStaging = (): boolean => {
  const normalized = (process.env.NODE_ENV ?? 'development').trim().toLowerCase();
  return normalized === 'production' || normalized === 'staging';
};

export interface StrongSecretOptions {
  /** Nom de la variable d'environnement (utilisé dans les messages d'erreur). */
  readonly envVar: string;
  /** Valeur par défaut committée dans le dépôt — jamais utilisable en prod/staging. */
  readonly insecureDefault: string;
  /** Longueur minimale exigée en production/staging. */
  readonly minLength: number;
}

/**
 * Résout un secret critique selon la règle du modèle `TURNCredentialService` :
 * lève en production/staging si absent, égal au défaut committé, ou trop
 * court ; retombe sur le défaut (avec avertissement) en dev/test.
 */
export function requireStrongSecret(options: StrongSecretOptions): string {
  const { envVar, insecureDefault, minLength } = options;
  const envValue = process.env[envVar];

  if (isProductionOrStaging()) {
    if (!envValue || envValue === insecureDefault) {
      throw new Error(
        `[SECURITY] ${envVar} environment variable must be set to a strong, ` +
        'non-default value in production/staging. The committed default ' +
        'cannot be used because it is public.'
      );
    }
    if (envValue.length < minLength) {
      throw new Error(
        `[SECURITY] ${envVar} must be at least ${minLength} characters in ` +
        'production/staging to provide adequate entropy. Generate with: ' +
        `openssl rand -hex ${minLength}`
      );
    }
    return envValue;
  }

  const value = envValue || insecureDefault;
  if (value === insecureDefault) {
    logger.warn(`⚠️ [SECURITY] Using committed default ${envVar} — DEV/LOCAL ONLY.`);
  } else if (value.length < minLength) {
    logger.warn(
      `⚠️ [SECURITY] Custom ${envVar} is shorter than ${minLength} characters — fine for ` +
      'local dev, but do not reuse it in a shared or staging environment.'
    );
  }
  return value;
}

/** Le défaut committé historique de `JWT_SECRET` — DEV/LOCAL uniquement. */
export const JWT_SECRET_DEV_DEFAULT = 'meeshy-secret-key-dev';

/**
 * Source UNIQUE de `JWT_SECRET` pour tout le gateway (#3623) — jamais
 * `process.env.JWT_SECRET || 'meeshy-secret-key-dev'` recopié au site d'appel.
 */
export const getJwtSecret = (): string =>
  requireStrongSecret({
    envVar: 'JWT_SECRET',
    insecureDefault: JWT_SECRET_DEV_DEFAULT,
    minLength: 32
  });
