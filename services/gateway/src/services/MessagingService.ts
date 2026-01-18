/**
 * Service de gestion des messages - Re-export for backward compatibility
 *
 * The original MessagingService has been refactored into a modular structure.
 * This file maintains backward compatibility by re-exporting the main service.
 *
 * New modular structure:
 * - MessagingService: Main orchestrator (357 lines)
 * - MessageValidator: Validation logic (315 lines)
 * - MessageProcessor: Processing logic (629 lines)
 *
 * @deprecated Import from './messaging/MessagingService' for new code
 */

export { MessagingService } from './messaging/MessagingService';
