/**
 * Les trois tables que la loi de CERCLE des accusés de lecture interroge
 * (#19385), pré-semées pour qu'elle AUTORISE — à l'usage des suites dont le
 * sujet n'est PAS la loi.
 *
 * ─── POURQUOI CE HELPER EXISTE ──────────────────────────────────────────────
 *
 * Depuis #19385, `broadcastReadStatus` consulte `dm.readReceipts` par
 * `pairAccessAmong`, qui lit `userRelation`, `friendRequest` et `user`. Une
 * suite dont le double Prisma ne porte pas ces tables fait LEVER la loi, et la
 * diffusion se tait (fail-closed, à dessein). Ses témoins tombent alors pour
 * une raison qui n'a rien à voir avec ce qu'ils gardent.
 *
 * Le dépôt interdit le remède paresseux — poser une surface de double « pour
 * que la route ne tombe pas » supprime le signal qui la ferait réparer
 * (cycle 129). Ce n'est PAS ce que fait ce helper : il ne masque aucun défaut,
 * il DÉCLARE le monde dans lequel le témoin voulait déjà vivre. Un accusé de
 * lecture entre deux comptes qui se voient suppose un lien au moins
 * CONNAISSANCE ; les suites écrites avant la loi le supposaient sans le dire,
 * et c'est cela qu'on rend explicite.
 *
 * **Il n'affaiblit rien, et c'est vérifiable** : la loi reste la VRAIE
 * (`pairAccessAmong` → `resolveRelationAccess`) sur un monde en mémoire qui
 * évalue les clauses reçues. Un lien manquant y rend un refus, pas un vert de
 * complaisance — c'est ce que les témoins de `readReceiptCircleGate.test.ts`
 * et `broadcastReadStatus.circleGate.test.ts` exercent, et eux seuls.
 */
import { ADULT_BIRTH, messagingWorld, type CircleLink } from './messaging-circle-world';

/**
 * Les tables de la loi où `subjectId` est AMI de chacun des `peerIds` — donc
 * au-dessus du plancher `ACQUAINTANCE` de `dm.readReceipts`.
 *
 * `FRIEND` et non `ACQUAINTANCE` tout juste : c'est le niveau que le
 * rattrapage d'une demande ACCEPTÉE laisse réellement en base
 * (`friendshipBackfillProjection` écrit `grantedByLow/High: 'FRIEND'`), donc le
 * monde le plus proche de la production pour deux comptes qui se parlent.
 *
 * À RÉPANDRE dans le double Prisma de la suite :
 * `prisma: { ...monDouble, ...readReceiptCircleAllowing(ACTEUR, [PAIR]) }`.
 */
export function readReceiptCircleAllowing(subjectId: string, peerIds: readonly string[]) {
  const ids = [...new Set(peerIds)].filter((id) => id && id !== subjectId);
  const links: readonly CircleLink[] = ids.map((id) => [subjectId, id, 'FRIEND'] as const);
  const world = messagingWorld({
    links,
    users: [subjectId, ...ids].map((id) => ({
      id,
      birthDate: ADULT_BIRTH,
      username: id,
      displayName: id,
      blockedUserIds: [],
    })),
  });
  return {
    userRelation: world.prisma.userRelation,
    friendRequest: world.prisma.friendRequest,
    user: world.prisma.user,
  };
}
