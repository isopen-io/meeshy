/**
 * Les adresses du groupe `statusMetrics` du catalogue d'API Meeshy — GÉNÉRÉ, ne pas éditer à la main.
 *
 * Source : services/gateway/route-manifest.json. Régénérer après tout changement de route :
 *
 *   cd packages/shared && npm run api-endpoints:generate
 *
 * S'importe en espace de noms, ce qui laisse le bundler retirer chaque entrée non appelée :
 *
 *   import * as statusMetricsEndpoints from '@meeshy/shared/api/endpoints/status-metrics';
 *
 * Les paramètres sont encodés ICI (encodeURIComponent) : passer la valeur brute.
 */

/** POST /api/v1/status-metrics/reset */
export const reset = '/api/v1/status-metrics/reset';

/** GET /api/v1/status-metrics */
export const root = '/api/v1/status-metrics';
