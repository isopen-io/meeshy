/**
 * LES RÉGLAGES D'« EN APPEL » (#18753) — le seul site qui ÉCRIT ses colonnes : la coupure globale
 * (`User.callSharingDisabledAt`) et le consentement tri-état par personne (`callShared` +
 * `callWithdrawnAt`). Ce qui est LU est l'effet de la loi (`phoneCallAllowedAmong`).
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { PhoneCallEmitterSettings, PhoneCallPersonSettings } from '@meeshy/shared/types/phone-call';
import { phoneCallAllowedAmong, type PhoneCallDb } from './phoneCallAccess';

export type PhoneCallSettingsDb = PhoneCallDb & Pick<PrismaClient, 'user' | 'relationFeatureSetting'>;

type Pair = { readonly ownerId: string; readonly otherId: string };

export async function readPhoneCallEmitterSettings(prisma: Pick<PrismaClient, 'user'>, userId: string): Promise<PhoneCallEmitterSettings> {
  const row = (await prisma.user.findUnique({ where: { id: userId }, select: { callSharingDisabledAt: true } })) as { readonly callSharingDisabledAt?: Date | null } | null;
  return { sharingEnabled: (row?.callSharingDisabledAt ?? null) === null };
}

export async function writePhoneCallEmitterSettings(
  prisma: Pick<PrismaClient, 'user'>,
  params: { readonly userId: string; readonly update: PhoneCallEmitterSettings; readonly now: Date },
): Promise<PhoneCallEmitterSettings> {
  await prisma.user.update({ where: { id: params.userId }, data: { callSharingDisabledAt: params.update.sharingEnabled ? null : params.now } });
  return { sharingEnabled: params.update.sharingEnabled };
}

export async function readPhoneCallPersonSettings(prisma: PhoneCallSettingsDb, params: Pair & { readonly now: Date }): Promise<PhoneCallPersonSettings> {
  const allowed = await phoneCallAllowedAmong(prisma, { subjectId: params.ownerId, otherIds: [params.otherId], subjectIs: 'target', now: params.now });
  return { userId: params.otherId, shared: allowed.has(params.otherId) };
}

export async function writePhoneCallPersonSettings(
  prisma: PhoneCallSettingsDb,
  params: Pair & { readonly update: { readonly shared: boolean }; readonly now: Date },
): Promise<PhoneCallPersonSettings> {
  const data = { callShared: params.update.shared, callWithdrawnAt: params.update.shared ? null : params.now };
  await prisma.relationFeatureSetting.upsert({
    where: { ownerId_otherId: { ownerId: params.ownerId, otherId: params.otherId } },
    create: { ownerId: params.ownerId, otherId: params.otherId, ...data },
    update: data,
  });
  return readPhoneCallPersonSettings(prisma, params);
}
