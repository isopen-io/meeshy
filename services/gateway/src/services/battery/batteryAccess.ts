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
import { bloodBundleAcceptedOf, relationPairConsentFor, type PairStoredConsent, type StoredConsentFeature } from '../relations/relationConsent';
import { relationBloodLocked } from '@meeshy/shared/utils/relation-emitter-consent';
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
  /**
   * L'accord de batterie des partages de position en cours (#19204) : pour chaque émetteur
   * (minuscules), les lecteurs (minuscules) à qui son partage l'accorde. Il vaut consentement de
   * l'émetteur pour `device.battery` seulement — la loi reste le plafond, la coupure globale ferme,
   * et le fantôme global (#19203), qui met le partage en pause, met sa batterie en pause aussi.
   */
  readonly sharedGrants?: ReadonlyMap<string, ReadonlySet<string>>;
};

const emitterOf = (params: Params, otherId: string): string => (params.subjectIs === 'target' ? params.subjectId : otherId);
const readerOf = (params: Params, otherId: string): string => (params.subjectIs === 'target' ? otherId : params.subjectId);

async function accountsOf(prisma: BatteryDb, ids: readonly string[]) {
  const rows = await prisma.user.findMany({
    where: { id: { in: [...new Set(ids)] } },
    select: { id: true, batterySharingDisabledAt: true, locationGhostAt: true, ...ACCOUNT_STATE_SELECT },
  });
  return new Map(rows.map((row) => [row.id, row]));
}

async function storedConsents(prisma: BatteryDb, params: Params, feature: StoredConsentFeature): Promise<ReadonlyMap<string, PairStoredConsent>> {
  return relationPairConsentFor(prisma, { subjectId: params.subjectId, otherIds: params.otherIds, subjectIs: params.subjectIs, feature });
}

type ReceiveChoice = { readonly mode: BatteryReceiveMode; readonly bloodBundleAccepted: boolean };

/** Ce que chaque lecteur a choisi de recevoir de l'émetteur (sa propre ligne, `ownerId` = lecteur), et son accord au palier. */
async function receiveModes(prisma: BatteryDb, params: Params): Promise<ReadonlyMap<string, ReceiveChoice>> {
  const where = params.subjectIs === 'target'
    ? { ownerId: { in: [...params.otherIds] }, otherId: params.subjectId }
    : { ownerId: params.subjectId, otherId: { in: [...params.otherIds] } };
  const rows = (await prisma.relationFeatureSetting.findMany({
    where,
    select: { ownerId: true, otherId: true, batteryReceive: true, bloodBundleAcceptedAt: true, bloodBundleVersion: true },
  })) as ReadonlyArray<{ ownerId: string; otherId: string; batteryReceive: string | null; bloodBundleAcceptedAt: Date | null; bloodBundleVersion: string | null }>;
  return new Map(rows.map((row) => [params.subjectIs === 'target' ? row.ownerId : row.otherId, { mode: parseReceiveMode(row.batteryReceive), bloodBundleAccepted: bloodBundleAcceptedOf(row) }]));
}

/**
 * Ce que le lecteur reçoit : son choix, sauf qu'entre Sangs, après SON accord au palier, « rien »
 * ne se choisit plus (#20361) — il reçoit la pastille, la forme la plus discrète.
 */
const receiveOf = (choice: ReceiveChoice | undefined, feature: StoredConsentFeature, effectiveLevel: RelationLevel): BatteryReceiveMode => {
  const mode = choice?.mode ?? BATTERY_DEFAULT_RECEIVE_MODE;
  return mode === 'none' && choice?.bloodBundleAccepted === true && relationBloodLocked({ feature, effectiveLevel }) ? 'pill' : mode;
};

/** Le partage de position en cours de l'émetteur accorde-t-il sa batterie à ce lecteur (#19204) ? */
const grantedBySharedLocation = (params: Params, feature: StoredConsentFeature, otherId: string): boolean =>
  feature === 'device.battery' &&
  params.sharedGrants?.get(emitterOf(params, otherId).toLowerCase())?.has(readerOf(params, otherId).toLowerCase()) === true;

/**
 * L'accès de chaque autre personne : `allowed` dit ce que la loi ET l'émetteur ouvrent,
 * `receive` ce que le lecteur veut. Une personne absente de la carte n'a rien.
 */
export async function batteryAccessAmong(prisma: BatteryDb, params: Params): Promise<ReadonlyMap<string, BatteryReaderAccess>> {
  const feature = params.feature ?? 'device.battery';
  const otherIds = [...new Set(params.otherIds)].filter((id) => id && id !== params.subjectId);
  if (!params.subjectId || otherIds.length === 0) return new Map();
  const scoped: Params = { ...params, otherIds };

  const [accounts, stored, modes] = await Promise.all([
    accountsOf(prisma, [params.subjectId, ...otherIds]),
    storedConsents(prisma, scoped, feature),
    receiveModes(prisma, scoped),
  ]);
  const law = await pairAccessAmong(prisma, {
    feature,
    subjectId: params.subjectId,
    otherIds,
    subjectIs: params.subjectIs,
    now: params.now,
    consentOf: (id, effectiveLevel: RelationLevel) => {
      const emitter = accounts.get(emitterOf(scoped, id));
      const globallyDisabled = Boolean(emitter?.batterySharingDisabledAt);
      if (!globallyDisabled && emitter?.locationGhostAt == null && grantedBySharedLocation(scoped, feature, id)) return 'granted';
      const pair = stored.get(id);
      return resolveEmitterConsent({ feature, stored: pair?.stored ?? null, effectiveLevel, globallyDisabled, bloodBundleAccepted: pair?.bloodBundleAccepted === true });
    },
  });

  return new Map(
    otherIds.map((id) => {
      const usable = isUsableAccount(accounts.get(emitterOf(scoped, id))) && isUsableAccount(accounts.get(readerOf(scoped, id)));
      const verdict = law.get(id);
      const allowed = usable && verdict?.allowed === true;
      return [id, allowed ? { allowed, receive: receiveOf(modes.get(id), feature, verdict.effectiveLevel) } : CLOSED];
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
