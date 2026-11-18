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
import { ADULT_BIRTH, circleLink, messagingWorld, type CircleLink } from './messaging-circle-world';

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

/**
 * Les mêmes trois tables, mais OUVERTES : toute paire interrogée est AMIE, et
 * tout compte interrogé est un adulte qui ne bloque personne.
 *
 * ─── POURQUOI UNE VARIANTE SANS IDS ─────────────────────────────────────────
 *
 * {@link readReceiptCircleAllowing} exige de NOMMER le sujet et ses pairs, ce
 * qui est juste quand le témoin parle du cercle. Une dizaine de suites de
 * ROUTES passent par `broadcastReadStatus` sans que le cercle soit leur sujet :
 * elles comptent des émissions, des rooms, des bornes d'historique. Leur
 * demander de nommer des identités qu'elles n'utilisent pas ailleurs serait de
 * l'archéologie, et chaque id recopié serait une occasion de se tromper.
 *
 * Ce que cette variante déclare est donc exactement ce que ces suites
 * supposaient AVANT #19385 : « le cercle n'est pas mon sujet, qu'il laisse
 * passer ». Elle ne masque aucun défaut de production — la loi reste la VRAIE
 * (`pairAccessAmong` → `resolveRelationAccess`), seul son MONDE est permissif,
 * et les quatre suites qui gardent la loi elle-même
 * (`readReceiptCircleGate`, `broadcastReadStatus.circleGate`,
 * `readReceiptCircleRest`) n'y touchent pas : elles construisent des paires
 * SOUS le plancher, et c'est là que la garde se prouve.
 *
 * `satisfies`-libre et sans état : chaque appel répond depuis la clause reçue,
 * donc deux suites ne peuvent pas se polluer.
 */
export function readReceiptCircleOpen() {
  /** Les ids nommés par un `where` de `lignesParmi` (deux branches `OR`). */
  const pairsOf = (where: Record<string, any> | undefined): Array<[string, string]> => {
    const branches: Array<Record<string, any>> = where?.OR ?? [];
    const pairs: Array<[string, string]> = [];
    for (const branch of branches) {
      const low = branch?.userLowId;
      const high = branch?.userHighId;
      const sujet = typeof low === 'string' ? low : typeof high === 'string' ? high : null;
      const autres: string[] = (typeof low === 'object' && low?.in) || (typeof high === 'object' && high?.in) || [];
      if (!sujet) continue;
      for (const autre of autres) pairs.push([sujet, autre]);
    }
    return pairs;
  };

  return {
    userRelation: {
      findMany: async (args: { where?: Record<string, any> } = {}) =>
        pairsOf(args.where).map(([a, b], index) => circleLink([a, b, 'FRIEND'], index)),
      findUnique: async () => null,
    },
    friendRequest: {
      findMany: async () => [],
      findFirst: async () => null,
    },
    user: {
      // Le `where` est HONORÉ sur `blockedUserIds`, et c'est tout l'enjeu :
      // `getBlockedUserIdsAmong` interroge cette table DEUX fois, et sa
      // première question est « lesquels de ces ids BLOQUENT le sujet ? »
      // (`blockedUserIds: { has: … }`). Un double qui ignore la clause rend
      // tous les ids, donc déclare tout le monde BLOQUEUR — et la loi refuse
      // l'éventail entier. C'est le défaut qu'a eu la première version de ce
      // helper, et il ne se voyait que par le verdict, jamais par une levée.
      findMany: async (args: { where?: Record<string, any> } = {}) =>
        args.where?.blockedUserIds
          ? []
          : ((args.where?.id?.in as string[]) ?? []).map((id) => ({
              id,
              birthDate: ADULT_BIRTH,
              role: 'USER',
              isActive: true,
              deletedAt: null,
              deactivatedAt: null,
              blockedUserIds: [],
            })),
      findUnique: async () => ({ blockedUserIds: [] }),
    },
  };
}
