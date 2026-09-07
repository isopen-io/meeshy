import { valeurDuCookie } from './cookies';

/**
 * L'IDENTITÉ D'APPAREIL DU PUSH WEB (#5391) — le site UNIQUE, le pendant push
 * de `guest-session.ts` : UNE écriture (le module de participation, au
 * premier abonnement, § 3.4 de la spécification), DEUX lectures (la porte de
 * `/notifications/preferences`, ce même module).
 *
 * POURQUOI UN COOKIE, PAS `localStorage` : `DELETE /api/v1/users/register-
 * device-token` (`services/gateway/src/routes/push-tokens.ts:264`) retire un
 * abonnement PAR `deviceId` — la porte doit connaître cette valeur SANS
 * JavaScript (le geste `valeur=false`, § 3.2) pour que « se désabonner »
 * marche par un `<form method="post">` nu. Un `localStorage` que seul le
 * navigateur lit n'atteindrait jamais la porte ; le cookie, lui, voyage dans
 * chaque requête.
 *
 * LE TOKEN FCM LUI-MÊME N'EST JAMAIS STOCKÉ ICI — ni en cookie, ni en
 * `localStorage` : le SERVEUR le connaît, indexé par `deviceId`
 * (`routes/push-tokens.ts:177-217`, upsert sur `(userId, token, type)` puis
 * bascule inactif tout autre token du même `deviceId`). Ce module ne porte
 * qu'un IDENTIFIANT D'APPAREIL opaque — jamais un secret, jamais le jeton
 * porteur du compte.
 */
export const COOKIE_DE_L_APPAREIL_PUSH = 'meeshy_v3_push_appareil';

const DUREE_DU_COOKIE_S = 60 * 60 * 24 * 365;

/**
 * La lecture — côté serveur depuis l'en-tête `Cookie` d'une `Request`, côté
 * navigateur depuis `document.cookie` : les deux ont la même forme
 * (`valeurDuCookie`, site unique de cette lecture dans la v3).
 */
export const lisLAppareilPush = (enteteCookie: string | null): string | null =>
  valeurDuCookie(enteteCookie, COOKIE_DE_L_APPAREIL_PUSH);

/**
 * Un identifiant d'appareil — UUID v4 quand `crypto.randomUUID` existe
 * (tout navigateur qui porte la Push API le porte aussi), un repli RFC4122
 * approximatif sinon : ni l'un ni l'autre n'est un secret, un identifiant de
 * SEGRÉGATION suffit (comme l'empreinte FNV-1a du travailleur de zone).
 */
const genereUnIdentifiant = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (motif) => {
    const alea = (Math.random() * 16) | 0;
    return (motif === 'x' ? alea : (alea & 0x3) | 0x8).toString(16);
  });
};

/**
 * LA POSE — idempotente : un appareil qui a déjà son identifiant le garde
 * (deux abonnements successifs sur le même navigateur restent le MÊME
 * `deviceId`, ce qui laisse l'upsert du serveur les fusionner plutôt que de
 * laisser un fantôme actif derrière). N'écrit JAMAIS `document.cookie`
 * hors navigateur — appelable en toute sécurité depuis un module qui
 * pourrait, un jour, être importé côté serveur par erreur de refactor.
 */
export const poseLAppareilPush = (options?: { readonly secure?: boolean }): string => {
  const existant = typeof document === 'undefined' ? null : lisLAppareilPush(document.cookie);
  if (existant !== null) return existant;

  const identifiant = genereUnIdentifiant();
  if (typeof document !== 'undefined') {
    const secure = options?.secure ?? document.location.protocol === 'https:';
    document.cookie = `${COOKIE_DE_L_APPAREIL_PUSH}=${encodeURIComponent(identifiant)};path=/;max-age=${DUREE_DU_COOKIE_S};samesite=lax${secure ? ';secure' : ''}`;
  }
  return identifiant;
};
