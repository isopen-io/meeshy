/**
 * QUI REÇOIT un état d'appareil de qui — la loi commune du téléphone injoignable (#18737) et de
 * l'alerte d'inactivité (#18738), sur le modèle de la batterie (`battery/batteryAccess.ts`) :
 * la loi par `pairAccessAmong` (niveau, blocage, équipe #16623), le consentement tri-état de
 * l'émetteur résolu par `resolveEmitterConsent`, sa coupure globale, et un compte désactivé ou
 * supprimé qui n'émet ni ne reçoit.
 */
import type { RelationLevel } from '@meeshy/shared/types/relation';
import { resolveEmitterConsent } from '@meeshy/shared/utils/relation-emitter-consent';
import type { BatteryDb } from '../battery/batteryAccess';
import { pairAccessAmong, type PairAccessSubject } from './pairAccess';
import { relationStoredConsentAmong, relationStoredConsentBy } from './relationConsent';
import { isUsableAccount, ACCOUNT_STATE_SELECT, type AccountState } from './usableAccount';

export type EmitterFeatureDb = BatteryDb;

/** Une feature à consentement stocké, et la colonne `User` de la coupure globale de son émetteur. */
export type EmitterFeature =
  | { readonly feature: 'device.unreachable'; readonly disabledColumn: 'unreachableSharingDisabledAt' }
  | { readonly feature: 'safety.inactivity'; readonly disabledColumn: 'inactivityCheckDisabledAt' };

export type EmitterFeatureParams = {
  readonly subjectId: string;
  readonly otherIds: readonly string[];
  /** `target` : le sujet est l'ÉMETTEUR, les autres le lisent ; `viewer` : le sujet est le LECTEUR. */
  readonly subjectIs: PairAccessSubject;
  readonly now: Date;
};

type Account = AccountState & { readonly id: string; readonly disabledAt: Date | null };

async function accountsOf(prisma: EmitterFeatureDb, ids: readonly string[], column: EmitterFeature['disabledColumn']): Promise<ReadonlyMap<string, Account>> {
  const rows = (await prisma.user.findMany({
    where: { id: { in: [...new Set(ids)] } },
    select: { id: true, [column]: true, ...ACCOUNT_STATE_SELECT },
  })) as unknown as ReadonlyArray<AccountState & { readonly id: string } & Record<string, unknown>>;
  return new Map(rows.map((row) => [row.id, { ...row, disabledAt: (row[column] as Date | null | undefined) ?? null }]));
}

/** Les personnes parmi `otherIds` à qui la loi ET l'émetteur ouvrent la feature. */
export async function emitterFeatureAllowedAmong(prisma: EmitterFeatureDb, spec: EmitterFeature, params: EmitterFeatureParams): Promise<ReadonlySet<string>> {
  const otherIds = [...new Set(params.otherIds)].filter((id) => id && id !== params.subjectId);
  if (!params.subjectId || otherIds.length === 0) return new Set();
  const emitterOf = (otherId: string): string => (params.subjectIs === 'target' ? params.subjectId : otherId);
  const readerOf = (otherId: string): string => (params.subjectIs === 'target' ? otherId : params.subjectId);
  const { feature } = spec;
  const [accounts, stored, probe] = await Promise.all([
    accountsOf(prisma, [params.subjectId, ...otherIds], spec.disabledColumn),
    params.subjectIs === 'target'
      ? relationStoredConsentAmong(prisma, { ownerId: params.subjectId, otherIds, feature })
      : relationStoredConsentBy(prisma, { ownerIds: otherIds, otherId: params.subjectId, feature }),
    pairAccessAmong(prisma, { feature, subjectId: params.subjectId, otherIds, subjectIs: params.subjectIs, now: params.now, consentOf: () => 'unknown' }),
  ]);
  const levelOf = (id: string): RelationLevel => probe.get(id)?.effectiveLevel ?? 'PUBLIC';
  const law = await pairAccessAmong(prisma, {
    feature,
    subjectId: params.subjectId,
    otherIds,
    subjectIs: params.subjectIs,
    now: params.now,
    consentOf: (id) =>
      resolveEmitterConsent({
        feature,
        stored: stored.get(id),
        effectiveLevel: levelOf(id),
        globallyDisabled: Boolean(accounts.get(emitterOf(id))?.disabledAt),
      }),
  });
  return new Set(
    otherIds.filter((id) => law.get(id)?.allowed === true && isUsableAccount(accounts.get(emitterOf(id))) && isUsableAccount(accounts.get(readerOf(id)))),
  );
}
