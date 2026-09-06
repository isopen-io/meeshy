/**
 * LE SIGNAL DE DÉCONNEXION (#5095) — le CONTRAT entre le navigateur
 * (`lib/realtime/deconnexion.ts`, qui poste ce message à chaque registration
 * active) et le travailleur de zone (`lib/sw/travailleur.js`, du JS PLAT sans
 * import : il porte le LITTÉRAL). Le lien entre les deux n'est pas un grep,
 * c'est l'EXÉCUTION — `__tests__/sw-zone.test.ts` importe cette constante et
 * dispatche avec elle : si les deux chaînes divergent, le témoin rougit.
 */
export const SIGNAL_DE_DECONNEXION = 'meeshy-v3:deconnexion';

/**
 * LE DRAPEAU DE ROTATION PUSH (#5391, suivi de revue) — le SECOND contrat
 * entre le travailleur (qui reçoit `pushsubscriptionchange`, un événement
 * livré au WORKER, jamais à une page qui peut être fermée) et le navigateur
 * (`lib/realtime/push-abonnement.ts`, qui relit ce drapeau à chaque
 * chargement de `/notifications/preferences` et rejoue l'abonnement s'il est
 * posé). Le worker ne peut pas rejouer la danse REST lui-même : la
 * configuration Firebase (`data-firebase-*`) vit sur le DOCUMENT, jamais
 * dans ce fichier plat — le Cache Storage est le seul canal qui survit entre
 * les deux, MÊME nom que `SIGNAL_DE_DECONNEXION` ci-dessus : le worker porte
 * le LITTÉRAL, `__tests__/sw-zone.test.ts` l'EXÉCUTE contre cette constante.
 *
 * `CACHE_DE_ROTATION_PUSH` est un nom STABLE, hors du cycle de version du
 * cache principal (`CACHE_NAME` porte l'empreinte du worker) : le nettoyage
 * `activate` l'EXEMPTE explicitement, sans quoi chaque déploiement effacerait
 * un drapeau posé entre deux mises à jour. La purge de déconnexion (#5095),
 * elle, l'efface comme le reste du namespace — un lecteur qui se déconnecte
 * n'a plus besoin d'être réabonné.
 */
export const CACHE_DE_ROTATION_PUSH = 'meeshy-v3-sw-push-rotation';
export const CLE_DE_ROTATION_PUSH = '/__v3/signal-rotation-push';

/**
 * LE CONTEXTE DURABLE DE L'ABONNEMENT (#5391, suivi de revue défaut 3) —
 * TROISIÈME entrée du MÊME cache que le drapeau ci-dessus : la configuration
 * Firebase (publique, § 3.4 de la spécification) et l'état « abonné » du
 * lecteur, écrits par `lib/realtime/push-abonnement.ts:memoriseLeContextePush`
 * à CHAQUE chargement de `/notifications/preferences` — la SEULE page qui
 * connaît les deux.
 *
 * Sans ce contexte, le rejeu de la rotation ne pouvait vivre QUE sur cette
 * page (défaut de revue : « le lecteur qui n'ouvre jamais cette page garde
 * un token mort ») — `rejoueSiRotationEnArrierePlan` le relit depuis `/chats`
 * (`lib/realtime/liste.ts`), la surface que le lecteur RÉOUVRE, sans jamais
 * y demander la configuration : elle a déjà voyagé une fois, elle survit
 * dans le MÊME Cache Storage que le drapeau — purgé à la déconnexion par la
 * même route (§ doc-comment de `CACHE_DE_ROTATION_PUSH`), jamais un secret
 * (l'`apiKey` Firebase publique, un `deviceId` opaque).
 */
export const CLE_DE_CONTEXTE_PUSH = '/__v3/signal-contexte-push';
