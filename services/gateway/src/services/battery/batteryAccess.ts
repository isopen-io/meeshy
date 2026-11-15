/**
 * QUI REÇOIT LA BATTERIE de qui (#14147 ; spec § 2) — la loi, le consentement tri-état de
 * l'émetteur, sa coupure globale, et ce que le LECTEUR veut recevoir.
 *
 * - le niveau, le blocage et l'équipe (#16623) passent par `pairAccessAmong`, site unique de
 *   la loi : un premier passage lit le niveau EFFECTIF, un second juge avec le consentement
 *   résolu par `resolveEmitterConsent` (Sang et équipe : accordé sauf refus ; Proche : refusé
 *   sauf accord) ;
 * - la colonne de consentement se lit par `relationStoredConsentAmong` / `…By`, à CHAQUE
 *   appel, jamais en cache ;
 * - un compte désactivé ou supprimé n'émet ni ne reçoit ; une coupure globale ferme tout ;
 * - un lecteur qui a choisi `none` pour cette personne ne reçoit rien, pas même l'état.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import {
  BATTERY_DEFAULT_RECEIVE_MODE,
  BATTERY_RECEIVE_MODES,
  type BatteryReceiveMode,
} from '@meeshy/shared/types/battery';
import type { RelationLevel } from '@meeshy/shared/types/relation';
import { resolveEmitterConsent } from '@meeshy/shared/utils/relation-emitter-consent';
import { comptesAuMoins } from '../friendship';
import { pairAccessAmong, type PairAccessDb, type PairAccessSubject } from '../relations/pairAccess';
import { relationStoredConsentAmong, relationStoredConsentBy, type StoredConsentFeature } from '../relations/relationConsent';
import { teamPeerCandidates } from '../relations/teamPeers';
import { isUsableAccount, ACCOUNT_STATE_SELECT } from '../relations/usableAccount';

export type BatteryDb = PairAccessDb & Pick<PrismaClient, 'relationFeatureSetting'>;

export type BatteryReaderAccess = { readonly allowed: boolean; readonly receive: BatteryReceiveMode };

const CLOSED: BatteryReaderAccess = { allowed: false, receive: BATTERY_DEFAULT_RECEIVE_MODE };

/** Au-delà, l'éventail s'arrête aux liens les plus proches (`comptesAuMoins` range du Sang au Proche). */
export const BATTERY_AUDIENCE_LIMIT = 500;

export const parseReceiveMode = (value: unknown): BatteryReceiveMode =>
  typeof value === 'string' && (BATTERY_RECEIVE_MODES as readonly string[]).includes(value) ? (value as BatteryReceiveMode) : BATTERY_DEFAULT_RECEIVE_MODE;

type Params = {
  readonly subjectId: string;
  readonly otherIds: readonly string[];
  /** `target` : le sujet est l'ÉMETTEUR, les autres le lisent ; `viewer` : le sujet est le LECTEUR. */
  readonly subjectIs: PairAccessSubject;
  readonly now: Date;
  readonly feature?: StoredConsentFeature;
};

const emitterOf = (params: Params, otherId: string): string => (params.subjectIs === 'target' ? params.subjectId : otherId);
const readerOf = (params: Params, otherId: string): string => (params.subjectIs === 'target' ? otherId : params.subjectId);

async function accountsOf(prisma: BatteryDb, ids: readonly string[]) {
  const rows = await prisma.user.findMany({
    where: { id: { in: [...new Set(ids)] } },
    select: { id: true, batterySharingDisabledAt: true, ...ACCOUNT_STATE_SELECT },
  });
  return new Map(rows.map((row) => [row.id, row]));
}

async function storedConsents(prisma: BatteryDb, params: Params, feature: StoredConsentFeature): Promise<ReadonlyMap<string, boolean | null>> {
  return params.subjectIs === 'target'
    ? relationStoredConsentAmong(prisma, { ownerId: params.subjectId, otherIds: params.otherIds, feature })
    : relationStoredConsentBy(prisma, { ownerIds: params.otherIds, otherId: params.subjectId, feature });
}

/** Ce que chaque lecteur a choisi de recevoir de l'émetteur (sa propre ligne, `ownerId` = lecteur). */
async function receiveModes(prisma: BatteryDb, params: Params): Promise<ReadonlyMap<string, BatteryReceiveMode>> {
  const where = params.subjectIs === 'target'
    ? { ownerId: { in: [...params.otherIds] }, otherId: params.subjectId }
    : { ownerId: params.subjectId, otherId: { in: [...params.otherIds] } };
  const rows = (await prisma.relationFeatureSetting.findMany({
    where,
    select: { ownerId: true, otherId: true, batteryReceive: true },
  })) as ReadonlyArray<{ ownerId: string; otherId: string; batteryReceive: string | null }>;
  return new Map(rows.map((row) => [params.subjectIs === 'target' ? row.ownerId : row.otherId, parseReceiveMode(row.batteryReceive)]));
}

/**
 * L'accès de chaque autre personne : `allowed` dit ce que la loi ET l'émetteur ouvrent,
 * `receive` ce que le lecteur veut. Une personne absente de la carte n'a rien.
 */
export async function batteryAccessAmong(prisma: BatteryDb, params: Params): Promise<ReadonlyMap<string, BatteryReaderAccess>> {
  const feature = params.feature ?? 'device.battery';
  const otherIds = [...new Set(params.otherIds)].filter((id) => id && id !== params.subjectId);
  if (!params.subjectId || otherIds.length === 0) return new Map();
  const scoped: Params = { ...params, otherIds };

  const [accounts, stored, modes, probe] = await Promise.all([
    accountsOf(prisma, [params.subjectId, ...otherIds]),
    storedConsents(prisma, scoped, feature),
    receiveModes(prisma, scoped),
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
        globallyDisabled: Boolean(accounts.get(emitterOf(scoped, id))?.batterySharingDisabledAt),
      }),
  });

  return new Map(
    otherIds.map((id) => {
      const usable = isUsableAccount(accounts.get(emitterOf(scoped, id))) && isUsableAccount(accounts.get(readerOf(scoped, id)));
      const allowed = usable && law.get(id)?.allowed === true;
      return [id, allowed ? { allowed, receive: modes.get(id) ?? BATTERY_DEFAULT_RECEIVE_MODE } : CLOSED];
    }),
  );
}

/** Un lecteur SERVI : la loi ouvre, et il n'a pas tout coupé pour cette personne. */
export const isServed = (access: BatteryReaderAccess | undefined): access is BatteryReaderAccess =>
  access !== undefined && access.allowed && access.receive !== 'none';

/**
 * Les CANDIDATS de l'éventail de `subjectId` : ses Proches et ses Sangs, et — pour un compte de
 * l'équipe, qui a le niveau Sang face à un collègue sans lien (#16623) — ses collègues. La loi
 * juge chacun ensuite ; un utilisateur ordinaire garde ses seuls liens.
 */
export async function batteryCandidatesOf(prisma: BatteryDb, subjectId: string): Promise<readonly string[]> {
  const [linked, team] = await Promise.all([
    comptesAuMoins(prisma, subjectId, 'CLOSE', { limit: BATTERY_AUDIENCE_LIMIT }),
    teamPeerCandidates(prisma, subjectId),
  ]);
  return [...new Set([...linked.map((link) => link.id), ...team])].filter((id) => id !== subjectId);
}
