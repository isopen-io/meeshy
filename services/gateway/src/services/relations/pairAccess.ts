/**
 * L'ORCHESTRATEUR de la loi d'accès pour une paire ou un éventail (#14107).
 *
 * La loi (`resolveRelationAccess`) est pure : elle reçoit le niveau, le blocage,
 * la communauté et l'âge déclaré. Chaque service du dépôt réassemblait ces
 * lectures à sa façon (`entourage.ts`, `GameProfileService`, `chosenRecipientLinks`),
 * et passait `'unknown'` pour l'âge faute de le lire — ce qui laisse ouvert tout
 * bouclier des mineurs. Ici, les lectures sont celles que la feature EXIGE
 * (`relationAccessReads`) : l'âge pour le bouclier et la Connaissance
 * automatique, la communauté quand un plancher s'atteint par elle, le rôle des
 * deux côtés quand le privilège d'équipe peut ouvrir la feature (#16623). L'âge, le
 * rôle et l'état du compte partent en UNE lecture, parallèle à celle du niveau : elle
 * n'allonge rien. Elle est TOUJOURS faite : un compte inutilisable des deux côtés ferme
 * toute feature (#20679), et ce verdict-là ne dépend pas de ce que la feature exige.
 *
 * Le niveau vient du site unique (`niveauxParmi`) ; aucune comparaison de
 * niveaux n'est écrite ici. Une lecture qui échoue LÈVE : l'appelant ferme.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { declaredAgeClass, minorProtectedBetween, type DeclaredAgeClass } from '@meeshy/shared/utils/age';
import { ACCOUNT_STATE_SELECT, isUsableAccount, lawRoleOf } from './usableAccount';
import { effectiveRelationLevel, relationAccessReads, resolveRelationAccess, type RelationAccess, type RelationConsent } from '@meeshy/shared/utils/relation-access';
import type { RelationFeature } from '@meeshy/shared/utils/relation-levels';
import type { RelationLevel } from '@meeshy/shared/types/relation';
import { getBlockedUserIdsAmong } from '../../utils/blocking';
import { niveauxParmi } from '../friendship';

export type PairAccessDb = Pick<PrismaClient, 'friendRequest' | 'userRelation' | 'user' | 'communityMember'>;

/** Qui, du sujet ou des autres, est le VIEWER de la loi (celui qui voit ou qui agit). */
export type PairAccessSubject = 'viewer' | 'target';

export type PairAccessAmongParams = {
  readonly feature: RelationFeature;
  readonly subjectId: string;
  readonly otherIds: readonly string[];
  readonly subjectIs: PairAccessSubject;
  readonly now?: Date;
  /**
   * Le consentement, pour une feature qui en exige un (écoute, position) : l'appelant
   * le lit par `relationPairConsentAmong` et le rend par autre personne, avec le NIVEAU
   * EFFECTIF que la loi vient de lire (équipe comprise) — c'est lui qui donne le défaut du
   * palier et le verrou du Sang (`resolveEmitterConsent`, #20361), et si la CIBLE de la loi (l'émetteur
   * d'un partage) est mineure déclarée. Absent, la loi refuse
   * toute feature à consentement (`reason: 'consent'`).
   */
  readonly consentOf?: (otherId: string, effectiveLevel: RelationLevel, ages: { readonly targetMinor: boolean; readonly minorProtected: boolean; readonly realLevel: RelationLevel }) => RelationConsent | undefined;
};

export type PairPerson = {
  readonly age: DeclaredAgeClass;
  readonly birthDate: Date | null;
  readonly role: string | null;
  /** Actif, ni supprimé, ni désactivé (`isUsableAccount`) — la SEULE lecture de l'état du compte (#20679). */
  readonly usable: boolean;
};

export async function peopleOf(prisma: PairAccessDb, ids: readonly string[], now: Date): Promise<ReadonlyMap<string, PairPerson>> {
  const rows = await prisma.user.findMany({
    where: { id: { in: [...ids] } },
    select: { id: true, birthDate: true, role: true, ...ACCOUNT_STATE_SELECT },
  });
  return new Map(
    rows.map((row) => [
      row.id,
      { age: declaredAgeClass(row.birthDate ?? null, now), birthDate: row.birthDate ?? null, role: lawRoleOf(row), usable: isUsableAccount(row) },
    ]),
  );
}

export async function coMembersAmong(prisma: PairAccessDb, subjectId: string, ids: readonly string[]): Promise<ReadonlySet<string>> {
  const own = await prisma.communityMember.findMany({ where: { userId: subjectId, isActive: true }, select: { communityId: true } });
  if (own.length === 0) return new Set();
  const shared = await prisma.communityMember.findMany({
    where: { userId: { in: [...ids] }, isActive: true, communityId: { in: own.map((m) => m.communityId) } },
    select: { userId: true },
  });
  return new Set(shared.map((m) => m.userId));
}

/**
 * Le verdict de la loi entre `subjectId` et CHACUN des `otherIds` (soi et doublons
 * écartés). `subjectIs` dit le sens : `viewer` quand le sujet agit envers les
 * autres (il écrit une demande), `target` quand ce sont les autres qui voient le
 * sujet (sa frappe, son Ne pas déranger).
 */
export async function pairAccessAmong(prisma: PairAccessDb, params: PairAccessAmongParams): Promise<ReadonlyMap<string, RelationAccess>> {
  const { feature, subjectId } = params;
  const ids = [...new Set(params.otherIds)].filter((id) => id && id !== subjectId);
  if (!subjectId || ids.length === 0) return new Map();

  const now = params.now ?? new Date();
  const reads = relationAccessReads(feature);
  const [levels, blocked, people, coMembers] = await Promise.all([
    niveauxParmi(prisma, subjectId, ids),
    getBlockedUserIdsAmong(prisma, subjectId, ids),
    peopleOf(prisma, [subjectId, ...ids], now),
    reads.community ? coMembersAmong(prisma, subjectId, ids) : Promise.resolve(new Set<string>()),
  ]);

  const ageOf = (id: string): DeclaredAgeClass => (reads.age ? people.get(id)?.age : undefined) ?? 'unknown';
  const roleOf = (id: string): string | null => people.get(id)?.role ?? null;
  return new Map(
    ids.map((id) => {
      const level = levels.get(id) ?? 'PUBLIC';
      const [viewerId, targetId] = params.subjectIs === 'viewer' ? [subjectId, id] : [id, subjectId];
      const input = {
        viewerId,
        targetId,
        grantedByViewer: level,
        grantedByTarget: level,
        sharesCommunity: coMembers.has(id),
        blockedEitherWay: blocked.has(id),
        viewerMinor: ageOf(viewerId),
        targetMinor: ageOf(targetId),
        viewerRole: roleOf(viewerId),
        targetRole: roleOf(targetId),
        feature,
      };
      const probe = resolveRelationAccess({ ...input, consent: 'unknown' });
      if (!people.get(subjectId)?.usable || !people.get(id)?.usable) return [id, unusableVerdict(probe)];
      const consentOf = params.consentOf;
      return [id, !probe.requiresConsent || !consentOf ? probe : resolveRelationAccess({ ...input, consent: consentOf(id, probe.effectiveLevel, { targetMinor: input.targetMinor === 'minor', realLevel: effectiveRelationLevel(input), minorProtected: minorProtectedBetween({ emitterBirthDate: people.get(targetId)?.birthDate, otherBirthDate: people.get(viewerId)?.birthDate, now }) }) })];
    }),
  );
}

/**
 * Un compte qui ne peut ni agir ni recevoir (`isUsableAccount` : inactif, supprimé en
 * attente de purge, désactivé, ou ligne absente) n'ouvre RIEN, d'un côté comme de l'autre
 * (#20679). La suppression demandée par la personne écrit `{ isActive: false, deletedAt }`
 * sans `deactivatedAt` : un juge qui ne lisait que la désactivation laissait la fiche, la
 * position et l'écoute d'un compte parti à ses Sangs pendant toute la grâce. Le verdict
 * dit `level` et `PUBLIC`, comme une paire sans lien : il ne révèle ni un blocage ni un départ.
 */
const unusableVerdict = (probe: RelationAccess): RelationAccess => ({
  allowed: false,
  effectiveLevel: 'PUBLIC',
  reason: 'level',
  requiresConsent: probe.requiresConsent,
});

/** Le verdict de la loi pour UNE paire : `viewerId` voit ou agit envers `targetId`. */
export async function pairAccess(
  prisma: PairAccessDb,
  params: { readonly feature: RelationFeature; readonly viewerId: string; readonly targetId: string; readonly now?: Date },
): Promise<RelationAccess> {
  const among = await pairAccessAmong(prisma, {
    feature: params.feature,
    subjectId: params.viewerId,
    otherIds: [params.targetId],
    subjectIs: 'viewer',
    now: params.now,
  });
  return (
    among.get(params.targetId) ??
    resolveRelationAccess({
      viewerId: params.viewerId,
      targetId: params.targetId,
      grantedByViewer: 'PUBLIC',
      grantedByTarget: 'PUBLIC',
      sharesCommunity: false,
      blockedEitherWay: false,
      viewerMinor: 'unknown',
      targetMinor: 'unknown',
      feature: params.feature,
    })
  );
}

/**
 * Les mineurs DÉCLARÉS que `senderId` ne peut pas atteindre par `feature` — le
 * bouclier (`RELATION_MINOR_TARGET_MIN_LEVEL`, RG-21) et lui seul : le blocage
 * garde sa propre règle. L'âge est lu d'abord ; sans mineur parmi les cibles,
 * aucune autre lecture (le chemin nominal d'un groupe d'adultes ne coûte rien).
 */
export async function minorShieldedAmong(
  prisma: PairAccessDb,
  params: { readonly feature: RelationFeature; readonly senderId: string; readonly recipientIds: readonly string[]; readonly now?: Date },
): Promise<ReadonlySet<string>> {
  const now = params.now ?? new Date();
  const ids = [...new Set(params.recipientIds)].filter((id) => id && id !== params.senderId);
  if (ids.length === 0) return new Set();
  const people = await peopleOf(prisma, ids, now);
  const minors = ids.filter((id) => people.get(id)?.age === 'minor');
  if (minors.length === 0) return new Set();
  const verdicts = await pairAccessAmong(prisma, { feature: params.feature, subjectId: params.senderId, otherIds: minors, subjectIs: 'viewer', now });
  return new Set(minors.filter((id) => verdicts.get(id)?.allowed === false && verdicts.get(id)?.reason === 'level'));
}
