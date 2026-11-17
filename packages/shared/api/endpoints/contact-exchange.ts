/**
 * Les adresses du groupe `contactExchange` du catalogue d'API Meeshy — GÉNÉRÉ, ne pas éditer à la main.
 *
 * Source : services/gateway/route-manifest.json. Régénérer après tout changement de route :
 *
 *   cd packages/shared && npm run api-endpoints:generate
 *
 * S'importe en espace de noms, ce qui laisse le bundler retirer chaque entrée non appelée :
 *
 *   import * as contactExchangeEndpoints from '@meeshy/shared/api/endpoints/contact-exchange';
 *
 * Les paramètres sont encodés ICI (encodeURIComponent) : passer la valeur brute.
 */

/** POST /api/v1/contact-exchange/:token/accept */
export const byTokenAccept = (token: string): string => `/api/v1/contact-exchange/${encodeURIComponent(token)}/accept`;
