/**
 * Les adresses du groupe `health` du catalogue d'API Meeshy — GÉNÉRÉ, ne pas éditer à la main.
 *
 * Source : services/gateway/route-manifest.json. Régénérer après tout changement de route :
 *
 *   cd packages/shared && npm run api-endpoints:generate
 *
 * S'importe en espace de noms, ce qui laisse le bundler retirer chaque entrée non appelée :
 *
 *   import * as healthEndpoints from '@meeshy/shared/api/endpoints/health';
 *
 * Les paramètres sont encodés ICI (encodeURIComponent) : passer la valeur brute.
 */

/** GET /api/v1/health/circuit-breakers */
export const circuitBreakers = '/api/v1/health/circuit-breakers';

/** GET /api/v1/health/metrics */
export const metrics = '/api/v1/health/metrics';

/** GET /api/v1/health/ready */
export const ready = '/api/v1/health/ready';

/** GET /health */
export const root = '/health';
