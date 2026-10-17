import { emailLinkSecret, liftEmailLinkSecret } from '@/lib/links/email-link-secret';

/**
 * #10864 — ouvrir la page comme le fait un lien d'e-mail : jeton dans le
 * fragment, relevé dans l'entrée d'historique par le module de production.
 * `tokenInHistory()` lit ce qu'un retour arrière ou un rechargement relirait.
 */
export function arriveByEmailLink(path: string, token: string): void {
  window.history.replaceState(null, '', `${path}?via=email#token=${encodeURIComponent(token)}`);
  liftEmailLinkSecret(window);
}

export function tokenInHistory(): string | null {
  return emailLinkSecret(window).token ?? null;
}

export function leaveEmailLink(): void {
  window.history.replaceState(null, '', '/');
}
