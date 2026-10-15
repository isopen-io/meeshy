import { apiConfig, type ApiConfig } from '@/lib/api/config';

import { webOriginOf } from './web-origin';

/**
 * L'ORIGINE PUBLIQUE DES LIENS PARTAGÉS (#10208) — la déclarée au démarrage
 * (`MEESHY_WEB_URL`), sinon celle que nomme la passerelle (`webOriginOf`),
 * sinon la page. Hors de `lib/api/config.ts` : seuls les écrans qui partagent
 * la chargent, jamais la première peinture.
 */
export function publicWebOriginOf(config: ApiConfig, pageOrigin: string): string {
  return config.webOrigin ?? webOriginOf(config.base, pageOrigin);
}

/** `publicWebOriginOf` contre la configuration de CE déploiement. */
export function publicWebOrigin(pageOrigin: string): string {
  return publicWebOriginOf(apiConfig, pageOrigin);
}
