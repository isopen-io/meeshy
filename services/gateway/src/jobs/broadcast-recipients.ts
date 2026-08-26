import type { Prisma } from '@meeshy/shared/prisma/client';

export type BroadcastTargeting = {
  readonly languages?: readonly string[];
  readonly countries?: readonly string[];
  readonly activityStatus?: 'active' | 'inactive' | 'all';
  readonly inactiveSinceDays?: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

const activityWindow = (targeting: BroadcastTargeting, now: Date): Prisma.UserWhereInput => {
  if (targeting.activityStatus === 'active') {
    return { lastActiveAt: { gte: new Date(now.getTime() - 30 * DAY_MS) } };
  }
  if (targeting.activityStatus === 'inactive') {
    const days = targeting.inactiveSinceDays || 30;
    return { lastActiveAt: { lt: new Date(now.getTime() - days * DAY_MS) } };
  }
  return {};
};

/**
 * Le ciblage d'une diffusion admin, traduit en filtre Prisma — commun aux
 * canaux e-mail et in-app. Règle PURE : seul le ciblage entre, aucune
 * contrainte de canal (l'e-mail y ajoute l'adresse vérifiée, l'in-app n'exige
 * rien de plus qu'un compte actif).
 */
export function buildBroadcastRecipientFilter(
  targeting: BroadcastTargeting,
  now: Date = new Date(),
): Prisma.UserWhereInput {
  return {
    isActive: true,
    deletedAt: null,
    ...(targeting.languages && targeting.languages.length > 0
      ? { systemLanguage: { in: [...targeting.languages] } }
      : {}),
    ...(targeting.countries && targeting.countries.length > 0
      ? { registrationCountry: { in: [...targeting.countries] } }
      : {}),
    ...activityWindow(targeting, now),
  };
}

/** Sujet/corps dans la langue du destinataire, repli langue source puis original. */
export function localizedBroadcastText(params: {
  readonly translated: Readonly<Record<string, string>> | null | undefined;
  readonly sourceLanguage: string;
  readonly original: string;
  readonly lang: string;
}): string {
  const translated = params.translated ?? {};
  return translated[params.lang] || translated[params.sourceLanguage] || params.original;
}
