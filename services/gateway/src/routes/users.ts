/**
 * User routes - Refactored modular structure
 *
 * This file re-exports the main userRoutes function from the modular implementation.
 * The implementation has been split into focused modules:
 *
 * - types.ts: Type definitions and interfaces
 * - profile.ts: User profile management (get, update, password, avatar)
 * - preferences.ts: Dashboard stats, user stats, search
 * - devices.ts: Friend requests, affiliate tokens, admin stubs
 * - index.ts: Main route aggregation
 */

export { userRoutes } from './users/index';
