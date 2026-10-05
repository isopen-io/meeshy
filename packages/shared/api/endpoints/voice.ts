/**
 * Les adresses du groupe `voice` du catalogue d'API Meeshy — GÉNÉRÉ, ne pas éditer à la main.
 *
 * Source : services/gateway/route-manifest.json. Régénérer après tout changement de route :
 *
 *   cd packages/shared && npm run api-endpoints:generate
 *
 * S'importe en espace de noms, ce qui laisse le bundler retirer chaque entrée non appelée :
 *
 *   import * as voiceEndpoints from '@meeshy/shared/api/endpoints/voice';
 *
 * Les paramètres sont encodés ICI (encodeURIComponent) : passer la valeur brute.
 */

/** GET /api/v1/voice/admin/metrics */
export const adminMetrics = '/api/v1/voice/admin/metrics';

/** GET · POST /api/v1/voice/analysis */
export const analysis = '/api/v1/voice/analysis';

/** POST /api/v1/voice/analyze */
export const analyze = '/api/v1/voice/analyze';

/** POST /api/v1/voice/compare */
export const compare = '/api/v1/voice/compare';

/** POST /api/v1/voice/feedback */
export const feedback = '/api/v1/voice/feedback';

/** GET /api/v1/voice/history */
export const history = '/api/v1/voice/history';

/** GET · DELETE /api/v1/voice/job/:jobId */
export const jobByJobId = (jobId: string): string => `/api/v1/voice/job/${encodeURIComponent(jobId)}`;

/** GET /api/v1/voice/languages */
export const languages = '/api/v1/voice/languages';

/** GET · DELETE /api/v1/voice/profile */
export const profile = '/api/v1/voice/profile';

/** PUT /api/v1/voice/profile/:profileId */
export const profileByProfileId = (profileId: string): string => `/api/v1/voice/profile/${encodeURIComponent(profileId)}`;

/** GET · POST /api/v1/voice/profile/consent */
export const profileConsent = '/api/v1/voice/profile/consent';

/** POST /api/v1/voice/profile/register */
export const profileRegister = '/api/v1/voice/profile/register';

/** POST /api/v1/voice/transcribe */
export const transcribe = '/api/v1/voice/transcribe';

/** POST /api/v1/voice/translate */
export const translate = '/api/v1/voice/translate';

/** POST /api/v1/voice/translate/async */
export const translateAsync = '/api/v1/voice/translate/async';
