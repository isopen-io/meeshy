import { authManager } from '@/services/auth-manager.service';

/**
 * L'identifiant à présenter au gateway, et SOUS QUEL EN-TÊTE.
 *
 * Deux populations, deux protocoles : un inscrit s'annonce par
 * `Authorization: Bearer <JWT>`, un visiteur sans compte par
 * `X-Session-Token: <anon_…>`. Ce n'est pas un détail de transport — le gateway
 * lit les deux dans des middlewares différents.
 *
 * `ApiService.request` ne connaissait que le premier : il lisait le seul
 * emplacement du jeton de COMPTE et posait toujours un `Bearer`. Un visiteur
 * fraîchement entré par lien voyait donc tous ses appels partir sans
 * identifiant — ou, pire, avec le résidu d'un ancien jeton que le serveur
 * refuse (« Invalid JWT token », observé en production le 2026-08-18, sept
 * secondes avant que son join ne réussisse pourtant côté serveur).
 *
 * D'où le contournement qui s'était installé : trois sites d'appel posaient
 * l'en-tête à la main. Ce qui marchait était exactement ce qui y avait pensé.
 */
export type RequestCredential = {
  readonly header: 'Authorization' | 'X-Session-Token';
  readonly value: string;
};

/**
 * Les deux lectures passent par `authManager`, jamais par `localStorage` en
 * direct. Un second lecteur du même état est précisément ce qui a produit ce
 * défaut : `token-utils` connaissait la règle, `ApiService` en appliquait une
 * autre. On n'en ajoute pas un troisième.
 *
 * `getAnonymousSession()` filtre déjà les sessions expirées — une session
 * périmée présentée au serveur ferait répondre « refusé » là où la vraie cause
 * est « expiré ».
 */
export function resolveRequestCredential(): RequestCredential | null {
  if (typeof window === 'undefined') return null;

  // Le COMPTE prime : quelqu'un de connecté qui garde une session invitée
  // dormante reste lui-même. Même ordre que `token-utils.getAuthToken()`.
  const authToken = authManager.getAuthToken();
  if (authToken) {
    return { header: 'Authorization', value: `Bearer ${authToken}` };
  }

  const anonymousToken = authManager.getAnonymousSession()?.token;
  if (anonymousToken) {
    return { header: 'X-Session-Token', value: anonymousToken };
  }

  return null;
}

/**
 * Ce navigateur porte-t-il un identifiant de COMPTE ?
 *
 * `isAuthenticated` du store ne répond pas à cette question : il dit « une
 * identité existe », et une session invitée en est une. Les ressources réservées
 * aux titulaires de compte — la boîte de notifications en premier lieu — se
 * gardent sur CETTE réponse, jamais sur l'autre.
 *
 * `setAnonymousSession` efface `AUTH_TOKEN` en ouvrant sa session : les deux
 * identifiants ne coexistent jamais, et l'en-tête résolu suffit à trancher.
 */
export function hasAccountCredential(): boolean {
  return resolveRequestCredential()?.header === 'Authorization';
}
