import type { PrismaClient } from '@meeshy/shared/prisma/client';
import {
  compareRelationLevel,
  minRelationLevel,
  parseRelationLevel,
  relationPairKey,
  type RelationLevel,
} from '@meeshy/shared/types/relation';

/**
 * LE SITE UNIQUE DU NIVEAU EFFECTIF entre deux comptes (#13927, cercles).
 *
 * « Ces deux comptes sont-ils amis ? » s'écrivait six fois dans le gateway
 * (feed, temps réel social, duo, retour d'un contact, arrivée d'un contact,
 * découvrabilité du profil) : six copies d'une même question divergent en
 * silence — celle qui bouge ne fait rougir aucune des cinq autres. La question
 * est désormais « quel est leur NIVEAU ? », et l'amitié n'en est qu'une
 * PROJECTION (`niveau >= FRIEND`). Une garde de source (`relation-access-
 * single-site-guard.test.ts`) interdit d'en réécrire la lecture ailleurs.
 *
 * ## D'où vient le niveau
 *
 * 1. la ligne `UserRelation` de la paire, si elle existe : le MINIMUM des deux
 *    accords (RG-01 : aucun accès à sens unique), toute valeur illisible lue
 *    PUBLIC. La ligne l'emporte, y compris quand elle est plus basse qu'une
 *    demande acceptée : c'est une baisse (RG-07), et une vieille demande ne la
 *    relève pas ;
 * 2. à défaut de ligne, une `FriendRequest` ACCEPTÉE se lit `FRIEND` — le
 *    rattrapage (`scripts/2026-10-31-backfill-user-relations.ts`) n'a pas encore
 *    écrit la paire, et rien n'est rétrogradé rétroactivement ;
 * 3. sinon `PUBLIC`.
 *
 * Le niveau rendu est celui des ACCORDS. Le relèvement à COMMUNITY (une
 * communauté en commun) et le blocage appartiennent à la loi
 * (`resolveRelationAccess`) : ils ne se lisent pas ici.
 */
export type RelationLevelDb = Pick<PrismaClient, 'friendRequest' | 'userRelation'>;

type GrantRow = {
  readonly userLowId: string;
  readonly userHighId: string;
  readonly grantedByLow?: string | null;
  readonly grantedByHigh?: string | null;
};

const MIN_FRIEND: RelationLevel = 'FRIEND';
const FRIEND_AND_ABOVE: readonly RelationLevel[] = ['FRIEND', 'CLOSE', 'BLOOD'];

const grantedMinimum = (row: GrantRow): RelationLevel =>
  minRelationLevel(parseRelationLevel(row.grantedByLow), parseRelationLevel(row.grantedByHigh));

const isFriendLevel = (level: RelationLevel): boolean => compareRelationLevel(level, MIN_FRIEND) >= 0;

const otherSide = (row: { userLowId: string; userHighId: string }, subject: string): string =>
  row.userLowId === subject ? row.userHighId : row.userLowId;

/** La demande ACCEPTÉE entre deux comptes, dans un sens comme dans l'autre. `pending` et `rejected` ne valent rien. */
async function demandeAcceptee(prisma: Pick<PrismaClient, 'friendRequest'>, a: string, b: string): Promise<boolean> {
  const ligne = await prisma.friendRequest.findFirst({
    where: {
      status: 'accepted',
      OR: [
        { senderId: a, receiverId: b },
        { senderId: b, receiverId: a },
      ],
    },
    select: { id: true },
  });

  return ligne !== null;
}

export async function niveauEffectif(prisma: RelationLevelDb, a: string, b: string): Promise<RelationLevel> {
  if (!a || !b || a === b) return 'PUBLIC';

  const ligne = await prisma.userRelation.findUnique({
    where: { userLowId_userHighId: relationPairKey(a, b) },
    select: { userLowId: true, userHighId: true, grantedByLow: true, grantedByHigh: true },
  });
  if (ligne) return grantedMinimum(ligne);

  return (await demandeAcceptee(prisma, a, b)) ? 'FRIEND' : 'PUBLIC';
}

async function lignesParmi(
  prisma: Pick<PrismaClient, 'userRelation'>,
  sujet: string,
  autres: ReadonlyArray<string>
): Promise<ReadonlyMap<string, RelationLevel>> {
  const lignes = await prisma.userRelation.findMany({
    where: {
      OR: [
        { userLowId: sujet, userHighId: { in: [...autres] } },
        { userHighId: sujet, userLowId: { in: [...autres] } },
      ],
    },
    select: { userLowId: true, userHighId: true, grantedByLow: true, grantedByHigh: true },
  });

  return new Map(lignes.map((ligne) => [otherSide(ligne, sujet), grantedMinimum(ligne)]));
}

/**
 * Le niveau de `sujet` avec CHACUN des `candidats` — la même loi que
 * {@link niveauEffectif}, en deux requêtes au plus pour un éventail. Une entrée
 * par candidat distinct (soi écarté), `PUBLIC` à défaut de lien.
 */
export async function niveauxParmi(
  prisma: RelationLevelDb,
  sujet: string,
  candidats: ReadonlyArray<string>
): Promise<ReadonlyMap<string, RelationLevel>> {
  const autres = [...new Set(candidats)].filter((id) => id && id !== sujet);
  if (!sujet || autres.length === 0) return new Map();

  const lues = await lignesParmi(prisma, sujet, autres);
  const sansLigne = autres.filter((id) => !lues.has(id));
  const demandes =
    sansLigne.length === 0
      ? []
      : await prisma.friendRequest.findMany({
          where: {
            status: 'accepted',
            OR: [
              { senderId: sujet, receiverId: { in: sansLigne } },
              { senderId: { in: sansLigne }, receiverId: sujet },
            ],
          },
          select: { senderId: true, receiverId: true },
        });
  const acceptees = new Set(demandes.map((d) => (d.senderId === sujet ? d.receiverId : d.senderId)));

  return new Map(autres.map((id) => [id, lues.get(id) ?? (acceptees.has(id) ? 'FRIEND' : 'PUBLIC')]));
}

/**
 * Deux comptes sont-ils AMIS — un lien d'au moins `FRIEND` ? Projection de
 * {@link niveauEffectif}, signature conservée pour ses appelants historiques.
 */
export async function amitieAcceptee(prisma: RelationLevelDb, a: string, b: string): Promise<boolean> {
  return isFriendLevel(await niveauEffectif(prisma, a, b));
}

/**
 * Lesquels, parmi `candidats`, sont AMIS de `sujet` — projection de
 * {@link niveauxParmi} (la sonnerie d'un appel de groupe, #8073).
 */
export async function amisAcceptesParmi(
  prisma: RelationLevelDb,
  sujet: string,
  candidats: ReadonlyArray<string>
): Promise<Set<string>> {
  const niveaux = await niveauxParmi(prisma, sujet, candidats);
  return new Set([...niveaux].filter(([, niveau]) => isFriendLevel(niveau)).map(([id]) => id));
}

type DatedFriend = { readonly id: string; readonly at: number };

const timeOf = (value: unknown): number => (value instanceof Date ? value.getTime() : 0);

const newestFirst = (a: DatedFriend, b: DatedFriend): number => b.at - a.at;

const lastSeenPerId = (friends: ReadonlyArray<DatedFriend>): DatedFriend[] =>
  [...friends.reduce((byId, f) => byId.set(f.id, Math.max(byId.get(f.id) ?? 0, f.at)), new Map<string, number>())].map(
    ([id, at]) => ({ id, at })
  );

/**
 * TOUS les comptes liés à `sujet` par un lien d'au moins `FRIEND`, les plus
 * récemment touchés d'abord, bornés à `limit` quand l'éventail est borné (le
 * retour d'un contact). Lignes `UserRelation` d'abord ; les demandes acceptées
 * n'y ajoutent que les paires SANS ligne, ou dont la ligne est au moins `FRIEND`.
 * Le blocage n'est PAS lu ici : il appartient à l'appelant (loi d'accès).
 */
export async function amisAcceptes(
  prisma: RelationLevelDb,
  sujet: string,
  options: { readonly limit?: number } = {}
): Promise<string[]> {
  if (!sujet) return [];

  const [lignes, demandes] = await Promise.all([
    prisma.userRelation.findMany({
      where: {
        AND: [
          { OR: [{ userLowId: sujet }, { userHighId: sujet }] },
          { grantedByLow: { in: [...FRIEND_AND_ABOVE] } },
          { grantedByHigh: { in: [...FRIEND_AND_ABOVE] } },
        ],
      },
      select: { userLowId: true, userHighId: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
      take: options.limit,
    }),
    prisma.friendRequest.findMany({
      where: { status: 'accepted', OR: [{ senderId: sujet }, { receiverId: sujet }] },
      select: { senderId: true, receiverId: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
      take: options.limit,
    }),
  ]);

  const viaLignes: DatedFriend[] = lignes.map((l) => ({ id: otherSide(l, sujet), at: timeOf(l.updatedAt) }));
  const dejaAmis = new Set(viaLignes.map((f) => f.id));
  const viaDemandes: DatedFriend[] = demandes
    .map((d) => ({ id: d.senderId === sujet ? d.receiverId : d.senderId, at: timeOf(d.updatedAt) }))
    .filter((f) => f.id && f.id !== sujet && !dejaAmis.has(f.id));

  const niveaux = await lignesParmi(prisma, sujet, [...new Set(viaDemandes.map((f) => f.id))]);
  const recuperes = viaDemandes.filter((f) => !niveaux.has(f.id) || isFriendLevel(niveaux.get(f.id) as RelationLevel));

  const tous = lastSeenPerId([...viaLignes, ...recuperes]).sort(newestFirst);
  return tous.slice(0, options.limit).map((f) => f.id);
}
