/**
 * LES RÉGLAGES DU TÉLÉPHONE INJOIGNABLE (#18737) — le seul site qui ÉCRIT ses colonnes : la coupure
 * globale de l'émetteur (`User.unreachableSharingDisabledAt`, le fantôme) et son consentement
 * tri-état par personne (`unreachableShared` + `unreachableWithdrawnAt`).
 *
 * Ce qui est LU est l'effet : `shared` répond par la loi (`phoneReachabilityAllowedAmong`), si bien
 * qu'un Sang sans réglage le reçoit et qu'un Proche sans accord ne le reçoit pas.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { PhoneReachabilityEmitterSettings, PhoneReachabilityPersonSettings } from '@meeshy/shared/types/phone-reachability';
import { phoneReachabilityAllowedAmong, type PhoneReachabilityDb } from './phoneReachabilityAccess';

export type PhoneReachabilitySettingsDb = PhoneReachabilityDb & Pick<PrismaClient, 'user' | 'relationFeatureSetting'>;

type Pair = { readonly ownerId: string; readonly otherId: string };

export async function readPhoneReachabilityEmitterSettings(prisma: Pick<PrismaClient, 'user'>, userId: string): Promise<PhoneReachabilityEmitterSettings> {
  const row = (await prisma.user.findUnique({ where: { id: userId }, select: { unreachableSharingDisabledAt: true } })) as { readonly unreachableSharingDisabledAt?: Date | null } | null;
  return { sharingEnabled: (row?.unreachableSharingDisabledAt ?? null) === null };
}

export async function writePhoneReachabilityEmitterSettings(
  prisma: Pick<PrismaClient, 'user'>,
  params: { readonly userId: string; readonly update: PhoneReachabilityEmitterSettings; readonly now: Date },
): Promise<PhoneReachabilityEmitterSettings> {
  await prisma.user.update({
    where: { id: params.userId },
    data: { unreachableSharingDisabledAt: params.update.sharingEnabled ? null : params.now },
  });
  return { sharingEnabled: params.update.sharingEnabled };
}

export async function readPhoneReachabilityPersonSettings(prisma: PhoneReachabilitySettingsDb, params: Pair & { readonly now: Date }): Promise<PhoneReachabilityPersonSettings> {
  const allowed = await phoneReachabilityAllowedAmong(prisma, { subjectId: params.ownerId, otherIds: [params.otherId], subjectIs: 'target', now: params.now });
  return { userId: params.otherId, shared: allowed.has(params.otherId) };
}

export async function writePhoneReachabilityPersonSettings(
  prisma: PhoneReachabilitySettingsDb,
  params: Pair & { readonly update: { readonly shared: boolean }; readonly now: Date },
): Promise<PhoneReachabilityPersonSettings> {
  const data = { unreachableShared: params.update.shared, unreachableWithdrawnAt: params.update.shared ? null : params.now };
  await prisma.relationFeatureSetting.upsert({
    where: { ownerId_otherId: { ownerId: params.ownerId, otherId: params.otherId } },
    create: { ownerId: params.ownerId, otherId: params.otherId, ...data },
    update: data,
  });
  return readPhoneReachabilityPersonSettings(prisma, params);
}
