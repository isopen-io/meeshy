/**
 * La loi « cette socket s'appuie-t-elle sur une session VIVANTE ? », isolée de
 * son appelant pour être lisible et testable seule.
 *
 * Une socket inscrite s'authentifie au JWT SEUL. Rien ne vérifiait que la
 * `UserSession` correspondante vivait encore : une appli installée avec un
 * jeton mort rouvre sa socket, `updateUserOnlineStatus` écrit alors
 * `User.lastActiveAt`, et une personne absente depuis des mois paraît présente
 * — ce qui la soustrait à la sélection de l'agent (#5712, #5703).
 *
 * Cas témoin mesuré le 2026-09-08 : `La_mignonne`, « active » il y a 148 min
 * avec deux sessions expirées depuis 62 jours et aucun message jamais envoyé.
 */

/** Le filtre d'une session utilisable : valide ET dans son échéance. */
export function liveSessionFilter(userId: string, sessionTokenHash: string) {
  return {
    userId,
    sessionToken: sessionTokenHash,
    isValid: true,
    // L'oubli que portaient déjà `extendSessionExpiry` et `_attachSessionId` :
    // 140 sessions expirées se déclaraient valides en production.
    expiresAt: { gt: new Date() },
  } as const;
}

/**
 * Le REFUS de connexion est-il armé ?
 *
 * Désarmé par défaut, et armé par la seule valeur exacte `'true'`. Ce chemin
 * porte TOUTES les connexions temps réel de la production : une variable
 * approximative (`'1'`, `'yes'`, une casse différente) qui l'armerait par
 * accident déconnecterait tout le monde. On s'arme sur un mot, pas sur une
 * intention devinée — et on se désarme sans redéploiement.
 */
export function requiresLiveSession(): boolean {
  return process.env.SOCKET_REQUIRES_LIVE_SESSION === 'true';
}
