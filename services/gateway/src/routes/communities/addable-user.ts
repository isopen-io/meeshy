import type { PrismaClient } from '@meeshy/shared/prisma/client';

import { isBlockedBetween } from '../../utils/blocking';
import { USABLE_ACCOUNT_WHERE } from '../../services/relations/usableAccount';

/**
 * QUI PEUT ÊTRE AJOUTÉ À UNE COMMUNAUTÉ (#6376) — le site unique des deux
 * routes qui ajoutent quelqu'un SANS son accord : `POST …/invite` (un membre)
 * et `POST …/members` (un administrateur).
 *
 * Un compte vivant seulement : ni désactivé par l'administration
 * (`deactivatedAt`), ni supprimé par son titulaire (`isActive: false` +
 * `deletedAt`, sans `deactivatedAt` — `routes/account-deletion.ts`), ni inactif
 * (`isActive: false` — une revendication d'adresse, `registration.service.ts`).
 * Et aucun blocage, dans un sens ou dans l'autre. Les deux routes rendent le
 * même 404 qu'un inconnu : la réponse ne dit pas à l'acteur qu'on l'a bloqué.
 *
 * ─── CE QUE CETTE PORTE N'INTERROGE PAS ──────────────────────────────────────
 *
 * Elle a refusé TOUT LE MONDE de sa création (#6376) au 2026-11-19 (#19799) :
 * son prédicat « compte vivant » était une égalité nue sur deux colonnes
 * qu'aucune création de compte n'écrit. Les deux routes qu'elle garde rendaient
 * donc 404 pour chacun, et elles entrent en service pour la première fois. Ce
 * qu'elle NE demande pas, relevé à cette occasion — chaque ligne est une issue,
 * pas un oubli :
 *
 *  · **l'âge déclaré.** Le bouclier des mineurs (`declaredAgeClass` +
 *    `RELATION_MINOR_TARGET_MIN_LEVEL`), que `talkieGate`, `bringService`,
 *    `messageRequests` et `pairAccess` interrogent, n'est pas lu ici : un majeur
 *    inconnu peut faire entrer un mineur déclaré, qui passe alors à `COMMUNITY`
 *    avec tous les membres. **#19811** — décision produit.
 *  · **le débit par ACTEUR.** Aucun des deux verbes n'en porte ; seul le plafond
 *    global par IP s'applique, et chaque ajout pousse une notification nommant
 *    l'acteur. **#19812**.
 *  · **la phase d'ACTIVATION.** `isActive` reste `true` pour un compte dont
 *    l'adresse n'est pas prouvée (le défaut de la colonne) : un compte en phase
 *    `blocked` (`services/auth/account-activation.ts`), qui ne peut plus ouvrir
 *    de session, est invitable et reçoit une notification qu'il ne lira pas.
 *    **#19813**.
 *  · `hideProfileFromSearch` n'est PAS interrogé, et c'est voulu : la cible est
 *    nommée par un `User.id` que l'acteur détient déjà, pas résolue depuis un
 *    identifiant — la loi de `services/profile-discoverability.ts` garde les
 *    résolutions identifiant → compte, pas les références directes.
 *
 * **Ce que l'admission PRODUIT, et qui n'est pas cosmétique** :
 * `effectiveRelationLevel` élève la personne ajoutée à `COMMUNITY` avec tous les
 * membres (`packages/shared/utils/relation-access.ts`), ce qui ouvre
 * `views.identity` et toute feature que la cible a réglée sur `COMMUNITY`. C'est
 * un octroi d'accès SANS consentement, et c'est le dessein de #6376 — écrit ici
 * pour que la prochaine lecture ne le découvre pas.
 *
 * « Vivant » vient de `USABLE_ACCOUNT_WHERE`, jamais d'une égalité écrite ici.
 * Composé à la main (`deactivatedAt: null, deletedAt: null`), ce filtre
 * n'appariait AUCUN compte — aucune création n'écrit ces colonnes — et les deux
 * routes rendaient 404 pour tout le monde : personne ne pouvait être invité dans
 * une communauté, ni ajouté par un administrateur (#19799).
 */
export async function isAddableUser(prisma: Pick<PrismaClient, 'user'>, actorId: string, targetId: string): Promise<boolean> {
  const target = await prisma.user.findFirst({
    where: { id: targetId, ...USABLE_ACCOUNT_WHERE },
    select: { id: true },
  });
  if (target === null) return false;
  return !(await isBlockedBetween(prisma, actorId, targetId));
}
