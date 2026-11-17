/**
 * QUI REÇOIT L'INJOIGNABILITÉ du téléphone de qui (#18737) — même forme que la batterie
 * (`battery/batteryAccess.ts`) : la loi par `pairAccessAmong` (niveau, blocage, équipe #16623),
 * le consentement tri-état de l'émetteur résolu par `resolveEmitterConsent` (Sang et équipe :
 * accordé sauf refus ; Proche : refusé sauf accord), la coupure globale (le fantôme), et un compte
 * désactivé ou supprimé qui n'émet ni ne reçoit. Les candidats sont ceux de la batterie : les
 * Proches et les Sangs, plus les collègues pour un compte de l'équipe.
 */
import type { RelationLevel } from '@meeshy/shared/types/relation';
import { resolveEmitterConsent } from '@meeshy/shared/utils/relation-emitter-consent';
import { pairAccessAmong, type PairAccessSubject } from '../relations/pairAccess';
import { relationStoredConsentAmong, relationStoredConsentBy } from '../relations/relationConsent';
import { isUsableAccount, ACCOUNT_STATE_SELECT, type AccountState } from '../relations/usableAccount';
import type { BatteryDb } from '../battery/batteryAccess';

export type PhoneReachabilityDb = BatteryDb;

const FEATURE = 'device.unreachable' as const;

type Params = {
  readonly subjectId: string;
  readonly otherIds: readonly string[];
  /** `target` : le sujet est l'ÉMETTEUR, les autres le lisent ; `viewer` : le sujet est le LECTEUR. */
  readonly subjectIs: PairAccessSubject;
  readonly now: Date;
};

const emitterOf = (params: Params, otherId: string): string => (params.subjectIs === 'target' ? params.subjectId : otherId);
const readerOf = (params: Params, otherId: string): string => (params.subjectIs === 'target' ? otherId : params.subjectId);

async function accountsOf(prisma: PhoneReachabilityDb, ids: readonly string[]) {
  const rows = (await prisma.user.findMany({
    where: { id: { in: [...new Set(ids)] } },
    select: { id: true, unreachableSharingDisabledAt: true, ...ACCOUNT_STATE_SELECT },
  })) as ReadonlyArray<AccountState & { readonly id: string; readonly unreachableSharingDisabledAt: Date | null }>;
  return new Map(rows.map((row) => [row.id, row]));
}

/** Les personnes parmi `otherIds` à qui la loi ET l'émetteur ouvrent l'injoignabilité. */
export async function phoneReachabilityAllowedAmong(prisma: PhoneReachabilityDb, params: Params): Promise<ReadonlySet<string>> {
  const otherIds = [...new Set(params.otherIds)].filter((id) => id && id !== params.subjectId);
  if (!params.subjectId || otherIds.length === 0) return new Set();
  const scoped: Params = { ...params, otherIds };
  const [accounts, stored, probe] = await Promise.all([
    accountsOf(prisma, [params.subjectId, ...otherIds]),
    params.subjectIs === 'target'
      ? relationStoredConsentAmong(prisma, { ownerId: params.subjectId, otherIds, feature: FEATURE })
      : relationStoredConsentBy(prisma, { ownerIds: otherIds, otherId: params.subjectId, feature: FEATURE }),
    pairAccessAmong(prisma, { feature: FEATURE, subjectId: params.subjectId, otherIds, subjectIs: params.subjectIs, now: params.now, consentOf: () => 'unknown' }),
  ]);
  const levelOf = (id: string): RelationLevel => probe.get(id)?.effectiveLevel ?? 'PUBLIC';
  const law = await pairAccessAmong(prisma, {
    feature: FEATURE,
    subjectId: params.subjectId,
    otherIds,
    subjectIs: params.subjectIs,
    now: params.now,
    consentOf: (id) =>
      resolveEmitterConsent({
        feature: FEATURE,
        stored: stored.get(id),
        effectiveLevel: levelOf(id),
        globallyDisabled: Boolean(accounts.get(emitterOf(scoped, id))?.unreachableSharingDisabledAt),
      }),
  });
  return new Set(
    otherIds.filter(
      (id) =>
        law.get(id)?.allowed === true &&
        isUsableAccount(accounts.get(emitterOf(scoped, id))) &&
        isUsableAccount(accounts.get(readerOf(scoped, id))),
    ),
  );
}
