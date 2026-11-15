/**
 * LES RÉGLAGES DE LA BATTERIE (#14147, spec § 2 et § 6) — le seul site qui ÉCRIT les colonnes
 * de la batterie : la coupure globale de l'émetteur (`User.batterySharingDisabledAt`), son
 * consentement tri-état par personne (`batteryShared` + `batteryWithdrawnAt`), et ce que le
 * lecteur veut recevoir de chacun (`batteryReceive`, `all` s'écrivant comme l'absence).
 *
 * Ce qui est LU est l'effet : `shared` répond par la loi (`batteryAccessAmong`), si bien qu'un
 * Sang sans réglage partage et qu'un Proche sans accord ne partage pas.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import {
  BATTERY_DEFAULT_RECEIVE_MODE,
  type BatteryEmitterSettings,
  type BatteryPersonSettings,
  type BatteryReceiveMode,
} from '@meeshy/shared/types/battery';
import { batteryAccessAmong, parseReceiveMode, type BatteryDb } from './batteryAccess';

export type BatterySettingsDb = BatteryDb & Pick<PrismaClient, 'user' | 'relationFeatureSetting'>;

type Pair = { readonly ownerId: string; readonly otherId: string };

export async function readBatteryEmitterSettings(prisma: Pick<PrismaClient, 'user'>, userId: string): Promise<BatteryEmitterSettings> {
  const row = await prisma.user.findUnique({ where: { id: userId }, select: { batterySharingDisabledAt: true } });
  return { sharingEnabled: (row?.batterySharingDisabledAt ?? null) === null };
}

export async function writeBatteryEmitterSettings(
  prisma: Pick<PrismaClient, 'user'>,
  params: { readonly userId: string; readonly update: BatteryEmitterSettings; readonly now: Date },
): Promise<BatteryEmitterSettings> {
  await prisma.user.update({
    where: { id: params.userId },
    data: { batterySharingDisabledAt: params.update.sharingEnabled ? null : params.now },
  });
  return { sharingEnabled: params.update.sharingEnabled };
}

export async function readBatteryPersonSettings(prisma: BatterySettingsDb, params: Pair & { readonly now: Date }): Promise<BatteryPersonSettings> {
  const [access, row] = await Promise.all([
    batteryAccessAmong(prisma, { subjectId: params.ownerId, otherIds: [params.otherId], subjectIs: 'target', now: params.now }),
    prisma.relationFeatureSetting.findFirst({
      where: { ownerId: params.ownerId, otherId: params.otherId },
      select: { batteryReceive: true },
    }) as Promise<{ readonly batteryReceive: string | null } | null>,
  ]);
  return {
    userId: params.otherId,
    shared: access.get(params.otherId)?.allowed === true,
    receive: parseReceiveMode(row?.batteryReceive),
  };
}

const receiveColumn = (receive: BatteryReceiveMode): string | null => (receive === BATTERY_DEFAULT_RECEIVE_MODE ? null : receive);

export async function writeBatteryPersonSettings(
  prisma: BatterySettingsDb,
  params: Pair & { readonly update: { readonly shared?: boolean; readonly receive?: BatteryReceiveMode }; readonly now: Date },
): Promise<BatteryPersonSettings> {
  const data = {
    ...(params.update.shared === undefined ? {} : { batteryShared: params.update.shared, batteryWithdrawnAt: params.update.shared ? null : params.now }),
    ...(params.update.receive === undefined ? {} : { batteryReceive: receiveColumn(params.update.receive) }),
  };
  await prisma.relationFeatureSetting.upsert({
    where: { ownerId_otherId: { ownerId: params.ownerId, otherId: params.otherId } },
    create: { ownerId: params.ownerId, otherId: params.otherId, ...data },
    update: data,
  });
  return readBatteryPersonSettings(prisma, params);
}
