import type { MagicLinkRequestResponse } from '@/services/magic-link.service';

export type MagicLinkRequestOutcome = { kind: 'sent' } | { kind: 'rate-limited' };

/**
 * Décide l'UI à afficher après une demande de magic link, sans jamais
 * révéler si l'adresse existe (#6665) : seul un refus par débit
 * (`code: 'RATE_LIMITED'`, distinct du message humain porté par `error`)
 * se distingue du succès — toute autre erreur (adresse inconnue,
 * validation serveur) se lit comme un envoi.
 */
export function resolveMagicLinkRequestOutcome(
  response: MagicLinkRequestResponse
): MagicLinkRequestOutcome {
  if (!response.success && response.code === 'RATE_LIMITED') {
    return { kind: 'rate-limited' };
  }
  return { kind: 'sent' };
}
