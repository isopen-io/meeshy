/**
 * Les adresses du groupe `l` du catalogue d'API Meeshy — GÉNÉRÉ, ne pas éditer à la main.
 *
 * Source : services/gateway/route-manifest.json. Régénérer après tout changement de route :
 *
 *   cd packages/shared && npm run api-endpoints:generate
 *
 * S'importe en espace de noms, ce qui laisse le bundler retirer chaque entrée non appelée :
 *
 *   import * as lEndpoints from '@meeshy/shared/api/endpoints/l';
 *
 * Les paramètres sont encodés ICI (encodeURIComponent) : passer la valeur brute.
 */

/** GET /api/v1/l/:token */
export const byToken = (token: string): string => `/api/v1/l/${encodeURIComponent(token)}`;
