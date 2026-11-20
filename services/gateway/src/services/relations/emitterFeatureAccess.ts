/**
 * QUI REÇOIT un état d'appareil de qui — la loi commune du téléphone injoignable (#18737), de
 * l'alerte d'inactivité (#18738), d'« en appel » (#18753) et de la chute détectée (#18748), sur le modèle de la batterie (`battery/batteryAccess.ts`) :
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

/**
 * Une feature à consentement stocké, et l'interrupteur global de son émetteur sur sa ligne `User` :
 * une COUPURE (`disabledColumn`, non nulle = coupé pour tous) pour les états actifs par défaut, ou un
 * ACCORD jugé sur la ligne entière (`emitterSwitch`) pour la chute (#18748), jamais active par défaut :
 * l'accord à la version courante, et l'âge déclaré.
 */
export type EmitterSwitch = {
  readonly select: Readonly<Record<string, true>>;
  readonly off: (row: Readonly<Record<string, unknown>>, now: Date) => boolean;
};

export type EmitterFeature =
  | { readonly feature: 'device.unreachable'; readonly disabledColumn: 'unreachableSharingDisabledAt' }
  | { readonly feature: 'safety.inactivity'; readonly disabledColumn: 'inactivityCheckDisabledAt' }
  | { readonly feature: 'device.call'; readonly disabledColumn: 'callSharingDisabledAt' }
  | { readonly feature: 'health.fall'; readonly emitterSwitch: EmitterSwitch };

const globalSwitchOf = (spec: EmitterFeature): EmitterSwitch =>
  'emitterSwitch' in spec
    ? spec.emitterSwitch
    : { select: { [spec.disabledColumn]: true }, off: (row) => (row[spec.disabledColumn] ?? null) !== null };

export type EmitterFeatureParams = {
  readonly subjectId: string;
  readonly otherIds: readonly string[];
  /** `target` : le sujet est l'ÉMETTEUR, les autres le lisent ; `viewer` : le sujet est le LECTEUR. */
  readonly subjectIs: PairAccessSubject;
  readonly now: Date;
};

type Account = AccountState & { readonly id: string } & Readonly<Record<string, unknown>>;

async function accountsOf(prisma: EmitterFeatureDb, ids: readonly string[], emitterSwitch: EmitterSwitch): Promise<ReadonlyMap<string, Account>> {
  const rows = (await prisma.user.findMany({
    where: { id: { in: [...new Set(ids)] } },
    select: { id: true, ...emitterSwitch.select, ...ACCOUNT_STATE_SELECT },
  })) as unknown as ReadonlyArray<Account>;
  return new Map(rows.map((row) => [row.id, row]));
}

/** Les personnes parmi `otherIds` à qui la loi ET l'émetteur ouvrent la feature. */
export async function emitterFeatureAllowedAmong(prisma: EmitterFeatureDb, spec: EmitterFeature, params: EmitterFeatureParams): Promise<ReadonlySet<string>> {
  const otherIds = [...new Set(params.otherIds)].filter((id) => id && id !== params.subjectId);
  if (!params.subjectId || otherIds.length === 0) return new Set();
  const emitterOf = (otherId: string): string => (params.subjectIs === 'target' ? params.subjectId : otherId);
  const readerOf = (otherId: string): string => (params.subjectIs === 'target' ? otherId : params.subjectId);
  const { feature } = spec;
  const globalSwitch = globalSwitchOf(spec);
  const [accounts, stored, probe] = await Promise.all([
    accountsOf(prisma, [params.subjectId, ...otherIds], globalSwitch),
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
        globallyDisabled: globalSwitch.off(accounts.get(emitterOf(id)) ?? {}, params.now),
      }),
  });
  return new Set(
    otherIds.filter((id) => law.get(id)?.allowed === true && isUsableAccount(accounts.get(emitterOf(id))) && isUsableAccount(accounts.get(readerOf(id)))),
  );
}
