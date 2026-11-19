/**
 * LES RÉGLAGES DE LA VÉRIFICATION D'INACTIVITÉ (#18738) — le seul site qui ÉCRIT ses colonnes : le
 * délai et la coupure globale de la personne (`User.inactivityCheckDelayHours`,
 * `User.inactivityCheckDisabledAt`) et son consentement tri-état par personne
 * (`inactivityShared` + `inactivityWithdrawnAt`).
 *
 * Ce qui est LU est l'effet : `shared` répond par la loi (`inactivityAllowedAmong`), si bien qu'un
 * Sang sans réglage la reçoit et qu'un Proche sans accord ne la reçoit pas.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import {
  INACTIVITY_CHECK_CONFIG,
  INACTIVITY_DELAY_HOURS,
  type InactivityCheckPersonSettings,
  type InactivityCheckSettings,
  type InactivityDelayHours,
} from '@meeshy/shared/types/inactivity-check';
import { inactivityAllowedAmong, type InactivityDb } from './inactivityAccess';

export type InactivitySettingsDb = InactivityDb & Pick<PrismaClient, 'user' | 'relationFeatureSetting'>;

type SettingsRow = { readonly inactivityCheckDisabledAt?: Date | null; readonly inactivityCheckDelayHours?: number | null } | null;

const isDelay = (value: unknown): value is InactivityDelayHours => (INACTIVITY_DELAY_HOURS as readonly unknown[]).includes(value);

/** Le délai en vigueur, ou `null` quand la vérification est coupée (ou le compte introuvable). */
export const inactivityDelayOf = (row: SettingsRow): InactivityDelayHours | null => {
  if (row === null || row.inactivityCheckDisabledAt) return null;
  return isDelay(row.inactivityCheckDelayHours) ? row.inactivityCheckDelayHours : INACTIVITY_CHECK_CONFIG.defaultDelayHours;
};

export async function readInactivityDelay(prisma: Pick<PrismaClient, 'user'>, userId: string): Promise<InactivityDelayHours | null> {
  const row = (await prisma.user.findUnique({ where: { id: userId }, select: { inactivityCheckDisabledAt: true, inactivityCheckDelayHours: true } })) as SettingsRow;
  return inactivityDelayOf(row);
}

export async function readInactivitySettings(prisma: Pick<PrismaClient, 'user'>, userId: string): Promise<InactivityCheckSettings> {
  return { delayHours: await readInactivityDelay(prisma, userId) };
}

export async function writeInactivitySettings(
  prisma: Pick<PrismaClient, 'user'>,
  params: { readonly userId: string; readonly update: InactivityCheckSettings; readonly now: Date },
): Promise<InactivityCheckSettings> {
  const data = params.update.delayHours === null
    ? { inactivityCheckDisabledAt: params.now }
    : { inactivityCheckDisabledAt: null, inactivityCheckDelayHours: params.update.delayHours };
  await prisma.user.update({ where: { id: params.userId }, data });
  return { delayHours: params.update.delayHours };
}

type Pair = { readonly ownerId: string; readonly otherId: string };

export async function readInactivityPersonSettings(prisma: InactivitySettingsDb, params: Pair & { readonly now: Date }): Promise<InactivityCheckPersonSettings> {
  const allowed = await inactivityAllowedAmong(prisma, { subjectId: params.ownerId, otherIds: [params.otherId], subjectIs: 'target', now: params.now });
  return { userId: params.otherId, shared: allowed.has(params.otherId) };
}

export async function writeInactivityPersonSettings(
  prisma: InactivitySettingsDb,
  params: Pair & { readonly update: { readonly shared: boolean }; readonly now: Date },
): Promise<InactivityCheckPersonSettings> {
  const data = { inactivityShared: params.update.shared, inactivityWithdrawnAt: params.update.shared ? null : params.now };
  await prisma.relationFeatureSetting.upsert({
    where: { ownerId_otherId: { ownerId: params.ownerId, otherId: params.otherId } },
    create: { ownerId: params.ownerId, otherId: params.otherId, ...data },
    update: data,
  });
  return readInactivityPersonSettings(prisma, params);
}
