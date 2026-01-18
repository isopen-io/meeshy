/**
 * User Features Routes - Entry Point
 *
 * Routes pour la gestion des fonctionnalités et consentements utilisateur (GDPR)
 *
 * Pattern: DateTime? != null signifie activé/consenti avec timestamp d'audit
 *
 * Routes:
 * - GET /user-features - Get complete feature status
 * - GET /user-features/validate/:feature - Validate if a feature can be used
 * - POST /user-features/:feature/enable - Enable a feature
 * - POST /user-features/:feature/disable - Disable a feature
 * - POST /user-features/consent/:consentType - Grant consent
 * - DELETE /user-features/consent/:consentType - Revoke consent
 * - GET /user-features/configuration - Get user configuration (language, formats, etc.)
 * - PUT /user-features/configuration - Update user configuration
 * - POST /user-features/age-verification - Verify user age
 * - GET /user-features/consents - Get all consent statuses
 *
 * @version 1.0.0
 */

import { FastifyInstance } from 'fastify';
import { registerFeatureManagementRoutes } from './features';
import { registerConsentsRoutes } from './consents';
import { registerConfigurationRoutes } from './configuration';

/**
 * Register all user features routes
 */
export default async function userFeaturesRoutes(fastify: FastifyInstance) {
  await Promise.all([
    registerFeatureManagementRoutes(fastify),
    registerConsentsRoutes(fastify),
    registerConfigurationRoutes(fastify)
  ]);
}

// Export types for external use
export type {
  FeatureParams,
  ConsentParams,
  ConfigurationBody,
  AgeVerificationBody
} from './types';

export {
  ACTIVATABLE_FEATURES,
  CONSENT_TYPES,
  featureStatusResponseSchema
} from './types';
