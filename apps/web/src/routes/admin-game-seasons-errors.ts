import { seasonRefusalOf } from '@/lib/api/admin-game-seasons';
import type { ApiFailure } from '@/lib/api/http';
import { translateAdmin, type AdminLanguage } from '@/lib/i18n-admin-catalog';

/**
 * Un refus de la passerelle, LISIBLE (#10232) : 409 (la révision a bougé, la proposition est déjà traitée), 422 (la
 * loi des saisons refuse — chaque code a sa phrase), 502 / 503 (l'agent), ou le serveur injoignable. Un code que ce
 * client ne connaît pas se dit tel quel, jamais sous un « échec » muet.
 */
export function seasonFailureText(language: AdminLanguage, failure: ApiFailure): string {
  if (failure.status === 0) return translateAdmin(language, 'admin.gameSeasons.refusal.network');
  const code = seasonRefusalOf(failure);
  if (code !== null) return translateAdmin(language, `admin.gameSeasons.refusal.${code}`);
  return translateAdmin(language, 'admin.gameSeasons.refusal.unknown', { error: failure.error });
}

/**
 * Un défaut d'événement App Store : la passerelle dit soit un défaut de forme (texte du validateur, tel quel), soit
 * la raison pour laquelle la proposition ne donne aucun événement (un refus de la loi, ou `not-exportable`).
 */
export function appEventFaultText(language: AdminLanguage, fault: string): string {
  if (fault === 'not-exportable') return translateAdmin(language, 'admin.gameSeasons.event.notExportable');
  const code = seasonRefusalOf({ error: fault });
  return code === null ? fault : translateAdmin(language, `admin.gameSeasons.refusal.${code}`);
}
