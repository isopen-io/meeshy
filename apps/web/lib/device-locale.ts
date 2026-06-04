/**
 * Device Locale Helper — Plan B « Device Locale 4e priorité »
 *
 * Source navigateur de la locale appareil (RFC 5646) envoyée au gateway via
 * le header `X-Device-Locale`. Le gateway normalise ensuite vers un code ISO
 * 639-1 (`fr-FR` → `fr`) et persiste opportunément dans `User.deviceLocale`.
 *
 * Mirroir du contrat iOS (`Locale.current.identifier`) :
 *   - SSR (`window` indisponible) → retourne `null`
 *   - Browser sans `navigator.language` → retourne `null`
 *   - Browser standard → retourne la chaîne BCP 47 brute (`fr-FR`, `pt-BR`, …)
 *
 * @see services/gateway/src/middleware/deviceLocale.ts
 * @see docs/superpowers/specs/2026-05-26-device-locale-fourth-priority-design.md
 */

const DEVICE_LOCALE_HEADER = 'X-Device-Locale';

/**
 * Retourne l'identifiant de locale BCP 47 du navigateur courant, ou `null`
 * côté serveur / si l'API n'est pas disponible.
 */
export function getDeviceLocale(): string | null {
  if (typeof navigator === 'undefined') return null;
  const raw = navigator.language;
  if (typeof raw !== 'string' || raw.length === 0) return null;
  return raw;
}

/**
 * Construit le header `X-Device-Locale` à fusionner dans les requêtes HTTP
 * sortantes. Renvoie un objet vide en SSR pour rester silencieux quand le
 * navigateur n'est pas dispo.
 */
export function getDeviceLocaleHeaders(): Record<string, string> {
  const locale = getDeviceLocale();
  if (!locale) return {};
  return { [DEVICE_LOCALE_HEADER]: locale };
}

export { DEVICE_LOCALE_HEADER };
