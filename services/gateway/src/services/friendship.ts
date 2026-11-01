import type { PrismaClient } from '@meeshy/shared/prisma/client';
import {
  compareRelationLevel,
  minRelationLevel,
  parseRelationLevel,
  relationPairKey,
  RELATION_LEVELS,
  type RelationLevel,
} from '@meeshy/shared/types/relation';
import { friendshipBackfillProjection, type UserRelationRow } from './relations/userRelationWriter';

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
 * 1. la ligne `UserRelation` de la paire : le MINIMUM des deux accords (RG-01 :
 *    aucun accès à sens unique), toute valeur illisible lue PUBLIC ;
 * 2. une `FriendRequest` ACCEPTÉE entre les deux se lit comme le RATTRAPAGE la
 *    laissera (`friendshipBackfillProjection`, `relations/userRelationWriter.ts`) :
 *    sans ligne, ou sur une ligne née plus bas sans baisse postérieure à
 *    l'acceptation (Connaissance née avant le rattrapage, écriture du lien
 *    ratée après une amitié renouée), elle vaut `FRIEND` au moins. Une baisse
 *    gravée À la date de l'acceptation ou APRÈS l'emporte (RG-07) : une vieille
 *    demande ne la relève pas. Le niveau lu avant le rattrapage est donc celui
 *    qu'il laissera — aucun ami perdu ni gagné entre le déploiement et le
 *    rattrapage (spec § 2) ; une seconde règle de réconciliation, ici, aurait
 *    divergé de celle de l'écrivain ;
 * 3. sinon `PUBLIC`.
 *
 * Le niveau rendu est celui des ACCORDS. Le relèvement à COMMUNITY (une
 * communauté en commun) et le blocage appartiennent à la loi
 * (`resolveRelationAccess`) : ils ne se lisent pas ici.
 */
export type RelationLevelDb = Pick<PrismaClient, 'friendRequest' | 'userRelation'>;

const MIN_FRIEND: RelationLevel = 'FRIEND';
const FRIEND_AND_ABOVE: readonly RelationLevel[] = ['FRIEND', 'CLOSE', 'BLOOD'];

const LINK_SELECT = {
  id: true,
  userLowId: true,
  userHighId: true,
  grantedByLow: true,
  grantedByHigh: true,
  transitions: true,
} as const;

const ACCEPTANCE_SELECT = { senderId: true, receiverId: true, respondedAt: true, updatedAt: true } as const;

type Acceptance = {
  readonly senderId: string;
  readonly receiverId: string;
  readonly respondedAt?: Date | null;
  readonly updatedAt?: Date | null;
};

/** `undefined` : aucune demande acceptée ; `null` : acceptée, sans date lisible. */
type AcceptedAt = Date | null | undefined;

const grantedMinimum = (row: Pick<UserRelationRow, 'grantedByLow' | 'grantedByHigh'>): RelationLevel =>
  minRelationLevel(parseRelationLevel(row.grantedByLow), parseRelationLevel(row.grantedByHigh));

const isFriendLevel = (level: RelationLevel): boolean => compareRelationLevel(level, MIN_FRIEND) >= 0;

const otherSide = (row: { userLowId: string; userHighId: string }, subject: string): string =>
  row.userLowId === subject ? row.userHighId : row.userLowId;

const otherParty = (request: Pick<Acceptance, 'senderId' | 'receiverId'>, subject: string): string =>
  request.senderId === subject ? request.receiverId : request.senderId;

/** La date d'acceptation, comme le rattrapage la lit (`respondedAt`, à défaut `updatedAt`). */
const acceptedAtOf = (request: Acceptance): Date | null => request.respondedAt ?? request.updatedAt ?? null;

/** La PLUS RÉCENTE des acceptations d'une paire (sans unique de paire, il peut y en avoir plusieurs). */
const latestAcceptance = (current: AcceptedAt, next: Date | null): Date | null => {
  if (!current) return next;
  if (!next) return current;
  return next.getTime() > current.getTime() ? next : current;
};

/** Le niveau servi : celui de la ligne telle que le rattrapage la laissera. */
function servedLevel(row: UserRelationRow | null, a: string, b: string, acceptedAt: AcceptedAt): RelationLevel {
  if (acceptedAt === undefined) return row ? grantedMinimum(row) : 'PUBLIC';
  const projected = friendshipBackfillProjection(row, relationPairKey(a, b), acceptedAt);
  return projected ? grantedMinimum(projected) : 'PUBLIC';
}

const needsAcceptance = (row: UserRelationRow | null | undefined): boolean => !row || !isFriendLevel(grantedMinimum(row));

/** La demande ACCEPTÉE la plus récente entre deux comptes, dans un sens comme dans l'autre. `pending` et `rejected` ne valent rien. */
async function acceptationEntre(prisma: Pick<PrismaClient, 'friendRequest'>, a: string, b: string): Promise<AcceptedAt> {
  const ligne = await prisma.friendRequest.findFirst({
    where: {
      status: 'accepted',
      OR: [
        { senderId: a, receiverId: b },
        { senderId: b, receiverId: a },
      ],
    },
    select: ACCEPTANCE_SELECT,
    orderBy: { updatedAt: 'desc' },
  });

  return ligne ? acceptedAtOf(ligne) : undefined;
}

export async function niveauEffectif(prisma: RelationLevelDb, a: string, b: string): Promise<RelationLevel> {
  if (!a || !b || a === b) return 'PUBLIC';

  const ligne: UserRelationRow | null = await prisma.userRelation.findUnique({
    where: { userLowId_userHighId: relationPairKey(a, b) },
    select: LINK_SELECT,
  });
  if (ligne && isFriendLevel(grantedMinimum(ligne))) return grantedMinimum(ligne);

  return servedLevel(ligne, a, b, await acceptationEntre(prisma, a, b));
}

/**
 * {@link niveauEffectif}, lu de façon UNIFORME : la ligne et la demande acceptée
 * sont lues ensemble, quel que soit le lien. Pour une porte dont le LECTEUR
 * choisit la cible (`GET /relations/:userId`) : le nombre de lectures ne dit
 * rien du lien, et un bloqué ne se distingue pas d'un inconnu par le temps.
 * Même loi (`servedLevel` rend le minimum d'une ligne déjà ≥ Ami), une lecture
 * de plus pour un ami — en parallèle, donc sans attente de plus.
 */
export async function niveauEffectifUniforme(prisma: RelationLevelDb, a: string, b: string): Promise<RelationLevel> {
  if (!a || !b || a === b) return 'PUBLIC';

  const [ligne, acceptee]: [UserRelationRow | null, AcceptedAt] = await Promise.all([
    prisma.userRelation.findUnique({ where: { userLowId_userHighId: relationPairKey(a, b) }, select: LINK_SELECT }),
    acceptationEntre(prisma, a, b),
  ]);

  return servedLevel(ligne, a, b, acceptee);
}

async function lignesParmi(
  prisma: Pick<PrismaClient, 'userRelation'>,
  sujet: string,
  autres: ReadonlyArray<string>
): Promise<ReadonlyMap<string, UserRelationRow>> {
  if (autres.length === 0) return new Map();
  const lignes: UserRelationRow[] = await prisma.userRelation.findMany({
    where: {
      OR: [
        { userLowId: sujet, userHighId: { in: [...autres] } },
        { userHighId: sujet, userLowId: { in: [...autres] } },
      ],
    },
    select: LINK_SELECT,
  });

  return new Map(lignes.map((ligne) => [otherSide(ligne, sujet), ligne]));
}

const acceptationsParAutre = (sujet: string, demandes: ReadonlyArray<Acceptance>): ReadonlyMap<string, Date | null> =>
  demandes.reduce((parAutre, demande) => {
    const autre = otherParty(demande, sujet);
    return parAutre.set(autre, latestAcceptance(parAutre.get(autre), acceptedAtOf(demande)));
  }, new Map<string, Date | null>());

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
  const aRapprocher = autres.filter((id) => needsAcceptance(lues.get(id)));
  const demandes: Acceptance[] =
    aRapprocher.length === 0
      ? []
      : await prisma.friendRequest.findMany({
          where: {
            status: 'accepted',
            OR: [
              { senderId: sujet, receiverId: { in: aRapprocher } },
              { senderId: { in: aRapprocher }, receiverId: sujet },
            ],
          },
          select: ACCEPTANCE_SELECT,
        });
  const acceptations = acceptationsParAutre(sujet, demandes);

  return new Map(autres.map((id) => [id, servedLevel(lues.get(id) ?? null, sujet, id, acceptations.get(id))]));
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
      select: ACCEPTANCE_SELECT,
      orderBy: { updatedAt: 'desc' },
      take: options.limit,
    }),
  ]);

  const viaLignes: DatedFriend[] = lignes.map((l) => ({ id: otherSide(l, sujet), at: timeOf(l.updatedAt) }));
  const dejaAmis = new Set(viaLignes.map((f) => f.id));
  const viaDemandes: DatedFriend[] = demandes
    .map((d) => ({ id: otherParty(d, sujet), at: timeOf(d.updatedAt) }))
    .filter((f) => f.id && f.id !== sujet && !dejaAmis.has(f.id));

  const candidats = [...new Set(viaDemandes.map((f) => f.id))];
  const lues = await lignesParmi(prisma, sujet, candidats);
  const acceptations = acceptationsParAutre(sujet, demandes);
  const recuperes = viaDemandes.filter((f) =>
    isFriendLevel(servedLevel(lues.get(f.id) ?? null, sujet, f.id, acceptations.get(f.id)))
  );

  const tous = lastSeenPerId([...viaLignes, ...recuperes]).sort(newestFirst);
  return tous.slice(0, options.limit).map((f) => f.id);
}

/** Un compte lié à `sujet`, et le NIVEAU EFFECTIF de ce lien. */
export type CompteLie = { readonly id: string; readonly niveau: RelationLevel };

const COMPTES_LIES_PLAFOND = 500;

/**
 * TOUS les comptes liés à `sujet` par un lien au-dessus de `PUBLIC` — la connaissance
 * comprise —, du plus PROCHE au plus lointain (`BLOOD` → `COMMUNITY`), et à niveau
 * égal les plus récemment touchés d'abord. Lignes `UserRelation` de tout niveau, et
 * demandes acceptées sans ligne ; chaque niveau passe par {@link niveauxParmi}, la
 * même loi que partout (#14052, la mention). Borné à `limit` par source. Le blocage
 * appartient à l'appelant.
 */
export async function comptesLies(
  prisma: RelationLevelDb,
  sujet: string,
  options: { readonly limit?: number } = {}
): Promise<CompteLie[]> {
  if (!sujet) return [];
  const take = options.limit ?? COMPTES_LIES_PLAFOND;

  const [lignes, demandes] = await Promise.all([
    prisma.userRelation.findMany({
      where: { OR: [{ userLowId: sujet }, { userHighId: sujet }] },
      select: { userLowId: true, userHighId: true },
      orderBy: { updatedAt: 'desc' },
      take,
    }),
    prisma.friendRequest.findMany({
      where: { status: 'accepted', OR: [{ senderId: sujet }, { receiverId: sujet }] },
      select: { senderId: true, receiverId: true },
      orderBy: { updatedAt: 'desc' },
      take,
    }),
  ]);

  const ordre = [
    ...new Set([...lignes.map((l) => otherSide(l, sujet)), ...demandes.map((d) => otherParty(d, sujet))]),
  ].filter((id) => id && id !== sujet);
  const niveaux = await niveauxParmi(prisma, sujet, ordre);

  return ordre
    .map((id, rang) => ({ id, niveau: niveaux.get(id) ?? 'PUBLIC', rang }))
    .filter((lien) => lien.niveau !== 'PUBLIC')
    .sort((a, b) => compareRelationLevel(b.niveau, a.niveau) || a.rang - b.rang)
    .map(({ id, niveau }) => ({ id, niveau }));
}

/**
 * Range `ids` du lien le plus PROCHE au plus lointain selon `niveaux`, sans défaire
 * l'ordre d'entrée à niveau égal (un id absent vaut `PUBLIC`). Le tri des niveaux
 * reste ici, au site de la loi (garde `relation-access-single-site-guard`).
 */
export function plusProchesDabord(ids: ReadonlyArray<string>, niveaux: ReadonlyMap<string, RelationLevel>): string[] {
  return ids
    .map((id, rang) => ({ id, rang, niveau: niveaux.get(id) ?? 'PUBLIC' }))
    .sort((a, b) => compareRelationLevel(b.niveau, a.niveau) || a.rang - b.rang)
    .map(({ id }) => id);
}

/**
 * Les comptes liés à `sujet` par un niveau effectif d'AU MOINS `plancher`, du plus
 * proche au plus lointain — l'énumérateur des éventails d'entourage (#13929).
 *
 * La lecture DESCEND les niveaux (Sang, puis Proche, puis Ami, puis Connaissance)
 * et s'arrête dès qu'un cran remplit la borne : chaque requête ne rend que les
 * lignes dont les DEUX accords atteignent le cran lu, et les crans déjà lus sont
 * gardés. Une foule de Connaissances récentes n'évince donc jamais un Sang ancien.
 * Les demandes acceptées ne sont lues que si le plancher est au plus `FRIEND`
 * (une demande acceptée ne vaut jamais plus). Chaque niveau repasse par
 * {@link niveauxParmi}, la même loi que partout. `PUBLIC` et `COMMUNITY` ne
 * s'énumèrent pas ici (aucune ligne ne les porte) : la communauté appartient à
 * l'appelant, le blocage aussi. L'appelant borne le résultat.
 */
export async function comptesAuMoins(
  prisma: RelationLevelDb,
  sujet: string,
  plancher: RelationLevel,
  options: { readonly limit: number }
): Promise<CompteLie[]> {
  if (!sujet || compareRelationLevel(plancher, 'ACQUAINTANCE') < 0) return [];
  const crans = RELATION_LEVELS.filter((niveau) => compareRelationLevel(niveau, plancher) >= 0).reverse();

  const lus = new Set<string>();
  for (const cran of crans) {
    const admis = RELATION_LEVELS.filter((niveau) => compareRelationLevel(niveau, cran) >= 0);
    const lignes = await prisma.userRelation.findMany({
      where: {
        AND: [
          { OR: [{ userLowId: sujet }, { userHighId: sujet }] },
          { grantedByLow: { in: [...admis] } },
          { grantedByHigh: { in: [...admis] } },
        ],
      },
      select: { userLowId: true, userHighId: true },
      orderBy: { updatedAt: 'desc' },
      take: options.limit,
    });
    lignes.forEach((ligne) => lus.add(otherSide(ligne, sujet)));
    if (lus.size >= options.limit) break;
  }

  const amis =
    lus.size < options.limit && compareRelationLevel(plancher, MIN_FRIEND) <= 0
      ? await amisAcceptes(prisma, sujet, { limit: options.limit })
      : [];
  const ordre = [...new Set([...lus, ...amis])].filter((id) => id && id !== sujet);
  const niveaux = await niveauxParmi(prisma, sujet, ordre);

  return plusProchesDabord(ordre, niveaux)
    .map((id) => ({ id, niveau: niveaux.get(id) ?? 'PUBLIC' }))
    .filter((lien) => compareRelationLevel(lien.niveau, plancher) >= 0);
}
