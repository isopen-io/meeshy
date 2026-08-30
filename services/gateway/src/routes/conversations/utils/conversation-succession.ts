import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { isMemberAdmin } from '@meeshy/shared/types/role-types';

/**
 * QUI hérite d'une conversation dont le créateur s'en va — **une seule loi**,
 * partagée par les deux portes qui la posaient chacune de son côté
 * (`leave.ts`, `delete-for-me.ts`).
 *
 * Décision porteur du 2026-08-28 (#4058) : « si créateur parti, **le premier à
 * avoir été admin devient créateur** ». La succession cesse donc d'être « le
 * premier modérateur venu, sinon le plus ancien membre » — l'ordre des rangs y
 * était d'ailleurs INVERSÉ, un modérateur passant devant un administrateur — et
 * devient une règle d'**ancienneté dans le rang d'administrateur** :
 *
 * 1. les administrateurs actifs, classés par **instant de promotion** ;
 * 2. à défaut d'administrateur, le **membre actif le plus ancien** ;
 * 3. à défaut de membre, la **clôture** de la conversation.
 *
 * ## L'instant de promotion, et son repli
 *
 * `Participant` ne porte aucun horodatage de rang. La trace vit dans
 * `Notification` : `PATCH …/participants/:userId/role` écrit une ligne
 * `member_promoted` datée pour la personne promue, sans aucune garde de
 * sourdine (contrairement à `member_left` et consorts), donc elle existe même
 * pour qui a mis la conversation en sourdine.
 *
 * Mais **une participation créée DÉJÀ administrateur n'a aucune trace** — le
 * seed et tout ajout direct n'écrivent pas cette notification. Le repli est son
 * `joinedAt`, et c'est plus qu'une commodité : cet administrateur-là l'EST
 * depuis son arrivée, donc son `joinedAt` **est** son instant de promotion. Ce
 * repli rend la règle TOTALE, et c'est ce qui répond à la quatrième question de
 * #4058 — la succession ne dépend plus d'une table effaçable en bloc
 * (`DELETE /notifications` fait un `deleteMany({})` global) : perdre la trace
 * dégrade le classement, elle ne peut plus le rendre indécidable.
 *
 * La casse ne décide de rien ici (#4008) : `metadata.newRole` est écrit en
 * MAJUSCULES (`'ADMIN'`) alors que `Participant.role` est en minuscules. Le tri
 * des candidats et la lecture de la trace replient tous deux par
 * `isMemberAdmin`, en JavaScript — aucun `where` Prisma ne compare un rang.
 *
 * ## Hériter demande un compte
 *
 * Un participant sans `userId` — un visiteur venu par un lien partagé — n'est
 * pas éligible. Gouverner un fil (fermer, bannir, promouvoir) depuis une
 * session qui expire, et sans ligne `User` à qui l'imputer, n'est pas une
 * succession : c'est une conversation laissée sans gouvernance sous couvert
 * d'en avoir une. S'il ne reste que des invités, la règle 3 s'applique.
 */
export type ConversationSuccession =
  | { readonly kind: 'transfer'; readonly participantId: string; readonly userId: string }
  | { readonly kind: 'close' };

type SuccessorCandidate = {
  readonly id: string;
  readonly userId: string | null;
  readonly role: string | null;
  readonly joinedAt: Date;
};

const PROMOTION_TYPE = 'member_promoted';

const isPromotionToAdmin = (metadata: unknown): boolean => {
  if (!metadata || typeof metadata !== 'object') return false;
  const newRole = (metadata as { newRole?: unknown }).newRole;
  return typeof newRole === 'string' && isMemberAdmin(newRole);
};

/**
 * Le premier `member_promoted` vers ADMIN de chaque candidat, sur CETTE
 * conversation. Une seule requête pour tout l'ensemble — la route de succession
 * est rare, mais elle ne doit pas être quadratique dans le nombre d'admins.
 */
async function adminPromotionInstants(
  prisma: PrismaClient,
  conversationId: string,
  userIds: readonly string[]
): Promise<Map<string, Date>> {
  const promotions = await prisma.notification.findMany({
    where: {
      type: PROMOTION_TYPE,
      userId: { in: [...userIds] },
      context: { path: ['conversationId'], equals: conversationId },
    },
    select: { userId: true, createdAt: true, metadata: true },
    orderBy: { createdAt: 'asc' },
  });

  const instants = new Map<string, Date>();
  for (const promotion of promotions) {
    if (!isPromotionToAdmin(promotion.metadata)) continue;
    // Asc : la PREMIÈRE ligne vue est la plus ancienne. Un administrateur
    // rétrogradé puis re-promu garde donc l'ancienneté de sa première fois —
    // « le premier à avoir été admin », au mot près.
    if (!instants.has(promotion.userId)) instants.set(promotion.userId, promotion.createdAt);
  }
  return instants;
}

const senioritySort =
  (instants: Map<string, Date>) =>
  (a: SuccessorCandidate, b: SuccessorCandidate): number => {
    const seniority = (c: SuccessorCandidate): number =>
      (c.userId ? instants.get(c.userId) : undefined)?.getTime() ?? c.joinedAt.getTime();
    return seniority(a) - seniority(b) || a.joinedAt.getTime() - b.joinedAt.getTime() ||
      a.id.localeCompare(b.id);
  };

/**
 * Un DM jamais utilisé ne se transmet pas : il se ferme.
 *
 * Le client Prisma renvoie `null` pour `firstMessageSentAt` aussi bien quand le
 * champ est present-et-null que quand il est ABSENT (legacy, jamais backfillé)
 * — impossible de distinguer les deux côté JS. On requête donc directement le
 * seul état qui corresponde à un DM « genuinely empty » via `count`, qui ne
 * matche jamais un document où le champ est absent.
 */
async function isUnusedDirect(prisma: PrismaClient, conversationId: string): Promise<boolean> {
  const count = await prisma.conversation.count({
    where: { id: conversationId, type: 'direct', firstMessageSentAt: null },
  });
  return count > 0;
}

export async function resolveConversationSuccession(params: {
  prisma: PrismaClient;
  conversationId: string;
  departingUserId: string;
}): Promise<ConversationSuccession> {
  const { prisma, conversationId, departingUserId } = params;

  if (await isUnusedDirect(prisma, conversationId)) return { kind: 'close' };

  const candidates = (await prisma.participant.findMany({
    where: { conversationId, isActive: true, userId: { not: departingUserId } },
    select: { id: true, userId: true, role: true, joinedAt: true },
    orderBy: { joinedAt: 'asc' },
  })) as SuccessorCandidate[];

  const eligible = candidates.filter((c): c is SuccessorCandidate & { userId: string } =>
    typeof c.userId === 'string' && c.userId.length > 0
  );
  if (eligible.length === 0) return { kind: 'close' };

  const admins = eligible.filter(c => isMemberAdmin(c.role ?? 'member'));

  // `eligible` arrive déjà trié par `joinedAt` : sans administrateur, la règle 2
  // est sa tête de liste, sans un tri de plus.
  const [successor] = admins.length > 0
    ? [...admins].sort(senioritySort(await adminPromotionInstants(prisma, conversationId, admins.map(a => a.userId))))
    : eligible;

  return { kind: 'transfer', participantId: successor.id, userId: successor.userId };
}
