/**
 * Les adresses du groupe `rootLegacyVoice` du catalogue d'API Meeshy — GÉNÉRÉ, ne pas éditer à la main.
 *
 * Source : services/gateway/route-manifest.json. Régénérer après tout changement de route :
 *
 *   cd packages/shared && npm run api-endpoints:generate
 *
 * S'importe en espace de noms, ce qui laisse le bundler retirer chaque entrée non appelée :
 *
 *   import * as rootLegacyVoiceEndpoints from '@meeshy/shared/api/endpoints/root-legacy-voice';
 *
 * Les paramètres sont encodés ICI (encodeURIComponent) : passer la valeur brute.
 */

/** GET · POST /voice/analysis */
export const analysis = '/voice/analysis';
