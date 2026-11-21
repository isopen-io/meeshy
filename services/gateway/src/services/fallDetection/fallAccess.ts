/**
 * QUI REÇOIT UNE CHUTE de qui (#18748) — la loi commune des états d'appareil
 * (`relations/emitterFeatureAccess.ts`) appliquée à `health.fall` (Sang, ou équipe #16623). Son
 * interrupteur global est un ACCORD jugé sur la ligne de l'émetteur (`fallEmitterOff`) : sans accord
 * daté à la version COURANTE du texte, ou sous 15 ans DÉCLARÉS (date posée après l'accord comprise),
 * la chute est coupée pour tous, collecte comprise. Les candidats sont ceux de la batterie.
 */
import { FALL_CONSENT_MINIMUM_AGE } from '@meeshy/shared/types/fall-detection';
import { ageInFullYearsUtc } from '@meeshy/shared/utils/age';
import { isFallConsentCurrent } from '@meeshy/shared/utils/fall-detection';
import { emitterFeatureAllowedAmong, type EmitterFeatureDb, type EmitterFeatureParams, type EmitterSwitch } from '../relations/emitterFeatureAccess';

export type FallDb = EmitterFeatureDb;

const FALL_EMITTER_SELECT = { fallAlertConsentedAt: true, fallAlertConsentVersion: true, birthDate: true } as const;

const asDate = (value: unknown): Date | null => (value instanceof Date ? value : null);
const asText = (value: unknown): string | null => (typeof value === 'string' ? value : null);

/** La chute est-elle COUPÉE par la ligne de son émetteur ? Accord absent ou périmé, ou mineur déclaré. */
export function fallEmitterOff(row: Readonly<Record<string, unknown>>, now: Date): boolean {
  if (!isFallConsentCurrent({ consentedAt: asDate(row.fallAlertConsentedAt), version: asText(row.fallAlertConsentVersion) })) return true;
  const birthDate = asDate(row.birthDate);
  return birthDate !== null && ageInFullYearsUtc(birthDate, now) < FALL_CONSENT_MINIMUM_AGE;
}

const FALL_SWITCH: EmitterSwitch = { select: FALL_EMITTER_SELECT, off: fallEmitterOff };

export function fallAllowedAmong(prisma: FallDb, params: EmitterFeatureParams): Promise<ReadonlySet<string>> {
  return emitterFeatureAllowedAmong(prisma, { feature: 'health.fall', emitterSwitch: FALL_SWITCH }, params);
}

/** L'accord explicite de la personne vaut-il encore ? Sans lui, rien n'est collecté ni servi. */
export async function fallConsentGiven(prisma: Pick<FallDb, 'user'>, userId: string, now: Date): Promise<boolean> {
  const row = (await prisma.user.findUnique({ where: { id: userId }, select: FALL_EMITTER_SELECT })) as Readonly<Record<string, unknown>> | null;
  return row !== null && !fallEmitterOff(row, now);
}
