import { logger } from '../../utils/logger';

/**
 * Un rappel enregistré (diffuseur, finaliseur) appelé SANS être attendu : ni
 * son rejet ni une exception synchrone n'atteignent l'appelant, qui a déjà
 * commis son écriture — l'échec se lit dans le journal.
 */
export function fireAndForget(run: () => unknown, label: string, callId: string): void {
  try {
    Promise.resolve(run()).catch((error: unknown) => {
      logger.warn(`${label} failed`, { callId, error });
    });
  } catch (error) {
    logger.warn(`${label} failed synchronously`, { callId, error });
  }
}
