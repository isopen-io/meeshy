/**
 * LE WORKER ZOMBIE DU PUSH LEGACY SE DÉSINSCRIT — le jumeau, côté PAGE, de
 * `public/sw-legacy-purge.js` (#7305).
 *
 * LE PROBLÈME. `meeshy.me` sert la v2 depuis le 2026-09-15. Tout navigateur
 * qui a connu le legacy sur cette origine conserve une inscription VIVANTE de
 * `/firebase-messaging-sw.js`, sous sa PROPRE portée
 * (`/firebase-cloud-messaging-push-scope`) — celle que le SDK Firebase
 * auto-inscrivait. La substitution de `/sw.js` ne la touche pas : ce sont deux
 * inscriptions, pas deux versions d'une même. Et `sw-legacy-purge.js` ne purge
 * que des CACHES.
 *
 * POURQUOI SUPPRIMER LE FICHIER NE SUFFIT PAS. Un 404 sur le script pendant
 * une vérification de mise à jour ne désinscrit pas un worker — il fait
 * simplement échouer la mise à jour, et le worker déjà installé continue de
 * s'exécuter. Le zombie survivrait donc à la suppression, et le même message
 * lèverait DEUX bannières : la sienne, composée avec ses routes périmées
 * (`/conversations/<id>`, `/mood`, `/reel` — aucune des trois n'existe dans la
 * v2), et celle de `sw-push.js`. C'est une violation directe de D-11, que le
 * lot censé le respecter aurait introduite : la suppression du fichier et
 * cette désinscription ne se séparent pas.
 *
 * LE JETON QU'IL PORTAIT MEURT SEUL. FCM rend
 * `messaging/registration-token-not-registered` ⇒ `TOKEN_INVALID` ⇒
 * `isActive=false` immédiat côté passerelle (`PushNotificationService`).
 * Aucun nettoyage de base n'est requis.
 *
 * IDEMPOTENT ET SILENCIEUX. Après le premier passage, plus rien ne
 * correspond ; un navigateur qui refuse la lecture des inscriptions
 * (navigation privée, politique de site) n'empêche rien — l'application ne
 * dépend pas de ce retrait pour fonctionner.
 */

/** Le script dont la PRÉSENCE dans une inscription en fait un zombie. */
export const LEGACY_PUSH_WORKER_SCRIPT = 'firebase-messaging-sw.js';

type WorkerRef = { readonly scriptURL: string } | null;

/**
 * Les TROIS états d'une inscription portent chacun un script, et un zombie peut
 * n'avoir jamais activé : ne lire que `active` laisserait sur place celui qui
 * attend. `unregister()` retire l'inscription entière, quel que soit l'état.
 */
export type LegacyRegistration = {
  readonly active: WorkerRef;
  readonly installing: WorkerRef;
  readonly waiting: WorkerRef;
  unregister(): Promise<boolean>;
};

export type RegistrationsContainer = {
  getRegistrations(): Promise<readonly LegacyRegistration[]>;
};

function estLegacy(registration: LegacyRegistration): boolean {
  return [registration.active, registration.installing, registration.waiting].some(
    (worker) => worker !== null && worker.scriptURL.includes(LEGACY_PUSH_WORKER_SCRIPT),
  );
}

/**
 * Rend le nombre d'inscriptions RETIRÉES — un compte, pas un booléen : c'est
 * ce qu'un témoin peut faire varier, et ce qu'une console peut lire quand on
 * vérifie sur un navigateur qui a connu le legacy.
 */
export async function unregisterLegacyPushWorkers(container: RegistrationsContainer | undefined): Promise<number> {
  if (container === undefined) return 0;
  let registrations: readonly LegacyRegistration[];
  try {
    registrations = await container.getRegistrations();
  } catch {
    return 0;
  }
  const retraits = await Promise.allSettled(registrations.filter(estLegacy).map((registration) => registration.unregister()));
  return retraits.filter((retrait) => retrait.status === 'fulfilled').length;
}

/**
 * L'ENVIRONNEMENT RÉEL — la seule fonction de ce module qui touche aux
 * globales, même découpage que `browserAppUpdateEnvironment`.
 */
export function purgeLegacyPushWorkers(): Promise<number> {
  const container = 'serviceWorker' in navigator ? (navigator.serviceWorker as unknown as RegistrationsContainer) : undefined;
  return unregisterLegacyPushWorkers(container);
}
