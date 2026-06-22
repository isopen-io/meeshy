/**
 * Clé de session anonyme pour le comptage des vues (v1 "comptage bête").
 * Réutilise le `session_token` d'un anonyme ayant déjà rejoint une conversation,
 * sinon génère + persiste un identifiant opaque par navigateur. Identifiant
 * FAIBLE (vidable, spoofable) — voir spec 2026-06-17 (§ Sécurité).
 */
const WEB_SESSION_KEY = 'meeshy_session_token';

export function getOrCreateWebSessionKey(): string {
  if (typeof window === 'undefined') return '';
  const existing = localStorage.getItem('session_token');
  if (existing) return existing;
  const stored = localStorage.getItem(WEB_SESSION_KEY);
  if (stored) return stored;
  const generated =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `web-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
  localStorage.setItem(WEB_SESSION_KEY, generated);
  return generated;
}
