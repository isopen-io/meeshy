/**
 * QUI hérite d'une conversation dont le créateur s'en va — une seule loi, pour
 * les deux portes qui la posaient chacune à sa façon.
 *
 * Décision porteur du 2026-08-28 (#4058), en marge de #3941 : « si créateur
 * parti, **le premier à avoir été admin devient créateur** ». La succession
 * cesse donc d'être « le premier modérateur venu, sinon le plus ancien membre »
 * pour devenir une règle d'**ancienneté dans le RANG**.
 *
 * ─── CE QUE LES DEUX PORTES FAISAIENT ───────────────────────────────────────
 *
 * | porte | comportement |
 * |---|---|
 * | `delete-for-me.ts` | élisait un **modérateur** (`orderBy joinedAt asc`), sinon le plus ancien membre — l'ordre des rangs était inversé |
 * | `leave.ts` | **refusait** le départ (`400` « transférez ou supprimez ») tant qu'il restait un membre actif |
 *
 * Deux écarts avec la décision, et deux lois là où il n'en faut qu'une. Le
 * critère de fin de #4058 le nomme : « implémentée en un seul site partagé ».
 *
 * ─── OÙ VIT L'INSTANT DE LA PROMOTION ───────────────────────────────────────
 *
 * `Participant` ne porte AUCUN horodatage de rang — `joinedAt`, `leftAt`,
 * `bannedAt`, `lastActiveAt`, et rien d'autre. La trace est ailleurs :
 * `PATCH /conversations/:id/participants/:userId/role` écrit, via
 * `NotificationService.createMemberRoleChangedNotification`, une ligne
 * `Notification` datée pour la personne promue — `context.conversationId`,
 * `metadata.newRole`, `createdAt` à l'instant de la promotion. Deux propriétés
 * vérifiées la rendent utilisable : cette écriture n'a **aucune garde de
 * sourdine** (contrairement à `member_left` et consorts, qui commencent par
 * `isConversationMutedFor` et rendent `null`), et **aucun travail planifié** ne
 * purge les notifications.
 *
 * ─── CE QUI DÉCIDE : `metadata.newRole`, PAS LE TYPE ────────────────────────
 *
 * Le `type` de la ligne (`member_promoted` / `member_demoted` /
 * `member_role_changed`) est DÉRIVÉ d'une table `roleHierarchy` dont les clés
 * sont en MAJUSCULES, comparée à un `previousRole` que l'appelant passe tel
 * qu'il est en base — en minuscules. `roleHierarchy['admin']` vaut donc
 * `undefined ?? 0`, et une rétrogradation `admin → MODERATOR` s'étiquette
 * `member_promoted`. Le type n'est pas un discriminant fiable ; `newRole`, écrit
 * directement depuis la requête, l'est. C'est la leçon #4008 — « la casse ne
 * décide pas d'une conséquence » — appliquée un cran plus haut : ici elle
 * décidait de l'ÉTIQUETTE, et l'étiquette aurait décidé de l'héritage.
 *
 * ─── POURQUOI LA TRACE N'A PAS BESOIN D'ÊTRE PROTÉGÉE ───────────────────────
 *
 * `DELETE /notifications` fait un `deleteMany({})` **global**. La question
 * ouverte était : faut-il restreindre cette route, ou dupliquer l'instant de
 * promotion sur `Participant` ? Ni l'un ni l'autre — parce que le repli sur
 * `joinedAt` (décision 1) rend la règle **TOTALE**. Une table vidée ne casse
 * pas la succession : elle la DÉGRADE vers l'ancienneté d'appartenance, qui
 * reste définie, déterministe et gouvernée par le rang. Une règle qui ne peut
 * pas échouer n'a pas de source de vérité à protéger.
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client'
import { MemberRole } from '@meeshy/shared/types/role-types'

/**
 * Ce que la loi a besoin de savoir d'un participant — et rien d'autre, pour que
 * le témoin puisse la faire tomber sans base de données.
 */
export type SuccessionCandidate = {
  id: string
  userId: string | null
  role?: string | null
  joinedAt?: Date | null
}

/** Un instant où quelqu'un est devenu administrateur DE CETTE conversation. */
export type AdminPromotion = {
  userId: string
  promotedAt: Date
}

export type CreatorSuccession =
  | { kind: 'transfer'; successor: SuccessionCandidate }
  | { kind: 'close' }

/**
 * Les trois types que `createMemberRoleChangedNotification` peut poser. On les
 * accepte TOUS et on tranche sur `metadata.newRole` — voir le doc-comment de
 * tête : le type est dérivé d'une comparaison sensible à la casse, `newRole`
 * ne l'est pas.
 */
const TYPES_DE_CHANGEMENT_DE_RANG = [
  'member_promoted',
  'member_demoted',
  'member_role_changed',
] as const

const estAdministrateur = (role: string | null | undefined): boolean =>
  (role ?? MemberRole.MEMBER).toLowerCase() === MemberRole.ADMIN

/**
 * Une ligne sans date d'arrivée ne PROUVE aucune ancienneté : elle concourt en
 * dernier plutôt que de gagner par un `0` implicite — et elle concourt, ce qui
 * est la différence entre « ranger » et « perdre ».
 */
const SANS_DATE = Number.POSITIVE_INFINITY

const instant = (date: Date | null | undefined): number =>
  date ? date.getTime() : SANS_DATE

/**
 * La loi, sans base de données : parmi les participants ACTIFS qui restent,
 * l'administrateur promu le PREMIER ; à défaut d'administrateur, le membre
 * arrivé le premier ; à défaut de quiconque, la clôture.
 */
export function elireSuccesseur(
  candidats: readonly SuccessionCandidate[],
  promotions: readonly AdminPromotion[]
): CreatorSuccession {
  if (candidats.length === 0) return { kind: 'close' }

  const administrateurs = candidats.filter(candidat => estAdministrateur(candidat.role))
  const pool = administrateurs.length > 0 ? administrateurs : candidats

  const premierRang = new Map<string, number>()
  if (administrateurs.length > 0) {
    for (const promotion of promotions) {
      const connu = premierRang.get(promotion.userId)
      const propose = instant(promotion.promotedAt)
      if (connu === undefined || propose < connu) premierRang.set(promotion.userId, propose)
    }
  }

  /**
   * L'ancienneté DANS LE RANG pour un administrateur — sa promotion si elle est
   * tracée, son arrivée sinon (décision 1). Pour un membre, l'arrivée est le
   * rang.
   */
  const anciennete = (candidat: SuccessionCandidate): number => {
    const trace = candidat.userId ? premierRang.get(candidat.userId) : undefined
    return trace ?? instant(candidat.joinedAt)
  }

  const classe = [...pool].sort((a, b) => {
    const parRang = anciennete(a) - anciennete(b)
    if (parRang !== 0) return parRang
    const parArrivee = instant(a.joinedAt) - instant(b.joinedAt)
    if (parArrivee !== 0) return parArrivee
    // Deux lignes rigoureusement à égalité doivent tout de même élire le MÊME
    // successeur à chaque appel : sans ce dernier critère, l'ordre rendu par la
    // base décide, et deux tentatives du même geste peuvent promouvoir deux
    // personnes différentes.
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })

  return { kind: 'transfer', successor: classe[0] }
}

const memeConversation = (context: unknown, conversationId: string): boolean =>
  typeof context === 'object' &&
  context !== null &&
  (context as { conversationId?: unknown }).conversationId === conversationId

const meneAuRangAdmin = (metadata: unknown): boolean => {
  if (typeof metadata !== 'object' || metadata === null) return false
  const nouveau = (metadata as { newRole?: unknown }).newRole
  return typeof nouveau === 'string' && nouveau.toLowerCase() === MemberRole.ADMIN
}

/**
 * La lecture, puis la loi — un seul site pour les deux portes.
 *
 * La seconde requête ne part QUE s'il reste un administrateur : sans admin, la
 * règle retombe sur l'ancienneté d'appartenance, que la première lecture porte
 * déjà.
 */
export async function resoudreSuccessionDuCreateur(
  prisma: PrismaClient,
  params: { conversationId: string; sortantUserId: string }
): Promise<CreatorSuccession> {
  const { conversationId, sortantUserId } = params

  const candidats = await prisma.participant.findMany({
    where: { conversationId, isActive: true, userId: { not: sortantUserId } },
    select: { id: true, userId: true, role: true, joinedAt: true },
    orderBy: { joinedAt: 'asc' },
  })

  if (candidats.length === 0) return { kind: 'close' }

  const identifiantsAdmins = candidats
    .filter(candidat => estAdministrateur(candidat.role))
    .map(candidat => candidat.userId)
    .filter((userId): userId is string => typeof userId === 'string' && userId.length > 0)

  if (identifiantsAdmins.length === 0) return elireSuccesseur(candidats, [])

  const traces = await prisma.notification.findMany({
    where: {
      userId: { in: identifiantsAdmins },
      type: { in: [...TYPES_DE_CHANGEMENT_DE_RANG] },
    },
    select: { userId: true, createdAt: true, context: true, metadata: true },
    orderBy: { createdAt: 'asc' },
  })

  const promotions: AdminPromotion[] = traces
    .filter(
      trace =>
        memeConversation(trace.context, conversationId) && meneAuRangAdmin(trace.metadata)
    )
    .map(trace => ({ userId: trace.userId, promotedAt: trace.createdAt }))

  return elireSuccesseur(candidats, promotions)
}
