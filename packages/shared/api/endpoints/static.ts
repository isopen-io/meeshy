/**
 * Les adresses du groupe `static` du catalogue d'API Meeshy — GÉNÉRÉ, ne pas éditer à la main.
 *
 * Source : services/gateway/route-manifest.json. Régénérer après tout changement de route :
 *
 *   cd packages/shared && npm run api-endpoints:generate
 *
 * S'importe en espace de noms, ce qui laisse le bundler retirer chaque entrée non appelée :
 *
 *   import * as staticEndpoints from '@meeshy/shared/api/endpoints/static';
 *
 * Les paramètres sont encodés ICI (encodeURIComponent) : passer la valeur brute.
 */

/** GET /api/v1/static/:filename */
export const byFilename = (filename: string): string => `/api/v1/static/${encodeURIComponent(filename)}`;
