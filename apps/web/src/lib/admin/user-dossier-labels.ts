import { translateAdminMaybe } from '@/lib/i18n-admin-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

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

export function securityEventLabel(eventType: string, language: InterfaceLanguage): string {
  const key = eventType.trim().toUpperCase();
  return translateAdminMaybe(language, `admin.people.secEvent.${key}`) ?? humanize(eventType);
}

/** Les types d'événements que la passerelle écrit aujourd'hui — chacun a son libellé (témoin). */
export const SECURITY_EVENT_TYPES = [
  'PASSWORD_RESET_REQUEST',
  'PASSWORD_RESET_SUCCESS',
  'PASSWORD_RESET_FAILED',
  'PASSWORD_RESET_UNVERIFIED_EMAIL',
  'PASSWORD_RESET_TOKEN_REUSE',
  'PASSWORD_RESET_REVOKED_TOKEN',
  'PASSWORD_RESET_INVALID_TOKEN',
  'PASSWORD_RESET_EXPIRED_TOKEN',
  'PASSWORD_RESET_LOCKED_ACCOUNT',
  'PASSWORD_RESET_ABUSE',
  'SUSPICIOUS_PASSWORD_RESET',
  'PASSWORD_CHANGE',
  'LOGIN_SUCCESS',
  'LOGIN_FAILED',
  'LOGIN_BLOCKED',
  'LOGOUT',
  'ACCOUNT_LOCKED',
  'ACCOUNT_UNLOCKED',
  'SESSION_CREATED',
  'SESSION_REVOKED',
  'SESSION_EXPIRED',
  'SESSION_TRUSTED',
  'TWO_FACTOR_ENABLED',
  'TWO_FACTOR_DISABLED',
  'TWO_FACTOR_SUCCESS',
  'TWO_FACTOR_FAILED',
  'TWO_FA_FAILED',
  'EMAIL_CHANGE',
  'PHONE_CHANGE',
  'PHONE_TRANSFERRED_OUT',
  'PHONE_TRANSFERRED_IN',
  'PHONE_TRANSFER_CODE_RESENT',
  'SUSPICIOUS_ACTIVITY',
  'RATE_LIMIT_EXCEEDED',
  'BRUTE_FORCE_DETECTED',
  'MAGIC_LINK_REQUESTED',
  'MAGIC_LINK_LOGIN_SUCCESS',
  'MAGIC_LINK_REUSE_ATTEMPT',
  'MAGIC_LINK_EXPIRED',
  'EMAIL_RELEASED_BY_CLAIM',
] as const;
