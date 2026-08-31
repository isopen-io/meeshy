/**
 * API Schemas - JSON Schema definitions for OpenAPI/Swagger documentation
 * SINGLE SOURCE OF TRUTH for API documentation schemas
 *
 * These schemas are used by:
 * - Gateway (Fastify Swagger routes)
 * - Frontend (API client validation)
 * - Any other service requiring API schema validation
 *
 * ## Façade de ré-export (#4635)
 *
 * Les schémas vivent dans `./api-schemas/`, un fichier par domaine. Ce module
 * garde son adresse et ré-exporte l’intégralité de leur surface : les 125
 * importeurs de `@meeshy/shared/types/api-schemas` sont inchangés, et
 * `route-manifest.json` régénéré depuis le serveur assemblé est identique à
 * l’octet près.
 *
 * L’ordre d’import n’est plus une contrainte de lignes : les schémas se
 * référencent d’un module à l’autre, et le graphe est un DAG dont
 * `./api-schemas/user.js` est le moyeu (aucune arête n’en revient).
 *
 * @module @meeshy/shared/types/api-schemas
 */

export * from './api-schemas/user.js';
export * from './api-schemas/session.js';
export * from './api-schemas/message-attachment.js';
export * from './api-schemas/message.js';
export * from './api-schemas/conversation.js';
export * from './api-schemas/conversation-request.js';
export * from './api-schemas/conversation-response.js';
export * from './api-schemas/auth.js';
export * from './api-schemas/reaction.js';
export * from './api-schemas/friend-request.js';
export * from './api-schemas/notification.js';
export * from './api-schemas/community.js';
export * from './api-schemas/call-session.js';
export * from './api-schemas/report.js';
export * from './api-schemas/audio-transcription.js';
export * from './api-schemas/audit.js';
export * from './api-schemas/affiliate.js';
export * from './api-schemas/anonymous-participant.js';
export * from './api-schemas/error.js';
export * from './api-schemas/signal.js';
export * from './api-schemas/type-exports.js';
