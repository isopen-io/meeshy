/**
 * LA COUPURE de la position en direct (#16794) — un blocage éteint, À L'INSTANT,
 * le partage en cours entre les deux comptes, dans les deux sens.
 *
 * Sans elle, le filtre d'annonce de `LocationHandler` ne voyait le blocage qu'à
 * son rafraîchissement suivant (une minute), soit jusqu'à 120 positions
 * successives vers le pair bloqué, puis une épingle figée sur la dernière.
 *
 * Un partage vit dans le registre EN MÉMOIRE du processus qui porte la socket du
 * partageur, et la route de blocage s'exécute sur n'importe quelle instance. La
 * passerelle est aujourd'hui MONO-INSTANCE (un seul conteneur `meeshy-gateway`,
 * aucun `replicas` dans `docker-compose.prod.yml`, mesuré pour #16794) : la
 * coupure de ce processus couvre donc tous les partages. Le retrait de l'épingle,
 * lui, passe par `fetchSockets`, que l'adaptateur Redis résout sur chaque nœud.
 *
 * À la deuxième instance, un partage porté par un AUTRE nœud que celui qui reçoit
 * le blocage retombe sur l'invariant de #16745 : son exclusion n'arrive qu'au
 * rafraîchissement d'une minute, et son épingle reste figée chez le pair jusqu'à
 * l'arrêt. Le canal partagé (sur le patron de `talkie:cut:<de>:<vers>`) est la
 * forme qui survit à la montée en charge ; il est suivi par #16800.
 */

export type LiveLocationCutter = {
  readonly cutPair: (pair: { readonly userA: string; readonly userB: string }) => Promise<void>;
};

let processCutter: LiveLocationCutter | null = null;

/** Le registre de CE processus : `LocationHandler` s'y déclare à sa construction. */
export const registerProcessLiveLocationCutter = (cutter: LiveLocationCutter): void => {
  processCutter = cutter;
};

/** À l'arrêt (`dispose`), seul le registre déclaré se retire : un successeur déjà posé reste. */
export const unregisterProcessLiveLocationCutter = (cutter: LiveLocationCutter): void => {
  if (processCutter === cutter) processCutter = null;
};

/** Sans sockets montées (tâche hors serveur, test de route), il n'y a aucun partage à couper. */
export async function cutLiveLocationsOnBlock(
  params: { readonly blockerId: string; readonly blockedId: string },
  cutter: LiveLocationCutter | null = processCutter,
): Promise<void> {
  if (!cutter) return;
  await cutter.cutPair({ userA: params.blockerId, userB: params.blockedId });
}
