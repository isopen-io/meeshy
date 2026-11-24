/**
 * QUI REÇOIT un état d'appareil de qui — la loi commune du téléphone injoignable (#18737), de
 * l'alerte d'inactivité (#18738), d'« en appel » (#18753) et de la chute détectée (#18748), sur le modèle de la batterie (`battery/batteryAccess.ts`) :
 * la loi par `pairAccessAmong` (niveau, blocage, équipe #16623), le consentement tri-état de
 * l'émetteur résolu par `resolveEmitterConsent`, sa coupure globale, et un compte désactivé ou
 * supprimé qui n'émet ni ne reçoit.
 *
 * Entre Sangs, après l'accord au palier (#20361), ni le refus stocké ni la COUPURE globale ne
 * ferment. L'ACCORD de la chute (art. 9 RGPD, âge minimum) n'est pas une coupure : il entre comme
 * garde LÉGALE (`legallyBlocked`), jugée avant le verrou et que rien ne lève.
 */
import type { RelationLevel } from '@meeshy/shared/types/relation';
import { resolveEmitterConsent } from '@meeshy/shared/utils/relation-emitter-consent';
import type { BatteryDb } from '../battery/batteryAccess';
import { pairAccessAmong, type PairAccessSubject } from './pairAccess';
import { relationPairConsentFor } from './relationConsent';
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
  /** `legal` : un accord ou un âge exigé par la loi, jamais levé par le verrou du Sang ; `cut` : une coupure de confort. */
  readonly nature: 'legal' | 'cut';
};

export type EmitterFeature =
  | { readonly feature: 'device.unreachable'; readonly disabledColumn: 'unreachableSharingDisabledAt' }
  | { readonly feature: 'safety.inactivity'; readonly disabledColumn: 'inactivityCheckDisabledAt' }
  | { readonly feature: 'device.call'; readonly disabledColumn: 'callSharingDisabledAt' }
  | { readonly feature: 'health.fall'; readonly emitterSwitch: EmitterSwitch };

const globalSwitchOf = (spec: EmitterFeature): EmitterSwitch =>
  'emitterSwitch' in spec
    ? spec.emitterSwitch
    : { select: { [spec.disabledColumn]: true }, off: (row) => (row[spec.disabledColumn] ?? null) !== null, nature: 'cut' };

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
  const [accounts, stored] = await Promise.all([
    accountsOf(prisma, [params.subjectId, ...otherIds], globalSwitch),
    relationPairConsentFor(prisma, { subjectId: params.subjectId, otherIds, subjectIs: params.subjectIs, feature }),
  ]);
  const law = await pairAccessAmong(prisma, {
    feature,
    subjectId: params.subjectId,
    otherIds,
    subjectIs: params.subjectIs,
    now: params.now,
    consentOf: (id, effectiveLevel: RelationLevel, ages) => {
      const off = globalSwitch.off(accounts.get(emitterOf(id)) ?? {}, params.now);
      const pair = stored.get(id);
      return resolveEmitterConsent({
        feature,
        stored: pair?.stored ?? null,
        effectiveLevel,
        realLevel: ages.realLevel,
        bloodBundleAccepted: pair?.bloodBundleAccepted === true,
        ...(globalSwitch.nature === 'legal' ? { legallyBlocked: off } : { globallyDisabled: off }),
      });
    },
  });
  return new Set(
    otherIds.filter((id) => law.get(id)?.allowed === true && isUsableAccount(accounts.get(emitterOf(id))) && isUsableAccount(accounts.get(readerOf(id)))),
  );
}
