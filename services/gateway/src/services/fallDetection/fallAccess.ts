/**
 * QUI REÇOIT UNE CHUTE de qui (#18748) — la loi commune des états d'appareil
 * (`relations/emitterFeatureAccess.ts`) appliquée à `health.fall` (Sang, ou équipe #16623). Son
 * interrupteur global est un ACCORD (`User.fallAlertConsentedAt`) : nul, la chute est coupée pour
 * tous, collecte comprise. Les candidats sont ceux de la batterie.
 */
import { emitterFeatureAllowedAmong, type EmitterFeatureDb, type EmitterFeatureParams } from '../relations/emitterFeatureAccess';

export type FallDb = EmitterFeatureDb;

export function fallAllowedAmong(prisma: FallDb, params: EmitterFeatureParams): Promise<ReadonlySet<string>> {
  return emitterFeatureAllowedAmong(prisma, { feature: 'health.fall', consentColumn: 'fallAlertConsentedAt' }, params);
}

/** L'accord explicite de la personne est-il donné ? Sans lui, rien n'est collecté ni servi. */
export async function fallConsentGiven(prisma: Pick<FallDb, 'user'>, userId: string): Promise<boolean> {
  const row = (await prisma.user.findUnique({ where: { id: userId }, select: { fallAlertConsentedAt: true } })) as { readonly fallAlertConsentedAt?: Date | null } | null;
  return Boolean(row?.fallAlertConsentedAt);
}
