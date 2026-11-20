/**
 * LES RÉGLAGES DE LA CHUTE (#18748) — le seul site qui ÉCRIT ses colonnes : l'ACCORD EXPLICITE
 * (`User.fallAlertConsentedAt` + `fallAlertConsentVersion`, jamais posé par défaut) et le retrait
 * tri-état par personne (`fallShared` + `fallWithdrawnAt`). Ce qui est LU par personne est l'effet de
 * la loi (`fallAllowedAmong`).
 *
 * L'accord n'est accepté que sur la version COURANTE du texte (`FALL_CONSENT_VERSION`), et jamais
 * sous `FALL_CONSENT_MINIMUM_AGE` ans DÉCLARÉS (art. 8 RGPD) ; une date de naissance absente ne
 * bloque pas — l'étape d'âge de l'inscription est facultative.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { FALL_CONSENT_MINIMUM_AGE, FALL_CONSENT_VERSION, type FallConsentSettings, type FallConsentUpdate, type FallPersonSettings } from '@meeshy/shared/types/fall-detection';
import { ageInFullYearsUtc } from '@meeshy/shared/utils/age';
import { fallAllowedAmong, type FallDb } from './fallAccess';

export type FallSettingsDb = FallDb & Pick<PrismaClient, 'user' | 'relationFeatureSetting'>;

export type FallConsentWrite =
  | { readonly kind: 'saved'; readonly settings: FallConsentSettings }
  | { readonly kind: 'minor' }
  | { readonly kind: 'stale-version' };

type Pair = { readonly ownerId: string; readonly otherId: string };
type ConsentRow = { readonly fallAlertConsentedAt?: Date | null; readonly fallAlertConsentVersion?: string | null; readonly birthDate?: Date | null };

const settingsOf = (row: ConsentRow | null): FallConsentSettings => {
  const consentedAt = row?.fallAlertConsentedAt ?? null;
  return { consentedAt: consentedAt ? consentedAt.toISOString() : null, consentVersion: consentedAt ? row?.fallAlertConsentVersion ?? null : null, currentVersion: FALL_CONSENT_VERSION };
};

export async function readFallConsentSettings(prisma: Pick<PrismaClient, 'user'>, userId: string): Promise<FallConsentSettings> {
  const row = (await prisma.user.findUnique({ where: { id: userId }, select: { fallAlertConsentedAt: true, fallAlertConsentVersion: true } })) as ConsentRow | null;
  return settingsOf(row);
}

export async function writeFallConsent(
  prisma: Pick<PrismaClient, 'user'>,
  params: { readonly userId: string; readonly update: FallConsentUpdate; readonly now: Date },
): Promise<FallConsentWrite> {
  if (!params.update.consented) {
    await prisma.user.update({ where: { id: params.userId }, data: { fallAlertConsentedAt: null, fallAlertConsentVersion: null } });
    return { kind: 'saved', settings: settingsOf(null) };
  }
  if (params.update.version !== FALL_CONSENT_VERSION) return { kind: 'stale-version' };
  const row = (await prisma.user.findUnique({ where: { id: params.userId }, select: { birthDate: true } })) as ConsentRow | null;
  if (row?.birthDate && ageInFullYearsUtc(row.birthDate, params.now) < FALL_CONSENT_MINIMUM_AGE) return { kind: 'minor' };
  await prisma.user.update({ where: { id: params.userId }, data: { fallAlertConsentedAt: params.now, fallAlertConsentVersion: FALL_CONSENT_VERSION } });
  return { kind: 'saved', settings: settingsOf({ fallAlertConsentedAt: params.now, fallAlertConsentVersion: FALL_CONSENT_VERSION }) };
}

export async function readFallPersonSettings(prisma: FallSettingsDb, params: Pair & { readonly now: Date }): Promise<FallPersonSettings> {
  const allowed = await fallAllowedAmong(prisma, { subjectId: params.ownerId, otherIds: [params.otherId], subjectIs: 'target', now: params.now });
  return { userId: params.otherId, shared: allowed.has(params.otherId) };
}

export async function writeFallPersonSettings(
  prisma: FallSettingsDb,
  params: Pair & { readonly update: { readonly shared: boolean }; readonly now: Date },
): Promise<FallPersonSettings> {
  const data = { fallShared: params.update.shared, fallWithdrawnAt: params.update.shared ? null : params.now };
  await prisma.relationFeatureSetting.upsert({
    where: { ownerId_otherId: { ownerId: params.ownerId, otherId: params.otherId } },
    create: { ownerId: params.ownerId, otherId: params.otherId, ...data },
    update: data,
  });
  return readFallPersonSettings(prisma, params);
}
