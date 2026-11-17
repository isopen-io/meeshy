import { translateAdminMaybe, type AdminLanguage } from '@/lib/i18n-admin-catalog';

/**
 * **LES ÉVÉNEMENTS DE SÉCURITÉ, DITS EN MOTS** (#8876) — le journal de sécurité d'un
 * membre servait `eventType` tel quel (`LOGIN_FAILED`, `PASSWORD_RESET_TOKEN_REUSE`) :
 * un code d'infrastructure, pas une phrase. Chaque type connu a son libellé
 * (`admin.people.secEvent.<TYPE>`) ; un type que ce client ne connaît pas (un
 * événement plus récent que l'interface) retombe sur un libellé HUMANISÉ
 * (« Login failed »), jamais sur le code brut en capitales.
 */
function humanize(code: string): string {
  const words = code.replace(/[_-]+/g, ' ').trim().toLowerCase();
  return words === '' ? code : `${words.charAt(0).toUpperCase()}${words.slice(1)}`;
}

export function securityEventLabel(eventType: string, language: AdminLanguage): string {
  const key = eventType.trim().toUpperCase();
  return translateAdminMaybe(language, `admin.people.secEvent.${key}`) ?? humanize(eventType);
}
